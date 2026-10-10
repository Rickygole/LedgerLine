CREATE TABLE readiness_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('test', 'training')),
  scheduled_on date NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  audience text NOT NULL CHECK (btrim(audience) <> '' AND char_length(audience) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX readiness_schedule_on_idx ON readiness_schedule(scheduled_on, kind);

ALTER TABLE readiness_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY readiness_schedule_read ON readiness_schedule FOR SELECT TO app_server USING (app.is_admin());
GRANT SELECT ON readiness_schedule TO app_server;
