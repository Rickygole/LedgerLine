# LedgerLine

I built LedgerLine as a proof of concept for the NYC Council Initiative Reporting System RFP, prepared for Estrada Consulting. It is not an official NYC system. Every organization, person, award and report in it is synthetic.

## What you can do in it

- **Funded organization:** see assigned initiatives and due dates, fill in a report with a budget grid (paste from a spreadsheet works), attach files, submit, and read returned notes from Finance.
- **Finance analyst:** see which reports are on time, late or missing, review submissions, flag problems, return a report with a note, accept it, run saved queries, export, and send reminders.
- **Finance admin:** everything an analyst can do, plus creating initiatives, publishing report forms, rolling a fiscal year forward, managing users, and correcting a submitted answer with a recorded reason.
- **View-only:** read access to the finance screens with no actions.

## How it is built

- Next.js 15 (App Router, server components and server actions), React 19, Tailwind 4, TypeScript.
- Postgres holds the rules. Row level security decides who sees what, using claims set per transaction (`withClaims` in `lib/db.ts`). The app connects as a limited `app_server` role that can only write the columns it needs.
- Audit and revision tables are append-only. A submission only changes status through a SQL function (`app.transition_submission`) that checks the action, the role and a lock version, and writes the audit row in the same transaction. Corrections and form publishing go through their own functions.
- Uploads go to Vercel Blob in production and to a local `.storage` folder otherwise.
- Sign-in is a shared passcode gate plus a per-user password and a signed session cookie.
- Two optional AI features: importing a report form from a Word template, and drafting the note when Finance returns a report. They only propose. Nothing is written until a person reviews and approves it, and each call is logged. Without an API key they run in offline replay (recorded responses for known inputs, labeled as such) or a rule-based fallback.

## Requirement evidence

`/trust` lists each requirement ID from `traceability.json` with the tests that cover it. Tests carry the ID in their title, for example `[BR-008]`. `scripts/trust.ts` reads the test results from `reports/` and writes `app/trust/evidence.json`, which the page renders. CI regenerates it on every run.

## Local setup

You need Node 22, pnpm 10 and Docker.

1. Start Postgres:

   ```
   docker run -d --name ledgerline-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ledgerline -p 5432:5432 postgres:16
   ```

2. Copy `.env.example` to `.env.local` and fill in the placeholders. Minimum: `DB_OWNER_URL`, `APP_SERVER_PASSWORD` (24 or more URL-safe characters), `APP_DATABASE_URL` (same password), `AUTH_SECRET`, `GATE_COOKIE_SECRET`, `GATE_PASSCODE`. Set `PERSONA_PASSWORD` for the demo users, or the seed uses a local default. `DEMO_TODAY` pins the date the app treats as today.

3. Install, migrate, create the login for the app role, seed:

   ```
   pnpm install
   pnpm db:migrate
   pnpm db:role
   pnpm db:seed
   ```

4. Run it with `pnpm dev` and open http://localhost:3000. Enter the passcode from `GATE_PASSCODE`, then sign in as one of the seeded users with `PERSONA_PASSWORD`. The seeded emails are listed on the sign-in page.


## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev`, `pnpm build`, `pnpm start` | Next.js dev server, production build, production server |
| `pnpm lint`, `pnpm typecheck` | ESLint, `tsc --noEmit` |
| `pnpm test` | All Vitest suites |
| `pnpm test:unit` | Unit tests only, no database needed |
| `pnpm db:migrate` | Apply SQL files in `db/migrations` |
| `pnpm db:role` | Set the `app_server` password from `APP_SERVER_PASSWORD` |
| `pnpm db:seed` | Reset and load synthetic data |
| `pnpm evidence` | Run tests and regenerate `app/trust/evidence.json` |

## Tests

`pnpm test:unit` needs no database. `pnpm test` adds the SQL tests, which run against the real database and check row level security, the state machine and the audit tables, and the AI evals, which run in replay and fallback mode. The SQL tests use `TEST_DB_OWNER_URL` and `TEST_APP_DATABASE_URL` if set, otherwise the normal URLs, so point them at a database you can lose.

## Deploying

The app is set up for Vercel with a Postgres database such as Neon. Run `pnpm db:migrate`, `pnpm db:role` and `pnpm db:seed` against the hosted database first. Seeding a hosted database requires `PERSONA_PASSWORD`. Environment variables, by name:

- Required: `DB_OWNER_URL` (migrations only), `APP_DATABASE_URL`, `APP_SERVER_PASSWORD`, `AUTH_SECRET`, `GATE_COOKIE_SECRET`, `GATE_PASSCODE`
- Storage: `BLOB_READ_WRITE_TOKEN`
- Reminders cron (`vercel.json`, daily): `CRON_SECRET`
- Optional AI: `ANTHROPIC_API_KEY`, `AI_MODEL_FORM`, `AI_MODEL_NOTE`, `AI_PRICE_PER_MTOK`
- Optional: `DEMO_TODAY`, `DB_POOL_MAX`

CI (`.github/workflows/ci.yml`) runs migrations, seed, lint, type check, tests, the evidence script and a build against a Postgres service. It deploys only if the repository variable `DEPLOY_ENABLED` is `true`.

## Layout

```
app/          routes: portal/ (organizations), finance/, trust/, login, gate, api/
components/   ui/ primitives, shell/, forms/, report/, charts/
lib/          db, auth, session, rules/ (validation), ai/, storage, forms/
db/migrations ordered SQL: roles, tables, audit, access policies, workflow
scripts/      migrate, role-password, seed, trust, make-templates
tests/        unit/, sql/, eval/
fixtures/     sample Word templates for form import
```

## Known limits

- With no API key the AI features only replay recorded responses or use rules. Live calls are wired but I have not run them against a model here.
- Azure Government is the production path I would propose for a real engagement. This is not deployed there, and it has no compliance review behind it.
- Email is not sent. Reminders and return notes are written to an outbox table you can read in the finance screens.
