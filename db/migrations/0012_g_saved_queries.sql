CREATE TABLE saved_query (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL REFERENCES app_user(id),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  params jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, name)
);
CREATE INDEX saved_query_owner_idx ON saved_query(owner);

ALTER TABLE saved_query ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_query_owner_read ON saved_query FOR SELECT TO app_server USING (owner = app.uid());
CREATE POLICY saved_query_owner_insert ON saved_query FOR INSERT TO app_server WITH CHECK (owner = app.uid() AND app.is_finance());
CREATE POLICY saved_query_owner_delete ON saved_query FOR DELETE TO app_server USING (owner = app.uid());
GRANT SELECT, INSERT, DELETE ON saved_query TO app_server;
