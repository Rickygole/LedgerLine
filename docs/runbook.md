# Demo runbook

For the demonstration to Estrada Consulting on Wednesday, October 14, 2026. Every click below was run against a production build (`pnpm build`, `pnpm start`) on this laptop with the seeded database, using Chromium driven by a script, and the timings are what that run measured. Timings come from a fast local database and an idle machine, so treat them as the floor. Where something did not work or was slow, it is listed under "Problems found" at the end.

Two commands described here come from the main branch and were not run on this branch: `pnpm preset <fresh|maria|daniel|priya> [--live]` and `pnpm db:seed:live`. On this branch `pnpm db:seed` does the same job as `pnpm preset fresh` and took 1.3 s. The outbox status "Recorded" (shown when email delivery is switched off) is also on main only; on this branch the outbox shows the message with its template and recipient and no status.

## 1. Setup

| Item | Value |
| --- | --- |
| App on the demo laptop | `pnpm build`, then `pnpm start -p 3000` (any free port works) |
| Passcode on the gate page | `ledger-demo` |
| Password for every persona | `ledgerline-demo` (the seed default when `PERSONA_PASSWORD` is not set) |
| Maria Santos, funded organization | `maria.santos@motthavenyouth.example.org` |
| James Okafor, her colleague | `james.okafor@motthavenyouth.example.org` |
| Daniel Cho, Finance analyst | `daniel.cho@finance.example.gov` |
| Priya Raman, Finance administrator | `priya.raman@finance.example.gov` |
| Grace Chen, Finance, read only | `grace.chen@finance.example.gov` |
| "Today" in the app | 2026-10-14 (`DEMO_TODAY` in `.env.local`) |

To run the live local model, add this to `.env.local` before `pnpm build` and `pnpm start`:

```
AI_PROVIDER=ollama
AI_MODEL_FORM=qwen3:8b
AI_MODEL_NOTE=qwen3:4b
AI_TIMEOUT_FACTOR=2
```

The evidence for those choices is in `docs/ai-eval.md`. Ollama must be running (`ollama list` answers) and both models should be loaded once before the demo (see T-60).

## 2. Files on the Desktop

Run `pnpm demo-desk`. It writes `fixtures/demo-desk/` (ignored by git) and sizes the budget files to Maria's $85,000.00 award on Mentor Match Network. Copy the folder to the Desktop.

| File | Used for |
| --- | --- |
| `budget-over-award.xlsx` | Maria's budget paste. Six lines, total $86,750.00, which is $1,750.00 over the award |
| `budget-balanced.xlsx` | The same six lines at exactly $85,000.00 (backup if the edit goes wrong) |
| `scan-31MB.pdf` | Refused with "This file is 31.0 MB, which is over the 25.0 MB limit for one file." |
| `scan-24MB.pdf` | Accepted (under the 25 MB limit) |
| `legacy-template.docx` | Priya's Word import (senior digital literacy template, 11 questions) |
| `legacy-template-held-out.docx` | The template with the hidden instruction, for the "break it" answer on AI |

If the award on the demo database is different, run `pnpm demo-desk --award <dollars>` or just run it again after a reseed.

## 3. Fallbacks, in the order to reach for them

| Problem | Do this | Cost |
| --- | --- | --- |
| Word import is taking more than 45 seconds | Say: "Slow network; this is the saved, reviewed draft for this template, same checks." Then switch to the second server (below) and repeat the import | The replay appears in about 0.13 s. Restarting the app takes about 4 s |
| Return note takes more than 10 seconds or fails | Nothing to do. If the model is not reachable the note is written from the report rules automatically and labeled "Drafted from the rules". Say: "That is the fail-safe" | Instant |
| Model is not running at all | Same as above: the form import falls back to the saved draft when the template is known, otherwise to the rule-based draft (0.26 s) | Instant |
| A scene is broken or a rehearsal left clutter | `pnpm preset <scene>` for one scene or `pnpm preset fresh` for everything. On this branch: `pnpm db:seed` (1.3 s) | Under 10 s |
| Sign-in says "Too many attempts. Wait 15 minutes" | Clear the counter: `psql "$DB_OWNER_URL" -c "delete from auth_attempt"` | 1 s |
| Deployed site down | Use localhost on the laptop | |
| Laptop app down too | Backup video | |

Second server for the replay path: in another terminal, `AI_PROVIDER= AI_MODEL_FORM= pnpm start -p 3002`. With no model configured the form import uses the saved draft for any of the three known templates. Sessions are cookies on a different port, so sign in again as Priya there. Tested: the held-out template drafted in 0.13 s with the label "Drafted from the rules and a saved, reviewed draft for this template. No model was used."

Turning the AI switch off in the database (`update app_setting set value='false'::jsonb where key='ai_enabled'`) makes both features use the rule-based draft instead and does not use the saved drafts. There is no screen for this switch on this branch.

## 4. T-60 checklist (one hour before)

1. `ollama list` shows qwen3:8b and qwen3:4b. Quit anything large (no 14b model loaded).
2. `pnpm build`, `pnpm start -p 3000`. Open `/gate` and confirm the page loads.
3. `pnpm preset fresh` (or `pnpm db:seed`), then `psql "$DB_OWNER_URL" -c "delete from auth_attempt"`.
4. Warm the models once: as Priya, import `legacy-template.docx` and wait for the draft (about 50 s the first time, about 40 s after), then discard it. As Daniel, open a report, Request update, tick all, Draft a note (about 6 s). The first call after the model loads is the slow one.
5. `pnpm demo-desk`, copy `fixtures/demo-desk` to the Desktop.
6. Chrome profiles signed in as Maria, Daniel and Priya. Display 1920 by 1080 at 125 percent. Notifications off.
7. Hotspot tested. Backup video open offline.
8. Run `pnpm break BR-022` once as a rehearsal (about 11 s). Run `pnpm preset fresh` again afterward.

## 5. T-10 checklist

1. `pnpm preset fresh`. Clear sign-in attempts as above.
2. Open `/finance` as Daniel and note the Missing count. After a fresh seed it reads 75 for FY26 Year-End, with 175 initiatives and $30.0M awarded across 442 awards.
3. Confirm Maria's report page opens: Mentor Match Network, FY26 Year-End, 14 days past due, $85,000.00.
4. Ollama answers: `curl -s localhost:11434/api/tags`.
5. Do not run `pnpm test:rule` or the browser tests before the demo. They reseed the database.

## 6. The 10 minute product path

Opening line (15 s): "This is what your top three orals slot could show NYC Council Finance, with invented data and the tasks the RFP scores at 30 percent. Near the end you pick one of five rules and I try to break it in front of you."

| Min | Persona and URL | Clicks | One line to say | If it fails |
| --- | --- | --- | --- | --- |
| 0:00 | Daniel, `/finance` | Sign in at `/gate` with the passcode, then the login page. The dashboard opens. Point at 175 initiatives, $30.0M, Missing 75, Waiting for review 39. Click Submissions, choose Category "Youth Services" and Borough "Bronx", click Apply filters | "Council's view: who is missing and who is waiting, and any combination of filters in one click." | Reload the page. If a filter does nothing, click Clear filters |
| 1:00 | Maria, `/portal` | Sign in as Maria. "Action needed: Mentor Match Network, FY26 Year-End, 14 days past due". Click Submission history (James Okafor's report is listed). Click My reports, then Continue report | "Anyone in her organization sees the organization's reports, including James's." | `pnpm preset maria` |
| 1:45 | Maria, report page | The legal name and EIN are already filled from the Council master list. Fill the remaining answers (contact, counts, delivery model, Yes or No). Click Paste box, paste the rows copied from `budget-over-award.xlsx` (select the three columns in Excel and press Cmd+C), click Add pasted rows | "Paste straight from Excel. The total is $1,750.00 over the award." | Use `budget-balanced.xlsx` and skip to Submit |
| 3:00 | Maria | Click Submit report. The red summary reads: "Fix 1 problem before you submit. Total $86,750.00 must equal award $85,000.00 (over by $1,750.00)." Say the planted line: "Remember this message. Later you choose a rule and I try to get around it." Reduce the last line's approved budget by $1,750.00. The page says "Balanced to award $85,000.00" | "The system refuses and tells her exactly what is wrong." | Reload and retype the last line |
| 4:00 | Maria | Under Attachments choose `scan-31MB.pdf`: "Not uploaded. This file is 31.0 MB, which is over the 25.0 MB limit for one file." Choose `scan-24MB.pdf`: "1 attached". Wait about 3 seconds for the Saved label, then reload the page to show the work is still there | "Large files refused clearly, the report resumes where she left it." | Skip the reload |
| 5:00 | Maria | Check the certification box, enter name and title, click Submit report. "Report received", reference LL-26YE-00002. Click Messages: the confirmation email copy is first in the list | "She gets a copy of exactly what was submitted." | If Submit refuses, read the message aloud and fix it, that is the point |
| 5:45 | Daniel, `/finance` | Reload the dashboard. Missing is 74 (was 75). Open `/finance/submissions?q=13-4027118&period=FY26-YE` (or Submissions, search `13-4027118`) and click LL-26YE-00002 | "Council's missing count dropped by one the moment she submitted." | |
| 6:30 | Daniel, report page | Click "Add a manual flag", type "Supplies line needs a vendor breakdown", click Add manual flag. Click Request update. The three problems are listed with tick boxes. Tick all. Click Draft a note (6 to 8 s). Read the AI draft aloud, click Accept, click Send to organization | "The AI only proposes, a named person sends it, and every sentence is tied to a rule." | If the draft is slow or errors the rule-based note appears, labeled "Drafted from the rules". Say "That is the fail-safe" |
| 8:00 | Priya, `/finance/initiatives/new` | Initiative name "Neighborhood Tutoring Network", pick a Category, type a description, click Create and continue. Step 2: type Mott in Find an organization, click Add, enter 40000, Save and continue. Step 3: click Import a Word template | "A new report type without a code change." | |
| 8:45 | Priya, form page | Choose `legacy-template.docx` in the file field, click Draft the form. About 40 s (see below). While waiting say the governance line. The draft shows 11 questions, each "Quote matches the template". Click Accept on each, then "Add 11 accepted questions" | Governance line: "The AI only proposes. It sees no contacts and takes no actions. The system checks every citation against the source, and a named person approves." | At 45 s switch to the second server (Section 3) |
| 9:30 | Priya | Click Publish, then Publish version 1. "Version 1 is published." Switch to Maria, My reports: the new initiative is there with Start report | "Published, and the organization sees it." | |

The Word import is the only real wait on this path. Everything else responds in under 3 seconds.

## 7. The 20 minute full version

Run the 10 minute path, then add these in this order. If time runs short, drop in this order: correction, Excel and charts, James and autofill, Azure down to 1 minute.

| Min | Beat | Persona and URL | Clicks | One line | If it fails |
| --- | --- | --- | --- | --- | --- |
| 10:00 | Resubmit | Maria, `/portal` | "Finance asked for changes" appears with an Update report button. Open it: the note is shown at the top. Change Report contact title to "Executive Director", wait 2 seconds, tick the certification, click Submit report | "She sees the note, fixes it, resubmits. Revision 2." | |
| 11:00 | Accept and correct | Daniel, same report | Click Accept report: "This report is accepted." Click "Correct an answer", Question "Report contact title", New value "Chief Program Officer", Reason "Title confirmed by phone with the organization", Save correction. Scroll to Audit timeline | "A correction after acceptance needs a reason and leaves a permanent record." | |
| 12:30 | Excel and charts | Daniel, `/finance/submissions` | Click Excel (download `ledgerline-submissions-FY26-YE-2026-10-14.xlsx`, 0.3 s). Back on `/finance`, show the two charts and View as table | "Everything on screen leaves as Excel." | Use the CSV link |
| 13:30 | Five rules | Ricky, terminal | Ask Rafael to pick one. Run the command in Section 8 and read the one plain line | "Pick one. I will show you the test, then try to break it in front of you." | If the command fails, show the same refusal in the browser (see Section 8) |
| 14:30 | How it was built | Priya, `/trust` | Open `/trust`: the requirement IDs, the test counts and the build it came from | "Every claim here has a record you can open." | |
| 17:00 | Azure and delivery | Priya, `/finance/platform` | Show the control table, then speak from `docs/azure.md` | "Same database design moves across unchanged." | |
| 19:00 | Close | | Stop on: "The proposal is due October 20. Here is what I would have ready for it. What would you want first?" | | |

Held-out template (use only if asked "can it be tricked"): as Priya import `legacy-template-held-out.docx`. The draft shows the notice "Paragraph 9 reads like an instruction to the drafting tool. It was treated as template text and ignored." and no address field.

## 8. The five "break it" rules

Run from the repository root with the app running. The default port is 3105, so set `E2E_PORT` to the port the app is on, for example `E2E_PORT=3000 pnpm break BR-022`. Each command signs Maria in once, takes about 11 s for the ones that use a browser and about 1 to 3 s for the database ones, and removes any scratch report it made. The output below is real.

| Rule | Command | What the screen prints |
| --- | --- | --- |
| BR-022 budget must equal the award | `pnpm break BR-022` | `REFUSED: A budget of $50,000.00 against an award of $62,500.00 was refused at submit and the report stayed a draft.` and `REFUSED: A direct status change by the organization's own account was refused by the database.` |
| BR-010 organizations are isolated | `pnpm break BR-010` | `REFUSED: Another organization's report address returned not found to Maria.`, `REFUSED: Row-level security showed Maria none of the other organizations' reports.`, `REFUSED: A storage path under another organization's EIN was refused.` |
| BR-021 required answers | `pnpm break BR-021` | `REFUSED: The empty report was refused with 14 problems listed, and it stayed a draft.` |
| BR-012 25 MB file limit | `pnpm break BR-012` | `REFUSED: A 26 MB file was refused before it was sent, with its size and the limit stated.` and `REFUSED: The server upload check refused a 31 MB file and stated the size.` |
| BR-019 and US-057 audit and retention | `pnpm break BR-019` (also `US-057`) | `REFUSED: An analyst's attempt to edit an audit event was refused by the database.`, `...delete a submitted revision...`, and `REFUSED: Even the table owner's edit of an audit event was rejected by the append-only trigger.` |

Each attempt prints a raw line under the plain one (for example `42501 permission denied for table audit_event`). The last line reads "All N attempts on BR-0xx were refused."

Prepared answer to "who can change the audit log": "The database owner can drop the guard, which is how I reset this demo, and that reset is logged. Production adds an Azure immutability policy plus database audit logging."

Engineers only: `pnpm test:rule BR-022` runs the tests tagged with the rule. It reseeds the database when it runs the browser part, so run `pnpm preset fresh` afterward.

## 9. Timings measured in the production build

Chromium driven by script, local Postgres, idle machine. Sign-in includes the gate.

| Step | Measured |
| --- | --- |
| Gate and sign in | 0.4 to 0.8 s |
| Portal pages (list, history, organization, messages) | 0.07 to 0.12 s |
| Finance dashboard | 0.24 to 1.3 s |
| Submissions list, filtered | 0.2 to 1.1 s |
| Open a submission | 0.8 to 2.0 s |
| Paste six rows and add them | 0.06 s |
| Submit refused with the balance message | 0.11 s |
| 31 MB file refused in the browser | 0.02 s |
| 24 MB file accepted | 0.2 s (local, no real network) |
| Submit to "Report received" | 0.1 s first time, 2.8 s on resubmit |
| Return note drafted by qwen3:4b | 6.1 to 8.0 s (three concerns) |
| Send update request, accept, correction | 0.85 s, 0.65 s, 0.27 s |
| Excel export, one organization and all of FY26 Year-End (1.2 MB) | 0.20 s and 0.22 s |
| Word import with qwen3:8b | 49.5 s on the first call after the model loaded, 38 to 40 s after |
| Word import, saved draft | 0.13 s |
| Word import, rule-based draft | 0.26 s |
| `pnpm db:seed` | 1.3 s |
| `pnpm build` | 44 s |

## 10. Problems found

1. **Sign-in lockout during rehearsal.** Every gate entry and every sign-in counts as an attempt, successful or not. The limits are 8 sign-ins per email, 30 per address and 20 gate entries per address in 15 minutes (`app/actions/session.ts`, `db/migrations/0008_throttle.sql`). Repro: run the demo path three times in a row, or sign in as Daniel nine times. The next sign-in shows "Too many attempts. Wait 15 minutes and try again." and I hit it twice during this work. Fix at the moment: `psql "$DB_OWNER_URL" -c "delete from auth_attempt"`. Suggested change, not made: count only failed attempts. Run the clear command at T-10.
2. **`pnpm break` was broken for three of five rules (fixed in `scripts/break.ts`).** BR-022, BR-021 and BR-012 failed with "Could not start a scratch report: not_found" because the script picked one of Maria's FY26 awards for an FY27 period. BR-012 then waited for text the app no longer shows ("26 MB. The limit is 25 MB."). Both fixed, all five rules now print refusals.
3. **The BR-012 server attempt is not an HTTP upload.** The second BR-012 attack calls the upload check function with a 31 MB size, it does not send 31 MB to the running server. It proves the rule, not the route. A real upload of a 31 MB file through the browser path is refused by the browser first.
4. **The AI switch off does not use the saved drafts.** `AI_ENABLED` false gives the rule-based draft. The saved draft (replay) is used only when a model is not configured or the call fails or times out. The plan assumed an off switch would show replays. Use the second server in Section 3 for the replay path. There is no screen for the switch on this branch.
5. **Word import is close to the 45 second line.** qwen3:8b takes 38 to 40 s warm and 49.5 s on the first call after a model load. With `AI_TIMEOUT_FACTOR=2` the app waits up to 90 s before falling back by itself, so the 45 s decision is the presenter's. Warm the model at T-60.
6. **Autosave waits 1.2 s.** Repro: paste budget rows and reload the page within a second. The rows are gone. Wait for the Saved label (or about 2 s) before reloading or leaving.
7. **Return notes from the local model (fixed in `lib/ai`).** A model wrote "as per rule PR-0:02" in a note shown to the organization, because the rule id check only recognizes well formed ids. Another wrote "currently null" because empty values were sent as null. Sentences that mention a rule are now dropped and empty values are no longer sent. Tests added.
8. **`pnpm test:rule` and `pnpm e2e` reseed the database.** The browser part of `test:rule` runs the global setup, which reseeds. Anything staged for the demo is lost. Run `pnpm preset fresh` after.
9. **The AI form draft proposes one extra question on two of three templates with qwen3:4b**, and one wrong field type on the held-out template with qwen3:8b. Both are fixed by the reviewer at accept time, which is the point of the review step, but expect to see it.
10. **Not exercised here:** `pnpm preset <scene>`, `pnpm db:seed:live` and the "Recorded" outbox status (all on main only), the deployed site, a real file upload over a network, and the PDF export. Anything in this runbook that mentions them should be checked after main is merged.
