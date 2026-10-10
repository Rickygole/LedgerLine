# LedgerLine on Azure: service mapping, portability and delivery

Prepared October 2026 for Estrada Consulting. This describes how the LedgerLine proof of concept would be hosted in Azure for the NYC Council Initiative Reporting System (PIN 102202709162026), what carries over unchanged, what must change, and a delivery plan to a February 1, 2027 go-live.

Every Azure Government availability statement below is marked "verify". Service availability, feature parity and authorization levels in Azure Government change over time and differ by region. Each one must be confirmed against Microsoft's current Azure Government documentation and the City's cloud policy before it is relied on in a proposal.

## 1. Where the proof of concept runs today

| Concern | Proof of concept today |
| --- | --- |
| Web application | Next.js 15 on Vercel (server components and server actions) |
| Database | Postgres 16 (Neon in the hosted copy, a local container in development) |
| Sign-in | Shared passcode gate, then email and password, signed session cookie (8 hour lifetime) |
| Files | Vercel Blob in production, a local folder in development |
| Email | A database outbox table. Messages are written in the same transaction as the action that caused them. A dispatcher (`lib/outbox-dispatch.ts`, transport in `lib/email.ts`) delivers them through the Resend HTTP API when `RESEND_API_KEY` and `EMAIL_FROM` are set. Otherwise they stay in the outbox with the status Recorded. The hosted copy is configured for recorded mode unless stated otherwise |
| AI model | A local model through Ollama (evaluated in `docs/ai-eval.md`) or the Anthropic API (not evaluated), behind one adapter (`lib/ai/model.ts`). The hosted copy has no model configured and uses the saved replays and the rule-based fallback |
| Scheduled work | A daily Vercel cron calling `/api/cron/reminders` |

## 2. Service mapping

| Function | Azure service | Azure Government | Notes |
| --- | --- | --- | --- |
| Database | Azure Database for PostgreSQL Flexible Server, version 16, zone redundant HA, private access through a virtual network | Verify | Same engine, so the schema, row level security, functions and triggers move as they are. Point in time restore and geo-redundant backup are configuration, not code |
| Web application | Azure App Service (Linux, Node 22) or Azure Container Apps, running the Next.js server | Verify for both | App Service is the simpler operating model. Container Apps suits a container pipeline. Either works behind Azure Front Door or Application Gateway with a web application firewall |
| Sign-in | Microsoft Entra ID (OpenID Connect) for Council Finance staff. Organization users either as Entra External ID guests or kept on the application's own accounts | Verify, including whether external identities are offered in the Government cloud | See section 4 for the code that changes |
| Files | Azure Blob Storage, private container, short lived SAS tokens issued by the server after the same access check the application makes today | Verify | Customer managed keys and an immutability policy are available if the City requires them |
| Email | Azure Communication Services Email, sending from a City approved domain with SPF, DKIM and DMARC | Verify. If it is not offered, use the City's existing mail relay or Microsoft Graph with the Exchange Online tenant | The outbox table stays. The dispatcher already reads queued rows, retries failed sends and records the result, so a failed send never loses a message. Only the transport in `lib/email.ts` changes |
| Scheduled work | Container Apps job, App Service WebJob or an Azure Functions timer calling the same reminders route | Verify | Replaces the Vercel cron entry in `vercel.json` |
| AI model adapter | Azure OpenAI Service in Azure Government, or Anthropic models through Microsoft Foundry | Verify both, including which model versions are offered and whether the City permits the data to leave a tenant boundary | Only `callStructured` in `lib/ai/model.ts` changes. The prompts, the schema checks, the citation check and the human approval step are provider independent |
| Secrets | Azure Key Vault with managed identity | Verify | Replaces environment variables for the database password, session secret and mail credentials |
| Monitoring | Azure Monitor, Application Insights, Log Analytics | Verify | Application logs and database logs go to a workspace the City can query |
| Deployment pipeline | GitHub Actions or Azure DevOps Pipelines, deploying to a staging slot, then swapping | Not applicable | The test suites run in the pipeline before any deploy |

## 3. What ports unchanged

These are the parts that carry the business rules, and none of them depends on Vercel.

- **Schema and migrations.** The SQL files in `db/migrations` apply to any Postgres 16 server with `pnpm db:migrate`. Flexible Server allows the extensions and roles they use. Role creation and the `app_server` login are scripted (`pnpm db:role`) and would be run once by the database administrator.
- **Row level security.** Policies on every table decide which organization and which role sees which rows, using the user id the server sets for each transaction.
- **State machine and audit.** Submission status changes, corrections and form publishing happen in SQL functions that check the action, the role and a lock version, and write the audit row in the same transaction.
- **Append-only history.** Triggers on the audit and revision tables reject UPDATE, DELETE and TRUNCATE.
- **Validation rules.** The budget balance, required answers, upload limits and format checks live in `lib/rules` and are also enforced where the data is written.
- **Tests.** The unit tests, the SQL and row level security tests, the AI evaluation set and the end to end tests run against any Postgres 16 URL. They are the acceptance evidence that the Azure copy behaves the same as the proof of concept.

## 4. What changes

| Change | Where | Size |
| --- | --- | --- |
| Entra ID sign-in replaces the passcode gate and the password login for staff | `middleware.ts`, `lib/session.ts`, `lib/auth.ts`, the login and reset pages | About two weeks including the role and group mapping |
| Blob SAS in place of Vercel Blob | `lib/storage.ts`, the upload route and the CSP allow list in `lib/csp.ts` | About one week |
| Azure Communication Services transport for the outbox dispatcher | `lib/email.ts` and the sender domain setup. The queue, retry and status handling exist | About three days, plus domain verification with the City |
| Model adapter for Azure OpenAI or Foundry | `callStructured` in `lib/ai/model.ts` | Two to three days, plus re-running the evaluation set on the chosen model |
| Hosting configuration, secrets, networking, WAF | Infrastructure as code (Bicep or Terraform) | Two to three weeks |
| Cron replacement | Scheduler job calling the reminders route | One day |
| Database TLS | The server connection already requires TLS for any host that is not localhost. The Flexible Server CA certificate must be trusted | One day |
| Demo only features | The presets script and the passcode gate are removed from the deployed build | Half a day |

## 5. The .NET question

The City or ECI may prefer a .NET stack. The design allows it.

The rules and the state live in SQL, in the policies, functions and triggers listed in section 3, and in one small rule evaluator (`lib/rules`, about 760 lines of TypeScript) that checks a report before submit. The Next.js layer renders pages, calls those functions, and enforces nothing that the database does not also enforce. A .NET API (ASP.NET Core with Npgsql) could replace the Next server layer and call the same functions, with Razor or a separate front end on top. The evaluator would be ported once, and the existing test cases in `tests/unit/validate.test.ts` and the SQL tests would be reused to confirm the port gives the same answers.

The cost is real: the front end and the server actions are rewritten, and the work is about six to eight additional weeks. It would not fit the February 1 date unless it began before award. The recommendation is to deliver the first release on the existing stack and treat a .NET API as a later option, since the database, which holds the rules, would not move.

## 6. NIST SP 800-53 mapping of controls that exist in the code

This lists only controls implemented in the proof of concept, with the place where each lives. It is not an authorization package. Controls that depend on the hosting platform are listed in section 7 as inherited or open.

| Control | What is implemented | Where |
| --- | --- | --- |
| AC-2 Account management | Accounts are created by an administrator, with a one-time invitation link that expires in 30 minutes. Accounts carry an active flag, and an inactive account cannot sign in or use a token. Administrators start resets | `db/migrations/0011_d_admin_actions.sql`, `0018_s_outbox_tokens.sql` |
| AC-3 Access enforcement | Row level security is enabled on every table that holds report data. An organization user reads only the rows of their own organization. Analysts, admins and view-only users get role specific policies | `db/migrations/0005_access.sql`, `tests/sql/access.test.ts` |
| AC-6 Least privilege | The application connects as `app_server`, which holds only the column and function grants it needs. It cannot read password hashes, cannot read the demo reset log, and cannot insert audit rows directly | `0005_access.sql`, `0008_throttle.sql` |
| AC-7 Unsuccessful logon attempts | Sign-in and reset attempts are counted in the database per client key. Past the limit the user sees "Too many attempts. Wait 15 minutes and try again." | `0008_throttle.sql`, `lib/throttle.ts` |
| AC-12 Session termination | Session cookies expire after 8 hours | `lib/session.ts` |
| AU-2, AU-3 Event logging and content | Audit rows record who, when, which entity, which action, the note, and the before and after values. An AI call carries its own log row with model, prompt version, input hash and validation result | `0004_audit.sql`, `ai_action` table |
| AU-9 Protection of audit information | Triggers reject UPDATE, DELETE and TRUNCATE on the audit and revision tables for every role, including the table owner. Audit rows are written only by a SQL function | `0004_audit.sql`, `tests/sql/retention.test.ts` |
| AU-10 Non-repudiation | Each submit and each correction stores a full snapshot and its SHA-256 hash, with the acting user | `submission_revision` |
| IA-5 Authenticator management | Passwords are hashed with bcrypt (cost 10), must be at least 12 characters and no more than 72 bytes, and cannot equal the email address. Reset and invitation tokens are random, single use, short lived, and only their SHA-256 hash is stored | `lib/password.ts`, `app/reset/actions.ts`, `0018_s_outbox_tokens.sql` |
| SC-8 Transmission confidentiality | The database connection requires TLS for any non-local host. Session cookies are marked Secure in production. Browser to server TLS is provided by the host and is open until Azure is configured | `lib/db.ts`, `lib/session.ts` |
| SC-18 and SI-10 Content and input handling | A nonce based Content Security Policy blocks inline scripts and framing. Output from users and from the AI is rendered escaped | `lib/csp.ts`, `middleware.ts` |
| SC-23 Session authenticity | Sessions are signed tokens in HttpOnly, SameSite=Lax cookies | `lib/session.ts` |
| SI-10 Information input validation | Every rule is re-checked on the server when data is written: required answers, number and format ranges, text length, budget balance, row count, EIN format, upload size (25 MB) and type, a content check on Office files, and signed upload paths. The browser checks are for convenience only | `lib/rules`, `lib/storage.ts`, `lib/report/upload-rules.ts` |
| SI-10 applied to AI output | Model output is validated against a schema, every citation must be a substring of the source paragraph, rule ids and dollar figures not in the input are dropped, and a named person approves before anything is saved | `lib/ai`, `lib/forms/editor/draft-core.ts`, `lib/finance/review/return-note-core.ts` |
| CM-5 Access restrictions for change | Form versions are immutable once published, and publishing goes through a function | `0004_audit.sql`, `0006_workflow.sql` |

## 7. Controls not implemented in the proof of concept

- **SC-28 Protection at rest** and **SC-13 Cryptography**: inherited from Flexible Server and Blob Storage encryption. Customer managed keys are a configuration decision for the City.
- **IA-2 Multi-factor authentication**: provided by Entra ID once sign-in moves to it. The proof of concept has none.
- **SC-7 Boundary protection**: private networking, WAF and egress rules are Azure work in section 4.
- **AU-6, SI-4 Monitoring and alerting**: logs go to Azure Monitor, with alert rules to be defined with the City.
- **CP-9, CP-10 Backup and recovery**: provided by Flexible Server backup, not tested here.
- **HSTS and other response headers on the application host**: set at Front Door or the web server.
- **An authorization package, a System Security Plan, and any ATO**: not produced. NYC Cyber Command and the agency determine what is required.

## 8. Delivery timeline to go-live on February 1, 2027

Dates assume award and contract registration in time to start on Monday, November 16, 2026. If the start moves, the plan moves day for day, and the go-live date has no slack beyond the last week. This is the main schedule risk, not a technical one.

| Dates | Phase | Output |
| --- | --- | --- |
| Oct 20, 2026 | Proposal due | Submission |
| Oct 26 to Nov 13 | Orals and award; contract registration | Not under ECI control |
| Nov 16 to Dec 4 | Confirm requirements with Council Finance. Load the real initiative, organization and award lists into a mapping sheet. Settle open questions on who signs in with what | Signed requirements baseline, data mapping, Azure subscription and Entra tenant access |
| Dec 7 to Dec 31 | Build on Azure: infrastructure as code, database, application hosting, Entra sign-in, Blob storage, mail worker, model adapter. Holiday week is reduced capacity | Staging environment running the full test suite |
| Jan 4 to Jan 15 | User acceptance testing with Finance staff and a pilot group of funded organizations. Accessibility review. Security review and penetration test. Load test | Defect list closed or accepted, test report |
| Jan 18 to Jan 22 | Load production data, create accounts, send invitations, training sessions and a short guide for organizations | Production environment populated |
| Jan 25 to Jan 29 | Dress rehearsal, go or no-go meeting, change freeze | Signed go decision |
| Feb 1, 2027 | Go-live | Support begins |
| Feb 1 onward | Hypercare for 30 days with daily check-ins, then a monthly review | Support log, defect fixes |

Dependencies the City controls: data lists in usable form by December 4, a named Finance approver for each phase gate, an Entra tenant and the Azure subscription by the start of December, and security review slots in January.

Items the plan deliberately leaves out of the first release if time is short, in this order: a .NET rewrite, the PDF export, optional AI features. The required reporting tasks, review, audit, Excel export and access controls are in the first release.
