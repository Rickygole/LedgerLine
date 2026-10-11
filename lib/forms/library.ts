import type { Tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { questionProblems, validateDefinition } from "@/lib/forms/editor/definition";
import type { LibraryEntry, TemplateSection } from "@/lib/forms/standard";
import type { ColumnSumRule, FormDefinition, Question, TableColumn } from "@/lib/rules/types";

export const PROTECTED_KEYS = ["org_legal_name", "org_ein"] as const;

export type LibraryItem = LibraryEntry & {
  retiredAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  formsUsing: number;
  usageByYear: Record<string, number>;
};

type LibraryRow = {
  question_key: string;
  label: string;
  help: string | null;
  field_type: Question["type"];
  required: boolean;
  options: string[] | null;
  max_length: number | null;
  max_words: number | null;
  visible_when: { key: string; equals: string } | null;
  table_columns: TableColumn[] | null;
  max_rows: number | null;
  sum_rule: ColumnSumRule | null;
  template_section: TemplateSection | null;
  position: number;
  retired_at: string | null;
  updated_at: string;
  updated_by_name: string | null;
  forms_using: number;
  usage_by_year: Record<string, number> | null;
};

const SELECT = `SELECT q.question_key, q.label, q.help, q.field_type, q.required, q.options, q.max_length, q.max_words,
       q.visible_when, q.table_columns, q.max_rows, q.sum_rule, q.template_section, q.position,
       q.retired_at::text, q.updated_at::text, u.full_name AS updated_by_name,
       (SELECT count(DISTINCT f.initiative_id)::int FROM form_version f
         WHERE f.status IN ('published', 'draft')
           AND jsonb_path_exists(f.definition, '$.sections[*].questions[*] ? (@.key == $k)', jsonb_build_object('k', q.question_key))) AS forms_using,
       (SELECT jsonb_object_agg(y.fy, y.n) FROM (
          SELECT i.fiscal_year_id AS fy, count(DISTINCT f.initiative_id)::int AS n
          FROM form_version f JOIN initiative i ON i.id = f.initiative_id
          WHERE f.status IN ('published', 'draft')
            AND jsonb_path_exists(f.definition, '$.sections[*].questions[*] ? (@.key == $k)', jsonb_build_object('k', q.question_key))
          GROUP BY i.fiscal_year_id) y) AS usage_by_year
FROM question q LEFT JOIN app_user u ON u.id = q.updated_by
WHERE q.scope = 'standard'`;

export function rowToQuestion(row: LibraryRow): Question {
  const question: Question = {
    key: row.question_key,
    label: row.label,
    type: row.field_type,
    required: row.required,
    scope: "standard",
  };
  if (row.help) question.help = row.help;
  if (row.options) question.options = row.options;
  if (row.max_length !== null) question.maxLength = row.max_length;
  if (row.max_words !== null) question.maxWords = row.max_words;
  if (row.visible_when) question.visibleWhen = row.visible_when;
  if (row.table_columns) question.columns = row.table_columns;
  if (row.max_rows !== null) question.maxRows = row.max_rows;
  if (row.sum_rule) question.sumRule = row.sum_rule;
  return question;
}

function rowToItem(row: LibraryRow): LibraryItem {
  return {
    question: rowToQuestion(row),
    templateSection: row.template_section,
    position: row.position,
    retiredAt: row.retired_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name,
    formsUsing: row.forms_using,
    usageByYear: row.usage_by_year ?? {},
  };
}

export async function currentFiscalYear(tx: Tx, today: string): Promise<string | null> {
  const row =
    (await tx.one<{ id: string }>("SELECT id FROM fiscal_year WHERE $1::date BETWEEN starts_on AND ends_on", [today])) ??
    (await tx.one<{ id: string }>("SELECT id FROM fiscal_year ORDER BY starts_on DESC LIMIT 1"));
  return row?.id ?? null;
}

export function usageParts(
  usageByYear: Record<string, number>,
  current: string | null,
): { current: { year: string; count: number } | null; prior: { year: string; count: number }[] } {
  const prior = Object.entries(usageByYear)
    .filter(([year]) => year !== current)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year.localeCompare(a.year));
  return { current: current ? { year: current, count: usageByYear[current] ?? 0 } : null, prior };
}

export async function loadLibrary(tx: Tx, options: { includeRetired?: boolean } = {}): Promise<LibraryItem[]> {
  const rows = await tx.query<LibraryRow>(
    `${SELECT}${options.includeRetired ? "" : " AND q.retired_at IS NULL"} ORDER BY q.position, q.label`,
  );
  return rows.map(rowToItem);
}

export async function loadLibraryQuestion(tx: Tx, key: string): Promise<LibraryItem | null> {
  const row = await tx.one<LibraryRow>(`${SELECT} AND q.question_key = $1`, [key]);
  return row ? rowToItem(row) : null;
}

export type LibraryInput = {
  question: Question;
  templateSection: TemplateSection | null;
};

export function libraryProblems(input: LibraryInput, existing: LibraryItem | null): string[] {
  const { question } = input;
  const errors: string[] = [];
  if (!question.label.trim()) errors.push("Enter the question label.");
  if (!/^[a-z][a-z0-9_]{1,59}$/.test(question.key))
    errors.push("The key must start with a letter and use only lowercase letters, numbers and underscores.");
  errors.push(...questionProblems(question));
  if (
    existing &&
    (PROTECTED_KEYS as readonly string[]).includes(question.key) &&
    existing.question.type !== question.type
  )
    errors.push("The answer type of the organization name and EIN questions cannot change.");
  return errors;
}

function columnsFor(question: Question) {
  return question.type === "table" ? JSON.stringify(question.columns ?? []) : null;
}

export async function createLibraryQuestion(tx: Tx, input: LibraryInput): Promise<{ ok: true } | { errors: string[] }> {
  const { question } = input;
  const errors = libraryProblems(input, null);
  if (errors.length > 0) return { errors };
  const taken = await tx.one("SELECT 1 FROM question WHERE question_key = $1", [question.key]);
  if (taken) return { errors: [`A library question with the key "${question.key}" already exists.`] };
  const next = await tx.one<{ next: number }>("SELECT coalesce(max(position), 0) + 1 AS next FROM question");
  await tx.query(
    `INSERT INTO question (question_key, scope, label, help, field_type, required, options, max_length, max_words,
                          visible_when, table_columns, max_rows, sum_rule, template_section, position, updated_by)
     VALUES ($1, 'standard', $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13, $14, app.uid())`,
    [
      question.key,
      question.label.trim(),
      question.help?.trim() || null,
      question.type,
      question.required,
      question.type === "select" ? JSON.stringify((question.options ?? []).map((o) => o.trim())) : null,
      question.type === "text" ? (question.maxLength ?? null) : null,
      question.type === "textarea" ? (question.maxWords ?? null) : null,
      question.visibleWhen ? JSON.stringify(question.visibleWhen) : null,
      columnsFor(question),
      question.type === "table" ? (question.maxRows ?? null) : null,
      question.type === "table" && question.sumRule ? JSON.stringify(question.sumRule) : null,
      input.templateSection,
      next?.next ?? 1,
    ],
  );
  await writeAudit(tx, {
    entity: "question",
    entityId: question.key,
    action: "library_add",
    note: question.label.trim(),
    after: { type: question.type, required: question.required, template_section: input.templateSection },
  });
  return { ok: true };
}

function snapshot(item: LibraryItem) {
  const q = item.question;
  return {
    label: q.label,
    help: q.help ?? null,
    type: q.type,
    required: q.required,
    options: q.options ?? null,
    max_length: q.maxLength ?? null,
    max_words: q.maxWords ?? null,
    columns: q.columns ?? null,
    max_rows: q.maxRows ?? null,
    sum_rule: q.sumRule ?? null,
    template_section: item.templateSection,
  };
}

export async function updateLibraryQuestion(tx: Tx, input: LibraryInput): Promise<{ ok: true } | { errors: string[] }> {
  const { question } = input;
  const existing = await loadLibraryQuestion(tx, question.key);
  if (!existing) return { errors: ["That library question was not found."] };
  if (existing.retiredAt) return { errors: ["A retired question cannot be edited. Restore it first."] };
  const errors = libraryProblems(input, existing);
  if (errors.length > 0) return { errors };
  const updated = await tx.query(
    `UPDATE question SET label = $2, help = $3, field_type = $4, required = $5, options = $6::jsonb, max_length = $7,
            max_words = $8, visible_when = $9::jsonb, table_columns = $10::jsonb, max_rows = $11, sum_rule = $12::jsonb,
            template_section = $13, updated_at = now(), updated_by = app.uid()
     WHERE question_key = $1 AND scope = 'standard' AND retired_at IS NULL RETURNING question_key`,
    [
      question.key,
      question.label.trim(),
      question.help?.trim() || null,
      question.type,
      question.required,
      question.type === "select" ? JSON.stringify((question.options ?? []).map((o) => o.trim())) : null,
      question.type === "text" ? (question.maxLength ?? null) : null,
      question.type === "textarea" ? (question.maxWords ?? null) : null,
      question.visibleWhen ? JSON.stringify(question.visibleWhen) : null,
      columnsFor(question),
      question.type === "table" ? (question.maxRows ?? null) : null,
      question.type === "table" && question.sumRule ? JSON.stringify(question.sumRule) : null,
      input.templateSection,
    ],
  );
  if (updated.length === 0) return { errors: ["That library question could not be changed."] };
  const after = await loadLibraryQuestion(tx, question.key);
  await writeAudit(tx, {
    entity: "question",
    entityId: question.key,
    action: "library_edit",
    note: question.label.trim(),
    before: snapshot(existing),
    after: after ? snapshot(after) : null,
  });
  return { ok: true };
}

export async function setLibraryRetired(
  tx: Tx,
  key: string,
  retired: boolean,
  reason: string,
): Promise<{ ok: true } | { errors: string[] }> {
  const existing = await loadLibraryQuestion(tx, key);
  if (!existing) return { errors: ["That library question was not found."] };
  if (retired && (PROTECTED_KEYS as readonly string[]).includes(key))
    return { errors: ["The organization name and EIN questions identify the reporter and cannot be retired."] };
  if (retired && existing.retiredAt) return { errors: ["That question is already retired."] };
  if (!retired && !existing.retiredAt) return { errors: ["That question is not retired."] };
  const why = reason.trim();
  if (retired && !why) return { errors: ["Say why the question is being retired."] };
  await tx.query(
    `UPDATE question SET retired_at = ${retired ? "now()" : "NULL"}, retired_by = ${retired ? "app.uid()" : "NULL"},
            updated_at = now(), updated_by = app.uid() WHERE question_key = $1 AND scope = 'standard'`,
    [key],
  );
  await writeAudit(tx, {
    entity: "question",
    entityId: key,
    action: retired ? "library_retire" : "library_restore",
    note: retired ? why : existing.question.label,
  });
  return { ok: true };
}

export type ApplyOutcome = {
  initiativeId: string;
  name: string;
  result: "created" | "updated" | "added" | "unchanged" | "missing" | "no_form" | "invalid";
  version: number | null;
  detail?: string;
};

type FormRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "superseded";
  definition: FormDefinition;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => x.localeCompare(y));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameQuestion(a: Question, b: Question): boolean {
  return stable(a) === stable(b);
}

function applyQuestion(
  definition: FormDefinition,
  question: Question,
  addSection: TemplateSection | null,
  addIfMissing: boolean,
): { definition: FormDefinition; change: "replaced" | "added" | "none" | "missing" } {
  const next = JSON.parse(JSON.stringify(definition)) as FormDefinition;
  const all = next.sections.flatMap((section) => section.questions);
  const at = all.find((candidate) => candidate.key === question.key);
  const fresh = JSON.parse(JSON.stringify(question)) as Question;
  if (at) {
    if (sameQuestion(at, fresh)) return { definition: next, change: "none" };
    for (const section of next.sections)
      section.questions = section.questions.map((candidate) => (candidate.key === question.key ? fresh : candidate));
    return { definition: next, change: "replaced" };
  }
  if (!addIfMissing) return { definition: next, change: "missing" };
  const target = next.sections.find(
    (section) => section.key === (addSection ?? "performance") && section.kind === "questions",
  );
  const fallback = next.sections.find((section) => section.kind === "questions");
  const section = target ?? fallback;
  if (!section) return { definition: next, change: "missing" };
  section.questions.push(fresh);
  return { definition: next, change: "added" };
}

export async function applyToForms(
  tx: Tx,
  key: string,
  initiativeIds: string[],
  options: { addIfMissing: boolean },
): Promise<{ errors: string[] } | { outcomes: ApplyOutcome[] }> {
  const item = await loadLibraryQuestion(tx, key);
  if (!item) return { errors: ["That library question was not found."] };
  if (item.retiredAt) return { errors: ["A retired question cannot be applied to forms."] };
  if (initiativeIds.length === 0) return { errors: ["Choose at least one initiative."] };
  const outcomes: ApplyOutcome[] = [];
  for (const initiativeId of initiativeIds) {
    const initiative = await tx.one<{ id: string; name: string }>("SELECT id, name FROM initiative WHERE id = $1", [
      initiativeId,
    ]);
    if (!initiative) continue;
    const base = { initiativeId, name: initiative.name };
    const draft = await tx.one<FormRow>(
      "SELECT id, version, status, definition FROM form_version WHERE initiative_id = $1 AND status = 'draft' FOR UPDATE",
      [initiativeId],
    );
    const source =
      draft ??
      (await tx.one<FormRow>(
        `SELECT id, version, status, definition FROM form_version
         WHERE initiative_id = $1 AND status IN ('published', 'superseded')
         ORDER BY (status = 'published') DESC, version DESC LIMIT 1`,
        [initiativeId],
      ));
    if (!source) {
      outcomes.push({ ...base, result: "no_form", version: null });
      continue;
    }
    const applied = applyQuestion(source.definition, item.question, item.templateSection, options.addIfMissing);
    if (applied.change === "missing") {
      outcomes.push({ ...base, result: "missing", version: null });
      continue;
    }
    if (applied.change === "none") {
      outcomes.push({ ...base, result: "unchanged", version: source.version });
      continue;
    }
    const problems = validateDefinition(applied.definition);
    if (problems.length > 0) {
      outcomes.push({ ...base, result: "invalid", version: null, detail: problems[0] });
      continue;
    }
    const verb = applied.change === "added" ? "Added" : "Updated";
    if (draft) {
      await tx.query("UPDATE form_version SET definition = $2::jsonb WHERE id = $1 AND status = 'draft'", [
        draft.id,
        JSON.stringify(applied.definition),
      ]);
      await writeAudit(tx, {
        entity: "form_version",
        entityId: draft.id,
        action: "library_applied",
        note: `${verb} the library question "${item.question.label}" in the open draft`,
        after: { question_key: key, initiative_id: initiativeId, version: draft.version },
      });
      outcomes.push({ ...base, result: applied.change === "added" ? "added" : "updated", version: draft.version });
      continue;
    }
    const next = await tx.one<{ next: number }>(
      "SELECT coalesce(max(version), 0) + 1 AS next FROM form_version WHERE initiative_id = $1",
      [initiativeId],
    );
    const created = await tx.one<{ id: string }>(
      `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by)
       VALUES ($1, $2, 'draft', $3::jsonb, 'manual', app.uid()) RETURNING id`,
      [initiativeId, next!.next, JSON.stringify(applied.definition)],
    );
    await writeAudit(tx, {
      entity: "form_version",
      entityId: created!.id,
      action: "library_applied",
      note: `Created a draft from version ${source.version}. ${verb} the library question "${item.question.label}"`,
      after: { question_key: key, initiative_id: initiativeId, version: next!.next, copied_from: source.version },
    });
    outcomes.push({ ...base, result: "created", version: next!.next });
  }
  const count = (result: ApplyOutcome["result"]) => outcomes.filter((o) => o.result === result).length;
  await writeAudit(tx, {
    entity: "question",
    entityId: key,
    action: "library_apply",
    note: `${outcomes.length} initiatives selected`,
    after: {
      drafts_created: count("created"),
      drafts_updated: count("updated") + count("added"),
      unchanged: count("unchanged"),
      not_on_form: count("missing"),
      no_form: count("no_form"),
      invalid: count("invalid"),
    },
  });
  return { outcomes };
}
