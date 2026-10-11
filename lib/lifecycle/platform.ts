import type { Tx } from "@/lib/db";

type PlatformFacts = {
  revisions: number;
  auditEvents: number;
  firstAudit: string | null;
  submissions: number;
  usersByRole: { role: string; n: number; active: number; invited: number }[];
  organizations: number;
  signInUsers: number;
  protectedTables: number;
  totalTables: number;
  policies: number;
  appendOnlyTriggers: number;
  initiatives: number;
  assignments: number;
};

export async function platformFacts(tx: Tx): Promise<PlatformFacts> {
  const counts = await tx.one<{
    revisions: number;
    audit: number;
    first_audit: string | null;
    submissions: number;
    orgs: number;
    sign_in: number;
    initiatives: number;
    assignments: number;
  }>(
    `SELECT (SELECT count(*)::int FROM submission_revision) AS revisions,
            (SELECT count(*)::int FROM audit_event) AS audit,
            (SELECT min(at)::text FROM audit_event) AS first_audit,
            (SELECT count(*)::int FROM submission) AS submissions,
            (SELECT count(*)::int FROM organization) AS orgs,
            (SELECT count(*)::int FROM app_user WHERE can_sign_in AND active) AS sign_in,
            (SELECT count(*)::int FROM initiative) AS initiatives,
            (SELECT count(*)::int FROM assignment) AS assignments`,
  );
  const roles = await tx.query<{ role: string; n: number; active: number; invited: number }>(
    "SELECT role, count(*)::int AS n, count(*) FILTER (WHERE can_sign_in)::int AS active, count(*) FILTER (WHERE NOT can_sign_in)::int AS invited FROM app_user WHERE active AND email <> 'system.scheduler@ledgerline.example' GROUP BY role ORDER BY CASE role WHEN 'cbo_submitter' THEN 4 WHEN 'finance_viewer' THEN 1 WHEN 'finance_analyst' THEN 2 ELSE 3 END",
  );
  const tables = await tx.one<{ protected: number; total: number }>(
    `SELECT count(*) FILTER (WHERE c.relrowsecurity)::int AS protected, count(*)::int AS total
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migration'`,
  );
  const policies = await tx.one<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'",
  );
  const triggers = await tx.one<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND c.relname IN ('audit_event', 'submission_revision') AND t.tgname LIKE '%append_only'`,
  );
  return {
    revisions: counts?.revisions ?? 0,
    auditEvents: counts?.audit ?? 0,
    firstAudit: counts?.first_audit ?? null,
    submissions: counts?.submissions ?? 0,
    usersByRole: roles,
    organizations: counts?.orgs ?? 0,
    signInUsers: counts?.sign_in ?? 0,
    protectedTables: tables?.protected ?? 0,
    totalTables: tables?.total ?? 0,
    policies: policies?.n ?? 0,
    appendOnlyTriggers: triggers?.n ?? 0,
    initiatives: counts?.initiatives ?? 0,
    assignments: counts?.assignments ?? 0,
  };
}
