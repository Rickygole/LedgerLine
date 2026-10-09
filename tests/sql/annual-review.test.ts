import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { checklistDone, CHECKLIST, loadDecisions, reviewForYear, signOffBlockers } from "@/lib/ops/reviews";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let winston: string;
let daniel: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  winston = await userId(owner, "winston.kellerman");
  daniel = await userId(owner, "daniel.cho");
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function code(fn: () => Promise<unknown>): Promise<string | null> {
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

const tx: Tx = {
  async query(sql, params) {
    return (await app.query(sql, params)).rows;
  },
  async one(sql, params) {
    return (await app.query(sql, params)).rows[0] ?? null;
  },
};

describe("[US-064][BR-028] annual structure review with Finance", () => {
  it("allows one review per fiscal year", async () => {
    await asUser(app, priya, async () => {
      expect(await code(() => app.query("SELECT app.start_annual_review('FY26', '2026-04-20')"))).toBe("23505");
      expect(await code(() => app.query("SELECT app.start_annual_review('FY99', '2026-04-20')"))).toBe("23503");
    });
  });

  it("walks a review through checklist, participants and decisions, and only then lets it be signed off", async () => {
    await owner.query("BEGIN");
    try {
      await owner.query("INSERT INTO fiscal_year (id, starts_on, ends_on) VALUES ('FY30', '2029-07-01', '2030-06-30')");
      await owner.query("SET LOCAL ROLE app_server");
      await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: winston })]);
      const run = async (sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows;
      const attempt = async (sql: string, params: unknown[] = []) => {
        await owner.query("SAVEPOINT attempt");
        try {
          await owner.query(sql, params);
          await owner.query("RELEASE SAVEPOINT attempt");
          return null;
        } catch (error) {
          await owner.query("ROLLBACK TO SAVEPOINT attempt");
          return (error as { code?: string }).code ?? "unknown";
        }
      };
      const id = (await run("SELECT app.start_annual_review('FY30', '2026-04-10') AS id"))[0].id as string;
      expect(await attempt("SELECT app.sign_off_annual_review($1, '2026-04-12')", [id])).toBe("23514");
      for (const item of CHECKLIST.map((c) => c.key)) await run("SELECT app.set_review_check($1, $2, true)", [id, item]);
      expect(await attempt("SELECT app.sign_off_annual_review($1, '2026-04-12')", [id])).toBe("23514");
      await run("SELECT app.add_review_participant($1, 'Winston Kellerman', 'Council Finance')", [id]);
      expect(await attempt("SELECT app.sign_off_annual_review($1, '2026-04-12')", [id])).toBe("23514");
      await run("SELECT app.add_review_decision($1, 'forms', 'Add a question about volunteer hours.')", [id]);
      expect(await attempt("SELECT app.sign_off_annual_review($1, '2026-04-01')", [id])).toBe("23514");
      expect(await attempt("SELECT app.sign_off_annual_review($1, '2999-01-01')", [id])).toBe("23514");
      await run("SELECT app.sign_off_annual_review($1, '2026-04-12')", [id]);
      const signed = (await run("SELECT status, signed_off_by, signed_off_on::text AS on FROM annual_review WHERE id = $1", [id]))[0];
      expect(signed).toEqual({ status: "signed_off", signed_off_by: winston, on: "2026-04-12" });
      const audit = (await run("SELECT action FROM audit_event WHERE entity = 'annual_review' AND entity_id = $1 ORDER BY id", [id])).map((r) => r.action);
      expect(audit[0]).toBe("review_started");
      expect(audit.filter((a) => a === "review_check")).toHaveLength(5);
      expect(audit[audit.length - 1]).toBe("review_signed_off");
      expect(await attempt("SELECT app.set_review_check($1, 'forms', false)", [id])).toBe("23514");
      expect(await attempt("SELECT app.add_review_decision($1, 'rules', 'Late change')", [id])).toBe("23514");
      expect(await attempt("SELECT app.add_review_participant($1, 'Late Person', 'Somewhere')", [id])).toBe("23514");
      expect(await attempt("SELECT app.sign_off_annual_review($1, '2026-04-13')", [id])).toBe("23514");
    } finally {
      await owner.query("ROLLBACK");
    }
  });

  it("is limited to finance administrators, while Finance staff can read reviews", async () => {
    await asUser(app, daniel, async () => {
      expect(await code(() => app.query("SELECT app.start_annual_review('FY27', '2026-10-20')"))).toBe("42501");
      const seen = (await app.query("SELECT fiscal_year_id FROM annual_review ORDER BY 1")).rows.map((r) => r.fiscal_year_id);
      expect(seen).toEqual(["FY26", "FY27"]);
    });
    const maria = await userId(owner, "maria.santos");
    await asUser(app, maria, async () => {
      expect((await app.query("SELECT count(*)::int AS n FROM annual_review")).rows[0].n).toBe(0);
    });
  });

  it("feeds the rollover: the signed review and its decisions are what the rollover page reads", async () => {
    await asUser(app, priya, async () => {
      const review = await reviewForYear(tx, "FY26");
      expect(review?.status).toBe("signed_off");
      expect(review?.signed_off_by_name).toBe("Priya Raman");
      expect(checklistDone(review!)).toBe(CHECKLIST.length);
      expect(signOffBlockers(review!)).toEqual([]);
      const decisions = await loadDecisions(tx, review!.id);
      expect(decisions.map((d) => d.area).sort()).toEqual(["forms", "initiatives", "periods", "rules", "users"]);
      expect(decisions.some((d) => /retire/i.test(d.decision))).toBe(true);
      const draft = await reviewForYear(tx, "FY27");
      expect(draft?.status).toBe("draft");
      expect(signOffBlockers(draft!).length).toBeGreaterThan(0);
    });
  });
});
