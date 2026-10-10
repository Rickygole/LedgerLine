ALTER TABLE question
  ADD COLUMN max_rows int CHECK (max_rows IS NULL OR max_rows BETWEEN 1 AND 50),
  ADD COLUMN sum_rule jsonb,
  ADD COLUMN template_section text CHECK (template_section IN ('organization', 'performance', 'narrative')),
  ADD COLUMN position int NOT NULL DEFAULT 0,
  ADD COLUMN retired_at timestamptz,
  ADD COLUMN retired_by uuid REFERENCES app_user(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by uuid REFERENCES app_user(id);

ALTER TABLE question
  ADD CONSTRAINT question_label_present CHECK (btrim(label) <> ''),
  ADD CONSTRAINT question_select_options CHECK (field_type <> 'select' OR (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2)),
  ADD CONSTRAINT question_table_columns CHECK (field_type <> 'table' OR (jsonb_typeof(table_columns) = 'array' AND jsonb_array_length(table_columns) BETWEEN 1 AND 8));

CREATE POLICY question_admin_update ON question FOR UPDATE TO app_server
  USING (app.is_admin()) WITH CHECK (app.is_admin());

GRANT UPDATE (label, help, field_type, required, options, max_length, max_words, visible_when, table_columns, max_rows, sum_rule, template_section, position, retired_at, retired_by, updated_at, updated_by)
  ON question TO app_server;
