import "../lib/load-env";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { sslFor } from "../lib/db-ssl";
import { buildDefinition, CATEGORY_METRICS } from "../lib/forms/standard";
import { seedQuestionLibrary } from "./seed-library";
import { buildSnapshot } from "../lib/snapshot";
import { todayInNewYork } from "../lib/dates";
import type { Answers, BudgetLine, FormDefinition } from "../lib/rules/types";
import {
  ACCOMPLISHMENTS,
  AGENCY_BY_CATEGORY,
  AGENCY_ORGS,
  BOROUGH_AREA_CODES,
  BOROUGH_DISTRICTS,
  BOROUGH_PLACES,
  BOROUGH_WEIGHTS,
  CATEGORIES,
  CHALLENGES,
  COST_PER_PARTICIPANT,
  COUNCIL_FIRST_NAMES,
  COUNCIL_LAST_NAMES,
  FINANCE_FIRST_NAMES,
  FINANCE_LAST_NAMES,
  FINANCE_TITLES,
  NAMED_INITIATIVES,
  ORG_FIRST_NAMES,
  ORG_LAST_NAMES,
  ORG_NOUNS,
  ORGS_PER_CATEGORY,
  OTPS_LINES,
  PREFIXES,
  PS_LINES,
  STORIES,
  TITLES,
  type Borough,
  type Category,
} from "./seed-data";
import { seedOperations } from "./seed-ops";
import { CITYWIDE_INITIATIVES, generateInitiatives, type InitiativeSpec } from "./seed-initiatives";

export const PERSONAS = {
  maria: { email: "maria.santos@motthavenyouth.example.org", name: "Maria Santos", title: "Program Director" },
  james: { email: "james.okafor@motthavenyouth.example.org", name: "James Okafor", title: "Finance Manager" },
  daniel: { email: "daniel.cho@finance.example.gov", name: "Daniel Cho", title: "Budget Analyst" },
  priya: { email: "priya.raman@finance.example.gov", name: "Priya Raman", title: "Deputy Director, Council Finance" },
  tomas: { email: "tomas.rivera@harborview.example.org", name: "Tomas Rivera", title: "Executive Director" },
  grace: { email: "grace.chen@finance.example.gov", name: "Grace Chen", title: "Policy Advisor" },
};

export const MARIA_ORG = { ein: "13-4027118", name: "Mott Haven Youth Futures, Inc." };
export const LATE_INITIATIVE = "Mentor Match Network";
export const ACCEPTED_INITIATIVE = "Afterschool Studio Program";

const MARIA_DRAFT_BUDGET = [
  ["PS", "Program Coordinator, 0.6 FTE", 24000],
  ["PS", "Mentor Recruitment Specialist, 0.4 FTE", 14400],
  ["PS", "Youth peer leader stipends", 9600],
  ["PS", "Fringe benefits", 7632],
  ["OTPS", "MetroCards for participants", 3960],
  ["OTPS", "Space rental for Saturday sessions", 3600],
  ["OTPS", "Program supplies and curriculum", 2875],
  ["OTPS", "Mentor background checks", 1890],
  ["OTPS", "Family events and meals", 1744],
  ["OTPS", "Printing and outreach", 1150],
  ["OTPS", "Mentor training workshop", 550],
] as const;

export const MARIA_REMAINING_BUDGET = [
  ["OTPS", "Program evaluation consultant", 7349],
  ["OTPS", "Summer career exposure trips", 6250],
] as const;

const TODAY = "2026-10-08";
const SPEAKER_DISTRICT = 9;
const SOURCE_MIX = { citywide: 40, speaker: 10, delegation: 50 };
const MISSING_RATE: Record<"local" | "citywide" | "speaker" | "delegation", number> = {
  citywide: 0.04,
  speaker: 0.08,
  local: 0.13,
  delegation: 0.13,
};
const HIGH_RISK_DISTRICTS = new Set([8, 15, 16, 17, 37, 42]);
const HIGH_RISK_FACTOR = 3.5;
const EIN_PREFIXES = [
  "11",
  "13",
  "13",
  "13",
  "14",
  "20",
  "26",
  "27",
  "45",
  "46",
  "47",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "92",
];

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

const random = rng(20261009);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => Math.floor(min + random() * (max - min + 1));
const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const chance = (p: number) => random() < p;

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function weighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[0][0];
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function dateBetween(start: string, end: string): string {
  const a = Date.parse(start);
  const b = Date.parse(end);
  return new Date(a + random() * (b - a)).toISOString().slice(0, 10);
}

function rampDate(start: string, end: string, steepness: number): string {
  const a = Date.parse(start);
  const b = Date.parse(end);
  return new Date(a + Math.pow(random(), 1 / steepness) * (b - a)).toISOString().slice(0, 10);
}

function nthSunday(year: number, month: number, n: number): number {
  const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return Date.UTC(year, month - 1, 1 + ((7 - dow) % 7) + 7 * (n - 1));
}

function isoAt(date: string, hour: number, minute: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = Date.UTC(y, m - 1, d);
  const offset = day >= nthSunday(y, 3, 2) && day < nthSunday(y, 11, 1) ? "-04:00" : "-05:00";
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
}

function workTime(date: string): string {
  return isoAt(date, between(9, 17), between(0, 59));
}

type Names = { first: readonly string[]; last: readonly string[] };

function nameMaker(pool: Names, used: Set<string>) {
  return () => {
    for (let attempt = 0; attempt < 500; attempt++) {
      const name = `${pick(pool.first)} ${pick(pool.last)}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    throw new Error("name pool exhausted");
  };
}

function homeDistrictIn(borough: Borough): number {
  const options = BOROUGH_DISTRICTS[borough];
  return Number(
    weighted(
      Object.fromEntries(
        options.map((d) => [
          String(d),
          HIGH_RISK_DISTRICTS.has(d) && !(borough === "Manhattan" && d === 8) ? (borough === "Brooklyn" ? 4 : 3) : 1,
        ]),
      ),
    ),
  );
}

function award(kind: "named" | "local", range: [number, number]): number {
  const [min, max] = range;
  const span = kind === "local" ? 0.4 : 1;
  const raw = min + Math.pow(random(), 1.6) * (max - min) * span;
  const step = raw < 40000 ? 500 : raw < 150000 ? pick([1000, 2500, 5000]) : pick([5000, 2500, 10000]);
  return Math.max(5000, roundTo(raw, step));
}

function phone(borough: Borough): string {
  return `${pick(BOROUGH_AREA_CODES[borough])}-555-${String(between(100, 199)).padStart(4, "0")}`;
}

function balancedBudget(total: number): BudgetLine[] {
  const count = between(5, 12);
  const psCount = Math.max(2, Math.floor(count * 0.6));
  const weights = Array.from({ length: count }, () => 0.4 + random() * 1.4);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const totalCents = Math.round(total * 100);
  let remaining = totalCents;
  const psPool = shuffle(PS_LINES);
  const otpsPool = shuffle(OTPS_LINES);
  return weights.map((weight, index) => {
    const cents = index === count - 1 ? remaining : roundTo(Math.round((weight / weightSum) * totalCents), 100);
    remaining -= cents;
    const isPs = index < psCount;
    return {
      rowId: randomUUID(),
      position: index + 1,
      category: isPs ? "PS" : "OTPS",
      description: isPs ? psPool[index % psPool.length] : otpsPool[(index - psCount) % otpsPool.length],
      amount: cents / 100,
    } satisfies BudgetLine;
  });
}

function skewedBudget(total: number): BudgetLine[] {
  const lines = balancedBudget(total);
  const direction = chance(0.55) ? 1 : -1;
  const delta = direction * pick([120, 340, 875, 1260, 2300, 4150, 6800, 310.5, 1999.99]);
  const target = lines[0];
  target.amount = Math.max(100, Math.round((target.amount + delta) * 100) / 100);
  return lines;
}

type OrgRow = {
  id: string;
  ein: string;
  legal_name: string;
  org_type: "cbo" | "agency";
  borough: Borough;
  district: number;
  categories: Category[];
  domain: string;
  submitterId: string;
  contact: { name: string; title: string; email: string; phone: string };
};

type SeedInitiative = {
  id: string;
  code: string;
  name: string;
  category: Category;
  fiscalYear: "FY26" | "FY27";
  kind: "named" | "local";
  formId: string;
  definition: FormDefinition;
  agency: string;
  source?: SeedInitiative;
  awards: [number, number];
  amount: [number, number];
  retired: boolean;
  open: boolean;
  renamedTo?: string;
};

type AssignmentRow = {
  id: string;
  initiative_id: string;
  org_id: string;
  award_amount: number;
  sponsoring_agency: string;
  funding_source: "local" | "citywide" | "speaker" | "delegation";
  contract_status: "awaiting" | "pending" | "registered";
  contract_registered_on: string | null;
  contract_number: string | null;
};

type Plan = { annualTarget: number; midActual: number; sites: number; delivery: string; youth: boolean; cost: number };

const PERIODS = {
  "FY26-MY": {
    fy: "FY26",
    kind: "MY",
    starts: "2025-07-01",
    ends: "2025-12-31",
    due: "2026-01-31",
    label: "FY26 Mid-Year",
    tag: "26MY",
    days: 184,
  },
  "FY26-YE": {
    fy: "FY26",
    kind: "YE",
    starts: "2025-07-01",
    ends: "2026-06-30",
    due: "2026-09-30",
    label: "FY26 Year-End",
    tag: "26YE",
    days: 365,
  },
  "FY27-MY": {
    fy: "FY27",
    kind: "MY",
    starts: "2026-07-01",
    ends: "2026-12-31",
    due: "2027-01-31",
    label: "FY27 Mid-Year",
    tag: "27MY",
    days: 184,
  },
  "FY27-YE": {
    fy: "FY27",
    kind: "YE",
    starts: "2026-07-01",
    ends: "2027-06-30",
    due: "2027-09-30",
    label: "FY27 Year-End",
    tag: "27YE",
    days: 365,
  },
} as const;

type PeriodId = keyof typeof PERIODS;

async function insertRows(client: Client, table: string, rows: Record<string, unknown>[], columns: string[]) {
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) SELECT ${columns.join(", ")} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
      [JSON.stringify(slice)],
    );
  }
}

async function reset(client: Client, scene: string) {
  const guarded = [
    "audit_event",
    "submission_revision",
    "support_message",
    "security_incident",
    "incident_remediation",
    "incident_event",
  ];
  for (const table of guarded) await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  await client.query(`TRUNCATE auth_attempt, audit_event, submission_revision, ai_action, outbox, flag, attachment, budget_line, answer, submission,
    form_version, question, assignment_sponsor, assignment, reporting_period, initiative, app_user, contact, organization, council_member, fiscal_year, app_setting,
    support_message, support_request, incident_event, incident_remediation, security_incident, incident_contact, annual_review_decision, annual_review_participant, annual_review,
    training_record, uat_defect, uat_session, readiness_schedule RESTART IDENTITY CASCADE`);
  for (const table of guarded) await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  await client.query("INSERT INTO demo_reset (scene) VALUES ($1)", [scene]);
}

const MISSION: Record<Category, string> = {
  "Youth Services": "mentoring, after-school learning and paid work experience for young people",
  "Older Adults": "social programs, meals and in-home support for older adults",
  Education: "adult education, literacy and family learning programs",
  Health: "health navigation, screenings and preventive care for neighborhood residents",
  Housing: "tenant counseling, housing stability services and building repair assistance",
  Workforce: "job training, placement and small business support",
  "Food Security": "emergency food, fresh produce distribution and nutrition education",
  "Immigrant Services": "orientation, benefits screening and language access for recent arrivals",
  "Arts and Culture": "performances, classes and exhibitions that serve local audiences",
  "Community Safety": "violence prevention, mediation and street outreach",
  "Legal Services": "free civil legal help in housing, benefits and family matters",
  "Parks and Environment": "neighborhood greening, stewardship and environmental education",
};

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

  await client.query(
    "INSERT INTO fiscal_year VALUES ('FY26', '2025-07-01', '2026-06-30'), ('FY27', '2026-07-01', '2027-06-30')",
  );
  await seedQuestionLibrary(client);
  await insertRows(
    client,
    "reporting_period",
    (Object.entries(PERIODS) as [PeriodId, (typeof PERIODS)[PeriodId]][]).map(([id, p]) => ({
      id,
      fiscal_year_id: p.fy,
      label: p.label,
      starts_on: p.starts,
      ends_on: p.ends,
      due_on: p.due,
    })),
    ["id", "fiscal_year_id", "label", "starts_on", "ends_on", "due_on"],
  );
  await client.query(`INSERT INTO app_setting VALUES ('ai_enabled', 'true')`);

  const usedNames = new Set<string>([
    PERSONAS.maria.name,
    PERSONAS.james.name,
    PERSONAS.daniel.name,
    PERSONAS.priya.name,
    PERSONAS.tomas.name,
    PERSONAS.grace.name,
  ]);
  const orgName = nameMaker({ first: ORG_FIRST_NAMES, last: ORG_LAST_NAMES }, usedNames);
  const financeName = nameMaker({ first: FINANCE_FIRST_NAMES, last: FINANCE_LAST_NAMES }, usedNames);
  const councilFirsts = shuffle(COUNCIL_FIRST_NAMES);
  const councilLasts = shuffle(COUNCIL_LAST_NAMES);
  const councilRows = Array.from({ length: 51 }, (_, i) => ({
    district: i + 1,
    full_name: `${councilFirsts[i]} ${councilLasts[i]}`,
  }));
  for (const row of councilRows) usedNames.add(row.full_name);
  await insertRows(client, "council_member", councilRows, ["district", "full_name"]);

  const orgs: OrgRow[] = [];
  const orgRows: Record<string, unknown>[] = [];
  const contactRows: Record<string, unknown>[] = [];
  const userRows: Record<string, unknown>[] = [];
  const usedEins = new Set<string>([MARIA_ORG.ein]);
  const usedOrgNames = new Set<string>([MARIA_ORG.name, "Harborview Youth Alliance"]);
  const usedPrefixes = new Set<string>(["Harborview"]);
  const prefixPool = shuffle(PREFIXES);
  let prefixIndex = 0;
  const ids = {
    maria: randomUUID(),
    james: randomUUID(),
    daniel: randomUUID(),
    priya: randomUUID(),
    tomas: randomUUID(),
    grace: randomUUID(),
  };

  const slots: { category: Category; agency?: (typeof AGENCY_ORGS)[number] }[] = [];
  for (const category of CATEGORIES) {
    const total = ORGS_PER_CATEGORY[category];
    const agencyOrgs = AGENCY_ORGS.filter((a) => a.category === category);
    for (const a of agencyOrgs) slots.push({ category, agency: a });
    for (let n = 0; n < total - agencyOrgs.length; n++) slots.push({ category });
  }

  const makeEin = () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const ein = `${pick(EIN_PREFIXES)}-${String(between(1000000, 9999999))}`;
      if (!usedEins.has(ein)) {
        usedEins.add(ein);
        return ein;
      }
    }
    throw new Error("ein pool exhausted");
  };

  let youthIndex = 0;
  for (const slot of slots) {
    const isMaria = slot.category === "Youth Services" && youthIndex === 0;
    const isTomas = slot.category === "Youth Services" && youthIndex === 1;
    if (slot.category === "Youth Services") youthIndex++;

    let name: string;
    let borough: Borough;
    let domain: string;
    if (isMaria) {
      name = MARIA_ORG.name;
      borough = "Bronx";
      domain = "motthavenyouth.example.org";
    } else if (isTomas) {
      name = "Harborview Youth Alliance";
      borough = "Brooklyn";
      domain = "harborview.example.org";
    } else if (slot.agency) {
      name = slot.agency.name;
      borough = slot.agency.borough;
      domain = `${slug(name)}.example.org`;
    } else {
      let candidate = "";
      for (let attempt = 0; attempt < 100; attempt++) {
        const prefix = prefixPool[prefixIndex++ % prefixPool.length];
        candidate = `${prefix} ${pick(ORG_NOUNS[slot.category])}`;
        if (!usedOrgNames.has(candidate) && !usedPrefixes.has(prefix)) {
          usedPrefixes.add(prefix);
          break;
        }
      }
      name = chance(0.45) ? `${candidate}, Inc.` : candidate;
      borough = weighted(BOROUGH_WEIGHTS);
      domain = `${slug(candidate)}.example.org`;
    }
    usedOrgNames.add(name);

    const id = randomUUID();
    const place = pick(BOROUGH_PLACES[borough]);
    const district = isMaria ? 8 : homeDistrictIn(borough);
    const contactName = isMaria ? PERSONAS.maria.name : isTomas ? PERSONAS.tomas.name : orgName();
    const [contactFirst, ...contactRest] = contactName.split(" ");
    const contactEmail = isMaria
      ? PERSONAS.maria.email
      : isTomas
        ? PERSONAS.tomas.email
        : `${slug(contactFirst)}.${slug(contactRest.join(""))}@${domain}`;
    const contactTitle = isMaria ? PERSONAS.maria.title : isTomas ? PERSONAS.tomas.title : pick(TITLES);
    const contactPhone = isMaria ? "718-555-0142" : phone(borough);
    const categories = [slot.category];
    if (!slot.agency && chance(0.25)) {
      const other = pick(CATEGORIES.filter((c) => c !== slot.category));
      categories.push(other);
    }
    const orgType = slot.agency ? "agency" : "cbo";
    const ein = isMaria ? MARIA_ORG.ein : makeEin();
    const submitterId = isMaria ? ids.maria : isTomas ? ids.tomas : randomUUID();

    const org: OrgRow = {
      id,
      ein,
      legal_name: name,
      org_type: orgType,
      borough,
      district,
      categories,
      domain,
      submitterId,
      contact: { name: contactName, title: contactTitle, email: contactEmail, phone: contactPhone },
    };
    orgs.push(org);
    orgRows.push({
      id,
      ein,
      legal_name: name,
      dba_name: null,
      org_type: orgType,
      borough,
      council_district: district,
      address_line: `${between(10, 2900)} ${pick(place.streets)}${chance(0.4) ? `, Suite ${between(2, 9)}00` : ""}`,
      city: place.city,
      state: "NY",
      postal_code: place.zip,
      phone: contactPhone,
      website: `https://www.${domain}`,
      mission: isMaria
        ? "Mott Haven Youth Futures connects young people in the South Bronx with mentors, academic support and paid work experience."
        : `${name} provides ${MISSION[slot.category]} for residents of ${borough === "Manhattan" ? "upper Manhattan and the Lower East Side" : borough}.`,
      founded_year: orgType === "agency" ? between(1975, 2005) : between(1968, 2018),
      annual_budget:
        orgType === "agency" ? roundTo(between(9000000, 48000000), 100000) : roundTo(between(350000, 8500000), 10000),
    });
    contactRows.push({
      id: randomUUID(),
      org_id: id,
      full_name: contactName,
      title: contactTitle,
      email: contactEmail,
      phone: contactPhone,
      is_primary: true,
    });
    userRows.push({
      id: submitterId,
      email: contactEmail,
      full_name: contactName,
      title: contactTitle,
      role: "cbo_submitter",
      org_id: id,
      password_hash: isMaria ? hash : null,
      can_sign_in: isMaria,
    });
    if (isMaria) {
      contactRows.push({
        id: randomUUID(),
        org_id: id,
        full_name: PERSONAS.james.name,
        title: PERSONAS.james.title,
        email: PERSONAS.james.email,
        phone: "718-555-0157",
        is_primary: false,
      });
      userRows.push({
        id: ids.james,
        email: PERSONAS.james.email,
        full_name: PERSONAS.james.name,
        title: PERSONAS.james.title,
        role: "cbo_submitter",
        org_id: id,
        password_hash: hash,
        can_sign_in: true,
      });
    } else if (chance(0.6)) {
      const second = orgName();
      const [f, ...r] = second.split(" ");
      contactRows.push({
        id: randomUUID(),
        org_id: id,
        full_name: second,
        title: pick(TITLES),
        email: `${slug(f)}.${slug(r.join(""))}@${domain}`,
        phone: phone(borough),
        is_primary: false,
      });
    }
  }
  await insertRows(client, "organization", orgRows, [
    "id",
    "ein",
    "legal_name",
    "dba_name",
    "org_type",
    "borough",
    "council_district",
    "address_line",
    "city",
    "state",
    "postal_code",
    "phone",
    "website",
    "mission",
    "founded_year",
    "annual_budget",
  ]);
  await insertRows(client, "contact", contactRows, [
    "id",
    "org_id",
    "full_name",
    "title",
    "email",
    "phone",
    "is_primary",
  ]);

  const maria = orgs.find((o) => o.legal_name === MARIA_ORG.name)!;
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const financeRows: Record<string, unknown>[] = [
    {
      id: ids.priya,
      email: PERSONAS.priya.email,
      full_name: PERSONAS.priya.name,
      title: PERSONAS.priya.title,
      role: "finance_admin",
      org_id: null,
      password_hash: hash,
      can_sign_in: true,
    },
    {
      id: ids.daniel,
      email: PERSONAS.daniel.email,
      full_name: PERSONAS.daniel.name,
      title: PERSONAS.daniel.title,
      role: "finance_analyst",
      org_id: null,
      password_hash: hash,
      can_sign_in: true,
    },
    {
      id: ids.grace,
      email: PERSONAS.grace.email,
      full_name: PERSONAS.grace.name,
      title: PERSONAS.grace.title,
      role: "finance_viewer",
      org_id: null,
      password_hash: hash,
      can_sign_in: true,
    },
  ];
  const reviewerIds: string[] = [ids.daniel];
  const staffPlan: ("finance_admin" | "finance_analyst" | "finance_viewer")[] = [
    "finance_admin",
    ...Array.from({ length: 8 }, () => "finance_analyst" as const),
    ...Array.from({ length: 5 }, () => "finance_viewer" as const),
  ];
  const takenSurnames = new Set<string>(
    [PERSONAS.priya.name, PERSONAS.daniel.name, PERSONAS.grace.name].map((name) => name.split(" ").slice(1).join(" ")),
  );
  for (const role of staffPlan) {
    const drawn = financeName();
    const [f, ...drawnLast] = drawn.split(" ");
    let surname = drawnLast.join(" ");
    if (takenSurnames.has(surname)) {
      const fresh = FINANCE_LAST_NAMES.find((last) => !takenSurnames.has(last) && !usedNames.has(`${f} ${last}`));
      if (!fresh) throw new Error("finance surname pool exhausted");
      surname = fresh;
      usedNames.add(`${f} ${surname}`);
    }
    takenSurnames.add(surname);
    const full = `${f} ${surname}`;
    const r = [surname];
    const id = randomUUID();
    if (role !== "finance_viewer") reviewerIds.push(id);
    financeRows.push({
      id,
      email: `${slug(f)}.${slug(r.join(""))}@finance.example.gov`,
      full_name: full,
      title: pick(FINANCE_TITLES[role]),
      role,
      org_id: null,
      password_hash: role === "finance_viewer" ? hash : null,
      can_sign_in: role === "finance_viewer",
    });
  }
  reviewerIds.push(ids.priya);
  await insertRows(
    client,
    "app_user",
    [...userRows, ...financeRows],
    ["id", "email", "full_name", "title", "role", "org_id", "password_hash", "can_sign_in"],
  );

  const initiatives: SeedInitiative[] = [];
  const initiativeRows: Record<string, unknown>[] = [];
  const formRows: Record<string, unknown>[] = [];
  const lineageRows: Record<string, unknown>[] = [];
  const serials = { FY26: 0, FY27: 0 };

  const addInitiative = (
    spec: {
      name: string;
      category: Category;
      kind: "named" | "local";
      awards: [number, number];
      amount: [number, number];
      description: string;
      retired?: boolean;
      open?: boolean;
      renamedTo?: string;
    },
    fiscalYear: "FY26" | "FY27",
    source?: SeedInitiative,
  ) => {
    const id = randomUUID();
    const formId = randomUUID();
    const serial = source ? Number(source.code.slice(-3)) : ++serials[fiscalYear];
    const definition = buildDefinition(`${spec.name} report`, CATEGORY_METRICS[spec.category]);
    const row: SeedInitiative = {
      id,
      code: `CI-${fiscalYear.slice(2)}-${String(serial).padStart(3, "0")}`,
      name: spec.name,
      category: spec.category,
      fiscalYear,
      kind: spec.kind,
      formId,
      definition,
      agency: AGENCY_BY_CATEGORY[spec.category],
      source,
      awards: spec.awards,
      amount: spec.amount,
      retired: Boolean(spec.retired),
      open: Boolean(spec.open),
      renamedTo: spec.renamedTo,
    };
    initiatives.push(row);
    initiativeRows.push({
      id,
      code: row.code,
      name: spec.name,
      category: spec.category,
      description: spec.description,
      fiscal_year_id: fiscalYear,
      total_funding: 0,
      status: spec.retired ? "retired" : "active",
      administering_agency: row.agency,
      created_by: ids.priya,
      created_at: fiscalYear === "FY26" ? "2025-06-18T10:00:00-04:00" : "2026-06-22T10:00:00-04:00",
    });
    formRows.push({
      id: formId,
      initiative_id: id,
      version: 1,
      status: "published",
      definition,
      source: "manual",
      created_by: ids.priya,
      published_by: ids.priya,
      published_at: fiscalYear === "FY26" ? "2025-06-25T10:00:00-04:00" : "2026-06-29T10:00:00-04:00",
    });
    return row;
  };

  const localSpec = (category: Category) => ({
    name: `Local ${category} Discretionary Fund`,
    category,
    kind: "local" as const,
    awards: [2, 3] as [number, number],
    amount: [8000, 90000] as [number, number],
    description: `Discretionary awards that individual Council Members designate to neighborhood ${category.toLowerCase()} programs in their districts.`,
  });

  const takenNames = new Set<string>([
    ...NAMED_INITIATIVES.flatMap((n) => [n.name, n.renamedTo ?? n.name]),
    ...CITYWIDE_INITIATIVES.map((c) => c.name),
    ...CATEGORIES.map((c) => localSpec(c).name),
  ]);
  const generated = generateInitiatives(CATEGORIES, takenNames, { shuffle, pick, random });

  const fy26: SeedInitiative[] = [];
  const fy27Only: InitiativeSpec[] = generated.filter((g) => g.newInFy27);
  for (const named of NAMED_INITIATIVES)
    fy26.push(addInitiative({ ...named, kind: "named", retired: named.retiredAtRollover }, "FY26"));
  for (const citywide of CITYWIDE_INITIATIVES) fy26.push(addInitiative(citywide, "FY26"));
  for (const category of CATEGORIES) fy26.push(addInitiative(localSpec(category), "FY26"));
  for (const spec of generated.filter((g) => !g.newInFy27))
    fy26.push(addInitiative({ ...spec, retired: spec.retiredAtRollover }, "FY26"));

  const fy27: SeedInitiative[] = [];
  for (const prior of fy26) {
    if (prior.retired) continue;
    const name = prior.renamedTo ?? prior.name;
    const description = initiativeRows.find((r) => r.id === prior.id)!.description as string;
    const next = addInitiative(
      {
        name,
        category: prior.category,
        kind: prior.kind,
        awards: prior.awards,
        amount: prior.amount,
        description,
        open: prior.open,
      },
      "FY27",
      prior,
    );
    fy27.push(next);
    lineageRows.push({
      predecessor_id: prior.id,
      successor_id: next.id,
      kind: name === prior.name ? "carried" : "renamed",
      fiscal_year_id: "FY27",
      note: name === prior.name ? "Carried forward to FY27" : `Renamed from ${prior.name}`,
      created_by: ids.priya,
      created_at: "2026-06-22T10:30:00-04:00",
    });
  }
  serials.FY27 = serials.FY26;
  const fy27New = fy27Only.map((spec) => addInitiative(spec, "FY27"));
  fy27.push(...fy27New);
  for (const prior of fy26.filter((p) => p.retired)) {
    lineageRows.push({
      predecessor_id: prior.id,
      successor_id: null,
      kind: "retired",
      fiscal_year_id: "FY27",
      note: "Retired at rollover to FY27",
      created_by: ids.priya,
      created_at: "2026-06-22T10:30:00-04:00",
    });
  }
  await insertRows(client, "initiative", initiativeRows, [
    "id",
    "code",
    "name",
    "category",
    "description",
    "fiscal_year_id",
    "total_funding",
    "status",
    "administering_agency",
    "created_by",
    "created_at",
  ]);
  await insertRows(client, "form_version", formRows, [
    "id",
    "initiative_id",
    "version",
    "status",
    "definition",
    "source",
    "created_by",
    "published_by",
    "published_at",
  ]);
  await insertRows(client, "initiative_lineage", lineageRows, [
    "predecessor_id",
    "successor_id",
    "kind",
    "fiscal_year_id",
    "note",
    "created_by",
    "created_at",
  ]);

  const byName = (name: string) => {
    const found = fy26.find((i) => i.name === name);
    if (!found) throw new Error(`missing initiative ${name}`);
    return found;
  };
  const late = byName(LATE_INITIATIVE);
  const accepted = byName(ACCEPTED_INITIATIVE);

  const assignments: AssignmentRow[] = [];
  const sponsorRows: Record<string, unknown>[] = [];
  const assignmentSeed = new Map<string, SeedInitiative>();
  const pairs = new Set<string>();
  const usedContracts = new Set<string>();

  const contractFor = (fy: "FY26" | "FY27", agency: string) => {
    const roll = random();
    const mix = fy === "FY26" ? { registered: 0.93, pending: 0.98 } : { registered: 0.52, pending: 0.8 };
    const status = roll < mix.registered ? "registered" : roll < mix.pending ? "pending" : "awaiting";
    let number: string | null = null;
    if (status !== "awaiting") {
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = `${agency}-${fy.slice(2)}-${String(between(1000, 99999)).padStart(5, "0")}`;
        if (!usedContracts.has(candidate)) {
          usedContracts.add(candidate);
          number = candidate;
          break;
        }
      }
    }
    const registeredOn =
      status === "registered"
        ? fy === "FY26"
          ? dateBetween("2025-08-04", "2026-03-20")
          : dateBetween("2026-07-14", "2026-10-02")
        : null;
    return {
      contract_status: status as AssignmentRow["contract_status"],
      contract_registered_on: registeredOn,
      contract_number: number,
    };
  };

  const sponsorsFor = (org: OrgRow, source: AssignmentRow["funding_source"], amount: number) => {
    const homeDistrict = org.id === maria.id || chance(0.75) ? org.district : pick(BOROUGH_DISTRICTS[org.borough]);
    if (source === "speaker") return [{ district: SPEAKER_DISTRICT, amount }];
    if (source === "delegation") {
      const others = shuffle(BOROUGH_DISTRICTS[org.borough].filter((d) => d !== org.district));
      const districts = [org.district, ...others.slice(0, between(1, Math.min(2, others.length)))];
      const cents = Math.round(amount * 100);
      const each = Math.floor(cents / districts.length);
      return districts.map((district, index) => ({
        district,
        amount: (index === 0 ? cents - each * (districts.length - 1) : each) / 100,
      }));
    }
    return [{ district: homeDistrict, amount }];
  };

  const load = new Map<string, number>();
  const loadKey = (org: OrgRow, fy: string) => `${org.id}:${fy}`;
  const largeOrgs = new Set(
    shuffle(orgs.filter((o) => o.id !== maria.id && o.categories.length > 1))
      .slice(0, 7)
      .map((o) => o.id),
  );
  const capFor = (org: OrgRow) => (largeOrgs.has(org.id) ? 12 : 6);
  const loadOf = (org: OrgRow, fy: string) => load.get(loadKey(org, fy)) ?? 0;
  const pressure = (org: OrgRow, fy: string) => loadOf(org, fy) / capFor(org);

  const assign = (
    initiative: SeedInitiative,
    org: OrgRow,
    amount: number,
    forcedSource?: AssignmentRow["funding_source"],
  ) => {
    const key = `${initiative.id}:${org.id}`;
    if (pairs.has(key)) return null;
    pairs.add(key);
    load.set(loadKey(org, initiative.fiscalYear), loadOf(org, initiative.fiscalYear) + 1);
    const source: AssignmentRow["funding_source"] =
      forcedSource ?? (initiative.kind === "local" ? "local" : weighted(SOURCE_MIX));
    const row: AssignmentRow = {
      id: randomUUID(),
      initiative_id: initiative.id,
      org_id: org.id,
      award_amount: amount,
      sponsoring_agency: initiative.agency,
      funding_source: source,
      ...contractFor(initiative.fiscalYear, initiative.agency),
    };
    assignments.push(row);
    assignmentSeed.set(row.id, initiative);
    for (const s of sponsorsFor(org, source, amount))
      sponsorRows.push({ assignment_id: row.id, district: s.district, amount: s.amount });
    return row;
  };

  const byPressure = (list: OrgRow[], fy: string) => [...list].sort((a, b) => pressure(a, fy) - pressure(b, fy));

  const poolFor = (initiative: SeedInitiative) => {
    const fy = initiative.fiscalYear;
    const free = (o: OrgRow) => !pairs.has(`${initiative.id}:${o.id}`) && loadOf(o, fy) < capFor(o);
    const own = byPressure(
      shuffle(orgs.filter((o) => o.id !== maria.id && o.categories.includes(initiative.category) && free(o))),
      fy,
    );
    if (!initiative.open) return own;
    return [
      ...own,
      ...byPressure(
        shuffle(
          orgs.filter(
            (o) => o.id !== maria.id && o.org_type === "cbo" && !o.categories.includes(initiative.category) && free(o),
          ),
        ),
        fy,
      ),
    ];
  };

  const fillAwards = (initiative: SeedInitiative, count: number) => {
    const pool = poolFor(initiative).slice(0, count);
    for (const org of pool) assign(initiative, org, award(initiative.kind, initiative.amount));
  };

  const ensureAwarded = (list: SeedInitiative[]) => {
    for (const initiative of list) {
      if (assignments.some((a) => a.initiative_id === initiative.id)) continue;
      const fallback = byPressure(
        shuffle(orgs.filter((o) => o.id !== maria.id && o.categories.includes(initiative.category))),
        initiative.fiscalYear,
      )[0];
      assign(initiative, fallback, award(initiative.kind, initiative.amount));
    }
  };

  const raiseToMinimum = (list: SeedInitiative[], fy: string, minimum: number) => {
    for (const org of orgs) {
      if (org.id === maria.id) continue;
      while (loadOf(org, fy) < minimum) {
        const options = list
          .filter((i) => org.categories.includes(i.category) && !pairs.has(`${i.id}:${org.id}`))
          .sort(
            (a, b) =>
              assignments.filter((x) => x.initiative_id === a.id).length -
              assignments.filter((x) => x.initiative_id === b.id).length,
          );
        if (options.length === 0) break;
        assign(options[0], org, award(options[0].kind, options[0].amount));
      }
    }
  };

  assign(late, maria, 85000, "local");
  assign(accepted, maria, 62500, "local");
  const smallFirst = [...fy26].sort(
    (a, b) => Number(a.kind === "local" || a.open) - Number(b.kind === "local" || b.open),
  );
  for (const initiative of smallFirst) fillAwards(initiative, between(initiative.awards[0], initiative.awards[1]));
  ensureAwarded(fy26);
  raiseToMinimum(fy26, "FY26", 3);

  const fy26Assignments = assignments.filter((a) => assignmentSeed.get(a.id)!.fiscalYear === "FY26");
  for (const prior of fy26Assignments) {
    const priorInitiative = assignmentSeed.get(prior.id)!;
    const next = fy27.find((i) => i.source?.id === priorInitiative.id);
    if (!next) continue;
    const org = orgById.get(prior.org_id)!;
    const isMaria = org.id === maria.id;
    if (!isMaria && chance(0.06)) continue;
    const factor = isMaria ? 1 : pick([1, 1, 1.04, 1.1, 0.95, 0.9, 1.15]);
    assign(next, org, Math.max(5000, roundTo(prior.award_amount * factor, 500)), prior.funding_source);
  }
  for (const next of fy27New) fillAwards(next, between(next.awards[0], next.awards[1]));
  for (const next of fy27.filter((i) => !fy27New.includes(i))) {
    if (chance(next.open ? 0 : 0.25)) fillAwards(next, 1);
  }
  ensureAwarded(fy27);
  raiseToMinimum(fy27, "FY27", 3);

  await insertRows(client, "assignment", assignments, [
    "id",
    "initiative_id",
    "org_id",
    "award_amount",
    "sponsoring_agency",
    "funding_source",
    "contract_status",
    "contract_registered_on",
    "contract_number",
  ]);
  await insertRows(client, "assignment_sponsor", sponsorRows, ["assignment_id", "district", "amount"]);
  await client.query(
    "UPDATE initiative i SET total_funding = coalesce((SELECT sum(award_amount) FROM assignment a WHERE a.initiative_id = i.id), 0)",
  );

  const plans = new Map<string, Plan>();
  const planFor = (a: AssignmentRow): Plan => {
    const found = plans.get(a.id);
    if (found) return found;
    const initiative = assignmentSeed.get(a.id)!;
    const [lo, hi] = COST_PER_PARTICIPANT[initiative.category];
    const cost = lo + random() * (hi - lo);
    const annualTarget = Math.max(24, Math.round(a.award_amount / cost));
    const plan: Plan = {
      annualTarget,
      midActual: Math.max(1, Math.round(annualTarget * 0.5 * (0.7 + random() * 0.4))),
      sites: annualTarget > 600 ? between(2, 5) : between(1, 3),
      delivery: pick(["In person", "In person", "In person", "Hybrid", "Remote"]),
      youth:
        initiative.category === "Youth Services" ||
        (initiative.category === "Education" && chance(0.5)) ||
        (initiative.category === "Health" && chance(0.3)) ||
        chance(0.08),
      cost,
    };
    plans.set(a.id, plan);
    return plan;
  };

  const metricValue = (key: string, actual: number, scale: number, days: number): string => {
    const n = (min: number, max: number) => String(Math.max(0, Math.round(between(min * 100, max * 100) / 100)));
    switch (key) {
      case "youth_program_hours":
        return n(Math.max(10, actual * 6), Math.max(20, actual * 28));
      case "youth_completion_rate":
        return String(between(58, 96));
      case "meals_delivered":
        return n(actual * 14 * scale, actual * 60 * scale);
      case "wellness_checks":
        return n(actual * 2 * scale, actual * 9 * scale);
      case "students_tutored":
        return n(actual * 0.55, actual * 0.95);
      case "literacy_gain_rate":
        return String(between(48, 88));
      case "screenings_completed":
        return n(actual * 0.6, actual * 0.95);
      case "referrals_made":
        return n(actual * 0.1, actual * 0.4);
      case "households_assisted":
        return n(actual * 0.5, actual * 0.95);
      case "evictions_prevented":
        return n(actual * 0.1, actual * 0.4);
      case "job_placements":
        return n(actual * 0.2, actual * 0.55);
      case "credentials_earned":
        return n(actual * 0.3, actual * 0.75);
      case "pounds_distributed":
        return n(actual * 28 * scale, actual * 70 * scale);
      case "pantry_days":
        return String(between(Math.round(days * 0.2), Math.round(days * 0.7)));
      case "legal_consultations":
        return n(actual * 0.6, actual * 1.1);
      case "language_access_hours":
        return n(60 * scale, 520 * scale);
      case "public_events":
        return n(5 * scale, 38 * scale);
      case "event_attendance":
        return n(actual * 0.9, actual * 1.4);
      case "mediations_held":
        return n(12 * scale, 110 * scale);
      case "outreach_contacts":
        return n(actual * 1.2, actual * 4);
      case "cases_opened":
        return n(actual * 0.5, actual * 0.95);
      case "cases_resolved":
        return n(actual * 0.3, actual * 0.8);
      case "volunteer_hours":
        return n(actual * 2.5, actual * 8);
      case "trees_planted":
        return n(12 * scale, 260 * scale);
      default:
        return String(between(5, 200));
    }
  };

  const fullAnswers = (a: AssignmentRow, periodId: PeriodId, quality: "normal" | "zero" | "low"): Answers => {
    const initiative = assignmentSeed.get(a.id)!;
    const org = orgById.get(a.org_id)!;
    const plan = planFor(a);
    const period = PERIODS[periodId];
    const scale = period.kind === "MY" ? 0.5 : 1;
    const target = period.kind === "MY" ? Math.round(plan.annualTarget * 0.5) : plan.annualTarget;
    let actual: number;
    if (quality === "zero") actual = 0;
    else if (quality === "low") actual = Math.max(1, Math.floor(target * (0.15 + random() * 0.2)));
    else if (period.kind === "MY") actual = Math.max(1, Math.round(target * (0.82 + random() * 0.3)));
    else actual = Math.max(plan.midActual + 1, Math.round(target * (0.88 + random() * 0.24)));
    const answers: Answers = {
      org_legal_name: org.legal_name,
      org_ein: org.ein,
      contact_name: org.contact.name,
      contact_title: org.contact.title,
      contact_email: org.contact.email,
      contact_phone: org.contact.phone,
      participants_target: String(target),
      participants_actual: String(actual),
      sites_count: String(plan.sites),
      delivery_model: plan.delivery,
      served_youth: plan.youth ? "Yes" : "No",
      accomplishments: pick(ACCOMPLISHMENTS[initiative.category])
        .replace("{actual}", String(actual))
        .replace("{hours}", String(between(14, 60))),
      challenges: chance(0.7) ? pick(CHALLENGES) : "",
      success_story: chance(0.55) ? pick(STORIES[initiative.category]) : "",
    };
    if (plan.youth) {
      const under18 = Math.max(3, Math.round(actual * (0.35 + random() * 0.5)));
      const a1 = Math.round(under18 * 0.25);
      const a2 = Math.round(under18 * 0.35);
      answers.youth_breakdown = [
        { age_group: "Under 10", count: a1 },
        { age_group: "10 to 13", count: a2 },
        { age_group: "14 to 17", count: Math.max(0, under18 - a1 - a2) },
      ];
    }
    const performance = initiative.definition.sections.find((s) => s.key === "performance");
    for (const question of performance?.questions ?? []) {
      if (question.scope !== "initiative") continue;
      answers[question.key] =
        quality === "zero" && question.type !== "percent" ? "0" : metricValue(question.key, actual, scale, period.days);
    }
    return answers;
  };

  const partialAnswers = (full: Answers): Answers => {
    const keys = Object.keys(full);
    const keep = new Set(["org_legal_name", "org_ein"]);
    const share = 0.25 + random() * 0.65;
    for (const key of keys) if (random() < share) keep.add(key);
    return Object.fromEntries(Object.entries(full).filter(([key]) => keep.has(key)));
  };

  const submissions: Record<string, unknown>[] = [];
  const answerRows: Record<string, unknown>[] = [];
  const budgetRows: Record<string, unknown>[] = [];
  const revisionRows: Record<string, unknown>[] = [];
  const auditRows: Record<string, unknown>[] = [];
  const outboxRows: Record<string, unknown>[] = [];
  const flagRows: Record<string, unknown>[] = [];
  const refCounters: Record<string, number> = {};

  const addAnswers = (submissionId: string, answers: Answers, by: string, at: string) => {
    for (const [key, value] of Object.entries(answers))
      answerRows.push({ submission_id: submissionId, question_key: key, value, updated_by: by, updated_at: at });
  };
  const addBudget = (submissionId: string, lines: BudgetLine[]) => {
    for (const line of lines)
      budgetRows.push({
        submission_id: submissionId,
        row_id: line.rowId,
        position: line.position,
        category: line.category,
        description: line.description,
        amount: line.amount,
      });
  };

  type Status = "draft" | "submitted" | "under_review" | "returned" | "accepted";

  const createSubmission = (opts: {
    assignment: AssignmentRow;
    period: PeriodId;
    status: Status;
    quality?: "normal" | "zero" | "low";
    submittedBy?: string;
    submittedOn?: string;
    unbalanced?: boolean;
    draftAnswers?: Answers;
    draftBudget?: readonly (readonly [BudgetLine["category"], string, number])[];
    draftKeys?: readonly string[];
    editedOn?: string;
  }) => {
    const initiative = assignmentSeed.get(opts.assignment.id)!;
    const org = orgById.get(opts.assignment.org_id)!;
    const period = PERIODS[opts.period];
    const id = randomUUID();
    refCounters[opts.period] = (refCounters[opts.period] ?? 0) + 1;
    const submitter = opts.submittedBy ?? org.submitterId;
    const full = fullAnswers(opts.assignment, opts.period, opts.quality ?? "normal");
    const startFrom = period.kind === "MY" ? (period.fy === "FY26" ? "2026-01-02" : "2026-10-01") : "2026-07-01";
    const startTo = period.kind === "MY" ? (period.fy === "FY26" ? "2026-01-25" : TODAY) : "2026-09-20";
    const startedOn = dateBetween(startFrom, startTo);
    const startedAt = workTime(startedOn);
    const base = {
      id,
      reference_no: `LL-${period.tag}-${String(refCounters[opts.period]).padStart(5, "0")}`,
      assignment_id: opts.assignment.id,
      period_id: opts.period,
      form_version_id: initiative.formId,
      started_by: submitter,
      created_at: startedAt,
    };
    if (opts.status === "draft") {
      const drafted = opts.draftAnswers ?? partialAnswers(full);
      const answers = opts.draftKeys
        ? Object.fromEntries(Object.entries(drafted).filter(([key]) => opts.draftKeys!.includes(key)))
        : drafted;
      const editedAt = workTime(opts.editedOn ?? minDate(TODAY, addDays(startedOn, between(0, 20))));
      addAnswers(id, answers, submitter, editedAt);
      if (opts.draftBudget)
        addBudget(
          id,
          opts.draftBudget.map(([category, description, amount], index) => ({
            rowId: randomUUID(),
            position: index + 1,
            category,
            description,
            amount,
          })),
        );
      else if (opts.unbalanced) addBudget(id, skewedBudget(opts.assignment.award_amount));
      else if (chance(0.3)) addBudget(id, balancedBudget(opts.assignment.award_amount).slice(0, between(2, 4)));
      submissions.push({
        ...base,
        status: "draft",
        revision: 0,
        lock_version: between(1, 9),
        submitted_by: null,
        submitted_at: null,
        updated_by: submitter,
        updated_at: editedAt,
      });
      return id;
    }
    const lines = balancedBudget(opts.assignment.award_amount);
    addAnswers(id, full, submitter, startedAt);
    addBudget(id, lines);
    const submittedDate =
      opts.submittedOn ??
      (period.kind === "MY" ? rampDate("2026-01-02", "2026-01-31", 2.2) : rampDate("2026-07-01", "2026-09-30", 2));
    const submittedAt = isoAt(submittedDate, between(9, 18), between(0, 59));
    const snapshot = buildSnapshot({
      formVersionId: initiative.formId,
      answers: full,
      budget: lines,
      attachments: [],
      subject: {
        organizationName: org.legal_name,
        ein: org.ein,
        initiativeName: initiative.name,
        awardAmount: opts.assignment.award_amount,
      },
    });
    revisionRows.push({
      submission_id: id,
      revision: 1,
      kind: "submit",
      snapshot,
      sha256: "",
      actor: submitter,
      reason: null,
      created_at: submittedAt,
    });
    auditRows.push({
      at: submittedAt,
      actor_id: submitter,
      entity: "submission",
      entity_id: id,
      action: "submit",
      note: null,
      before: { status: "draft", revision: 0 },
      after: { status: "submitted", revision: 1 },
    });
    outboxRows.push({
      to_email: org.contact.email,
      template: "submission_confirmation",
      subject: `Report received: ${initiative.name}, ${period.label}`,
      body_text: `We received your report ${base.reference_no} for ${initiative.name}.`,
      submission_id: id,
      org_id: org.id,
      status: "recorded",
      created_by: submitter,
      created_at: submittedAt,
    });
    const reviewer = pick(reviewerIds);
    const later = (days: number) => workTime(minDate(TODAY, addDays(submittedDate, days)));
    let updatedAt = submittedAt;
    if (opts.status !== "submitted") {
      updatedAt = later(between(1, 4));
      auditRows.push({
        at: updatedAt,
        actor_id: reviewer,
        entity: "submission",
        entity_id: id,
        action: "start_review",
        note: null,
        before: { status: "submitted", revision: 1 },
        after: { status: "under_review", revision: 1 },
      });
    }
    if (opts.status === "accepted") {
      updatedAt = later(between(5, 21));
      auditRows.push({
        at: updatedAt,
        actor_id: reviewer,
        entity: "submission",
        entity_id: id,
        action: "accept",
        note: null,
        before: { status: "under_review", revision: 1 },
        after: { status: "accepted", revision: 1 },
      });
    }
    if (opts.status === "returned") {
      updatedAt = later(between(5, 10));
      auditRows.push({
        at: updatedAt,
        actor_id: reviewer,
        entity: "submission",
        entity_id: id,
        action: "request_update",
        note: pick([
          "Please attach the payroll register for the Program Coordinator line and confirm the participant count.",
          "The budget narrative does not match the supplies line. Please explain the difference and resubmit.",
          "Sites served are listed as 3 but only two addresses appear in the narrative. Please confirm.",
        ]),
        before: { status: "under_review", revision: 1 },
        after: { status: "returned", revision: 1 },
      });
    }
    if (opts.status !== "returned" && chance(0.04)) {
      flagRows.push({
        submission_id: id,
        kind: "manual",
        source: "user",
        note: pick([
          "Verify site count with agency monitor.",
          "Expense ratio differs from prior year, ask for a short explanation.",
          "Check attendance sign-in sheets at next site visit.",
        ]),
        status: "open",
        created_by: reviewer,
        created_at: updatedAt,
      });
    }
    submissions.push({
      ...base,
      created_at: startedOn < submittedDate ? startedAt : isoAt(addDays(submittedDate, -1), 10, 0),
      status: opts.status,
      revision: 1,
      lock_version: between(3, 12),
      submitted_by: submitter,
      submitted_at: submittedAt,
      updated_by: submitter,
      updated_at: updatedAt,
    });
    return id;
  };

  const lateAssignment = assignments.find((a) => a.initiative_id === late.id && a.org_id === maria.id)!;
  const acceptedAssignment = assignments.find((a) => a.initiative_id === accepted.id && a.org_id === maria.id)!;

  createSubmission({
    assignment: acceptedAssignment,
    period: "FY26-MY",
    status: "accepted",
    submittedBy: ids.james,
    submittedOn: "2026-01-21",
  });
  createSubmission({
    assignment: lateAssignment,
    period: "FY26-MY",
    status: "accepted",
    submittedBy: ids.maria,
    submittedOn: "2026-01-27",
  });
  createSubmission({
    assignment: acceptedAssignment,
    period: "FY26-YE",
    status: "accepted",
    submittedBy: ids.james,
    submittedOn: "2026-09-18",
  });
  if (options.lateDraft === "half") {
    const answers = fullAnswers(lateAssignment, "FY26-YE", "normal");
    createSubmission({
      assignment: lateAssignment,
      period: "FY26-YE",
      status: "draft",
      submittedBy: ids.maria,
      draftAnswers: answers,
      draftBudget: MARIA_DRAFT_BUDGET,
      editedOn: "2026-09-22",
    });
  }
  for (const next of assignments.filter(
    (a) => a.org_id === maria.id && assignmentSeed.get(a.id)!.fiscalYear === "FY27",
  )) {
    if (chance(0.5))
      createSubmission({
        assignment: next,
        period: "FY27-MY",
        status: "draft",
        submittedBy: ids.maria,
        draftKeys: ["org_legal_name", "org_ein", "contact_name", "contact_title", "contact_email", "contact_phone"],
      });
  }

  for (const assignment of assignments) {
    if (assignment.org_id === maria.id) continue;
    const fy = assignmentSeed.get(assignment.id)!.fiscalYear;
    if (fy === "FY27") {
      if (chance(0.08)) createSubmission({ assignment, period: "FY27-MY", status: "draft" });
      continue;
    }
    const mid = random();
    if (mid < 0.96)
      createSubmission({
        assignment,
        period: "FY26-MY",
        status: "accepted",
        quality: chance(0.03) ? "low" : "normal",
        submittedOn: chance(0.1) ? rampDate("2026-02-01", "2026-03-14", 0.55) : undefined,
      });
    else if (mid < 0.975) createSubmission({ assignment, period: "FY26-MY", status: "returned" });
    else if (mid < 0.985) createSubmission({ assignment, period: "FY26-MY", status: "draft" });

    const homeOrg = orgById.get(assignment.org_id)!;
    const risk =
      MISSING_RATE[assignment.funding_source] * (HIGH_RISK_DISTRICTS.has(homeOrg.district) ? HIGH_RISK_FACTOR : 1);
    if (chance(risk)) {
      if (chance(0.55)) createSubmission({ assignment, period: "FY26-YE", status: "draft", unbalanced: chance(0.5) });
      continue;
    }
    const year = random() * 0.84;
    const lateSubmitDate = chance(0.1) ? dateBetween("2026-10-01", TODAY) : undefined;
    if (year < 0.66)
      createSubmission({
        assignment,
        period: "FY26-YE",
        status: "accepted",
        quality: chance(0.03) ? "low" : "normal",
        submittedOn: lateSubmitDate && lateSubmitDate <= "2026-10-03" ? lateSubmitDate : undefined,
      });
    else if (year < 0.75)
      createSubmission({
        assignment,
        period: "FY26-YE",
        status: "submitted",
        quality: chance(0.08) ? "zero" : chance(0.12) ? "low" : "normal",
        submittedOn: dateBetween("2026-09-24", TODAY),
      });
    else if (year < 0.81)
      createSubmission({
        assignment,
        period: "FY26-YE",
        status: "under_review",
        submittedOn: dateBetween("2026-09-15", "2026-10-04"),
      });
    else
      createSubmission({
        assignment,
        period: "FY26-YE",
        status: "returned",
        submittedOn: dateBetween("2026-08-20", "2026-09-28"),
      });
  }

  auditRows.push({
    at: "2026-06-22T10:30:00-04:00",
    actor_id: ids.priya,
    entity: "fiscal_year",
    entity_id: "FY27",
    action: "rollover",
    note: "Rolled over from FY26",
    before: null,
    after: { from: "FY26", to: "FY27", created: fy27.length, retired: fy26.filter((p) => p.retired).length },
  });

  const unopened = new Set(submissions.filter((row) => row.period_id === "FY27-MY").map((row) => row.id));
  const keepOpened = <T extends { submission_id?: unknown }>(rows: T[]) =>
    rows.filter((row) => !unopened.has(row.submission_id));
  const openedSubmissions = submissions.filter((row) => !unopened.has(row.id));
  const openedAnswers = keepOpened(answerRows);
  const openedBudget = keepOpened(budgetRows);

  auditRows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  await insertRows(client, "submission", openedSubmissions, [
    "id",
    "reference_no",
    "assignment_id",
    "period_id",
    "form_version_id",
    "status",
    "revision",
    "lock_version",
    "started_by",
    "submitted_by",
    "submitted_at",
    "updated_by",
    "updated_at",
    "created_at",
  ]);
  await insertRows(client, "answer", openedAnswers, [
    "submission_id",
    "question_key",
    "value",
    "updated_by",
    "updated_at",
  ]);
  await insertRows(client, "budget_line", openedBudget, [
    "submission_id",
    "row_id",
    "position",
    "category",
    "description",
    "amount",
  ]);
  for (let i = 0; i < revisionRows.length; i += 500) {
    await client.query(
      `INSERT INTO submission_revision (submission_id, revision, kind, snapshot, sha256, actor, reason, created_at)
       SELECT submission_id, revision, kind, snapshot, encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), actor, reason, created_at
       FROM jsonb_populate_recordset(NULL::submission_revision, $1::jsonb)`,
      [JSON.stringify(revisionRows.slice(i, i + 500))],
    );
  }
  await insertRows(client, "audit_event", auditRows, [
    "at",
    "actor_id",
    "entity",
    "entity_id",
    "action",
    "note",
    "before",
    "after",
  ]);
  await insertRows(client, "outbox", outboxRows, [
    "to_email",
    "template",
    "subject",
    "body_text",
    "submission_id",
    "org_id",
    "status",
    "created_by",
    "created_at",
  ]);
  await insertRows(client, "flag", flagRows, [
    "submission_id",
    "kind",
    "source",
    "note",
    "status",
    "created_by",
    "created_at",
  ]);

  return {
    ids,
    orgs: orgs.length,
    initiatives: initiatives.length,
    assignments: assignments.length,
    submissions: openedSubmissions.length,
    council: councilRows.length,
  };
}

export async function runSeed(url: string, scene = "fresh"): Promise<string> {
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  await client.query("BEGIN");
  try {
    await reset(client, scene);
    const summary = await seed(client);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: summary.ids.priya }),
    ]);
    await client.query("SELECT app.ensure_scheduler()");
    await client.query("SELECT app.restore_reminder_defaults(id) FROM reporting_period");
    await client.query("SELECT app.backfill_reminder_history($1::date)", [todayInNewYork()]);
    await seedOperations(client);
    await client.query("SELECT set_config('request.jwt.claims', '', true)");
    await client.query("COMMIT");
    return `seeded ${summary.orgs} organizations, ${summary.initiatives} initiatives, ${summary.assignments} assignments, ${summary.submissions} submissions`;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.DB_OWNER_URL;
  if (!url) throw new Error("DB_OWNER_URL is not set");
  console.log(await runSeed(url, process.argv[2] ?? "fresh"));
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
