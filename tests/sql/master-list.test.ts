import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addOrganization, applyImport, parseImport, previewRows, type CleanRow } from "@/lib/finance/admin/master-list";
import { buildDefinition } from "@/lib/forms/standard";
import { EIN_NOT_ON_LIST, NAME_NOT_ON_LIST } from "@/lib/rules/identity";
import { reportIssues } from "@/lib/report/issues";
import type { Tx } from "@/lib/db";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let grace: string;
let maria: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  maria = await userId(owner, "maria.santos");
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

function tx(): Tx {
  return {
    async query(sql, params) {
      return (await app.query(sql, params as unknown[])).rows;
    },
    async one(sql, params) {
      return (await app.query(sql, params as unknown[])).rows[0] ?? null;
    },
  };
}

async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  await app.query("SAVEPOINT attempt");
  try {
    await fn();
    await app.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await app.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

const fresh: CleanRow = {
  ein: "99-1234567",
  legal_name: "Bridge Street Youth Collective",
  org_type: "cbo",
  borough: "Brooklyn",
  council_district: 35,
  address_line: "410 Bridge Street",
  postal_code: "11201",
  contact_name: "Dana Whitfield",
  contact_title: "Executive Director",
  contact_email: "dana@bridgestreet.example.org",
  contact_phone: "718-555-0182",
};

const HEADER =
  "ein,legal_name,org_type,borough,council_district,address_line,postal_code,contact_name,contact_title,contact_email,contact_phone";

describe("[US-033][BR-023] Council Finance maintains the master list", () => {
  it("lets an administrator add an organization with its primary contact and records it in the audit log", async () => {
    await asUser(app, priya, async () => {
      const result = await addOrganization(tx(), fresh);
      if (!("id" in result)) throw new Error("not added");
      const org = (
        await app.query("SELECT ein, legal_name, borough, council_district, org_type FROM organization WHERE id = $1", [
          result.id,
        ])
      ).rows[0];
      expect(org).toEqual({
        ein: "99-1234567",
        legal_name: fresh.legal_name,
        borough: "Brooklyn",
        council_district: 35,
        org_type: "cbo",
      });
      const contact = (
        await app.query("SELECT full_name, title, email, phone, is_primary FROM contact WHERE org_id = $1", [result.id])
      ).rows;
      expect(contact).toEqual([
        {
          full_name: "Dana Whitfield",
          title: "Executive Director",
          email: "dana@bridgestreet.example.org",
          phone: "718-555-0182",
          is_primary: true,
        },
      ]);
      const audit = (
        await app.query(
          "SELECT actor_id, action, after FROM audit_event WHERE entity = 'organization' AND entity_id = $1",
          [result.id],
        )
      ).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].actor_id).toBe(priya);
      expect(audit[0].action).toBe("org_add");
      expect(audit[0].after.ein).toBe("99-1234567");
    });
  });

  it("keeps each EIN unique", async () => {
    await asUser(app, priya, async () => {
      expect("id" in (await addOrganization(tx(), fresh))).toBe(true);
      expect(await addOrganization(tx(), { ...fresh, legal_name: "Another Name" })).toEqual({
        duplicate: "Bridge Street Youth Collective",
      });
      expect(
        await errorCode(() =>
          app.query(
            "INSERT INTO organization (ein, legal_name, org_type, borough, address_line, postal_code) VALUES ($1, 'Dup', 'cbo', 'Citywide', 'x', '10001')",
            [fresh.ein],
          ),
        ),
      ).toBe("23505");
    });
  });

  it("leaves the master list unchanged for analysts, view-only staff and organizations", async () => {
    for (const who of [daniel, grace, maria]) {
      await asUser(app, who, async () => {
        expect(
          await errorCode(() =>
            app.query(
              "INSERT INTO organization (ein, legal_name, org_type, borough, address_line, postal_code) VALUES ('98-7654321', 'Sneaky', 'cbo', 'Citywide', 'x', '10001')",
            ),
          ),
        ).toBe("42501");
        await app.query("UPDATE organization SET legal_name = 'Hijacked'");
        expect(
          (await app.query("SELECT count(*)::int AS n FROM organization WHERE legal_name = 'Hijacked'")).rows[0].n,
        ).toBe(0);
        expect(
          await errorCode(() =>
            app.query(
              "INSERT INTO contact (org_id, full_name, title, email) SELECT id, 'X', 'Y', 'x@example.org' FROM organization LIMIT 1",
            ),
          ),
        ).toBe("42501");
      });
    }
  });

  it("previews a file as new, updated, unchanged and rejected rows with the reason for each rejection, without changing anything", async () => {
    const existing = (
      await owner.query(
        "SELECT ein, legal_name, org_type, borough, council_district, address_line, postal_code FROM organization ORDER BY ein LIMIT 2",
      )
    ).rows;
    const contact = async (ein: string) =>
      (
        await owner.query(
          "SELECT c.full_name, c.title, c.email, c.phone FROM contact c JOIN organization o ON o.id = c.org_id WHERE o.ein = $1 AND c.is_primary",
          [ein],
        )
      ).rows[0];
    const [a, b] = existing;
    const ca = await contact(a.ein);
    const cb = await contact(b.ein);
    const line = (o: typeof a, c: typeof ca, patch: Record<string, string> = {}) =>
      [
        patch.ein ?? o.ein,
        patch.name ?? `"${o.legal_name}"`,
        o.org_type,
        o.borough,
        o.council_district ?? "",
        `"${patch.address ?? o.address_line}"`,
        o.postal_code,
        c.full_name,
        c.title,
        c.email,
        c.phone ?? "",
      ].join(",");
    const csv = [
      HEADER,
      line(a, ca),
      line(b, cb, { address: "1 New Address Plaza" }),
      `${fresh.ein},${fresh.legal_name},Nonprofit,Brooklyn,35,${fresh.address_line},11201,Dana Whitfield,Executive Director,dana@bridgestreet.example.org,`,
      `12-34,Too Short Org,Nonprofit,Brooklyn,35,1 Main St,11201,Dana Whitfield,ED,d@example.org,`,
      `${fresh.ein},Same EIN Again,Nonprofit,Brooklyn,35,1 Main St,11201,Dana Whitfield,ED,d@example.org,`,
      `97-1234567,Wrong Borough Org,Nonprofit,Queens,35,1 Main St,11201,Dana Whitfield,ED,d@example.org,`,
    ].join("\n");
    const before = (await owner.query("SELECT count(*)::int AS n FROM organization")).rows[0].n;
    const parsed = parseImport(csv);
    if (!parsed.ok) throw new Error(parsed.error);
    await asUser(app, priya, async () => {
      const preview = await previewRows(tx(), parsed.rows);
      expect(preview.counts).toEqual({ new: 1, updated: 1, unchanged: 1, rejected: 3 });
      expect(preview.rows.map((r) => r.status)).toEqual([
        "unchanged",
        "updated",
        "new",
        "rejected",
        "rejected",
        "rejected",
      ]);
      expect(preview.rows[1].changes).toEqual(["Address"]);
      expect(preview.rows[3].reasons).toEqual(["The EIN must be 9 digits, like 12-3456789."]);
      expect(preview.rows[4].reasons).toEqual([`The EIN ${fresh.ein} already appears on row 4 of this file.`]);
      expect(preview.rows[5].reasons).toEqual(["District 35 is in Brooklyn, not Queens."]);
      expect((await app.query("SELECT count(*)::int AS n FROM organization")).rows[0].n).toBe(before);
    });
    expect((await owner.query("SELECT count(*)::int AS n FROM organization")).rows[0].n).toBe(before);
  });

  it("applies the confirmed import: adds new organizations, updates known ones by EIN, skips rejected rows and audits every change", async () => {
    const target = (
      await owner.query(
        "SELECT ein, legal_name, org_type, borough, council_district, address_line, postal_code FROM organization ORDER BY ein LIMIT 1",
      )
    ).rows[0];
    const contact = (
      await owner.query(
        "SELECT c.full_name, c.title, c.email FROM contact c JOIN organization o ON o.id = c.org_id WHERE o.ein = $1 AND c.is_primary",
        [target.ein],
      )
    ).rows[0];
    const csv = [
      HEADER,
      `${target.ein},"${target.legal_name} (renamed)",${target.org_type},${target.borough},${target.council_district ?? ""},"${target.address_line}",${target.postal_code},${contact.full_name},${contact.title},${contact.email},`,
      `${fresh.ein},${fresh.legal_name},Nonprofit,Brooklyn,35,${fresh.address_line},11201,Dana Whitfield,Executive Director,dana@bridgestreet.example.org,718-555-0182`,
      `12-34,Too Short Org,Nonprofit,Brooklyn,35,1 Main St,11201,Dana Whitfield,ED,d@example.org,`,
    ].join("\n");
    const parsed = parseImport(csv);
    if (!parsed.ok) throw new Error(parsed.error);
    await asUser(app, priya, async () => {
      const preview = await previewRows(tx(), parsed.rows);
      const summary = await applyImport(tx(), preview, "master.csv");
      expect(summary).toEqual({ added: 1, updated: 1, unchanged: 0, rejected: 1 });
      expect(
        (await app.query("SELECT legal_name FROM organization WHERE ein = $1", [target.ein])).rows[0].legal_name,
      ).toBe(`${target.legal_name} (renamed)`);
      expect(
        (await app.query("SELECT count(*)::int AS n FROM organization WHERE ein = $1", [fresh.ein])).rows[0].n,
      ).toBe(1);
      expect(
        (
          await app.query(
            "SELECT count(*)::int AS n FROM organization WHERE ein = '12-34' OR legal_name = 'Too Short Org'",
          )
        ).rows[0].n,
      ).toBe(0);
      const actions = (
        await app.query(
          "SELECT action, note FROM audit_event WHERE entity IN ('organization', 'master_list') AND actor_id = $1 ORDER BY id",
          [priya],
        )
      ).rows;
      expect(actions.map((a) => a.action)).toEqual(["org_update", "org_add", "master_list_import"]);
      expect(actions[2].note).toBe("master.csv: 1 added, 1 updated, 0 unchanged, 1 rejected");
      const again = await previewRows(tx(), parsed.rows);
      expect(again.counts).toEqual({ new: 0, updated: 0, unchanged: 2, rejected: 1 });
    });
  });
});

describe("[US-033][BR-023] the portal's EIN and name checks use the list Finance maintains", () => {
  it("accepts the organization's name as listed, and rejects the old name once Finance updates the list", async () => {
    const row = (
      await owner.query(
        `SELECT s.id, o.ein, o.legal_name, u.id AS submitter
         FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN organization o ON o.id = a.org_id
         JOIN app_user u ON u.org_id = o.id AND u.role = 'cbo_submitter' AND u.active
         WHERE s.status = 'draft' ORDER BY s.reference_no LIMIT 1`,
      )
    ).rows[0];
    const { loadReport } = await import("@/lib/report/data");
    const definition = buildDefinition("Check", []);
    const check = async (name: string, ein: string) => {
      const loaded = await loadReport(tx(), row.id);
      return reportIssues({
        definition,
        answers: { org_legal_name: name, org_ein: ein },
        budget: [],
        awardAmount: 0,
        orgEin: loaded!.header.ein,
        orgName: loaded!.header.orgName,
      }).filter((i) => i.field === "org_ein" || i.field === "org_legal_name");
    };
    await asUser(app, row.submitter, async () => {
      expect(await check(row.legal_name, row.ein)).toEqual([]);
    });
    await asUser(app, priya, async () => {
      const csv = [
        HEADER,
        `${row.ein},Renamed Through The Master List,Nonprofit,Citywide,,1 Main St,10001,Dana Whitfield,Director,dana@example.org,`,
      ].join("\n");
      const parsed = parseImport(csv);
      if (!parsed.ok) throw new Error(parsed.error);
      const preview = await previewRows(tx(), parsed.rows);
      expect(preview.counts.updated).toBe(1);
      await applyImport(tx(), preview, "rename.csv");
      await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: row.submitter })]);
      const issues = await check(row.legal_name, row.ein);
      expect(issues.map((i) => i.message)).toEqual([NAME_NOT_ON_LIST]);
      expect(await check("Renamed Through The Master List", row.ein)).toEqual([]);
      const wrongEin = await check("Renamed Through The Master List", "11-1111111");
      expect(wrongEin.map((i) => i.message)).toEqual([EIN_NOT_ON_LIST]);
    });
  });

  it("has an organization added to the list in the same query the portal reads from", async () => {
    await asUser(app, priya, async () => {
      const added = await addOrganization(tx(), fresh);
      if (!("id" in added)) throw new Error("not added");
      const listed = (await app.query("SELECT ein, legal_name FROM organization WHERE ein = $1", [fresh.ein])).rows;
      expect(listed).toEqual([{ ein: fresh.ein, legal_name: fresh.legal_name }]);
    });
  });
});
