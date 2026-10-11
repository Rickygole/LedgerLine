export type Provider = "Application" | "Shared" | "Inherited from hosting provider";

export type SecurityControl = {
  id: string;
  name: string;
  how: string;
  provider: Provider;
  where: string[];
  tests: string[];
  note?: string;
};

export const CONTROLS_STATEMENT =
  "These are application controls. FedRAMP authorization and a NIST assessment are performed on the production environment before go-live.";

export const SECURITY_CONTROLS: SecurityControl[] = [
  {
    id: "AC-2",
    name: "Account management",
    how: "A Finance administrator creates every account. A new user sets a password through a one-time link that expires after 30 minutes. An account carries an active flag, and deactivating it ends its sessions immediately.",
    provider: "Application",
    where: ["db/migrations/0011_d_admin_actions.sql", "db/migrations/0015_b_accounts.sql"],
    tests: ["tests/sql/accounts.test.ts"],
  },
  {
    id: "AC-3",
    name: "Access enforcement",
    how: "Row level security is switched on for every table that holds report data. An organization user reads only the rows of their own organization. Finance roles have their own policies, and a report changes status only through a database function that checks who is acting.",
    provider: "Application",
    where: ["db/migrations/0005_access.sql", "db/migrations/0006_workflow.sql"],
    tests: ["tests/sql/access.test.ts", "tests/e2e/access.spec.ts"],
  },
  {
    id: "AC-6",
    name: "Least privilege",
    how: "The application connects as app_server, a database role that is not a superuser and cannot bypass row level security. It holds only the table and function grants it needs, and it cannot read password hashes or reset tokens. View-only users cannot write.",
    provider: "Application",
    where: ["db/migrations/0001_roles.sql", "db/migrations/0005_access.sql"],
    tests: ["tests/sql/access.test.ts", "tests/sql/accounts.test.ts"],
  },
  {
    id: "AC-7",
    name: "Unsuccessful logon attempts",
    how: "Failed sign-in and reset attempts are counted in the database for each client key. After eight failures in 15 minutes the next attempt is refused with a wait notice. A successful sign-in clears the count.",
    provider: "Application",
    where: ["db/migrations/0008_throttle.sql", "db/migrations/0019_t_throttle_failures.sql", "lib/throttle.ts"],
    tests: ["tests/sql/throttle.test.ts", "tests/e2e/access.spec.ts"],
  },
  {
    id: "AC-12",
    name: "Session termination",
    how: "A session is a signed token that expires after 8 hours. Signing out, changing a password or deactivating an account makes every earlier session stop working.",
    provider: "Application",
    where: ["lib/session.ts", "app/actions/session.ts"],
    tests: ["tests/sql/accounts.test.ts", "tests/e2e/access.spec.ts"],
  },
  {
    id: "AU-2, AU-3",
    name: "Event logging and content of audit records",
    how: "Submissions, returns, acceptances, corrections, form publishing, role changes, rollover and reminder runs each write an audit event. Each event records who acted, when, the entity, the action, a note, and the values before and after.",
    provider: "Application",
    where: ["db/migrations/0004_audit.sql", "lib/audit.ts", "lib/finance/audit-actions.ts"],
    tests: ["tests/unit/audit-actions.test.ts", "tests/sql/workflow.test.ts"],
  },
  {
    id: "AU-9",
    name: "Protection of audit information",
    how: "Database triggers reject any update, delete or truncate of the audit trail and the submitted report revisions, for the application account and for the table owner. The owner can still disable a trigger, so protecting the owner credential is part of the production environment.",
    provider: "Shared",
    where: ["db/migrations/0004_audit.sql", "db/migrations/0006_workflow.sql"],
    tests: ["tests/sql/retention.test.ts", "tests/sql/access.test.ts"],
    note: "The hosting provider and the Council control who holds the database owner credential.",
  },
  {
    id: "AU-12",
    name: "Audit record generation",
    how: "Audit rows are written only by a database function, in the same transaction as the change they describe, so a change cannot be saved without its record. The application account cannot insert audit rows directly.",
    provider: "Application",
    where: ["db/migrations/0004_audit.sql", "lib/audit.ts"],
    tests: ["tests/sql/access.test.ts", "tests/sql/workflow.test.ts"],
  },
  {
    id: "IA-2",
    name: "Identification and authentication",
    how: "Every user has an individual account and signs in with a work email and password. Multi-factor authentication is not part of the application. It comes with the Council's identity provider when sign-in moves to it in production.",
    provider: "Shared",
    where: ["app/actions/session.ts", "middleware.ts"],
    tests: ["tests/e2e/access.spec.ts"],
    note: "Multi-factor authentication is not implemented here.",
  },
  {
    id: "IA-5",
    name: "Authenticator management",
    how: "Passwords are stored only as bcrypt hashes. A password must be at least 12 characters, no longer than bcrypt can use, and different from the email address. Reset and invitation tokens are random, single use, and short lived, and only their SHA-256 hash is stored.",
    provider: "Application",
    where: ["lib/password.ts", "app/reset/actions.ts", "db/migrations/0018_s_outbox_tokens.sql"],
    tests: ["tests/unit/password.test.ts", "tests/sql/accounts.test.ts"],
  },
  {
    id: "SC-8",
    name: "Transmission confidentiality and integrity",
    how: "The application connects to its database over TLS for any host that is not local, and marks its session cookie Secure in production. TLS between the browser and the server, and the HSTS header, are set by the hosting provider.",
    provider: "Shared",
    where: ["lib/db-ssl.ts", "lib/session.ts"],
    tests: ["tests/unit/db-ssl.test.ts"],
    note: "Browser TLS and HSTS are provided by the hosting provider and are checked in the production assessment.",
  },
  {
    id: "SC-18",
    name: "Mobile code",
    how: "A Content Security Policy that allows scripts only with a per-request nonce blocks inline script injection and framing. Responses also carry nosniff, frame denial and referrer headers.",
    provider: "Application",
    where: ["lib/csp.ts", "middleware.ts"],
    tests: ["tests/unit/csp.test.ts", "tests/e2e/access.spec.ts"],
  },
  {
    id: "SC-28",
    name: "Protection of information at rest",
    how: "Encryption of the database and stored files at rest is provided by the hosting provider. The application adds its own protection for secrets by storing passwords and tokens only as hashes.",
    provider: "Inherited from hosting provider",
    where: ["lib/password.ts"],
    tests: [],
    note: "No test here proves disk encryption. It is confirmed with the hosting provider in the production assessment.",
  },
  {
    id: "SI-10",
    name: "Information input validation",
    how: "Every report is validated on the server before it can be submitted: required answers, formats, numeric bounds, word limits and budget balance. Free text length limits and the submit rules are also enforced by the database. Browser checks are a convenience only.",
    provider: "Application",
    where: ["lib/rules/validate.ts", "lib/rules/bounds.ts", "db/migrations/0016_b_text_limits.sql"],
    tests: ["tests/unit/validate.test.ts", "tests/unit/numeric-bounds.test.ts", "tests/sql/accounts.test.ts"],
  },
  {
    id: "SI-11",
    name: "Error handling",
    how: "Server actions turn database errors into plain sentences and never show the raw error. The real error is written to the server log with a request ID that also appears on the error page. The health check exposes nothing sensitive.",
    provider: "Application",
    where: ["lib/actions.ts", "lib/ops/log.ts", "app/error.tsx"],
    tests: ["tests/unit/action-errors.test.ts", "tests/sql/health.test.ts"],
  },
  {
    id: "CM-2",
    name: "Baseline configuration",
    how: "The database schema is defined only by numbered SQL migrations, applied in order and recorded in a ledger table. The health check reports the latest applied migration and the build commit.",
    provider: "Application",
    where: ["db/migrations", "scripts/migrate.ts", "lib/ops/health.ts"],
    tests: ["tests/sql/health.test.ts"],
  },
  {
    id: "CM-3",
    name: "Configuration change control",
    how: "Every change runs through a pipeline that checks formatting, lint, types, unit, database and end to end tests and a production build before it can be deployed. Form publishing and rollover write audit events.",
    provider: "Shared",
    where: [".github/workflows/ci.yml"],
    tests: ["tests/sql/fiscal-year.test.ts", "tests/sql/initiative-lifecycle.test.ts"],
    note: "Who may approve and deploy a change is set in the hosting and source control accounts.",
  },
  {
    id: "CP-9",
    name: "System backup",
    how: "Database backups and point in time restore are provided by the hosting provider. The application lets a Finance administrator download the whole database as a zip of CSV files with a description of every table.",
    provider: "Inherited from hosting provider",
    where: ["lib/export/package.ts", "app/finance/data/page.tsx"],
    tests: ["tests/unit/data-package.test.ts"],
    note: "The test covers the export. Provider backups are not tested here.",
  },
  {
    id: "IR-4, IR-6",
    name: "Incident handling and reporting",
    how: "A Finance administrator records a security incident. The application queues a notice to every designated Council contact, flags a notice that is late, and tracks the remediation report with every version kept.",
    provider: "Application",
    where: ["db/migrations/0018_r_incidents.sql", "lib/ops/incidents.ts"],
    tests: ["tests/sql/incidents.test.ts", "tests/unit/incident-deadlines.test.ts"],
  },
];
