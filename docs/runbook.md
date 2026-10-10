# Demo runbook

For the demonstration to Estrada Consulting on Wednesday, October 14, 2026. The click path below follows the screens on main. The timings in section 9 were measured on an earlier rehearsal against a production build (`pnpm build`, `pnpm start`) on the demo laptop and have not been remeasured. They come from a fast local database and an idle machine, so treat them as the floor. Seeded counts change when the seed changes, so where a number depends on the seed this runbook says "the number on the Missing tile" and similar instead of quoting it. Known rough edges are under "Problems found" at the end.

## 1. Setup

| Item | Value |
| --- | --- |
| App on the demo laptop | `pnpm build`, then `pnpm start -p 3000` (any free port works) |
| Passcode on the gate page | The passcode in your access file (`GATE_PASSCODE` in `.env.local` for the laptop) |
| Password for every persona | The persona password in your access file (`PERSONA_PASSWORD` when the database was seeded) |
| Maria Santos, funded organization | `maria.santos@motthavenyouth.example.org` |
| James Okafor, her colleague | `james.okafor@motthavenyouth.example.org` |
| Daniel Cho, Finance analyst | `daniel.cho@finance.example.gov` |
| Priya Raman, Finance administrator | `priya.raman@finance.example.gov` |
| Grace Chen, Finance, read only | `grace.chen@finance.example.gov` |
| "Today" in the app | 2026-10-14 (`DEMO_TODAY` in `.env.local`) |

Sign-in order: open the site, enter the passcode on "Enter your access code", and you land on the start page ("Report on your City Council initiative funding"). Choose "Start now" (or "Sign in") to reach the login page, then sign in as the persona.

To run the live local model, add this to `.env.local` before `pnpm build` and `pnpm start`:

```
AI_PROVIDER=ollama
AI_MODEL_FORM=qwen3:8b
AI_MODEL_NOTE=qwen3:4b
AI_TIMEOUT_FACTOR=2
```

The evidence for those choices is in `docs/ai-eval.md`. Ollama must be running (`ollama list` answers) and both models should be loaded once before the demo (see T-60).

## 2. Files on the Desktop

Run `pnpm demo-desk`. It writes `fixtures/demo-desk/` (ignored by git) and sizes the budget files to Maria's largest award on the seeded database (it prints the initiative and amount). Copy the folder to the Desktop.

| File | Used for |
| --- | --- |
| `budget-remaining.xlsx` | Maria's budget paste. The two lines her seeded draft is missing ($7,349.00 and $6,250.00), which bring $71,401.00 up to the $85,000.00 award |
| `budget-over-award.xlsx` | Six lines whose total is $1,750.00 over the award, for a rehearsal of the refusal on an empty budget |
| `budget-balanced.xlsx` | The same six lines at exactly the award |
| `scan-31MB.pdf` | Refused with "This file is 31.0 MB, which is over the 25.0 MB limit for one file." |
| `scan-24MB.pdf` | Accepted (under the 25 MB limit) |
| `legacy-template.docx` | Priya's Word import (the senior digital literacy template) |
| `legacy-template-held-out.docx` | The template with the hidden instruction, for the "break it" answer on AI |

If the award on the demo database is different, run `pnpm demo-desk --award <dollars>` or just run it again after a reseed.

## 3. Fallbacks, in the order to reach for them

| Problem | Do this | Cost |
| --- | --- | --- |
| Word import is taking more than 45 seconds | Say: "Slow network; this is the saved, reviewed draft for this template, same checks." Then switch to the second server (below) and repeat the import | The replay appears in about 0.13 s. Restarting the app takes about 4 s |
| Return note takes more than 10 seconds or fails | Nothing to do. If the model is not reachable the suggested note is built from the report rules automatically and says "Built from the report rules. No model was used." Say: "That is the fail-safe" | Instant |
| Model is not running at all | Same as above: the form import falls back to the saved draft when the template is known, otherwise to the rule-based draft (0.26 s) | Instant |
| A scene is broken or a rehearsal left clutter | `pnpm preset <maria|daniel|priya>` for one scene or `pnpm preset fresh` for everything (`pnpm db:seed` does the same as `fresh`). Add `--live` to target the hosted database; it asks you to type the host name first | Under 10 s |
| Sign-in or the gate says "Too many attempts. Wait 15 minutes" | Clear the counter: `psql "$DB_OWNER_URL" -c "delete from auth_attempt"` | 1 s |
| Deployed site down | Use localhost on the laptop | |
| Laptop app down too | Backup video | |

Second server for the replay path: in another terminal, `AI_PROVIDER= AI_MODEL_FORM= pnpm start -p 3002`. With no model configured the form import uses the saved draft for any of the three known templates. Sessions are cookies on a different port, so sign in again as Priya there. The import panel then says it is showing saved suggestions built from the rules and a reviewed earlier result, and that no model was used.

Turning the AI switch off in the database (`update app_setting set value='false'::jsonb where key='ai_enabled'`) makes both features use the rule-based draft instead and does not use the saved drafts. There is no screen for this switch.

## 4. T-60 checklist (one hour before)

1. `ollama list` shows qwen3:8b and qwen3:4b. Quit anything large (no 14b model loaded).
2. `pnpm build`, `pnpm start -p 3000`. Open `/gate` and confirm the page loads.
3. `pnpm preset fresh`, then `psql "$DB_OWNER_URL" -c "delete from auth_attempt"`.
4. Warm the models once: as Priya, import `legacy-template.docx` and wait for the draft (about 50 s the first time, about 40 s after), then discard it. As Daniel, open a report that is under review, choose "Request an update", open "Suggest a note from the checks", tick every item and choose "Suggest a note" (about 6 s), then close the dialog with Cancel. The first call after the model loads is the slow one.
5. `pnpm demo-desk`, copy `fixtures/demo-desk` to the Desktop.
6. Chrome profiles signed in as Maria, Daniel and Priya. Display 1920 by 1080 at 125 percent. Notifications off.
7. Hotspot tested. Backup video open offline.
8. Run `pnpm break BR-022` once as a rehearsal (about 11 s). Run `pnpm preset fresh` again afterward.

## 5. T-10 checklist

1. `pnpm preset fresh`. Clear sign-in attempts as above.
2. Open `/finance` as Daniel. After a fresh seed the headline reads "67 reports are missing" for FY26 Year-End, with 42 waiting for review, 31 in review, 9 update requested and 290 of 439 accepted. District 8 is first in "Districts with the most missing reports" with 14 of 34. Under the list: Citywide initiatives, 12 missing of 161, and Speaker's allocations, 3 missing of 38.
3. Confirm Maria's overdue report opens from My reports ("Continue report"): Mentor Match Network, $85,000.00, reference LL-26YE-00002. Review and submit lists exactly 2 problems.
4. Ollama answers: `curl -s localhost:11434/api/tags`.
5. Do not run `pnpm test:rule` or the browser tests before the demo. They reseed the database.

## 6. The 10 minute product path

Opening line (15 s): "This is what your top three orals slot could show NYC Council Finance, with invented data and the tasks the RFP scores at 30 percent. Near the end you pick one of five rules and I try to break it in front of you."

| Min | Persona and URL | Clicks | One line to say | If it fails |
| --- | --- | --- | --- | --- |
| 0:00 | Daniel, `/finance` | Open the site, enter the passcode, and note the start page. Choose Start now, sign in as Daniel. The dashboard opens with the headline ("N reports are missing"), the four tiles (Missing, Waiting for review, Update requested, Accepted) and the map "Missing reports by Council district". Point at the headline and the Missing tile. The map is shaded by the share of each district's reports that are missing; the South Bronx and central Brooklyn stand out. Tab to or click District 8 (first in the ranked list, 14 of 34): Submissions opens on its 14 missing reports, sorted with the largest awards first, and Mott Haven Youth Futures is in the list. Back on the dashboard use "Show by" to switch to Organization location | "Council's view: who is missing and who is waiting, by district, and any combination of filters in one click." | Reload the page. If a filter does nothing, choose Clear all |
| 1:00 | Maria, `/portal` | Sign in as Maria. The headline says her report is overdue, with the report in the next action card. Open Submission history (James Okafor's report is listed), then My reports, then Continue report | "Anyone in her organization sees the organization's reports, including James's." | `pnpm preset maria` |
| 1:45 | Maria, report page | The stepper shows steps 1 to 3 complete: her saved draft already has every answer. Go to Review and submit and choose "Submit report to Council Finance". The summary reads "There are 2 problems to fix before you submit": "Total $71,401.00 must equal award $85,000.00 (under by $13,599.00)." and the certification. Say the planted line: "Remember this message. Later you choose a rule and I try to get around it." | "The system refuses and tells her exactly what is wrong." | `pnpm preset maria` |
| 2:30 | Maria | Choose the budget problem in the summary. Budget opens with 11 lines and the amber meter "Under by $13,599.00". Choose Paste from Excel, paste the two rows copied from `budget-remaining.xlsx` (select the three columns in Excel and press Cmd+C), choose Add pasted rows. The meter turns green: "Balanced" | "Paste straight from Excel, and the meter says when it adds up." | Add the two lines by hand: PS, Program evaluation consultant, 7349; OTPS, Summer career exposure trips, 6250 |
| 4:00 | Maria | On Attachments choose `scan-31MB.pdf`: "Not uploaded. This file is 31.0 MB, which is over the 25.0 MB limit for one file." Choose `scan-24MB.pdf`: the count reads "1 attached". Wait for the Saved label in the page header, then reload the page to show the work is still there | "Large files refused clearly, the report resumes where she left it." | Skip the reload |
| 5:00 | Maria | On Review and submit check the certification box, enter Certifier name and Certifier title, choose "Submit report to Council Finance". The page reads "Report submitted" with a reference number starting LL-. Open Messages: the confirmation copy is first in the list | "She gets a copy of exactly what was submitted." | If submit refuses, read the message aloud and fix it, that is the point |
| 5:45 | Daniel, `/finance` | Reload the dashboard. Missing reads 66 (was 67) and District 8 reads 13 of 34. Open Submissions, search Maria's EIN `13-4027118` (or open `/finance/submissions?q=13-4027118`) and open her new report by its reference number | "Council's missing count dropped by one the moment she submitted." | |
| 6:30 | Daniel, report page | The report opens with the "Your decision" panel. Choose Start review. Open "Add a manual flag", type "Supplies line needs a vendor breakdown" and add it. Choose "Request an update": the dialog opens with "Note to the organization" already started from the failing checks (here, the flag just added). Open "Suggest a different note", tick every item under "What needs to change", choose "Suggest a note" (6 to 8 s). Read the suggestion aloud, choose "Use this note", then "Send request". The page says the contact will see the note in Messages and above their report | "The AI only proposes, a named person sends it, and every sentence is tied to a rule." | If the model is slow or errors, the suggestion says "Built from the report rules. No model was used." Say "That is the fail-safe" |
| 8:00 | Priya, `/finance/initiatives/new` | Step 1 of 3, Initiative details: name "Neighborhood Tutoring Network", pick a Category, type a description, choose "Create and continue". Step 2 of 3, Assign organizations: type Mott in "Find an organization", add the match, enter an award amount, choose "Save and continue". Step 3 of 3, Report form: choose "Import a Word template" | "A new report type without a code change." | |
| 8:45 | Priya, form page | The import panel opens. Choose `legacy-template.docx` and choose "Suggest questions". About 40 s (see below). While waiting say the governance line. The review is two columns: "From your document" on the left with numbered paragraphs, and the suggested questions on the right, each with a citation check. Selecting a question highlights its quoted paragraph. Choose Accept on each question, then "Add N accepted questions to draft" | Governance line: "The AI only proposes. It sees no contacts and takes no actions. The system checks every citation against the source, and a named person approves." | At 45 s switch to the second server (Section 3) |
| 9:30 | Priya | Choose "Publish version 1". The dialog "Publish version 1?" says Funded organizations start using it right away. Choose "Yes, publish version 1". Switch to Maria, My reports: the new initiative is there with Start report | "Published, and the organization sees it." | |

The Word import is the only real wait on this path. Everything else responds in a few seconds.

## 7. The 20 minute full version

Run the 10 minute path, then add these in this order. If time runs short, drop in this order: correction, Excel and charts, James and autofill, Azure down to 1 minute.

| Min | Beat | Persona and URL | Clicks | One line | If it fails |
| --- | --- | --- | --- | --- | --- |
| 10:00 | Resubmit | Maria, `/portal` | The headline reads "Council Finance asked for changes to 1 report" and the report has an Update report button. Open it: the note is shown at the top. Change Report contact title to "Executive Director", wait for the Saved label, go to Review and submit, tick the certification and choose "Submit report to Council Finance" | "She sees the note, fixes it, resubmits. Revision 2." | |
| 11:00 | Accept and correct | Daniel, same report | In "Your decision" choose Start review if it is offered, then Accept report: the panel reads "This report is accepted". Open "Correct an answer", Question "Report contact title", New value "Chief Program Officer", Reason "Title confirmed by phone with the organization", choose Save correction. Scroll to Audit timeline | "A correction after acceptance needs a reason and leaves a permanent record." | |
| 12:30 | Excel and charts | Daniel, `/finance/submissions` | Open the export menu and choose "Excel workbook (.xlsx)" (the file name carries the period and date). Back on `/finance`, show the charts and "View as table" | "Everything on screen leaves as Excel." | Choose "CSV file (.csv)" from the same menu |
| 13:30 | Five rules | Ricky, terminal | Ask Rafael to pick one. Run the command in Section 8 and read the one plain line | "Pick one. I will show you the test, then try to break it in front of you." | If the command fails, show the same refusal in the browser (see Section 8) |
| 14:30 | How it was built | Priya, `/trust` (admins only) | Open `/trust`: the requirement IDs, the test counts and the build it came from | "Every claim here has a record you can open." | |
| 17:00 | Azure and delivery | Priya, `/finance/platform` | Show the control table, then speak from `docs/azure.md` | "Same database design moves across unchanged." | |
| 19:00 | Close | | Stop on: "The proposal is due October 20. Here is what I would have ready for it. What would you want first?" | | |

Held-out template (use only if asked "can it be tricked"): as Priya import `legacy-template-held-out.docx`. The draft shows the notice "Paragraph 9 reads like an instruction to the drafting tool. It was treated as template text and ignored." and no address field.

## 8. The five "break it" rules

Run from the repository root with the app running. The default port is 3105, so set `E2E_PORT` to the port the app is on, for example `E2E_PORT=3000 pnpm break BR-022`. Each command signs Maria in once, takes about 11 s for the ones that use a browser and about 1 to 3 s for the database ones, and removes any scratch report it made. The lines below are the refusals the script prints; amounts and counts in them come from the seed.

| Rule | Command | What the screen prints |
| --- | --- | --- |
| BR-022 budget must equal the award | `pnpm break BR-022` | `REFUSED: A budget of $X against an award of $Y was refused at submit and the report stayed a draft.` and `REFUSED: A direct status change by the organization's own account was refused by the database.` |
| BR-010 organizations are isolated | `pnpm break BR-010` | `REFUSED: Another organization's report address returned not found to Maria.`, `REFUSED: Row-level security showed Maria none of the other organizations' reports.`, `REFUSED: A storage path under another organization's EIN was refused.` |
| BR-021 required answers | `pnpm break BR-021` | `REFUSED: The empty report was refused with N problems listed, and it stayed a draft.` |
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

1. **Rehearsal lockouts.** Failed sign-ins are counted per email (8) and per address (30) in 15 minutes, and a successful sign-in clears the email counter. Gate entries are counted per address (20 in 15 minutes) whether or not they succeed, so a long rehearsal with many fresh browser sessions can hit "Too many attempts. Wait 15 minutes and try again." (`app/actions/session.ts`, `db/migrations/0018_s_throttle_lock.sql`). Fix at the moment: `psql "$DB_OWNER_URL" -c "delete from auth_attempt"`. Run it at T-10.
2. **The BR-012 server attempt is not an HTTP upload.** The second BR-012 attack calls the upload check function with a 31 MB size, it does not send 31 MB to the running server. It proves the rule, not the route. A real upload of a 31 MB file through the browser path is refused by the browser first.
3. **The AI switch off does not use the saved drafts.** With `ai_enabled` false in `app_setting`, both features use the rule-based draft. The saved draft (replay) is used only when a model is not configured or the call fails or times out. Use the second server in Section 3 for the replay path. There is no screen for the switch.
4. **Word import is close to the 45 second line.** qwen3:8b took 38 to 40 s warm and 49.5 s on the first call after a model load in the evaluation. With `AI_TIMEOUT_FACTOR=2` the app waits up to 90 s before falling back by itself, so the 45 s decision is the presenter's. Warm the model at T-60.
5. **Autosave waits 1.2 s.** Paste budget rows and reload the page within a second and the rows are gone. Wait for the Saved label before reloading or leaving.
6. **`pnpm test:rule` and `pnpm e2e` reseed the database.** The browser part of `test:rule` runs the global setup, which reseeds. Anything staged for the demo is lost. Run `pnpm preset fresh` after.
7. **The local model adds or mis-types a field now and then.** qwen3:4b proposed one extra question on two of three templates and qwen3:8b chose one wrong field type on the held-out template (`docs/ai-eval.md`). The reviewer fixes both at accept time, which is the point of the review step, but expect to see it.
8. **Not verified on main.** The click path in section 6 and 7 was written from the components and routes on main and was not clicked through in a browser for this revision. The deployed site, a real file upload over a network, and the PDF export were not exercised. Run the 10 minute path once end to end before the demonstration.
