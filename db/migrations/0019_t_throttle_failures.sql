CREATE FUNCTION app.attempts_blocked(p_key text, p_window_minutes int, p_limit int) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) >= p_limit FROM auth_attempt WHERE key = p_key AND at > now() - make_interval(mins => p_window_minutes)
$$;

CREATE FUNCTION app.clear_attempts(p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM auth_attempt WHERE key = p_key
$$;

REVOKE ALL ON FUNCTION app.attempts_blocked(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.clear_attempts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.attempts_blocked(text, int, int) TO app_server;
GRANT EXECUTE ON FUNCTION app.clear_attempts(text) TO app_server;
