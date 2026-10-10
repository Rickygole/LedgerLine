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

## Interface conventions

Status badges (`components/ui/status-badge.tsx`) always pair a color with an icon and a word, so color is never the only signal. Each color has one meaning:

| Tone | Color | Meaning | Examples |
| --- | --- | --- | --- |
| `ok` | Green | Done or in good standing | Accepted, Active, Registered, Published |
| `warn` | Amber | Someone needs to act | Update requested, flags, due soon, no published form |
| `bad` | Red | Late, failed or missing | Missing, past due, failed message |
| `info` | Blue | In progress or waiting on someone else | Submitted, In review, Registration pending, Will be queued, Invited |
| `neutral` | Gray | A plain fact or a closed state | Not started, Draft, Queued, Deactivated, Retired, categories |

Pick the tone by meaning, not by how eye catching it is. Amber is for things that need action; a queued email or a pending registration is not a warning.

Numbers use `formatCurrency` and `formatCount` from `lib/rules/money.ts`: thousands separators everywhere, cents on budget screens, whole dollars (`formatCurrency(value, { cents: false })`) on lists and summaries. Audit events are worded only through `lib/finance/audit-actions.ts`; a unit test fails if the database or the app can write an action that has no wording there. Staff tables use `<Table density="compact">`, and list tables pass `stack` so rows become cards on phones. An end to end test fails if any finance table scrolls sideways at 1440 pixels with the sidebar open.

## Requirement evidence

`/trust` lists each requirement ID from `traceability.json` with the tests that cover it. Tests carry the ID in their title, for example `[BR-008]`. `scripts/trust.ts` reads the test results from `reports/` and writes `app/trust/evidence.json`, which the page renders. `pnpm evidence` produces that file locally, and the page says when a run was local. CI regenerates it and uploads it as a build artifact but does not commit it, so the file in the repository shows the last local run until someone runs `pnpm evidence` again.

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
| `pnpm db:seed` | Reset and load the starting data set |
| `pnpm db:seed:live` | Reseed the hosted database. Reads the owner connection string from the first line of `.env.neon` and `NEON_PERSONA_PASSWORD` from `.env.neon-app`, prints only the host, and asks you to type the host name first |
| `pnpm preset <scene>` | Reset one demo scene on the local database: `fresh` (full reseed), `maria` (her overdue draft back to half filled with an empty budget), `daniel` (one of her reports under review with an open flag), `priya` (remove initiatives created since the last reseed). Add `--live` to target the hosted database with the same host confirmation. Uses the owner connection only and is not part of the deployed app |
| `pnpm cron:reminders` | Call the reminders cron route of the running app |
| `pnpm evidence` | Run tests and regenerate `app/trust/evidence.json` |

## Tests

`pnpm test:unit` needs no database. `pnpm test` adds the SQL tests, which run against the real database and check row level security, the state machine and the audit tables, and the AI evals, which run in replay and fallback mode. The SQL tests use `TEST_DB_OWNER_URL` and `TEST_APP_DATABASE_URL` if set, otherwise the normal URLs, so point them at a database you can lose.

## Local model

Both AI features can run on a model served by Ollama on the same machine, with no API key. Set `AI_PROVIDER=ollama`, `AI_MODEL_FORM=qwen3:8b`, `AI_MODEL_NOTE=qwen3:8b` and `AI_TIMEOUT_FACTOR=3`, then run `pnpm eval:live` to score both features against the template set. Without a configured model the app uses recorded runs and the rule based fallback.

## Deploying

The app is set up for Vercel with a Postgres database such as Neon. Run `pnpm db:migrate`, `pnpm db:role` and `pnpm db:seed` against the hosted database first. Seeding a hosted database requires `PERSONA_PASSWORD`. Environment variables, by name:

- Required: `DB_OWNER_URL` (migrations only), `APP_DATABASE_URL`, `APP_SERVER_PASSWORD`, `AUTH_SECRET`, `GATE_COOKIE_SECRET`, `GATE_PASSCODE`
- Storage: `BLOB_READ_WRITE_TOKEN`
- Reminders cron (`vercel.json`, daily): `CRON_SECRET`
- Optional email delivery: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ALLOWLIST`. Without `RESEND_API_KEY` and `EMAIL_FROM`, nothing is emailed and every message is recorded in Messages and the Outbox with the status Recorded. With them, queued messages are delivered through the Resend HTTP API after a submission and by the daily job. A failed send is retried up to three times. `EMAIL_ALLOWLIST` is a comma separated list of addresses or domains such as `@example.org`; when it is set, only those recipients are emailed and other messages are marked Held.
- Optional AI: `AI_PROVIDER` (`anthropic` or `ollama`), `AI_MODEL_FORM`, `AI_MODEL_NOTE`, `ANTHROPIC_API_KEY`, `OLLAMA_URL`, `AI_TIMEOUT_FACTOR`, `AI_PRICE_PER_MTOK`
- Optional: `DEMO_TODAY`, `DB_POOL_MAX`

CI (`.github/workflows/ci.yml`) runs migrations, seed, lint, type check, tests, the evidence script and a build against a Postgres service. It deploys only if the repository variable `DEPLOY_ENABLED` is `true`.

## Running the reminders locally

The reminders job is the route `/api/cron/reminders`. On Vercel the schedule in `vercel.json` calls it once a day. Locally, set `CRON_SECRET` in `.env.local` (any string), start the app, then run `pnpm cron:reminders`. The script sends the secret as a bearer token to `APP_URL`, or to `http://localhost:3000` when that is not set, and prints the date it used and how many reminders it queued. Use `PORT` to point it at another local port. The route works out today's date in New York, finds every active rule whose date is today for periods due within 120 days, and adds one email per organization and rule to the outbox. Running it twice on the same day queues nothing the second time. Without `CRON_SECRET` the route answers 503, and with a wrong token it answers 401. The seed also loads the reminders that earlier rules already sent, so the outbox shows history from the first run. Seeded history is marked Recorded, never Sent.

## Map data

The council district and borough shapes in `lib/geo` come from NYC Open Data, published by the Department of City Planning: City Council Districts (dataset 872g-cjhh) and Borough Boundaries (dataset gthc-hcne), both the versions clipped to the shoreline, release 26b, downloaded on 2026-10-09 as GeoJSON from `https://data.cityofnewyork.us/api/geospatial/<dataset id>?method=export&format=GeoJSON`. Use of the data is governed by the NYC Open Data Terms of Use at `https://opendata.cityofnewyork.us/overview/#termsofuse`; the datasets carry no separate license field, and the terms were not reviewed in full, so check them before redistributing the files. The shapes are projected from EPSG:2263, simplified to about 100 feet and rounded to a 1000 by 1000 grid, so they are for display only and not for locating an address. A district that crosses a borough line is labelled with the borough that holds most of its area (district 8 is Manhattan). To rebuild, put the two GeoJSON files in `data/raw` (git ignored) as `council.geojson` and `boroughs.geojson`, then run `python3 scripts/build-geo.py` with `shapely`, `pyproj` and `numpy` installed.

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
