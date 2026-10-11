# Runbook

For the presentation to Estrada Consulting on Wednesday, October 14, 2026. Every click below was run against a production build (`pnpm build`, `pnpm start`) on Saturday, October 10, 2026, starting from `pnpm preset fresh`, and the labels, counts and timings in it are what that run showed. The path was then regrouped into three use cases with BR-010 as the one break-it rule; that order, the dashboard wording after the latest dashboard changes and the BR-010 slot were not run end to end as a sequence. The timings come from a fast local database and an idle machine, so treat them as the floor. Where a number depends on the seed it is the number a fresh seed produces; reseed and the numbers come back. What was not run: the live local model (the Word import and the note were run on the saved draft and the rule-based note), the PDF export, a real network upload and the hosted site. Known rough edges are under "Problems found" at the end.

## 1. Setup

| Item | Value |
| --- | --- |
| App on the presentation laptop | `pnpm build`, then `pnpm start -p 3000` (any free port works) |
| Passcode on the gate page | The passcode in your access file (`GATE_PASSCODE` in `.env.local` for the laptop) |
| Password for every persona | The persona password in your access file (`PERSONA_PASSWORD` when the database was seeded) |
| Maria Santos, funded organization | `maria.santos@motthavenyouth.example.org` |
| James Okafor, her colleague | `james.okafor@motthavenyouth.example.org` |
| Daniel Cho, Finance analyst | `daniel.cho@finance.example.gov` |
| Priya Raman, Finance administrator | `priya.raman@finance.example.gov` |
| Grace Chen, Finance, read only | `grace.chen@finance.example.gov` |
| "Today" in the app | The real date in New York. On 2026-10-14 the overdue counts below match exactly; on earlier days they read fewer days past due. Set `DEMO_TODAY=2026-10-14` in `.env.local` to pin the date for a local rehearsal |

Sign-in order: open the site, enter the passcode on "Enter your access code", and you land on the start page ("Report on your City Council initiative funding"). Choose "Start now" (or "Sign in") to reach the login page, then sign in as the persona.

To run the live local model, add this to `.env.local` before `pnpm build` and `pnpm start`:

```
AI_PROVIDER=ollama
AI_MODEL_FORM=qwen3:8b
AI_MODEL_NOTE=qwen3:4b
AI_TIMEOUT_FACTOR=2
```

The evidence for those choices is in `docs/ai-eval.md`. Ollama must be running (`ollama list` answers) and both models should be loaded once before the presentation (see T-60). Without these settings the app uses the saved draft for the known templates and builds the note from the report rules, and says so on screen.

## 2. Files on the Desktop

Run `pnpm demo-desk`. It writes `fixtures/demo-desk/` (ignored by git) and sizes the budget files to Maria's overdue award on the seeded database (it prints the initiative and amount: Mentor Match Network, $85,000.00). Copy the folder to the Desktop.

| File | Used for |
| --- | --- |
| `budget-remaining.xlsx` | Maria's budget paste. The two lines her seeded draft is missing ($7,349.00 and $6,250.00), which bring $71,401.00 up to the $85,000.00 award |
| `budget-over-award.xlsx` | Six lines whose total is $1,750.00 over the award, for a rehearsal of the refusal on an empty budget (after `pnpm preset maria`) |
| `budget-balanced.xlsx` | The same six lines at exactly the award. Use it instead of `budget-remaining.xlsx` after `pnpm preset maria`, which leaves her budget empty |
| `scan-31MB.pdf` | Refused with "This file is 31.0 MB, which is over the 25.0 MB limit for one file." |
| `scan-24MB.pdf` | Accepted (under the 25 MB limit) |
| `legacy-template.docx` | Priya's Word import (the senior digital literacy template) |
| `legacy-template-held-out.docx` | The template with the hidden instruction, for the "break it" answer on AI |

If the award on the database is different, run `pnpm demo-desk --award <dollars>` or just run it again after a reseed.

## 3. Fallbacks, in the order to reach for them

| Problem | Do this | Cost |
| --- | --- | --- |
| Word import is taking more than 45 seconds | Say: "The model is running on this laptop and it is slow on this template. I am switching to the saved, reviewed draft for it. It goes through the same citation checks, and the screen says no model was used." Then switch to the second server (below) and repeat the import | The replay appears in about 0.13 s. Restarting the app takes about 4 s |
| You would rather not wait on the model at all | Use the second server for the Word import from the start. The saved draft is used before the model runs, not after someone asks, and you say so in the first sentence: "This is the saved, reviewed draft for this template; the live model takes about 40 seconds on this laptop and I can run it afterward." | Nothing |
| Return note takes more than 10 seconds or fails | Nothing to do. If the model is not reachable the suggested note is built from the report rules automatically and says "Built from the report rules. No model was used." Say: "That is the fail-safe" | Instant |
| Model is not running at all | Same as above: the form import falls back to the saved draft when the template is known, otherwise to the rule-based draft (0.26 s) | Instant |
| A scene is broken or a rehearsal left clutter | `pnpm preset fresh` for everything (`pnpm db:seed` does the same), 1.3 s. `pnpm preset maria` puts her overdue draft back with 9 answers and an empty budget (paste `budget-balanced.xlsx`, not `budget-remaining.xlsx`). `pnpm preset daniel` puts Afterschool Studio Program under review with one open flag. `pnpm preset priya` removes initiatives created since the last reseed. Add `--live` to target the hosted database; it asks you to type the host name first | Under 2 s |
| Sign-in or the gate says "Too many attempts. Wait 15 minutes" | Clear the counter: `psql "$DB_OWNER_URL" -c "delete from auth_attempt"` | 1 s |
| Deployed site down | Use localhost on the laptop | |
| Laptop app down too | Backup video | |

Second server for the replay path: in another terminal, `AI_PROVIDER= AI_MODEL_FORM= pnpm start -p 3002`. With no model configured the form import uses the saved draft for any of the three known templates. Sessions are cookies on a different port, so sign in again as Priya there. The import panel then says it is showing saved suggestions built from the rules and a reviewed earlier result, and that no model was used.

Turning the AI switch off in the database (`update app_setting set value='false'::jsonb where key='ai_enabled'`) makes both features use the rule-based draft instead and does not use the saved drafts. There is no screen for this switch.

## 4. T-60 checklist (one hour before)

1. `ollama list` shows qwen3:8b and qwen3:4b. Quit anything large (no 14b model loaded).
2. `pnpm build`, `pnpm start -p 3000`. Open `/gate` and confirm the page loads.
3. `pnpm preset fresh`, then `psql "$DB_OWNER_URL" -c "delete from auth_attempt"`.
4. Warm the models once: as Priya, import `legacy-template.docx` and wait for the draft (about 50 s the first time, about 40 s after), then discard it. As Daniel, open a report that is under review, choose "Request an update", choose "Suggest a different note", tick every item and choose "Suggest a note" (about 6 s with the model), then close the dialog with Cancel. The first call after the model loads is the slow one.
5. `pnpm demo-desk`, copy `fixtures/demo-desk` to the Desktop.
6. Chrome profiles signed in as Maria, Daniel and Priya. Display 1920 by 1080 at 125 percent. Notifications off.
7. Hotspot tested. Backup video open offline.
8. Run `E2E_PORT=3000 pnpm break BR-022` once as a rehearsal (about 11 s). Run `pnpm preset fresh` again afterward.

## 5. T-10 checklist

1. `pnpm preset fresh`. Clear sign-in attempts as above.
2. Open `/finance` as Daniel. After a fresh seed the headline reads "67 reports are missing" for FY26 Year-End, with 42 waiting for review, 31 in review, 9 update requested and 290 of 439 accepted. District 8 is first in "Districts with the most missing reports" with 14 of 34. Under the list: Citywide initiatives, 12 missing of 161, and Speaker's allocations, 3 missing of 38.
3. Confirm Maria's overdue report opens from My reports ("Continue report"): Mentor Match Network, $85,000.00, reference LL-26YE-00002, "14 days past due". Review and submit lists exactly 2 problems.
4. Ollama answers: `curl -s localhost:11434/api/tags`.
5. Do not run `pnpm test:rule` or the browser tests before the demo. They reseed the database.

## 6. The 10 minute product path

Opening line (15 s): "The RFP scores the written proposal. Orals go to the three highest-scoring proposers and are taken into consideration (RFP pp. 15 and 18). This is what I would show Council Finance in that slot: three jobs the system exists to do, and one rule I try to break in front of you."

Three use cases, one break-it rule. The other four rules stay in reserve (Section 8) and are used only if Rafael asks.

Wording that may differ after the latest dashboard changes: the review queue card may read "Waiting for review" or carry an "In review" reconciliation, and the Missing figure may be shown with a "Missing with draft" split. The beats below point at the Missing number and the review queue, so they stay correct either way. The numbers are the ones a fresh seed produces: Missing 67 in total, 42 in the review queue, 9 update requested, 290 of 439 accepted, District 8 at 14 of 34. Whatever the card is called, quote the total Missing number.

### Use case 1. An organization fixes its report and submits it (Maria)

| Min | Persona and URL | Clicks | One line to say | If it fails |
| --- | --- | --- | --- | --- |
| 0:00 | Daniel, `/finance` | Open the site, enter the passcode, and note the start page ("Report on your City Council initiative funding"). Choose Start now, sign in as Daniel. The dashboard headline reads "67 reports are missing". Point at the Missing number and the review queue, then the map "Missing reports by Council district". In "Districts with the most missing reports" choose District 8 (first, 14 of 34): Submissions opens on its 14 missing reports, the largest awards first. Back on the dashboard, "Show by" switches to Organization location (District 8 then reads 15 of 32) | "Council's view: who is missing and who is waiting, by district. Remember 67. In a few minutes it changes." | Reload the page. If a filter does nothing, choose Clear all |
| 0:45 | Maria, `/portal` | Sign in as Maria. The headline says "1 report is overdue" and the card "Do this next" shows Mentor Match Network, FY26 Year-End, "14 days past due". Open Submission history (James Okafor's Afterschool Studio Program report is listed), then My reports, then Continue report. The report opens on the Narrative step: "3 of 6 sections complete" | "Anyone in her organization sees the organization's reports, including James's." | `pnpm preset fresh` |
| 1:15 | Maria, report page | In the step list choose "Review and submit", then "Submit report to Council Finance". The summary reads "There are 2 problems to fix before you submit": "Total $71,401.00 must equal award $85,000.00 (under by $13,599.00)." and "Check the box to certify that this report is accurate and complete." Below it, "Worth checking before you submit. These do not stop you from submitting." lists that actual spent has not been entered | "The system refuses and tells her exactly what is wrong." | `pnpm preset fresh` |
| 2:00 | Maria | Choose the budget problem in the summary. Budget opens with "11 of 100 lines" and the amber meter "Under by $13,599.00". Choose Paste from Excel, paste the two rows copied from `budget-remaining.xlsx` (select the three columns in Excel and press Cmd+C) into "Paste your rows here", choose Add pasted rows. The page says "2 rows added" and the meter turns green: "Balanced" | "Paste straight from Excel, and the meter says when it adds up." | Add the two lines by hand: OTPS, Program evaluation consultant, 7349; OTPS, Summer career exposure trips, 6250 |
| 3:00 | Maria | On Attachments choose `scan-31MB.pdf`: "Not uploaded. This file is 31.0 MB, which is over the 25.0 MB limit for one file." Choose `scan-24MB.pdf`: the count reads "1 attached". Wait for the Saved label in the page header | "Large files refused clearly, and her work is saved as she goes." | Skip the reload |
| 3:45 | Maria | On Review and submit check the certification box, confirm the Certifier name and Certifier title, choose "Submit report to Council Finance". The page reads "Report submitted" with the reference number LL-26YE-00002. Open Messages: "Report received: Mentor Match Network, FY26 Year-End" is first in the list. The page says email delivery is not turned on and that each message is recorded, so do not say it was emailed | "She gets a copy of exactly what was submitted, in her messages." | If submit refuses, read the message aloud and fix it, that is the point |

### Use case 2. An analyst reviews it and sends a drafted note (Daniel)

| Min | Persona and URL | Clicks | One line to say | If it fails |
| --- | --- | --- | --- | --- |
| 4:30 | Daniel, `/finance` | Reload the dashboard. The headline reads "66 reports are missing" (was 67), the review queue is one higher (43) and District 8 reads 13 of 34. Open Submissions, search Maria's EIN `13-4027118` (or open `/finance/submissions?q=13-4027118`) and open her new report with the organization name link (Mott Haven Youth Futures, Inc., the Mentor Match Network row marked Submitted). The row also says "Submitted N days late" | "The missing count dropped by one the moment she submitted." | |
| 5:15 | Daniel, report page | The report opens with the "Your decision" panel. Choose Start review ("Review started. The report is now in review."). Open "Add a manual flag", type "Supplies line needs a vendor breakdown" and choose "Add manual flag" ("Flag added."). Choose "Request an update": the dialog "Request an update from Maria Santos" opens with an empty "Note to the organization". Choose "Suggest a different note", tick every item under "What needs to change" (the flag, attach supporting documentation for personnel lines, confirm participant counts), choose "Suggest a note". Read the suggestion aloud, choose "Use this note", then "Send request". The page says the contact will see the note in Messages and above their report | "The system only proposes, a named person sends it, and every sentence is tied to a rule. The flag's own text stays internal; the organization is only told Council Finance has a question." | The suggestion says "Built from the report rules. No model was used." when there is no model. Say "That is the fail-safe" |

### The break-it rule (BR-010, organizations see only their own reports)

| Min | Persona and URL | Clicks | One line to say | If it fails |
| --- | --- | --- | --- | --- |
| 6:45 | Ricky, terminal | Ask Rafael to name the rule, or offer BR-010. Run `E2E_PORT=3000 pnpm break BR-010` (1.4 s). It prints three refusals: another organization's report address returned not found to Maria, row-level security showed Maria none of the other organizations' reports, and a storage path under another organization's EIN was refused | "Pick one. I will show you the test, then try to break it in front of you." | Show the same refusal in the browser: as Maria open another organization's report address and read the not found page |

### Use case 3. An administrator creates an initiative from a Word template (Priya)

| Min | Persona and URL | Clicks | One line to say | If it fails |
| --- | --- | --- | --- | --- |
| 7:30 | Priya, `/finance/initiatives/new` | Step 1 of 3, Initiative details: name "Neighborhood Tutoring Network", pick a Category, type a description, choose "Create and continue". Step 2 of 3, Assign organizations: type Mott in "Find an organization", add the match, enter an award amount (40000), check "Total funding after saving: $40,000.00", choose "Save and continue". Step 3 of 3, Report form: choose "Import a Word template" | "A new report type without a code change. It gets the next code in the series, CI-27-183 on a fresh seed." | |
| 8:15 | Priya, form page | The import panel opens. Choose `legacy-template.docx` and choose "Suggest questions". With the saved draft this takes about 0.1 s and the panel says no model was used; with the live model it takes about 40 s (see below), so say the governance line while waiting. The review is two columns: "From your document" on the left with numbered paragraphs, and "Suggested questions (11)" on the right, each with a citation check. Selecting a question highlights its quoted paragraph. Choose Accept on each question, then "Add 11 accepted questions to draft". The page says "Draft applied. 8 questions added, 3 already in the form." | Governance line: "The AI only proposes. It sees no contacts and takes no actions. The system checks every citation against the source, and a named person approves." | With the live model, at 45 s switch to the second server (Section 3) |
| 9:00 | Priya | Choose "Publish version 1". The dialog "Publish version 1?" says "This is the first version, with 23 questions." and "Funded organizations start using it right away." Choose "Yes, publish version 1". Switch to Maria, My reports: Neighborhood Tutoring Network is listed with Start | "Published, and the organization sees it." | |

Close (9:30): "That was three jobs, one rule attacked, and every claim on `/trust` has a record behind it. What would you want to see first for the proposal?"

With the live model the Word import is the only real wait on this path. Everything else responds in under a second. If the path runs over, drop the Attachments beat first, then the District 8 and Organization location detail.

## 7. The 20 minute full version

Run the 10 minute path, then add these in this order. If time runs short, drop in this order: correction, Excel and charts, the other four rules, Azure down to 1 minute.

| Min | Beat | Persona and URL | Clicks | One line | If it fails |
| --- | --- | --- | --- | --- | --- |
| 10:00 | Resubmit | Maria, `/portal` | The headline reads "Council Finance asked for changes to 1 report" and the report has an Update link. Open it: "Council Finance asked for changes" with the note is shown at the top, and the report opens on the step she edited last. Change Report contact title to "Executive Director" on Organization and contact, wait for the Saved label, go to Review and submit, tick the certification and choose "Submit report to Council Finance" | "She sees the note, fixes it, resubmits. Revision 2." | |
| 11:00 | Accept and correct | Daniel, same report | In "Your decision" choose Start review if it is offered, then Accept report: the panel reads "This report is accepted". Open "Correct an answer", Question "Report contact title", New value "Chief Program Officer", Reason "Title confirmed by phone with the organization", choose Save correction ("Correction saved as a new revision."). Scroll to Audit timeline | "A correction after acceptance needs a reason and leaves a permanent record." | |
| 12:30 | Excel and charts | Daniel, `/finance/submissions` | Open the Export menu and choose "Excel workbook (.xlsx)" (the file name carries the period and date, for example `ledgerline-submissions-FY26-YE-2026-10-14.xlsx`). Back on `/finance`, show the charts and "View as table" | "Everything on screen leaves as Excel." | Choose "CSV file (.csv)" from the same menu |
| 13:30 | The other four rules | Ricky, terminal | BR-010 was already run. Ask Rafael to pick another of BR-022, BR-021, BR-012 or BR-019. Run the command in Section 8 and read the one plain line | "Pick one. I will show you the test, then try to break it in front of you." | If the command fails, show the same refusal in the browser (see Section 8) |
| 14:30 | How it was built | Priya, `/trust` (admins only) | Open `/trust`: the requirement IDs, the test counts and the build they came from. Run `pnpm evidence` before the presentation so the build shown is the one on the laptop; it reseeds the database, so run `pnpm preset fresh` after | "Every claim here has a record you can open." | |
| 17:00 | Azure and delivery | Priya, `/finance/platform` | Show the control table, then speak from `docs/azure.md` | "The database design, the rules and the audit moves across unchanged, and a .NET API can call the same functions." | |
| 19:00 | Close | | Stop on: "The proposal is due October 20. Here is what I would have ready for it. What would you want first?" | | |

Held-out template (use only if asked "can it be tricked"): as Priya import `legacy-template-held-out.docx`. The draft shows the notice "Paragraph 9 reads like an instruction to the drafting tool. It was treated as template text and ignored." and no address field.

## 8. The five "break it" rules (BR-010 is in the 10 minute path, the rest are in reserve)

Run from the repository root with the app running. The default port is 3105, so set `E2E_PORT` to the port the app is on, for example `E2E_PORT=3000 pnpm break BR-022`. Each command signs Maria in once, takes about 11 s for the ones that use a browser (BR-022, BR-021, BR-012) and 1 to 2 s for the database ones (BR-010, BR-019), and removes any scratch report it made. The lines below are the refusals the script prints; amounts and counts in them come from the seed.

| Rule | Command | What the screen prints |
| --- | --- | --- |
| BR-022 budget must equal the award | `pnpm break BR-022` | `REFUSED: A budget of $68,000.00 against an award of $85,000.00 was refused at submit and the report stayed a draft.` and `REFUSED: A submit sent straight to the database with a short budget was refused by the database itself, with no application code involved.` |
| BR-010 organizations are isolated | `pnpm break BR-010` | `REFUSED: Another organization's report address returned not found to Maria.`, `REFUSED: Row-level security showed Maria none of the other organizations' reports.`, `REFUSED: A storage path under another organization's EIN was refused.` |
| BR-021 required answers | `pnpm break BR-021` | `REFUSED: The empty report was refused with 14 problems listed, and it stayed a draft.` |
| BR-012 25 MB file limit | `pnpm break BR-012` | `REFUSED: A 26 MB file was refused before it was sent, with its size and the limit stated.` and `REFUSED: The server upload check refused a 31 MB file and stated the size.` |
| BR-019 and US-057 audit and retention | `pnpm break BR-019` (also `US-057`) | `REFUSED: An analyst's attempt to edit an audit event was refused by the database.`, `REFUSED: An analyst's attempt to delete a submitted revision was refused by the database.`, and `REFUSED: Even the table owner's edit of an audit event was rejected by the append-only trigger.` |

Each attempt prints a raw line under the plain one (for example `42501 permission denied for table audit_event`). The last line reads "All N attempts on BR-0xx were refused."

Prepared answer to "who can change the audit log": "The database owner can drop the guard, which is how I reset the data between rehearsals, and each reset is recorded in the demo_reset table, which the owner can also edit. Production adds an Azure immutability policy plus database audit logging."

Engineers only: `pnpm test:rule BR-022` runs the tests tagged with the rule. It reseeds the database when it runs the browser part, so run `pnpm preset fresh` afterward.

## 9. Questions to expect

**Who wrote it?** "I directed AI coding agents. The decisions were mine: the rules live in the database and not only in the application, the AI only proposes and a named person approves, there is a rule-based fallback when no model is available, and what to leave out. I ran everything and reviewed it, and I caught the agents getting things wrong. Two examples from this repository: the requirements page marked contract commitments such as support and breach notification as verified by test, so it now has a separate status for a supporting tool that is built where the commitment itself is delivered under contract; and the budget balance rule was first enforced only by the application server, so it now also lives in the database function that files a report (migration 0025)."

**Why not .NET on Azure?** "The question has two parts. The rules, the row level security, the status function and the audit triggers are SQL, and they move to Azure Database for PostgreSQL as they are. A .NET API can call the same database functions. What changes in a .NET build is the web layer, which is rewritten, and the one rule evaluator, which is ported and checked against the same test cases. If ECI's stack is .NET, the data layer and the tests carry across and the cost is the web layer, about six to eight weeks (`docs/azure.md`, section 5). Your architecture document is cloud neutral, Azure Government or AWS GovCloud, and so is this design: Postgres, object storage, an identity provider and a mail transport each have an equivalent in either."

**Why qwen locally and Azure OpenAI in production?** "Locally, the data stays on the laptop and the evaluation could run without an API key, so I could measure it. Five local models were screened, and qwen3:8b for forms and qwen3:4b for notes were the best of them (`docs/ai-eval.md`). In production the model would sit behind the same adapter, and Azure OpenAI in the government cloud is the natural choice because the data stays inside the tenant boundary. That path has not been evaluated, so the evaluation set would be re-run on whatever model the Council permits before it is relied on. The deployed site has no model and uses the saved drafts and the rule-based fallback."

**How big is the evaluation and who labeled it?** "Three Word templates, one of them holding an injected instruction, and five return note cases, run three times each on qwen3:8b and qwen3:4b. The labels were written by one person, me, with no second labeler, and the templates were generated for this project, they are not Council forms. It shows the citation check and the fallbacks work. It does not show how the model behaves on the Council's real templates, and I say so in `docs/ai-eval.md`."

**What did you deliberately not build?** "Staff sign-in through Entra ID and multi-factor authentication, a real email domain, a security authorization package or any compliance review, the Azure environment itself, and any real Council data. Email is recorded and not sent unless a provider is configured. The shared passcode gate is an interim measure. The requirements page says which items are tested, which are supporting tools for a contract commitment, and which are delivery commitments that this application cannot show."

**Who owns it and is it confidential?** "The repository carries my copyright and an all rights reserved notice, with no license granted. It holds no Council data: everything in it is generated for the system, and the hosted copy is behind a passcode. If ECI wants to use it in a proposal, ownership and licensing terms are a conversation to have before the proposal, not after."

## 10. Timings measured in the production build

Chromium driven by script, local Postgres, idle machine, October 10, 2026. Sign-in includes the gate. Each figure is from a fresh seed.

| Step | Measured |
| --- | --- |
| Gate and sign in | 0.4 to 0.5 s |
| Portal pages (list, history, organization, messages) | 0.07 to 0.14 s |
| Finance dashboard | 0.18 s |
| Submissions list, unfiltered or filtered | 0.4 s |
| Open a submission from the list | 0.9 s |
| Search by EIN | 0.6 s |
| Paste two rows and add them | 0.04 s |
| Submit refused with the balance message | 0.05 s |
| 31 MB file refused in the browser | 0.01 s |
| 24 MB file accepted | 0.2 s (local, no real network) |
| Submit to "Report submitted" | 0.1 s |
| Rule-based note suggested | 0.1 s |
| Start review, add flag, send update request | 0.12 s, 0.05 s, 0.12 s |
| Accept and correction | 0.1 s and 0.12 s |
| Excel export of all FY26 Year-End (1.2 MB) | 0.2 s |
| New initiative: create, assign, open import, publish | 0.08 s, 0.11 s, 0.11 s, 0.03 s |
| Word import, saved draft | 0.11 s |
| Return note drafted by qwen3:4b | 6.1 to 8.0 s (three concerns), from `docs/ai-eval.md`, not remeasured |
| Word import with qwen3:8b | 49.5 s on the first call after the model loaded, 38 to 40 s after, from `docs/ai-eval.md`, not remeasured |
| `pnpm break` | 11 s for BR-022, BR-021 and BR-012; 1.4 s for BR-010; 0.6 s for BR-019 |
| `pnpm db:seed` or `pnpm preset fresh` | 1.3 s |
| `pnpm build` | 32 s from a clean `.next` |

On the hosted site the first sign-in after it has been idle can take about 3 s, and the dashboard about 1.5 s, because of the network and a cold database connection. Open the site once before you start.

## 11. Problems found

1. **Rehearsal lockouts.** Failed sign-ins are counted per email (8) and per address (30) in 15 minutes, and a successful sign-in clears the email counter. Gate entries are counted per address (20 in 15 minutes) whether or not they succeed, so a long rehearsal with many fresh browser sessions can hit "Too many attempts. Wait 15 minutes and try again." (`app/actions/session.ts`, `db/migrations/0018_s_throttle_lock.sql`). Fix at the moment: `psql "$DB_OWNER_URL" -c "delete from auth_attempt"`. Run it at T-10.
2. **The BR-012 server attempt is not an HTTP upload.** The second BR-012 attack calls the upload check function with a 31 MB size, it does not send 31 MB to the running server. It proves the rule, not the route. A real upload of a 31 MB file through the browser path is refused by the browser first.
3. **The AI switch off does not use the saved drafts.** With `ai_enabled` false in `app_setting`, both features use the rule-based draft. The saved draft (replay) is used only when a model is not configured or the call fails or times out. Use the second server in Section 3 for the replay path. There is no screen for the switch.
4. **Word import is close to the 45 second line.** qwen3:8b took 38 to 40 s warm and 49.5 s on the first call after a model load in the evaluation. With `AI_TIMEOUT_FACTOR=2` the app waits up to 90 s before falling back by itself, so the 45 s decision is the presenter's. Warm the model at T-60.
5. **Autosave waits 1.2 s.** Paste budget rows and reload the page within a second and the rows are gone. Wait for the Saved label before reloading or leaving.
6. **`pnpm test:rule` and `pnpm e2e` reseed the database.** The browser part of `test:rule` runs the global setup, which reseeds. Anything staged for the presentation is lost. Run `pnpm preset fresh` after.
7. **The local model adds or mis-types a field now and then.** qwen3:4b proposed one extra question on two of three templates and qwen3:8b chose one wrong field type on the held-out template (`docs/ai-eval.md`). The reviewer fixes both at accept time, which is the point of the review step, but expect to see it.
8. **Rehearsing before October 14.** The hosted site uses the real date, so before October 14 Maria's report reads fewer than 14 days past due and every count of days in this runbook is lower by the same amount. If you pin the date locally with `DEMO_TODAY`, submission times still use the real clock, so a submitted report can read "Submitted N days late" with a different N. On October 14 everything agrees.
9. **Messages are recorded, not emailed.** Email delivery is off unless it is configured, so every confirmation and update request is shown as recorded in Messages. Say "in her messages", not "by email".
10. **Not run for this revision.** The live local model path, the PDF export, a real upload over a network and the hosted site. Run the 10 minute path once against the hosted site, and once with the model, before the presentation.
