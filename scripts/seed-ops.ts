import type { Client } from "pg";

async function userId(client: Client, email: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>("SELECT id FROM app_user WHERE email = $1", [email]);
  if (!rows[0]) throw new Error(`no seeded user ${email}`);
  return rows[0].id;
}

async function audit(
  client: Client,
  at: string,
  actor: string,
  entity: string,
  entityId: string,
  action: string,
  note: string | null,
  after: object | null,
) {
  await client.query(
    "INSERT INTO audit_event (at, actor_id, entity, entity_id, action, note, after) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)",
    [at, actor, entity, entityId, action, note, after ? JSON.stringify(after) : null],
  );
}

type SupportSeed = {
  requester: string;
  category: string;
  subject: string;
  body: string;
  agoHours: number;
  atHour: number;
  replyAfterHours: number | null;
  reply?: string;
  closeAfterHours?: number;
  responder?: string;
};

export async function seedOperations(client: Client) {
  const priya = await userId(client, "priya.raman@finance.example.gov");
  const winston = await userId(client, "winston.kellerman@finance.example.gov");
  const grace = await userId(client, "grace.chen@finance.example.gov");
  const maria = await userId(client, "maria.santos@motthavenyouth.example.org");
  const james = await userId(client, "james.okafor@motthavenyouth.example.org");
  const tomas = await userId(client, "tomas.rivera@harborview.example.org");
  const rahul = await userId(client, "rahul.patel@fernhillyouthfutures.example.org");
  const paloma = await userId(client, "paloma.quinones@northgateyoungleadersproject.example.org");
  const tariq = await userId(client, "tariq.lindqvist@silverbrookyouthfutures.example.org");

  const requests: SupportSeed[] = [
    {
      requester: maria,
      category: "password",
      subject: "Password link expired before I could use it",
      body: "I opened the link in my invitation email an hour late and it says the link is not valid. Can you send a new one?",
      agoHours: 118,
      atHour: 13.5,
      replyAfterHours: 2,
      reply: "A new link is in your messages. It works once and expires after 30 minutes, so please use it right away.",
      closeAfterHours: 4,
      responder: priya,
    },
    {
      requester: grace,
      category: "account",
      subject: "I cannot open the Users page",
      body: "The Users page says I do not have access. I only need to see which analysts are assigned to the year-end review.",
      agoHours: 96,
      atHour: 11,
      replyAfterHours: 3,
      reply: "Users is limited to Finance administrators. I can send you the list of analysts directly.",
      closeAfterHours: 5,
      responder: winston,
    },
    {
      requester: await userId(client, "daniel.cho@finance.example.gov"),
      category: "data",
      subject: "Export times out for the whole year",
      body: "When I export every FY26 year-end report at once the download never starts. Smaller filters work.",
      agoHours: 40,
      atHour: 16,
      replyAfterHours: 1,
      reply: "Use the period filter and export each period on its own for now. We are looking at the full-year case.",
      responder: priya,
    },
    {
      requester: james,
      category: "report",
      subject: "Budget total does not match our award",
      body: "Our budget lines add up to the award but the page still says the totals do not match. Could a rounding issue cause this?",
      agoHours: 33,
      atHour: 15.5,
      replyAfterHours: 19,
      reply:
        "One line was entered with a trailing space in the amount, which counted as zero. Re-enter the amount and the totals will match.",
      responder: winston,
    },
    {
      requester: rahul,
      category: "report",
      subject: "Participant count needs a correction after submitting",
      body: "We submitted the year-end report with 212 participants served. The correct number is 221. How do we correct it?",
      agoHours: 31,
      atHour: 14.25,
      replyAfterHours: null,
    },
    {
      requester: paloma,
      category: "other",
      subject: "Which browsers can we use",
      body: "Our staff use a mix of browsers. Is there a list of the ones LedgerLine supports?",
      agoHours: 29,
      atHour: 10,
      replyAfterHours: 27,
      reply: "Current versions of Chrome, Edge, Firefox and Safari work. Please avoid Internet Explorer.",
      responder: priya,
    },
    {
      requester: tariq,
      category: "account",
      subject: "Add a second person who can submit our reports",
      body: "Our finance manager needs her own login so she can submit the mid-year report. What do we need to send you?",
      agoHours: 52,
      atHour: 9.33,
      replyAfterHours: null,
    },
    {
      requester: tomas,
      category: "account",
      subject: "Move our reports to a new contact",
      body: "Our program director is leaving next week. Can reports for Harborview Youth Alliance go to our new director?",
      agoHours: 9,
      atHour: 10.67,
      replyAfterHours: null,
    },
    {
      requester: maria,
      category: "password",
      subject: "Locked out after several attempts",
      body: "I typed the wrong password a few times and now the sign-in page asks me to wait. How long is the wait?",
      agoHours: 1,
      atHour: 11,
      replyAfterHours: null,
    },
  ];
  for (const request of [...requests].sort((a, b) => b.agoHours - a.agoHours)) {
    const createdAt = (
      await client.query<{ at: string }>(
        `SELECT LEAST(
                  (date_trunc('day', (now() - make_interval(hours => $1)) AT TIME ZONE 'America/New_York') + make_interval(mins => round($2::numeric * 60)::int)) AT TIME ZONE 'America/New_York',
                  now() - interval '15 minutes'
                )::text AS at`,
        [request.agoHours, request.atHour],
      )
    ).rows[0].at;
    const after = (hours: number | null) => (hours === null ? null : Math.round(hours * 60));
    const { rows } = await client.query<{ id: string; reference: string }>(
      `INSERT INTO support_request (requester, category, subject, body, created_at, first_response_at, first_responder, closed_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz,
               CASE WHEN $6::int IS NULL THEN NULL ELSE $5::timestamptz + make_interval(mins => $6::int) END, $7,
               CASE WHEN $8::int IS NULL THEN NULL ELSE $5::timestamptz + make_interval(mins => $8::int) END)
       RETURNING id, reference`,
      [
        request.requester,
        request.category,
        request.subject,
        request.body,
        createdAt,
        after(request.replyAfterHours),
        request.replyAfterHours === null ? null : request.responder,
        after(request.closeAfterHours ?? null),
      ],
    );
    const { id, reference: ref } = rows[0];
    await client.query(
      "INSERT INTO support_message (request_id, author, from_staff, body, created_at) VALUES ($1, $2, false, $3, $4::timestamptz)",
      [id, request.requester, request.body, createdAt],
    );
    if (request.replyAfterHours !== null && request.reply) {
      await client.query(
        "INSERT INTO support_message (request_id, author, from_staff, body, created_at) VALUES ($1, $2, true, $3, $4::timestamptz + make_interval(mins => $5::int))",
        [id, request.responder, request.reply, createdAt, after(request.replyAfterHours)],
      );
    }
    await audit(
      client,
      createdAt,
      request.requester,
      "support_request",
      id,
      "support_request_created",
      `${ref}: ${request.subject}`,
      { category: request.category },
    );
    if (request.replyAfterHours !== null && request.responder) {
      const at = (
        await client.query<{ at: string }>("SELECT ($1::timestamptz + make_interval(mins => $2::int))::text AS at", [
          createdAt,
          after(request.replyAfterHours),
        ])
      ).rows[0].at;
      await audit(client, at, request.responder, "support_request", id, "support_first_response", ref, {
        first_response: true,
      });
    }
  }

  const contacts = [
    {
      name: "Marguerite Ellison",
      title: "Chief Information Security Officer, Council",
      email: "marguerite.ellison@council.example.gov",
    },
    {
      name: "Raymond Tolliver",
      title: "Deputy Director, Council Finance",
      email: "raymond.tolliver@finance.example.gov",
    },
    { name: "Imani Okoye", title: "Data Protection Counsel, Council", email: "imani.okoye@council.example.gov" },
  ];
  for (const contact of contacts) {
    await client.query(
      "INSERT INTO incident_contact (full_name, title, email, created_by, created_at) VALUES ($1, $2, $3, $4, '2026-07-14T14:00:00Z')",
      [contact.name, contact.title, contact.email, priya],
    );
  }

  const incidents = [
    {
      detected: "2026-08-19T14:20:00-04:00",
      notified: "2026-08-19T15:05:00-04:00",
      severity: "moderate",
      description:
        "A Finance staff member's work email and password appeared in a public list of leaked credentials. The account was signed out everywhere and the password was reset within the hour.",
      affected:
        "One Finance analyst account. The sign-in record shows no use of the leaked password. No reports or organization data were opened from outside the Council network.",
      report: {
        at: "2026-08-21T11:30:00-04:00",
        rootCause:
          "The staff member had reused their LedgerLine password on an unrelated personal service that was later breached.",
        actions:
          "Revoked all sessions for the account, forced a new password, reviewed 90 days of sign-in and audit records for the account, and notified the staff member's manager.",
        prevention:
          "Added a password check against known leaked passwords at sign-in, shortened the session lifetime for Finance roles, and added a reminder about password reuse to staff training.",
        completedOn: "2026-08-24",
      },
    },
    {
      detected: "2026-10-05T08:30:00-04:00",
      notified: "2026-10-05T10:05:00-04:00",
      severity: "low",
      description:
        "A routine scan found that links used for uploaded supporting documents stayed valid for 24 hours, longer than the 15 minutes the security plan allows.",
      affected:
        "Supporting documents uploaded since September 21. The access log shows no requests to those links from outside the organizations that uploaded them.",
      report: {
        at: "2026-10-06T16:10:00-04:00",
        rootCause:
          "A configuration change on September 21 raised the link lifetime for large files and was not reviewed against the security plan.",
        actions:
          "Reduced the lifetime to 15 minutes, invalidated the existing links, and reviewed the access log for the period.",
        prevention:
          "Adding a check to every release that compares link lifetimes with the security plan before the change goes live.",
        completedOn: null,
      },
    },
  ];
  for (const incident of incidents) {
    const { rows } = await client.query<{ id: string; reference: string }>(
      `INSERT INTO security_incident (detected_at, description, affected_data, severity, notify_due_at, remediation_due_at, notified_at, contacts_notified, recorded_by, recorded_at)
       VALUES ($1::timestamptz, $2, $3, $4, $1::timestamptz + interval '24 hours', $1::timestamptz + interval '7 days', $5::timestamptz, $6, $7, $5::timestamptz) RETURNING id, reference`,
      [
        incident.detected,
        incident.description,
        incident.affected,
        incident.severity,
        incident.notified,
        contacts.length,
        priya,
      ],
    );
    const { id, reference } = rows[0];
    await client.query(
      "INSERT INTO incident_event (incident_id, at, actor, kind, detail) VALUES ($1, $2, $3, 'recorded', $4), ($1, $2, $3, 'notified', $5)",
      [id, incident.notified, priya, incident.severity, `${contacts.length} designated contacts`],
    );
    await audit(
      client,
      incident.notified,
      priya,
      "security_incident",
      id,
      "incident_recorded",
      `${reference}: ${incident.description}`,
      { severity: incident.severity, contacts_notified: contacts.length, on_time: true },
    );
    for (const contact of contacts) {
      await client.query(
        "INSERT INTO outbox (to_email, template, subject, body_text, status, created_by, created_at) VALUES ($1, 'security_incident', $2, $3, 'recorded', $4, $5)",
        [
          contact.email,
          `Security incident ${reference} (${incident.severity} severity)`,
          `Hello ${contact.name},\n\nA security incident was recorded in LedgerLine.\n\nReference: ${reference}\nSeverity: ${incident.severity}\n\nWhat happened:\n${incident.description}\n\nData affected:\n${incident.affected}\n\nA written remediation report and a plan to reduce the risk of a repeat will follow within 7 days of detection.\n\nLedgerLine`,
          priya,
          incident.notified,
        ],
      );
    }
    await client.query(
      "INSERT INTO incident_remediation (incident_id, root_cause, actions, prevention, completed_on, recorded_by, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        id,
        incident.report.rootCause,
        incident.report.actions,
        incident.report.prevention,
        incident.report.completedOn,
        priya,
        incident.report.at,
      ],
    );
    await client.query(
      "INSERT INTO incident_event (incident_id, at, actor, kind) VALUES ($1, $2, $3, 'remediation_reported')",
      [id, incident.report.at, priya],
    );
    if (incident.report.completedOn) {
      await client.query(
        "INSERT INTO incident_event (incident_id, at, actor, kind, detail) VALUES ($1, $2, $3, 'remediation_completed', $4)",
        [id, incident.report.at, priya, incident.report.completedOn],
      );
    }
    await audit(
      client,
      incident.report.at,
      priya,
      "security_incident",
      id,
      "incident_remediation_reported",
      reference,
      { completed_on: incident.report.completedOn },
    );
  }

  const review26 = (
    await client.query<{ id: string }>(
      `INSERT INTO annual_review (fiscal_year_id, review_date, check_initiatives, check_forms, check_periods, check_users, check_rules, status, signed_off_by, signed_off_on, created_by, created_at)
       VALUES ('FY26', '2026-04-14', true, true, true, true, true, 'signed_off', $1, '2026-05-06', $1, '2026-04-14T13:00:00Z') RETURNING id`,
      [priya],
    )
  ).rows[0].id;
  const participants26 = [
    ["Priya Raman", "Council Finance"],
    ["Winston Kellerman", "Council Finance"],
    ["Daniel Cho", "Council Finance"],
    ["Lena Whitcomb", "Speaker's Office"],
  ];
  for (const [name, affiliation] of participants26)
    await client.query(
      "INSERT INTO annual_review_participant (review_id, full_name, affiliation, created_at) VALUES ($1, $2, $3, '2026-04-14T13:30:00Z')",
      [review26, name, affiliation],
    );
  const decisions26 = [
    ["initiatives", "Retire the seven initiatives that ended in FY26 and carry every other initiative forward."],
    ["forms", "Add a table for participants under 18 by age group to the standard questions."],
    ["periods", "Keep the January 31 mid-year and September 30 year-end due dates."],
    ["users", "Add two analysts for the year-end review window."],
    ["rules", "Move the first reminder to 14 days before each due date."],
  ];
  for (const [area, decision] of decisions26)
    await client.query(
      "INSERT INTO annual_review_decision (review_id, area, decision, decided_by, created_at) VALUES ($1, $2, $3, $4, '2026-04-14T15:00:00Z')",
      [review26, area, decision, priya],
    );
  await audit(client, "2026-04-14T13:00:00Z", priya, "annual_review", review26, "review_started", "FY26", {
    review_date: "2026-04-14",
  });
  await audit(client, "2026-05-06T15:00:00Z", priya, "annual_review", review26, "review_signed_off", "FY26", {
    signed_off_on: "2026-05-06",
  });

  const review27 = (
    await client.query<{ id: string }>(
      `INSERT INTO annual_review (fiscal_year_id, review_date, check_initiatives, check_forms, check_periods, created_by, created_at)
       VALUES ('FY27', '2026-10-06', true, true, true, $1, '2026-10-06T13:00:00Z') RETURNING id`,
      [winston],
    )
  ).rows[0].id;
  for (const [name, affiliation] of [
    ["Winston Kellerman", "Council Finance"],
    ["Priya Raman", "Council Finance"],
  ]) {
    await client.query(
      "INSERT INTO annual_review_participant (review_id, full_name, affiliation, created_at) VALUES ($1, $2, $3, '2026-10-06T13:30:00Z')",
      [review27, name, affiliation],
    );
  }
  await client.query(
    "INSERT INTO annual_review_decision (review_id, area, decision, decided_by, created_at) VALUES ($1, 'initiatives', 'Combine the two older adult meal programs into one initiative for FY28.', $2, '2026-10-06T15:00:00Z')",
    [review27, winston],
  );
  await audit(client, "2026-10-06T13:00:00Z", winston, "annual_review", review27, "review_started", "FY27", {
    review_date: "2026-10-06",
  });

  const finance = (
    await client.query<{ id: string; role: string; email: string }>(
      "SELECT id, role, email FROM app_user WHERE role <> 'cbo_submitter' AND email <> 'system.scheduler@ledgerline.example' ORDER BY full_name",
    )
  ).rows;
  const modules = (
    await client.query<{ key: string; audience: string[] }>(
      "SELECT key, audience FROM training_module ORDER BY position",
    )
  ).rows;
  const skip = new Set<string>([winston]);
  const analysts = finance.filter((u) => u.role === "finance_analyst");
  analysts.slice(-4).forEach((u) => skip.add(u.id));
  let day = 0;
  for (const user of finance) {
    const required = modules.filter((m) => m.audience.includes(user.role));
    const partial = skip.has(user.id);
    const done = partial ? required.slice(0, Math.max(1, required.length - 2)) : required;
    for (const entry of done) {
      const date = new Date(Date.UTC(2026, 8, 28 + (day % 8)));
      day += 1;
      await client.query(
        "INSERT INTO training_record (user_id, module_key, completed_on, recorded_by, recorded_at) VALUES ($1, $2, $3, $4, $5)",
        [user.id, entry.key, date.toISOString().slice(0, 10), priya, `${date.toISOString().slice(0, 10)}T20:00:00Z`],
      );
    }
  }

  const sessions = [
    {
      on: "2026-09-22",
      scenario: "Organization submits a mid-year report with a balanced budget",
      tester: "Maria Santos",
      role: "Program Director, Mott Haven Youth Futures",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-09-22",
      scenario: "Organization saves a draft and returns to it on another day",
      tester: "Maria Santos",
      role: "Program Director, Mott Haven Youth Futures",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-09-23",
      scenario: "A report cannot be submitted while the budget total differs from the award",
      tester: "James Okafor",
      role: "Finance Manager, Mott Haven Youth Futures",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-09-24",
      scenario: "Organization uploads a 25 MB Excel supporting document",
      tester: "Maria Santos",
      role: "Program Director, Mott Haven Youth Futures",
      result: "failed",
      notes: "Upload finished but the progress bar stayed at 100 percent until the page was reloaded.",
      defects: [
        {
          description: "Upload progress bar does not clear for files over 20 MB",
          severity: "major",
          fixed: "2026-10-02",
        },
      ],
    },
    {
      on: "2026-10-05",
      scenario: "Organization uploads a 25 MB Excel supporting document",
      tester: "Maria Santos",
      role: "Program Director, Mott Haven Youth Futures",
      result: "passed",
      notes: "Retest after the fix.",
      defects: [],
    },
    {
      on: "2026-09-28",
      scenario: "Analyst starts a review and returns a report with a note",
      tester: "Daniel Cho",
      role: "Budget Analyst, Council Finance",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-09-28",
      scenario: "Analyst flags a submission and it appears under Flagged items",
      tester: "Daniel Cho",
      role: "Budget Analyst, Council Finance",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-09-29",
      scenario: "View-only user cannot change a report or a form",
      tester: "Grace Chen",
      role: "Policy Analyst, Council Finance",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-09-30",
      scenario: "Administrator adds a Finance user and sends a password link",
      tester: "Priya Raman",
      role: "Deputy Director, Council Finance",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-10-01",
      scenario: "Administrator rolls FY27 forms and awards into FY28",
      tester: "Winston Kellerman",
      role: "Finance Administrator, Council Finance",
      result: "blocked",
      notes: "The review table stayed empty after choosing the new year.",
      defects: [
        { description: "Rollover preview is empty until the page is reloaded", severity: "major", fixed: null },
      ],
    },
    {
      on: "2026-10-02",
      scenario: "Analyst exports a filtered list to Excel and CSV",
      tester: "Daniel Cho",
      role: "Budget Analyst, Council Finance",
      result: "passed",
      notes: null,
      defects: [],
    },
    {
      on: "2026-10-06",
      scenario: "Reminder email is queued for organizations with a missing report",
      tester: "Winston Kellerman",
      role: "Finance Administrator, Council Finance",
      result: "failed",
      notes: null,
      defects: [
        { description: "Reminder preview shows the due date in year-first format", severity: "minor", fixed: null },
      ],
    },
    {
      on: "2026-10-07",
      scenario: "Organization prints a submitted report to PDF",
      tester: "Tomas Rivera",
      role: "Executive Director, Harborview Youth Alliance",
      result: "passed",
      notes: null,
      defects: [],
    },
  ];
  for (const session of sessions) {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO uat_session (session_on, scenario, tester_name, tester_role, result, notes, recorded_by, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $1::date + time '20:00') RETURNING id",
      [session.on, session.scenario, session.tester, session.role, session.result, session.notes, priya],
    );
    for (const defect of session.defects) {
      await client.query(
        "INSERT INTO uat_defect (session_id, description, severity, status, fixed_on, created_at) VALUES ($1, $2, $3, $4, $5, $6::date + time '20:00')",
        [rows[0].id, defect.description, defect.severity, defect.fixed ? "fixed" : "open", defect.fixed, session.on],
      );
    }
    await audit(client, `${session.on}T20:00:00Z`, priya, "uat_session", rows[0].id, "uat_recorded", session.scenario, {
      result: session.result,
      defects: session.defects.length,
    });
  }
}
