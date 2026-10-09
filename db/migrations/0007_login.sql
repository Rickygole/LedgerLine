CREATE OR REPLACE FUNCTION app.login_lookup(p_email text)
RETURNS TABLE (id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.password_hash
  FROM app_user u
  WHERE lower(u.email) = lower(btrim(p_email)) AND u.can_sign_in AND u.active AND u.password_hash IS NOT NULL
$$;

REVOKE ALL ON FUNCTION app.login_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.login_lookup(text) TO app_server;
