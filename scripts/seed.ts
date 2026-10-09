import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { buildDefinition, CATEGORY_METRICS } from "../lib/forms/standard";
import { buildSnapshot } from "../lib/snapshot";
import type { Answers, BudgetLine, FormDefinition } from "../lib/rules/types";
import {
  ACCOMPLISHMENTS,
  BOROUGH_DISTRICTS,
  BOROUGH_ZIPS,
  BOROUGHS,
  CHALLENGES,
  FIRST_NAMES,
  INITIATIVE_NAMES,
  LAST_NAMES,
  ORG_PREFIXES,
  ORG_SUFFIXES,
  OTPS_LINES,
  PS_LINES,
  STORIES,
  STREETS,
  TITLES,
} from "./seed-data";

export const PERSONAS = {
  maria: { email: "maria.santos@motthavenyouth.example.org", name: "Maria Santos", title: "Program Director" },
  james: { email: "james.okafor@motthavenyouth.example.org", name: "James Okafor", title: "Finance Manager" },
  daniel: { email: "daniel.cho@finance.example.gov", name: "Daniel Cho", title: "Budget Analyst" },
  priya: { email: "priya.raman@finance.example.gov", name: "Priya Raman", title: "Deputy Director, Initiative Reporting" },
  tomas: { email: "tomas.rivera@harborview.example.org", name: "Tomas Rivera", title: "Executive Director" },
  grace: { email: "grace.chen@finance.example.gov", name: "Grace Chen", title: "Policy Analyst" },
};

export const MARIA_ORG = { ein: "00-1040217", name: "Mott Haven Youth Futures, Inc." };
export const LATE_INITIATIVE = "Youth Mentoring Networks";
export const ACCEPTED_INITIATIVE = "After School Enrichment";

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20261014);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => Math.floor(min + random() * (max - min + 1));
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

function award(): number {
  const r = random();
  if (r < 0.55) return roundTo(between(20000, 90000), 500);
  if (r < 0.88) return roundTo(between(90000, 250000), 1000);
  return roundTo(between(250000, 750000), 5000);
}

function phone(): string {
  return `${pick(["212", "718", "347", "929", "646"])}-555-${String(between(100, 199)).padStart(4, "0")}`;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function balancedBudget(total: number): BudgetLine[] {
  const count = between(5, 12);
  const psCount = Math.max(2, Math.floor(count * 0.6));
  const weights = Array.from({ length: count }, () => 0.5 + random());
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const totalCents = Math.round(total * 100);
  let remaining = totalCents;
  return weights.map((weight, index) => {
    const cents = index === count - 1 ? remaining : roundTo(Math.round((weight / weightSum) * totalCents), 100);
    remaining -= cents;
    const isPs = index < psCount;
    return {
      rowId: randomUUID(),
      position: index + 1,
      category: isPs ? "PS" : "OTPS",
      description: isPs ? PS_LINES[index % PS_LINES.length] : OTPS_LINES[index % OTPS_LINES.length],
      amount: cents / 100,
    } satisfies BudgetLine;
  });
}

type OrgRow = { id: string; ein: string; legal_name: string; borough: string; contact: { name: string; title: string; email: string; phone: string } };

function fullAnswers(definition: FormDefinition, org: OrgRow, outcomes: "normal" | "zero" | "low"): Answers {
  const target = between(40, 400);
  const actual = outcomes === "zero" ? 0 : outcomes === "low" ? Math.floor(target * 0.3) : Math.floor(target * (0.85 + random() * 0.35));
  const answers: Answers = {
    org_legal_name: org.legal_name,
    org_ein: org.ein,
    contact_name: org.contact.name,
    contact_title: org.contact.title,
    contact_email: org.contact.email,
    contact_phone: org.contact.phone,
    participants_target: String(target),
    participants_actual: String(actual),
    sites_count: String(between(1, 4)),
    delivery_model: pick(["In person", "In person", "Hybrid", "Remote"]),
    served_youth: random() < 0.4 ? "Yes" : "No",
    accomplishments: pick(ACCOMPLISHMENTS),
    challenges: pick(CHALLENGES),
    success_story: random() < 0.6 ? pick(STORIES) : "",
  };
  if (answers.served_youth === "Yes") {
    answers.youth_breakdown = [
      { age_group: "Under 10", count: between(5, 40) },
      { age_group: "10 to 13", count: between(10, 60) },
      { age_group: "14 to 17", count: between(10, 80) },
    ];
  }
  const performance = definition.sections.find((s) => s.key === "performance");
  for (const question of performance?.questions ?? []) {
    if (question.scope !== "initiative") continue;
    answers[question.key] = question.type === "percent" ? String(between(60, 97)) : String(outcomes === "zero" ? 0 : between(20, 900));
  }
  return answers;
}

function partialAnswers(full: Answers): Answers {
  const keep = ["org_legal_name", "org_ein", "contact_name", "contact_title", "contact_email", "contact_phone", "accomplishments"];
  return Object.fromEntries(Object.entries(full).filter(([key]) => keep.includes(key)));
}

function isoAt(date: string, hour: number, minute: number): string {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`;
}

function dateBetween(start: string, end: string): string {
  const a = Date.parse(start);
  const b = Date.parse(end);
  return new Date(a + random() * (b - a)).toISOString().slice(0, 10);
}

async function insertRows(client: Client, table: string, rows: Record<string, unknown>[], columns: string[]) {
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) SELECT ${columns.join(", ")} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
      [JSON.stringify(slice)]
    );
  }
}

async function reset(client: Client, scene: string) {
  const guarded = ["audit_event", "submission_revision"];
  for (const table of guarded) await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  await client.query(`TRUNCATE auth_attempt, audit_event, submission_revision, ai_action, outbox, flag, attachment, budget_line, answer, submission,
    form_version, question, assignment, reporting_period, initiative, app_user, contact, organization, fiscal_year, app_setting RESTART IDENTITY CASCADE`);
  for (const table of guarded) await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  await client.query("INSERT INTO demo_reset (scene) VALUES ($1)", [scene]);
}

function isLocalDatabase(url: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function seed(client: Client, options: { lateDraft: "empty" | "half" } = { lateDraft: "half" }) {
  const fallbackPassword = "ledgerline-demo";
  const password = process.env.PERSONA_PASSWORD ?? fallbackPassword;
  if (password === fallbackPassword && !isLocalDatabase(String(process.env.DB_OWNER_URL ?? ""))) {
    throw new Error("Set PERSONA_PASSWORD to something other than the default before seeding a hosted database");
  }
  const hash = await bcrypt.hash(password, 10);

  await client.query("INSERT INTO fiscal_year VALUES ('FY26', '2025-07-01', '2026-06-30'), ('FY27', '2026-07-01', '2027-06-30')");
  await client.query(`INSERT INTO reporting_period VALUES
    ('FY26-YE', 'FY26', 'FY26 Year-End', '2026-01-01', '2026-06-30', '2026-09-30'),
    ('FY27-MY', 'FY27', 'FY27 Mid-Year', '2026-07-01', '2026-12-31', '2027-01-31')`);
  await client.query(`INSERT INTO app_setting VALUES ('ai_enabled', 'true'), ('demo_today', '"2026-10-14"')`);

  const orgs: OrgRow[] = [];
  const orgRows: Record<string, unknown>[] = [];
  const contactRows: Record<string, unknown>[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const borough = i === 0 ? "Bronx" : pick(BOROUGHS);
    let name = i === 0 ? MARIA_ORG.name : `${ORG_PREFIXES[i % ORG_PREFIXES.length]} ${ORG_SUFFIXES[(i * 7) % ORG_SUFFIXES.length]}`;
    if (usedNames.has(name)) name = `${name} of ${borough}`;
    usedNames.add(name);
    if (i === 1) name = "Harborview Youth Alliance";
    const ein = i === 0 ? MARIA_ORG.ein : `00-${String(1100000 + i * 13729).slice(0, 7)}`;
    const id = randomUUID();
    const domain = i === 0 ? "motthavenyouth.example.org" : `${slug(name).slice(0, 18)}.example.org`;
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const contact = i === 0
      ? { name: PERSONAS.maria.name, title: PERSONAS.maria.title, email: PERSONAS.maria.email, phone: "718-555-0142" }
      : { name: `${first} ${last}`, title: pick(TITLES), email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`, phone: phone() };
    const org: OrgRow = { id, ein, legal_name: name, borough, contact };
    orgs.push(org);
    orgRows.push({
      id,
      ein,
      legal_name: name,
      dba_name: null,
      org_type: i % 17 === 5 ? "agency" : "cbo",
      borough,
      council_district: i === 0 ? 8 : pick(BOROUGH_DISTRICTS[borough as keyof typeof BOROUGH_DISTRICTS]),
      address_line: `${between(10, 2900)} ${pick(STREETS)}${random() < 0.4 ? `, Suite ${between(2, 9)}00` : ""}`,
      city: borough === "Manhattan" ? "New York" : borough,
      state: "NY",
      postal_code: pick(BOROUGH_ZIPS[borough as keyof typeof BOROUGH_ZIPS]),
      phone: contact.phone,
      website: `https://www.${domain}`,
      mission: i === 0
        ? "Mott Haven Youth Futures connects young people in the South Bronx with mentors, academic support and paid work experience."
        : `${name} serves ${borough} residents through community programs, case management and partnerships with local schools.`,
      founded_year: between(1968, 2016),
      annual_budget: roundTo(between(400000, 9000000), 10000),
    });
    contactRows.push({ id: randomUUID(), org_id: id, full_name: contact.name, title: contact.title, email: contact.email, phone: contact.phone, is_primary: true });
    if (random() < 0.7) {
      const f = pick(FIRST_NAMES);
      const l = pick(LAST_NAMES);
      contactRows.push({ id: randomUUID(), org_id: id, full_name: `${f} ${l}`, title: pick(TITLES), email: `${f.toLowerCase()}.${l.toLowerCase()}@${domain}`, phone: phone(), is_primary: false });
    }
  }
  if (orgs[0].legal_name === MARIA_ORG.name) {
    contactRows.push({ id: randomUUID(), org_id: orgs[0].id, full_name: PERSONAS.james.name, title: PERSONAS.james.title, email: PERSONAS.james.email, phone: "718-555-0157", is_primary: false });
  }
  await insertRows(client, "organization", orgRows, ["id", "ein", "legal_name", "dba_name", "org_type", "borough", "council_district", "address_line", "city", "state", "postal_code", "phone", "website", "mission", "founded_year", "annual_budget"]);
  await insertRows(client, "contact", contactRows, ["id", "org_id", "full_name", "title", "email", "phone", "is_primary"]);

  const users: Record<string, unknown>[] = [];
  const ids: Record<keyof typeof PERSONAS, string> = {
    maria: randomUUID(), james: randomUUID(), daniel: randomUUID(), priya: randomUUID(), tomas: randomUUID(), grace: randomUUID(),
  };
  users.push(
    { id: ids.maria, email: PERSONAS.maria.email, full_name: PERSONAS.maria.name, title: PERSONAS.maria.title, role: "cbo_submitter", org_id: orgs[0].id, password_hash: hash, can_sign_in: true },
    { id: ids.james, email: PERSONAS.james.email, full_name: PERSONAS.james.name, title: PERSONAS.james.title, role: "cbo_submitter", org_id: orgs[0].id, password_hash: hash, can_sign_in: true },
    { id: ids.daniel, email: PERSONAS.daniel.email, full_name: PERSONAS.daniel.name, title: PERSONAS.daniel.title, role: "finance_analyst", org_id: null, password_hash: hash, can_sign_in: true },
    { id: ids.priya, email: PERSONAS.priya.email, full_name: PERSONAS.priya.name, title: PERSONAS.priya.title, role: "finance_admin", org_id: null, password_hash: hash, can_sign_in: true },
    { id: ids.tomas, email: PERSONAS.tomas.email, full_name: PERSONAS.tomas.name, title: PERSONAS.tomas.title, role: "cbo_submitter", org_id: orgs[1].id, password_hash: null, can_sign_in: false },
    { id: ids.grace, email: PERSONAS.grace.email, full_name: PERSONAS.grace.name, title: PERSONAS.grace.title, role: "finance_viewer", org_id: null, password_hash: null, can_sign_in: false }
  );
  const orgSubmitter: Record<string, string> = { [orgs[0].id]: ids.maria, [orgs[1].id]: ids.tomas };
  for (const org of orgs.slice(2)) {
    const id = randomUUID();
    orgSubmitter[org.id] = id;
    users.push({ id, email: org.contact.email, full_name: org.contact.name, title: org.contact.title, role: "cbo_submitter", org_id: org.id, password_hash: null, can_sign_in: false });
  }
  const financeRoles = ["finance_viewer", "finance_analyst", "finance_analyst", "finance_analyst", "finance_admin"];
  const financeIds: string[] = [ids.daniel];
  for (let i = 0; i < 56; i++) {
    const f = pick(FIRST_NAMES);
    const l = pick(LAST_NAMES);
    const id = randomUUID();
    const role = financeRoles[i % financeRoles.length];
    if (role !== "finance_viewer") financeIds.push(id);
    users.push({
      id,
      email: `${f.toLowerCase()}.${l.toLowerCase()}${i}@finance.example.gov`,
      full_name: `${f} ${l}`,
      title: role === "finance_admin" ? "Unit Head" : role === "finance_analyst" ? pick(["Budget Analyst", "Senior Budget Analyst", "Financial Analyst"]) : "Policy Analyst",
      role,
      org_id: null,
      password_hash: null,
      can_sign_in: false,
    });
  }
  await insertRows(client, "app_user", users, ["id", "email", "full_name", "title", "role", "org_id", "password_hash", "can_sign_in"]);

  const initiatives: { id: string; name: string; category: string; formId: string; definition: FormDefinition }[] = [];
  const initiativeRows: Record<string, unknown>[] = [];
  const formRows: Record<string, unknown>[] = [];
  let n = 0;
  for (const [category, names] of Object.entries(INITIATIVE_NAMES)) {
    for (const base of names) {
      n++;
      const id = randomUUID();
      const formId = randomUUID();
      const name = base;
      const definition = buildDefinition(`${base} report`, CATEGORY_METRICS[category]);
      initiatives.push({ id, name, category, formId, definition });
      initiativeRows.push({
        id,
        code: `CI-${String(n).padStart(3, "0")}`,
        name,
        category,
        description: `Council funding for ${category.toLowerCase()} programs delivered by community organizations and City agencies. Funded organizations report performance, spending and outcomes twice a year.`,
        fiscal_year_id: "FY27",
        total_funding: 0,
        status: "active",
        created_by: ids.priya,
      });
      formRows.push({
        id: formId,
        initiative_id: id,
        version: 1,
        status: "published",
        definition,
        source: "seed",
        created_by: ids.priya,
        published_by: ids.priya,
        published_at: "2026-06-15T10:00:00-04:00",
      });
    }
  }
  await insertRows(client, "initiative", initiativeRows, ["id", "code", "name", "category", "description", "fiscal_year_id", "total_funding", "status", "created_by"]);
  await insertRows(client, "form_version", formRows, ["id", "initiative_id", "version", "status", "definition", "source", "created_by", "published_by", "published_at"]);

  const byName = (name: string) => {
    const found = initiatives.find((i) => i.name === name);
    if (!found) throw new Error(`missing initiative ${name}`);
    return found;
  };
  const late = byName(LATE_INITIATIVE);
  const accepted = byName(ACCEPTED_INITIATIVE);
  const large = byName("Adult Literacy");

  type AssignmentRow = { id: string; initiative_id: string; org_id: string; award_amount: number };
  const assignments: AssignmentRow[] = [];
  const pairs = new Set<string>();
  const assign = (initiativeId: string, orgId: string, amount: number) => {
    const key = `${initiativeId}:${orgId}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    assignments.push({ id: randomUUID(), initiative_id: initiativeId, org_id: orgId, award_amount: amount });
  };
  assign(late.id, orgs[0].id, 85000);
  assign(accepted.id, orgs[0].id, 62500);
  for (let i = 2; i < 42; i++) assign(large.id, orgs[i].id, roundTo(between(15000, 60000), 500));
  for (const initiative of initiatives) {
    if (initiative.id === large.id) continue;
    const count = initiative.id === late.id || initiative.id === accepted.id ? 1 : random() < 0.72 ? 1 : 2;
    for (let c = 0; c < count; c++) assign(initiative.id, orgs[between(1, orgs.length - 1)].id, award());
  }
  await insertRows(client, "assignment", assignments.map((a) => ({ ...a, sponsoring_agency: pick(["DYCD", "DFTA", "DOHMH", "HRA", "SBS", "DCLA", "DOE", "DPR"]) })), ["id", "initiative_id", "org_id", "award_amount", "sponsoring_agency"]);
  await client.query("UPDATE initiative i SET total_funding = coalesce((SELECT sum(award_amount) FROM assignment a WHERE a.initiative_id = i.id), 0)");

  const initiativeById = new Map(initiatives.map((i) => [i.id, i]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const submissions: Record<string, unknown>[] = [];
  const answerRows: Record<string, unknown>[] = [];
  const budgetRows: Record<string, unknown>[] = [];
  const revisionRows: Record<string, unknown>[] = [];
  const auditRows: Record<string, unknown>[] = [];
  const outboxRows: Record<string, unknown>[] = [];
  let ref = 0;

  const addAnswers = (submissionId: string, answers: Answers, by: string, at: string) => {
    for (const [key, value] of Object.entries(answers)) {
      answerRows.push({ submission_id: submissionId, question_key: key, value, updated_by: by, updated_at: at });
    }
  };
  const addBudget = (submissionId: string, lines: BudgetLine[]) => {
    for (const line of lines) {
      budgetRows.push({ submission_id: submissionId, row_id: line.rowId, position: line.position, category: line.category, description: line.description, amount: line.amount });
    }
  };

  const createSubmission = (opts: {
    assignment: AssignmentRow;
    period: "FY26-YE" | "FY27-MY";
    status: "draft" | "submitted" | "under_review" | "returned" | "accepted";
    outcomes?: "normal" | "zero" | "low";
    submittedBy?: string;
    submittedOn?: string;
    unbalanced?: boolean;
    draftAnswers?: Answers;
  }) => {
    const initiative = initiativeById.get(opts.assignment.initiative_id)!;
    const org = orgById.get(opts.assignment.org_id)!;
    const id = randomUUID();
    ref++;
    const submitter = opts.submittedBy ?? orgSubmitter[org.id];
    const full = fullAnswers(initiative.definition, org, opts.outcomes ?? "normal");
    const startedAt = isoAt(opts.period === "FY26-YE" ? dateBetween("2026-07-01", "2026-08-20") : dateBetween("2026-09-01", "2026-10-10"), between(9, 17), between(0, 59));
    const base = {
      id,
      reference_no: `LL-${opts.period === "FY26-YE" ? "26YE" : "27MY"}-${String(ref).padStart(5, "0")}`,
      assignment_id: opts.assignment.id,
      period_id: opts.period,
      form_version_id: initiative.formId,
      started_by: submitter,
      created_at: startedAt,
    };
    if (opts.status === "draft") {
      const answers = opts.draftAnswers ?? partialAnswers(full);
      addAnswers(id, answers, submitter, startedAt);
      if (opts.unbalanced) {
        const lines = balancedBudget(opts.assignment.award_amount);
        lines[0].amount = Math.round((lines[0].amount + 1750) * 100) / 100;
        addBudget(id, lines);
      }
      submissions.push({ ...base, status: "draft", revision: 0, lock_version: between(1, 9), submitted_by: null, submitted_at: null, updated_by: submitter, updated_at: startedAt });
      return id;
    }
    const lines = balancedBudget(opts.assignment.award_amount);
    addAnswers(id, full, submitter, startedAt);
    addBudget(id, lines);
    const submittedDate = opts.submittedOn ?? dateBetween("2026-08-01", "2026-09-29");
    const submittedAt = isoAt(submittedDate, between(9, 18), between(0, 59));
    const snapshot = buildSnapshot({ formVersionId: initiative.formId, answers: full, budget: lines, attachments: [] });
    revisionRows.push({ submission_id: id, revision: 1, kind: "submit", snapshot, sha256: "", actor: submitter, reason: null, created_at: submittedAt });
    auditRows.push({ at: submittedAt, actor_id: submitter, entity: "submission", entity_id: id, action: "submit", note: null, before: { status: "draft", revision: 0 }, after: { status: "submitted", revision: 1 } });
    outboxRows.push({
      to_email: org.contact.email,
      template: "submission_confirmation",
      subject: `Report received: ${initiative.name}, ${opts.period === "FY26-YE" ? "FY26 Year-End" : "FY27 Mid-Year"}`,
      body_text: `We received your report ${base.reference_no} for ${initiative.name}.`,
      submission_id: id,
      org_id: org.id,
      status: "sent",
      created_by: submitter,
      created_at: submittedAt,
    });
    const reviewer = pick(financeIds);
    const later = (days: number) => isoAt(new Date(Date.parse(submittedDate) + days * 86400000).toISOString().slice(0, 10), between(9, 17), between(0, 59));
    if (opts.status !== "submitted") {
      auditRows.push({ at: later(2), actor_id: reviewer, entity: "submission", entity_id: id, action: "start_review", note: null, before: { status: "submitted", revision: 1 }, after: { status: "under_review", revision: 1 } });
    }
    if (opts.status === "accepted") {
      auditRows.push({ at: later(5), actor_id: reviewer, entity: "submission", entity_id: id, action: "accept", note: null, before: { status: "under_review", revision: 1 }, after: { status: "accepted", revision: 1 } });
    }
    if (opts.status === "returned") {
      auditRows.push({ at: later(4), actor_id: reviewer, entity: "submission", entity_id: id, action: "request_update", note: "Please attach the signed timesheets for the Program Coordinator line and confirm the participant count.", before: { status: "under_review", revision: 1 }, after: { status: "returned", revision: 1 } });
    }
    submissions.push({ ...base, status: opts.status, revision: 1, lock_version: between(3, 12), submitted_by: submitter, submitted_at: submittedAt, updated_by: submitter, updated_at: submittedAt });
    return id;
  };

  const lateAssignment = assignments.find((a) => a.initiative_id === late.id)!;
  const acceptedAssignment = assignments.find((a) => a.initiative_id === accepted.id)!;
  createSubmission({ assignment: acceptedAssignment, period: "FY26-YE", status: "accepted", submittedBy: ids.james, submittedOn: "2026-09-18" });
  if (options.lateDraft === "half") {
    const org = orgById.get(orgs[0].id)!;
    const full = fullAnswers(late.definition, org, "normal");
    const half: Answers = {};
    for (const key of ["org_legal_name", "org_ein", "contact_name", "contact_title", "contact_email", "contact_phone", "accomplishments", "challenges"]) half[key] = full[key];
    createSubmission({ assignment: lateAssignment, period: "FY26-YE", status: "draft", submittedBy: ids.maria, draftAnswers: half });
  }

  for (const assignment of assignments) {
    if (assignment.org_id === orgs[0].id) continue;
    const r = random();
    if (r < 0.7) createSubmission({ assignment, period: "FY26-YE", status: "accepted", outcomes: random() < 0.03 ? "low" : "normal" });
    else if (r < 0.77) createSubmission({ assignment, period: "FY26-YE", status: "submitted", outcomes: random() < 0.25 ? "zero" : random() < 0.3 ? "low" : "normal" });
    else if (r < 0.81) createSubmission({ assignment, period: "FY26-YE", status: "under_review" });
    else if (r < 0.83) createSubmission({ assignment, period: "FY26-YE", status: "returned" });
    else if (r < 0.9) createSubmission({ assignment, period: "FY26-YE", status: "draft", unbalanced: random() < 0.6 });
    if (random() < 0.12) createSubmission({ assignment, period: "FY27-MY", status: "draft" });
  }

  await insertRows(client, "submission", submissions, ["id", "reference_no", "assignment_id", "period_id", "form_version_id", "status", "revision", "lock_version", "started_by", "submitted_by", "submitted_at", "updated_by", "updated_at", "created_at"]);
  await insertRows(client, "answer", answerRows, ["submission_id", "question_key", "value", "updated_by", "updated_at"]);
  await insertRows(client, "budget_line", budgetRows, ["submission_id", "row_id", "position", "category", "description", "amount"]);
  for (let i = 0; i < revisionRows.length; i += 500) {
    await client.query(
      `INSERT INTO submission_revision (submission_id, revision, kind, snapshot, sha256, actor, reason, created_at)
       SELECT submission_id, revision, kind, snapshot, encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), actor, reason, created_at
       FROM jsonb_populate_recordset(NULL::submission_revision, $1::jsonb)`,
      [JSON.stringify(revisionRows.slice(i, i + 500))]
    );
  }
  await insertRows(client, "audit_event", auditRows, ["at", "actor_id", "entity", "entity_id", "action", "note", "before", "after"]);
  await insertRows(client, "outbox", outboxRows, ["to_email", "template", "subject", "body_text", "submission_id", "org_id", "status", "created_by", "created_at"]);

  return { ids, orgs: orgs.length, initiatives: initiatives.length, assignments: assignments.length, submissions: submissions.length };
}

async function main() {
  const url = process.env.DB_OWNER_URL;
  if (!url) throw new Error("DB_OWNER_URL is not set");
  const client = new Client({ connectionString: url, ssl: url.includes("localhost") ? undefined : true });
  await client.connect();
  await client.query("BEGIN");
  try {
    await reset(client, process.argv[2] ?? "fresh");
    const summary = await seed(client);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: summary.ids.priya })]);
    await client.query("SELECT app.ensure_scheduler()");
    await client.query("SELECT app.restore_reminder_defaults(id) FROM reporting_period");
    await client.query("SELECT set_config('request.jwt.claims', '', true)");
    await client.query("COMMIT");
    console.log(`seeded ${summary.orgs} organizations, ${summary.initiatives} initiatives, ${summary.assignments} assignments, ${summary.submissions} submissions`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
