import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appUrl, connect, ownerUrl, userId } from "./helpers";
import { zip } from "../unit/zip-fixture";

vi.mock("server-only", () => ({}));

const blobHead = vi.fn();
const blobDel = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@vercel/blob", () => ({
  head: (...args: unknown[]) => blobHead(...args),
  del: (...args: unknown[]) => blobDel(...args),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));

let owner: Client;
let maria: string;
let submission: string;
let blobBody: Buffer;
let blobType: string;

const PLAIN_TYPES =
  '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>';

async function actions() {
  return import("@/app/portal/reports/actions");
}

async function prepare(filename: string, bytes = 100) {
  const { prepareUpload } = await actions();
  const result = await prepareUpload({ submissionId: submission, filename, bytes });
  if (result.status !== "ok") throw new Error(`prepare failed: ${JSON.stringify(result)}`);
  return result;
}

function stage(body: Buffer, contentType: string) {
  blobBody = body;
  blobType = contentType;
}

beforeAll(async () => {
  owner = await connect(ownerUrl());
  maria = await userId(owner, "maria.santos");
  const row = await owner.query(
    `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE id = $1) AND s.status = 'draft' AND NOT EXISTS (SELECT 1 FROM attachment x WHERE x.submission_id = s.id)
     ORDER BY s.id LIMIT 1`,
    [maria],
  );
  submission = row.rows[0].id;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(blobBody), { status: 200 })),
  );
});

beforeEach(() => {
  blobHead.mockReset();
  blobDel.mockReset();
  blobDel.mockResolvedValue(undefined);
  getCurrentUser.mockResolvedValue({ id: maria, role: "cbo_submitter" });
  blobHead.mockImplementation(async (pathname: string) => ({
    url: `https://blob.test/${pathname}`,
    downloadUrl: `https://blob.test/${pathname}?d=1`,
    size: blobBody.length,
    contentType: blobType,
  }));
  stage(Buffer.from("%PDF-1.4\nfine\n"), "application/pdf");
});

afterEach(async () => {
  await owner.query("DELETE FROM attachment WHERE submission_id = $1", [submission]);
  await owner.query("DELETE FROM upload_ticket WHERE submission_id = $1", [submission]);
  await owner.query("DELETE FROM auth_attempt WHERE key = $1", [`upload:${maria}`]);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await owner?.end();
});

describe("[US-023] a signed upload can be recorded once", () => {
  it("records a valid upload", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("minutes.pdf");
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "minutes.pdf",
    });
    expect(result.status).toBe("ok");
    expect(blobDel).not.toHaveBeenCalled();
  });

  it("refuses a replay of the same signed upload and keeps the stored blob", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("minutes.pdf");
    const args = {
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "minutes.pdf",
    };
    expect((await recordBlobUpload(args)).status).toBe("ok");
    const again = await recordBlobUpload(args);
    expect(again.status).toBe("rejected");
    expect(blobDel).not.toHaveBeenCalled();
    const count = await owner.query("SELECT count(*)::int AS n FROM attachment WHERE submission_id = $1", [submission]);
    expect(count.rows[0].n).toBe(1);
  });

  it("refuses to re-attach after the row was removed", async () => {
    const { recordBlobUpload, removeAttachment } = await actions();
    const ticket = await prepare("minutes.pdf");
    const args = {
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "minutes.pdf",
    };
    const first = await recordBlobUpload(args);
    if (first.status !== "ok") throw new Error("record failed");
    expect((await removeAttachment({ submissionId: submission, attachmentId: first.attachment.id })).status).toBe("ok");
    expect((await recordBlobUpload(args)).status).toBe("rejected");
  });

  it("refuses an expired signature", async () => {
    const { recordBlobUpload } = await actions();
    const { signPath } = await import("@/lib/report/attachments");
    const ticket = await prepare("minutes.pdf");
    const expired = signPath(maria, submission, ticket.pathname, Math.floor(Date.now() / 1000) - 5);
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: expired,
      filename: "minutes.pdf",
    });
    expect(result.status).toBe("rejected");
  });

  it("refuses a ticket whose database expiry has passed", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("minutes.pdf");
    await owner.query("UPDATE upload_ticket SET expires_at = now() - interval '1 minute' WHERE path = $1", [
      ticket.pathname,
    ]);
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "minutes.pdf",
    });
    expect(result.status).toBe("rejected");
  });

  it("takes the type from the signed path, not the client filename", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("minutes.pdf");
    stage(Buffer.from("a,b\n1,2\n"), "text/csv");
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "evil.csv",
    });
    expect(result.status).toBe("rejected");
    const count = await owner.query("SELECT count(*)::int AS n FROM attachment WHERE submission_id = $1", [submission]);
    expect(count.rows[0].n).toBe(0);
  });

  it("refuses a blob whose content does not match the signed type", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("minutes.pdf");
    stage(Buffer.from("MZ not a pdf"), "application/pdf");
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "minutes.pdf",
    });
    expect(result.status).toBe("rejected");
    expect(blobDel).toHaveBeenCalledTimes(1);
  });

  it("[US-023] refuses a workbook that carries macros and deletes the blob", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("budget.xlsx");
    stage(
      zip([
        { name: "[Content_Types].xml", data: PLAIN_TYPES },
        { name: "xl/vbaProject.bin", data: "MACRO" },
      ]),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "budget.xlsx",
    });
    expect(result).toMatchObject({ status: "rejected" });
    expect(blobDel).toHaveBeenCalledTimes(1);
  });

  it("[BR-012] re-checks the file count inside the recording transaction", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("late.pdf");
    for (let n = 0; n < 20; n++) {
      await owner.query(
        "INSERT INTO attachment (submission_id, path, filename, bytes, mime, uploaded_by) VALUES ($1, $2, $3, 10, 'application/pdf', $4)",
        [submission, `fill/${n}.pdf`, `fill${n}.pdf`, maria],
      );
    }
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "late.pdf",
    });
    expect(result).toMatchObject({ status: "rejected", message: expect.stringContaining("at most 20 files") });
    expect(blobDel).toHaveBeenCalledTimes(1);
  });

  it("[BR-012] re-checks the total size inside the recording transaction", async () => {
    const { recordBlobUpload } = await actions();
    const ticket = await prepare("late.pdf");
    for (let n = 0; n < 8; n++) {
      await owner.query(
        "INSERT INTO attachment (submission_id, path, filename, bytes, mime, uploaded_by) VALUES ($1, $2, $3, $4, 'application/pdf', $5)",
        [submission, `fill/big${n}.pdf`, `big${n}.pdf`, 25 * 1024 * 1024, maria],
      );
    }
    const result = await recordBlobUpload({
      submissionId: submission,
      pathname: ticket.pathname,
      signature: ticket.signature,
      filename: "late.pdf",
    });
    expect(result).toMatchObject({ status: "rejected", message: expect.stringContaining("200 MB") });
  });
});

describe("[BR-012] preparing uploads is capped per user", () => {
  it("allows 60 preparations an hour and refuses the next", async () => {
    const { prepareUpload } = await actions();
    await owner.query("INSERT INTO auth_attempt (key) SELECT $1 FROM generate_series(1, 60)", [`upload:${maria}`]);
    const result = await prepareUpload({ submissionId: submission, filename: "one-more.pdf", bytes: 100 });
    expect(result).toMatchObject({ status: "rejected" });
    expect(
      (await owner.query("SELECT count(*)::int AS n FROM upload_ticket WHERE submission_id = $1", [submission])).rows[0]
        .n,
    ).toBe(0);
  });
});

describe("[US-023] upload tickets in the database", () => {
  it("redeems once, only for the owner", async () => {
    const app = await connect(appUrl());
    try {
      const other = await userId(owner, "daniel.cho");
      const path = `t/${submission}/x.pdf`;
      await owner.query(
        "INSERT INTO upload_ticket (path, user_id, submission_id, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')",
        [path, maria, submission],
      );
      const redeem = async (as: string) => {
        await app.query("BEGIN");
        try {
          await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: as })]);
          const r = await app.query("SELECT app.redeem_upload_ticket($1, $2) AS ok", [path, submission]);
          await app.query("COMMIT");
          return r.rows[0].ok as boolean;
        } catch (error) {
          await app.query("ROLLBACK");
          throw error;
        }
      };
      expect(await redeem(other)).toBe(false);
      expect(await redeem(maria)).toBe(true);
      expect(await redeem(maria)).toBe(false);
    } finally {
      await app.end();
    }
  });
});
