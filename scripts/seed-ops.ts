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
      replyAfterHours: 6,
      reply:
        "A Finance analyst can correct it. Reply with the report reference and the right number, and we will record it as a correction with your reason.",
      closeAfterHours: 8,
      responder: priya,
    },
    {
      requester: paloma,
      category: "other",
      subject: "Which browsers can we use",
      body: "Our staff use a mix of browsers. Is there a list of the ones LedgerLine supports?",
      agoHours: 29,
      atHour: 10,
      replyAfterHours: 9,
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
      replyAfterHours: 4,
      reply: "Send us the name and work email of the second person. We will add the login and send a password link.",
      closeAfterHours: 20,
      responder: winston,
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

  const schedule: [string, string, string, string][] = [
    [
      "test",
      "2026-11-30",
      "Organizations submit a report, save a draft and upload a supporting document",
      "Pilot organizations and Council Finance",
    ],
    [
      "test",
      "2026-12-02",
      "Finance reviews, flags and returns a report, then corrects a submitted answer",
      "Finance analysts",
    ],
    ["test", "2026-12-04", "Budget balancing, pasting from Excel and the submitted PDF copy", "Pilot organizations"],
    ["test", "2026-12-08", "Administrators add users, change forms and set reminder rules", "Finance administrators"],
    ["test", "2026-12-10", "Exports, saved queries and the full data package", "Finance analysts and administrators"],
    ["test", "2026-12-22", "Retest of every defect found in the earlier sessions", "Everyone who took part"],
    ["training", "2026-12-14", "Orientation and signing in", "All Finance users"],
    ["training", "2026-12-16", "Reading submitted reports", "All Finance users"],
    ["training", "2027-01-06", "Reviewing and returning reports", "Finance analysts and administrators"],
    ["training", "2027-01-12", "Exports and saved queries", "Finance analysts and administrators"],
    ["training", "2027-01-14", "Initiatives and report forms", "Finance administrators"],
    ["training", "2027-01-20", "Users, roles and password resets", "Finance administrators"],
    ["training", "2027-01-22", "Annual rollover and reminders", "Finance administrators"],
  ];
  for (const [kind, on, title, audience] of schedule)
    await client.query("INSERT INTO readiness_schedule (kind, scheduled_on, title, audience) VALUES ($1, $2, $3, $4)", [
      kind,
      on,
      title,
      audience,
    ]);
}
