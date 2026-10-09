CREATE TABLE question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key text NOT NULL UNIQUE CHECK (question_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  scope text NOT NULL CHECK (scope IN ('standard', 'initiative')),
  label text NOT NULL,
  help text,
  field_type text NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'integer', 'currency', 'percent', 'date', 'email', 'phone', 'ein', 'select', 'yesno', 'table')),
  required boolean NOT NULL DEFAULT false,
  options jsonb,
  max_length int,
  max_words int,
  visible_when jsonb,
  table_columns jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE form_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES initiative(id),
  version int NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'superseded')),
  definition jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_draft', 'rule_draft', 'seed')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES app_user(id),
  published_at timestamptz,
  UNIQUE (initiative_id, version)
);
CREATE UNIQUE INDEX form_version_one_published ON form_version(initiative_id) WHERE status = 'published';

CREATE TABLE submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no text NOT NULL UNIQUE,
  assignment_id uuid NOT NULL REFERENCES assignment(id),
  period_id text NOT NULL REFERENCES reporting_period(id),
  form_version_id uuid NOT NULL REFERENCES form_version(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'returned', 'accepted')),
  revision int NOT NULL DEFAULT 0,
  lock_version int NOT NULL DEFAULT 0,
  started_by uuid REFERENCES app_user(id),
  submitted_by uuid REFERENCES app_user(id),
  submitted_at timestamptz,
  updated_by uuid REFERENCES app_user(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, period_id),
  CHECK ((status = 'draft' AND revision = 0) OR submitted_at IS NOT NULL)
);
CREATE INDEX submission_period_idx ON submission(period_id);

CREATE TABLE answer (
  submission_id uuid NOT NULL REFERENCES submission(id),
  question_key text NOT NULL,
  value jsonb,
  updated_by uuid REFERENCES app_user(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, question_key)
);

CREATE TABLE budget_line (
  submission_id uuid NOT NULL REFERENCES submission(id),
  row_id uuid NOT NULL,
  position int NOT NULL,
  category text NOT NULL CHECK (category IN ('PS', 'OTPS')),
  description text NOT NULL DEFAULT '',
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (submission_id, row_id)
);

CREATE TABLE attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submission(id),
  path text NOT NULL UNIQUE,
  filename text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes > 0 AND bytes <= 26214400),
  mime text NOT NULL,
  uploaded_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE flag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submission(id),
  kind text NOT NULL CHECK (kind IN ('unbalanced', 'incomplete', 'validation', 'spend_spike', 'zero_outcomes', 'manual')),
  source text NOT NULL CHECK (source IN ('rule', 'user')),
  note text,
  detail jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES app_user(id),
  resolved_at timestamptz
);
CREATE INDEX flag_submission_idx ON flag(submission_id);

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  template text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  submission_id uuid REFERENCES submission(id),
  org_id uuid REFERENCES organization(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL CHECK (feature IN ('form_draft', 'return_note')),
  mode text NOT NULL CHECK (mode IN ('live', 'replay', 'fallback')),
  model text,
  prompt_version text NOT NULL,
  input_sha256 text NOT NULL,
  output jsonb NOT NULL,
  validation jsonb NOT NULL,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10, 5),
  latency_ms int,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'edited', 'rejected')),
  approver uuid REFERENCES app_user(id),
  decided_at timestamptz,
  edit_diff jsonb,
  submission_id uuid REFERENCES submission(id),
  initiative_id uuid REFERENCES initiative(id),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
