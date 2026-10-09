CREATE TABLE submission_revision (
  id bigserial PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submission(id),
  revision int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('submit', 'correction')),
  snapshot jsonb NOT NULL,
  sha256 text NOT NULL,
  actor uuid NOT NULL REFERENCES app_user(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, revision, kind)
);

CREATE TABLE audit_event (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES app_user(id),
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  note text,
  before jsonb,
  after jsonb,
  ai_action_id uuid REFERENCES ai_action(id)
);
CREATE INDEX audit_event_entity_idx ON audit_event(entity, entity_id);

CREATE TABLE demo_reset (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  scene text NOT NULL,
  operator text NOT NULL DEFAULT current_user
);

CREATE OR REPLACE FUNCTION app.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER submission_revision_append_only
  BEFORE UPDATE OR DELETE ON submission_revision
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER submission_revision_no_truncate
  BEFORE TRUNCATE ON submission_revision
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE OR REPLACE FUNCTION app.freeze_published_form() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.definition IS DISTINCT FROM OLD.definition THEN
    RAISE EXCEPTION 'form_version % is published and immutable', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER form_version_immutable
  BEFORE UPDATE ON form_version
  FOR EACH ROW EXECUTE FUNCTION app.freeze_published_form();
