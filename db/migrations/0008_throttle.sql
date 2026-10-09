CREATE TABLE auth_attempt (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempt_key_at ON auth_attempt(key, at);
ALTER TABLE auth_attempt ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.record_attempt(p_key text, p_window_minutes int, p_limit int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent int;
BEGIN
  DELETE FROM auth_attempt WHERE at < now() - interval '1 day';
  SELECT count(*) INTO v_recent FROM auth_attempt
  WHERE key = p_key AND at > now() - make_interval(mins => p_window_minutes);
  IF v_recent >= p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO auth_attempt (key) VALUES (p_key);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION app.record_attempt(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_attempt(text, int, int) TO app_server;

REVOKE INSERT ON audit_event FROM app_server;
DROP POLICY IF EXISTS audit_insert ON audit_event;
