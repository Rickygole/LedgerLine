CREATE OR REPLACE FUNCTION app.record_attempt(p_key text, p_window_minutes int, p_limit int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_key));
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
