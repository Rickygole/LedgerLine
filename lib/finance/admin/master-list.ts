import type { Tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ORG_TYPES, REPORT_BOROUGHS, CITYWIDE } from "@/lib/domain";
import { boroughLabel, districtInBorough } from "@/lib/geo/boroughs";
import { digitsOnly } from "@/lib/rules/identity";
import { personNameProblem } from "@/lib/rules/person-name";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1_000_000;

export const MASTER_FIELDS = [
  "ein",
  "legal_name",
  "org_type",
  "borough",
  "council_district",
  "address_line",
  "postal_code",
  "contact_name",
  "contact_title",
  "contact_email",
  "contact_phone",
] as const;

export type MasterField = (typeof MASTER_FIELDS)[number];

export type MasterRow = Record<MasterField, string>;

export const FIELD_LABEL: Record<MasterField, string> = {
  ein: "EIN",
  legal_name: "Legal name",
  org_type: "Type",
  borough: "Borough",
  council_district: "Council district",
  address_line: "Address",
  postal_code: "ZIP code",
  contact_name: "Primary contact name",
  contact_title: "Primary contact title",
  contact_email: "Primary contact email",
  contact_phone: "Primary contact phone",
};

const ALIASES: Record<string, MasterField> = {
  ein: "ein",
  employer_identification_number: "ein",
  legal_name: "legal_name",
  name: "legal_name",
  organization: "legal_name",
  organization_name: "legal_name",
  org_type: "org_type",
  type: "org_type",
  organization_type: "org_type",
  borough: "borough",
  council_district: "council_district",
  district: "council_district",
  address: "address_line",
  address_line: "address_line",
  street_address: "address_line",
  postal_code: "postal_code",
  zip: "postal_code",
  zip_code: "postal_code",
  contact_name: "contact_name",
  primary_contact: "contact_name",
  primary_contact_name: "contact_name",
  contact_title: "contact_title",
  primary_contact_title: "contact_title",
  contact_email: "contact_email",
  primary_contact_email: "contact_email",
  contact_phone: "contact_phone",
  primary_contact_phone: "contact_phone",
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function formatEin(digits: string): string {
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function orgTypeOf(raw: string): "cbo" | "agency" | null {
  const text = raw.trim().toLowerCase();
  const hit = ORG_TYPES.find((t) => t.value === text || t.label.toLowerCase() === text);
  if (hit) return hit.value;
  if (["nonprofit", "non-profit", "community based organization", "cbo"].includes(text)) return "cbo";
  if (["city agency", "agency"].includes(text)) return "agency";
  return null;
}

export type CleanRow = {
  ein: string;
  legal_name: string;
  org_type: "cbo" | "agency";
  borough: string;
  council_district: number | null;
  address_line: string;
  postal_code: string;
  contact_name: string;
  contact_title: string;
  contact_email: string;
  contact_phone: string | null;
};

export function validateRow(raw: MasterRow): { row: CleanRow } | { problems: Partial<Record<MasterField, string>> } {
  const problems: Partial<Record<MasterField, string>> = {};
  const einDigits = digitsOnly(raw.ein);
  if (!raw.ein.trim()) problems.ein = "Enter the EIN.";
  else if (einDigits.length !== 9 || /[^\d\s-]/.test(raw.ein))
    problems.ein = "The EIN must be 9 digits, like 12-3456789.";

  const legalName = raw.legal_name.trim().replace(/\s+/g, " ");
  if (!legalName) problems.legal_name = "Enter the legal name.";
  else if (legalName.length > 160) problems.legal_name = "Use 160 characters or fewer for the legal name.";

  const orgType = orgTypeOf(raw.org_type);
  if (!raw.org_type.trim()) problems.org_type = "Choose the organization type.";
  else if (!orgType) problems.org_type = "The type must be Nonprofit or City agency.";

  const borough = REPORT_BOROUGHS.find((b) => b.toLowerCase() === raw.borough.trim().toLowerCase());
  if (!raw.borough.trim()) problems.borough = "Choose the borough.";
  else if (!borough) problems.borough = `The borough must be one of ${REPORT_BOROUGHS.join(", ")}.`;

  let district: number | null = null;
  const districtText = raw.council_district.trim();
  if (districtText === "") {
    if (borough && borough !== CITYWIDE) problems.council_district = "Enter the Council district, from 1 to 51.";
  } else if (!/^\d{1,2}$/.test(districtText) || Number(districtText) < 1 || Number(districtText) > 51) {
    problems.council_district = "The Council district must be a number from 1 to 51.";
  } else {
    district = Number(districtText);
    if (borough && borough !== CITYWIDE && !districtInBorough(district, borough))
      problems.council_district = `District ${district} is in ${boroughLabel(district)}, not ${borough}.`;
  }

  const address = raw.address_line.trim().replace(/\s+/g, " ");
  if (!address) problems.address_line = "Enter the street address.";
  else if (address.length > 200) problems.address_line = "Use 200 characters or fewer for the address.";

  const zip = raw.postal_code.trim();
  if (!zip) problems.postal_code = "Enter the ZIP code.";
  else if (!/^\d{5}(-\d{4})?$/.test(zip)) problems.postal_code = "The ZIP code must be 5 digits, like 10027.";

  const contactName = raw.contact_name.trim().replace(/\s+/g, " ");
  if (!contactName) problems.contact_name = "Enter the primary contact's name.";
  else {
    const nameProblem = personNameProblem(contactName, "primary contact name");
    if (nameProblem) problems.contact_name = nameProblem;
    else if (contactName.length > 120) problems.contact_name = "Use 120 characters or fewer for the contact name.";
  }

  const contactTitle = raw.contact_title.trim().replace(/\s+/g, " ");
  if (!contactTitle) problems.contact_title = "Enter the primary contact's title.";
  else if (contactTitle.length > 120) problems.contact_title = "Use 120 characters or fewer for the contact title.";

  const email = raw.contact_email.trim().toLowerCase();
  if (!email) problems.contact_email = "Enter the primary contact's email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    problems.contact_email = "The contact email must be an email address, like name@example.org.";

  let phone: string | null = null;
  if (raw.contact_phone.trim()) {
    const digits = digitsOnly(raw.contact_phone);
    if (digits.length !== 10) problems.contact_phone = "The contact phone must be a 10-digit phone number.";
    else phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (Object.keys(problems).length > 0) return { problems };
  return {
    row: {
      ein: formatEin(einDigits),
      legal_name: legalName,
      org_type: orgType!,
      borough: borough!,
      council_district: district,
      address_line: address,
      postal_code: zip,
      contact_name: contactName,
      contact_title: contactTitle,
      contact_email: email,
      contact_phone: phone,
    },
  };
}

export type RowStatus = "new" | "updated" | "unchanged" | "rejected";

export type PreviewRow = {
  line: number;
  ein: string;
  legal_name: string;
  status: RowStatus;
  reasons: string[];
  changes: string[];
  clean: CleanRow | null;
};

export type Preview = {
  rows: PreviewRow[];
  counts: Record<RowStatus, number>;
};

export type ParsedImport = { ok: true; rows: { line: number; raw: MasterRow }[] } | { ok: false; error: string };

export function parseImport(text: string): ParsedImport {
  if (text.length > MAX_IMPORT_BYTES)
    return { ok: false, error: "That file is larger than 1 MB. Split it and try again." };
  const table = parseCsv(text);
  if (table.length === 0)
    return { ok: false, error: "The file is empty. Add a header row and at least one organization." };
  const header = table[0].map((name) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
  );
  const index = new Map<MasterField, number>();
  header.forEach((name, position) => {
    const field = ALIASES[name];
    if (field && !index.has(field)) index.set(field, position);
  });
  const missing = MASTER_FIELDS.filter((field) => field !== "contact_phone" && !index.has(field));
  if (missing.length > 0)
    return {
      ok: false,
      error: `The header row is missing ${missing.map((field) => FIELD_LABEL[field]).join(", ")}. Expected columns: ${MASTER_FIELDS.join(", ")}.`,
    };
  if (table.length === 1) return { ok: false, error: "The file has a header row but no organizations." };
  if (table.length - 1 > MAX_IMPORT_ROWS)
    return { ok: false, error: `The file has more than ${MAX_IMPORT_ROWS} organizations. Split it and try again.` };
  const rows = table.slice(1).map((cells, i) => {
    const raw = Object.fromEntries(
      MASTER_FIELDS.map((field) => [field, (index.has(field) ? (cells[index.get(field)!] ?? "") : "").toString()]),
    ) as MasterRow;
    return { line: i + 2, raw };
  });
  return { ok: true, rows };
}

type Existing = {
  id: string;
  ein: string;
  legal_name: string;
  org_type: string;
  borough: string;
  council_district: number | null;
  address_line: string;
  postal_code: string;
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

const LOAD_EXISTING = `SELECT o.id, o.ein, o.legal_name, o.org_type, o.borough, o.council_district, o.address_line, o.postal_code,
       c.full_name AS contact_name, c.title AS contact_title, c.email AS contact_email, c.phone AS contact_phone
FROM organization o
LEFT JOIN LATERAL (SELECT * FROM contact WHERE org_id = o.id ORDER BY is_primary DESC, full_name LIMIT 1) c ON true`;

function changedFields(existing: Existing, clean: CleanRow): MasterField[] {
  const out: MasterField[] = [];
  if (existing.legal_name !== clean.legal_name) out.push("legal_name");
  if (existing.org_type !== clean.org_type) out.push("org_type");
  if (existing.borough !== clean.borough) out.push("borough");
  if ((existing.council_district ?? null) !== clean.council_district) out.push("council_district");
  if (existing.address_line !== clean.address_line) out.push("address_line");
  if (existing.postal_code !== clean.postal_code) out.push("postal_code");
  if ((existing.contact_name ?? "") !== clean.contact_name) out.push("contact_name");
  if ((existing.contact_title ?? "") !== clean.contact_title) out.push("contact_title");
  if ((existing.contact_email ?? "").toLowerCase() !== clean.contact_email) out.push("contact_email");
  if (clean.contact_phone !== null && (existing.contact_phone ?? "") !== clean.contact_phone) out.push("contact_phone");
  return out;
}

export async function previewRows(tx: Tx, rows: { line: number; raw: MasterRow }[]): Promise<Preview> {
  const existing = new Map((await tx.query<Existing>(LOAD_EXISTING)).map((row) => [row.ein, row]));
  const seen = new Map<string, number>();
  const result: PreviewRow[] = rows.map(({ line, raw }) => {
    const checked = validateRow(raw);
    if ("problems" in checked) {
      return {
        line,
        ein: raw.ein.trim(),
        legal_name: raw.legal_name.trim(),
        status: "rejected" as const,
        reasons: Object.values(checked.problems),
        changes: [],
        clean: null,
      };
    }
    const clean = checked.row;
    const first = seen.get(clean.ein);
    if (first !== undefined) {
      return {
        line,
        ein: clean.ein,
        legal_name: clean.legal_name,
        status: "rejected" as const,
        reasons: [`The EIN ${clean.ein} already appears on row ${first} of this file.`],
        changes: [],
        clean: null,
      };
    }
    seen.set(clean.ein, line);
    const current = existing.get(clean.ein);
    if (!current)
      return {
        line,
        ein: clean.ein,
        legal_name: clean.legal_name,
        status: "new" as const,
        reasons: [],
        changes: [],
        clean,
      };
    const changes = changedFields(current, clean);
    return {
      line,
      ein: clean.ein,
      legal_name: clean.legal_name,
      status: changes.length > 0 ? ("updated" as const) : ("unchanged" as const),
      reasons: [],
      changes: changes.map((field) => FIELD_LABEL[field]),
      clean,
    };
  });
  const counts: Record<RowStatus, number> = { new: 0, updated: 0, unchanged: 0, rejected: 0 };
  for (const row of result) counts[row.status] += 1;
  return { rows: result, counts };
}

async function writePrimaryContact(tx: Tx, orgId: string, clean: CleanRow) {
  const primary = await tx.one<{ id: string }>(
    "SELECT id FROM contact WHERE org_id = $1 AND is_primary ORDER BY full_name LIMIT 1",
    [orgId],
  );
  if (primary) {
    await tx.query(
      "UPDATE contact SET full_name = $2, title = $3, email = $4, phone = coalesce($5, phone) WHERE id = $1",
      [primary.id, clean.contact_name, clean.contact_title, clean.contact_email, clean.contact_phone],
    );
    return;
  }
  await tx.query(
    "INSERT INTO contact (org_id, full_name, title, email, phone, is_primary) VALUES ($1, $2, $3, $4, $5, true)",
    [orgId, clean.contact_name, clean.contact_title, clean.contact_email, clean.contact_phone],
  );
}

export async function insertOrganization(tx: Tx, clean: CleanRow): Promise<string> {
  const created = await tx.one<{ id: string }>(
    `INSERT INTO organization (ein, legal_name, org_type, borough, council_district, address_line, postal_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      clean.ein,
      clean.legal_name,
      clean.org_type,
      clean.borough,
      clean.council_district,
      clean.address_line,
      clean.postal_code,
    ],
  );
  await writePrimaryContact(tx, created!.id, clean);
  return created!.id;
}

async function updateOrganization(tx: Tx, orgId: string, clean: CleanRow) {
  await tx.query(
    `UPDATE organization SET legal_name = $2, org_type = $3, borough = $4, council_district = $5, address_line = $6, postal_code = $7
     WHERE id = $1`,
    [
      orgId,
      clean.legal_name,
      clean.org_type,
      clean.borough,
      clean.council_district,
      clean.address_line,
      clean.postal_code,
    ],
  );
  await writePrimaryContact(tx, orgId, clean);
}

export async function addOrganization(tx: Tx, clean: CleanRow): Promise<{ id: string } | { duplicate: string }> {
  const taken = await tx.one<{ id: string; legal_name: string }>(
    "SELECT id, legal_name FROM organization WHERE ein = $1",
    [clean.ein],
  );
  if (taken) return { duplicate: taken.legal_name };
  const id = await insertOrganization(tx, clean);
  await writeAudit(tx, {
    entity: "organization",
    entityId: id,
    action: "org_add",
    note: clean.legal_name,
    after: {
      ein: clean.ein,
      legal_name: clean.legal_name,
      borough: clean.borough,
      council_district: clean.council_district,
    },
  });
  return { id };
}

export async function applyImport(
  tx: Tx,
  preview: Preview,
  fileName: string,
): Promise<{ added: number; updated: number; unchanged: number; rejected: number }> {
  const existing = new Map((await tx.query<Existing>(LOAD_EXISTING)).map((row) => [row.ein, row]));
  let added = 0;
  let updated = 0;
  for (const row of preview.rows) {
    if (!row.clean) continue;
    if (row.status === "new") {
      const id = await insertOrganization(tx, row.clean);
      await writeAudit(tx, {
        entity: "organization",
        entityId: id,
        action: "org_add",
        note: `${row.clean.legal_name}, imported from ${fileName}`,
        after: { ein: row.clean.ein, legal_name: row.clean.legal_name, borough: row.clean.borough },
      });
      added += 1;
    } else if (row.status === "updated") {
      const current = existing.get(row.clean.ein)!;
      await updateOrganization(tx, current.id, row.clean);
      await writeAudit(tx, {
        entity: "organization",
        entityId: current.id,
        action: "org_update",
        note: `${row.clean.legal_name}, imported from ${fileName}`,
        before: {
          legal_name: current.legal_name,
          org_type: current.org_type,
          borough: current.borough,
          council_district: current.council_district,
          address_line: current.address_line,
          postal_code: current.postal_code,
          contact_name: current.contact_name,
          contact_email: current.contact_email,
        },
        after: {
          legal_name: row.clean.legal_name,
          org_type: row.clean.org_type,
          borough: row.clean.borough,
          council_district: row.clean.council_district,
          address_line: row.clean.address_line,
          postal_code: row.clean.postal_code,
          contact_name: row.clean.contact_name,
          contact_email: row.clean.contact_email,
          changed: row.changes,
        },
      });
      updated += 1;
    }
  }
  const result = { added, updated, unchanged: preview.counts.unchanged, rejected: preview.counts.rejected };
  await writeAudit(tx, {
    entity: "master_list",
    entityId: "import",
    action: "master_list_import",
    note: `${fileName}: ${added} added, ${updated} updated, ${result.unchanged} unchanged, ${result.rejected} rejected`,
    after: result,
  });
  return result;
}
