import type { Client } from "pg";
import { standardEntries } from "../lib/forms/standard";

export async function seedQuestionLibrary(client: Client): Promise<number> {
  const entries = standardEntries();
  for (const { question, templateSection, position } of entries) {
    await client.query(
      `INSERT INTO question (question_key, scope, label, help, field_type, required, options, max_length, max_words,
                             visible_when, table_columns, max_rows, sum_rule, template_section, position)
       VALUES ($1, 'standard', $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13, $14)`,
      [
        question.key,
        question.label,
        question.help ?? null,
        question.type,
        question.required,
        question.options ? JSON.stringify(question.options) : null,
        question.maxLength ?? null,
        question.maxWords ?? null,
        question.visibleWhen ? JSON.stringify(question.visibleWhen) : null,
        question.columns ? JSON.stringify(question.columns) : null,
        question.maxRows ?? null,
        question.sumRule ? JSON.stringify(question.sumRule) : null,
        templateSection,
        position,
      ],
    );
  }
  return entries.length;
}
