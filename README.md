# LedgerLine

LedgerLine is a reporting system built for Estrada Consulting for the NYC Council Initiative Reporting System RFP. It is not an official NYC system. The seed script loads a full set of organizations, initiatives, people and reports so every screen has data to work with.

Funded organizations file mid-year and year-end reports on the Council funding they receive. Council Finance staff track who is on time, late or missing, review what comes in, ask for changes, and export the results.

## Who uses it

- **Funded organization:** sees assigned initiatives and due dates, fills in a report with a budget grid (pasting from a spreadsheet works), attaches files, submits, and reads update requests from Finance.
- **Finance analyst:** sees which reports are on time, late or missing, reviews submissions, flags problems, requests updates, accepts reports, runs saved queries, exports, and sends reminders.
- **Finance admin:** everything an analyst does, plus creating initiatives, publishing report forms, rolling a fiscal year forward, and managing users. Analysts and admins can both correct a submitted answer with a recorded reason. Only admins see `/trust`.
- **View-only:** read access to the finance screens, no actions.

## Running it locally

You need Node 22, pnpm 10 and Docker.

1. Start Postgres:

   ```
   docker run -d --name ledgerline-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ledgerline -p 5432:5432 postgres:16
   ```

2. Copy `.env.example` to `.env.local` and replace the placeholders. The minimum is `DB_OWNER_URL`, `APP_SERVER_PASSWORD` (24 or more URL-safe characters), `APP_DATABASE_URL` (same password), `AUTH_SECRET`, `GATE_COOKIE_SECRET` and `GATE_PASSCODE`. Set `PERSONA_PASSWORD` for the seeded users; on a local database the seed has a default if you leave it out, and it refuses that default on any other host. `DEMO_TODAY` pins the date the app treats as today.

3. Install, migrate, give the app role a login, and seed:

   ```
   pnpm install
   pnpm db:migrate
   pnpm db:role
   pnpm db:seed
   ```

4. Start the app with `pnpm dev` and open http://localhost:3000. Enter the passcode from `GATE_PASSCODE` on the access code page, then sign in as a seeded user with `PERSONA_PASSWORD`. The seeded emails are listed on the sign-in page.

Scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev`, `pnpm build`, `pnpm start` | Next.js dev server, production build, production server |
| `pnpm lint`, `pnpm typecheck` | ESLint, `tsc --noEmit` |
| `pnpm test` | Every Vitest suite: unit, SQL and eval |
| `pnpm test:unit` | Unit tests only, no database needed |
| `pnpm e2e` | Playwright against a production build served on port 3105 (`E2E_PORT` changes it). Reseeds the database |
| `pnpm evidence` | Vitest, Playwright, then `scripts/trust.ts`, which regenerates `app/trust/evidence.json` |
| `pnpm eval:live` | Score a local Ollama model against the form and note evaluation sets, see `docs/ai-eval.md` |
| `pnpm db:migrate` | Apply the SQL files in `db/migrations` |
| `pnpm db:role` | Set the `app_server` password from `APP_SERVER_PASSWORD` and allow it to log in |
| `pnpm db:seed` | Erase and reload the starting data set on the database in `DB_OWNER_URL` |
| `pnpm db:seed:live` | Reseed the hosted database. Reads the owner connection string from the first line of `.env.neon` and `NEON_PERSONA_PASSWORD` from `.env.neon-app`, prints the host, and asks you to type it before it changes anything |
| `pnpm preset <scene>` | Reset one walkthrough scene: `fresh` (full reseed), `maria` (her overdue draft back to half filled with an empty budget), `daniel` (one of her reports under review with an open flag), `priya` (remove initiatives created since the last reseed). Add `--live` to target the hosted database with the same host confirmation. It uses the owner connection and is not part of the deployed app |
| `pnpm demo-desk` | Write the budget, oversize PDF and Word files used in the walkthrough to `fixtures/demo-desk/` (git ignored). `--award <dollars>` overrides the award it sizes the budget files to |
| `pnpm break <rule>` | Try to defeat one business rule against the running app and print each refusal. Rules: BR-022, BR-010, BR-021, BR-012, BR-019, US-057 |
| `pnpm test:rule <id>` | Run the tests tagged with one requirement ID |
| `pnpm cron:reminders` | Call the reminders route of a running app |

### Reminders

The reminders job is the route `/api/cron/reminders`. On Vercel the schedule in `vercel.json` calls it once a day. Locally, set `CRON_SECRET` in `.env.local` (any string), start the app, then run `pnpm cron:reminders`. The script sends the secret as a bearer token to `APP_URL`, or to `http://localhost:3000` when that is not set (`PORT` picks another local port), and prints the date it used and how many reminders it queued. The route works out today's date in New York, finds every active rule whose date is today for periods due within 120 days, and adds one email per organization and rule to the outbox. Running it twice on the same day queues nothing the second time. Without `CRON_SECRET` the route answers 503, and with a wrong token it answers 401. Seeded history is marked Recorded, never Sent.

## Tests

- **Unit** (`tests/unit`): rules, formatting, parsers, AI guards. No database needed.
- **SQL** (`tests/sql`): run against a real Postgres and check row level security, the state machine, the audit tables and retention. They use `TEST_DB_OWNER_URL` and `TEST_APP_DATABASE_URL` if set, otherwise the normal URLs, so point them at a database you can lose.
- **Eval** (`tests/eval`): score the form drafting and return note features in replay and rule-based mode. No model is called.
- **End to end** (`tests/e2e`): Playwright drives a production build through the main flows for each role, plus access control, accessibility and table layout checks. The global setup reseeds the database. Run `pnpm build` first; Playwright starts `pnpm start` itself if nothing is listening.
- **Live eval** (`tests/live`): `pnpm eval:live` scores a local Ollama model. It is not part of `pnpm test`.
- **Evidence**: `pnpm evidence` runs Vitest and Playwright and then writes `app/trust/evidence.json` from the results (see Requirements traceability).

CI (`.github/workflows/ci.yml`) runs migrations, role setup and seed, lint, type check, the Vitest suites, a build, the Playwright suite and the evidence script against a Postgres service, and uploads `reports` and `app/trust/evidence.json` as an artifact. It deploys to Vercel only from main and only if the repository variable `DEPLOY_ENABLED` is `true`. `docs/runbook.md` is the 10 minute walkthrough.

## Deployment

The app is set up for Vercel with a Postgres database such as Neon. Run `pnpm db:migrate`, `pnpm db:role` and `pnpm db:seed` against the hosted database first. Seeding a hosted database requires `PERSONA_PASSWORD`. Environment variables, by name:

- Required: `DB_OWNER_URL` (migrations only), `APP_DATABASE_URL`, `APP_SERVER_PASSWORD`, `AUTH_SECRET`, `GATE_COOKIE_SECRET`, `GATE_PASSCODE`
- Storage: `BLOB_READ_WRITE_TOKEN`. Without it uploads go to a local `.storage` folder
- Reminders cron (`vercel.json`, daily): `CRON_SECRET`
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ALLOWLIST`. Delivery happens through the Resend HTTP API only when both `RESEND_API_KEY` and `EMAIL_FROM` are set. Otherwise every message is written to the outbox and shown as Recorded in Messages and the Outbox. When delivery is on, queued messages are sent after a submission and by the daily job, and a failed send is retried up to three times. `EMAIL_ALLOWLIST` is a comma separated list of addresses or domains such as `@example.org`; when it is set, only those recipients are emailed and other messages are marked Held.
- AI: `AI_PROVIDER` (`anthropic` or `ollama`), `AI_MODEL_FORM`, `AI_MODEL_NOTE`, `ANTHROPIC_API_KEY`, `OLLAMA_URL`, `AI_TIMEOUT_FACTOR`, `AI_PRICE_PER_MTOK`. The deployed site sets none of them, so it runs on the saved replays and the rule-based fallback.
- Other: `DEMO_TODAY`, `DB_POOL_MAX`

## Architecture

Next.js 15 (App Router, server components and server actions), React 19, Tailwind 4 and TypeScript, on Postgres 16. The browser never talks to the database; every read and write goes through a server component or action, and the database enforces the rules whether or not the application remembers to.

**Access is decided in Postgres.** Row level security policies on every report table filter rows by the user and role set for the current transaction. `withClaims` in `lib/db.ts` opens a transaction, sets those claims locally, runs the query and commits, so a pooled connection never carries one user's identity into another request. The app connects as `app_server`, a role that holds only the column and function grants it needs. It cannot read password hashes, and it cannot insert or change audit rows except through the audit function, which it may call. Row level security and the definer functions protect against application bugs and against other organizations; they are not a defense against a fully compromised application server, which can still call every function the role has been granted.

**Status changes go through one function.** A submission changes status only through `app.transition_submission`, which checks the action, the caller's role and a lock version, and writes the audit row in the same transaction. A submit also needs the lock version it was prepared from, a snapshot whose budget total matches the saved budget lines, and a saved budget equal to the award when the form requires it, so a direct call to the function cannot file an unbalanced report. Two people acting on the same report cannot both win: the second gets a stale-version error and is shown the current state. Corrections and form publishing have their own functions.

**History is append-only.** Triggers on the audit and revision tables reject UPDATE, DELETE and TRUNCATE for every role, including the table owner. Each submit and each correction stores a full snapshot with its SHA-256 hash. The preset scripts switch the triggers off while they reset a scene, as the table owner, and record each reset in `demo_reset`.

**Email goes through an outbox.** Messages are written to the `outbox` table in the same transaction as the action that caused them, so a message exists exactly when its action committed. A dispatcher in `lib/outbox-dispatch.ts` delivers them through Resend when it is configured; otherwise they stay recorded.

**Autosave is optimistic.** The report editor saves on a short delay with the row's lock version and an idempotent save id, so a retried request after a dropped connection does not double-write, and a stale tab is told so instead of overwriting a newer save.

**AI proposes, people decide.** Two features use a model: importing a report form from a Word template, and drafting the note when Finance requests an update. Nothing is written until a person reviews and approves it, each call is logged in `ai_action`, and model output is validated before anyone sees it. A form field must quote text found in the cited paragraph, and a note sentence is dropped if it cites no input rule, a rule that was not supplied, or a dollar figure that was not supplied.

A model served by Ollama on the same machine is supported and was evaluated (`docs/ai-eval.md`): qwen3:8b for form drafting and qwen3:4b for notes. To use them set `AI_PROVIDER=ollama`, `AI_MODEL_FORM=qwen3:8b`, `AI_MODEL_NOTE=qwen3:4b` and `AI_TIMEOUT_FACTOR=2`. Without a configured model, form import falls back to a saved, reviewed draft for the known templates or to a rule-based draft, and notes are built from the report rules; the screen says which one you got. The deployed site has no model and always uses these fallbacks. The adapter also accepts the Anthropic API, but that path was not evaluated.

Uploads go to Vercel Blob in production and to `.storage` otherwise. Sign-in is a shared passcode gate, then a per-user password and a signed, HttpOnly session cookie that lasts eight hours.

Layout:

```
app/          routes: portal/ (organizations), finance/, trust/, login, gate, reset, get-help, (info)/, api/
components/   ui/, shell/, forms/, report/, charts/, finance/, portal/, ops/
lib/          db, auth, session, email, outbox-dispatch, storage, throttle, csp
              rules/ (validation), ai/, forms/, report/, portal/, finance/, lifecycle/, ops/, export/, geo/
db/migrations ordered SQL: roles, tables, audit, access policies, workflow, throttle, outbox
scripts/      migrate, role-password, seed*, preset(s), trust, break, test-rule, make-templates, make-demo-desk, run-reminders
tests/        unit/, sql/, eval/, e2e/, live/
fixtures/     templates/ (Word files for form import)
patches/      pnpm patch for Next.js
vendor/       vendored xlsx tarball
docs/         runbook, azure, ai-eval
```

### Dependency patches

`patches/next@15.5.27.patch` fixes a scheduling bug in the copy of react-dom that Next 15.5 vendors under `next/dist/compiled`. `pingSuspendedRoot` dropped a ping that arrived while React was rendering, so when a React Server Components response streamed in several chunks a transition could be left pending and the page looked stuck. The patch records the ping instead of discarding it, in both the development and production builds. pnpm applies it on install through `patchedDependencies` in `pnpm-workspace.yaml`. Remove it when moving to Next 16.

`xlsx` is installed from `vendor/xlsx-0.20.3.tgz` because SheetJS publishes current releases from its own server and not to npm, and the npm copy is old and carries known advisories. Vendoring the tarball keeps installs reproducible and offline-safe.

## Security notes

- Sign-in needs the shared passcode and then a personal password. Passwords are bcrypt hashed, at least 12 characters and not equal to the email address. Failed sign-ins are counted per email and per address in the database; gate entries are counted per address.
- Reset and invitation tokens are random, single use, expire quickly, and only their SHA-256 hash is stored.
- A nonce based Content Security Policy blocks inline scripts and framing (`lib/csp.ts`, `middleware.ts`).
- Every validation rule is re-checked on the server when data is written. Uploads are limited to 25 MB per file, checked by type and, for Office files, by content. Spreadsheet exports guard against formula injection.
- The cron route compares its bearer token in constant time.
- The database connection requires TLS for any host that is not localhost.
- A hosted database cannot be seeded with the default seed password.
- `docs/azure.md` lists the controls the code implements against NIST SP 800-53 and the ones it does not.

## Requirements traceability

`/trust`, visible to Finance admins, lists each requirement ID from `traceability.json` with the tests that cover it. The IDs are the client's user stories (US-nnn) and business rules (BR-nnn). Tests carry the ID in their title, for example `[BR-008]`. `scripts/trust.ts` reads the test results from `reports/` and writes `app/trust/evidence.json`, which the page renders. A requirement is Verified when a tagged test passed on its first attempt, Failing when one did not, and otherwise Demonstrated or Planned according to its entry in `traceability.json`. `pnpm evidence` produces the file locally and the page says when a run was local. CI regenerates it and uploads it as a build artifact but does not commit it, so the file in the repository shows the last local run.

## Interface conventions

Status badges (`components/ui/status-badge.tsx`) pair a color with an icon and a word, so color is never the only signal. Each color has one meaning:

| Tone | Color | Meaning | Examples |
| --- | --- | --- | --- |
| `ok` | Green | Done or in good standing | Accepted, Active, Registered, Published |
| `warn` | Amber | Someone needs to act | Update requested, flags, due soon, no published form |
| `bad` | Red | Late, failed or missing | Missing, past due, failed message |
| `info` | Blue | In progress or waiting on someone else | Submitted, In review, Registration pending, Will be queued, Invited |
| `neutral` | Gray | A plain fact or a closed state | Not started, Draft, Queued, Deactivated, Retired, categories |

Pick the tone by meaning. Amber is for things that need action; a queued email or a pending registration is not a warning. Audit events are worded only through `lib/finance/audit-actions.ts`, and a unit test fails if the database or the app can write an action with no wording there. Staff tables use `<Table density="compact">`, and list tables pass `stack` so rows become cards on phones.

## Map data

The council district and borough shapes in `lib/geo` come from NYC Open Data, published by the Department of City Planning: City Council Districts (dataset 872g-cjhh) and Borough Boundaries (dataset gthc-hcne), both the versions clipped to the shoreline, release 26b, downloaded on 2026-10-09 as GeoJSON from `https://data.cityofnewyork.us/api/geospatial/<dataset id>?method=export&format=GeoJSON`. Use of the data is governed by the NYC Open Data Terms of Use at `https://opendata.cityofnewyork.us/overview/#termsofuse`; the datasets carry no separate license field, and the terms were not reviewed in full, so check them before redistributing the files. The shapes are projected from EPSG:2263, simplified to about 100 feet and rounded to a 1000 by 1000 grid, so they are for display only and not for locating an address. A district that crosses a borough line is labelled with the borough that holds most of its area (district 8 is Manhattan). To rebuild, put the two GeoJSON files in `data/raw` (git ignored) as `council.geojson` and `boroughs.geojson`, then run `python3 scripts/build-geo.py` with `shapely`, `pyproj` and `numpy` installed.

## Known limits

- Email goes out through Resend only when it is configured. Otherwise messages are recorded in the outbox and shown as Recorded.
- Live AI was evaluated with local Ollama models on three templates and five note cases (`docs/ai-eval.md`), not with a hosted API. The deployed site has no model.
- Azure Government is the production path I would propose for a real engagement (`docs/azure.md`). This is not deployed there and has no compliance review behind it.
- Staff sign in with a password and no second factor. The shared passcode gate is an interim access measure.
- Autosave waits 1.2 seconds after the last edit. Leaving the page before the Saved label appears can lose that edit.
- Word form import accepts .docx files up to 2 MB.
- The district and borough maps are for display only and cannot locate an address.
