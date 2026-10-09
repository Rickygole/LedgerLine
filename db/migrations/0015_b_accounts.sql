ALTER TABLE app_user ADD COLUMN session_version int NOT NULL DEFAULT 0;

REVOKE SELECT ON app_user FROM app_server;
GRANT SELECT (id, email, full_name, title, role, org_id, can_sign_in, active, created_at) ON app_user TO app_server;

CREATE TABLE password_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('reset', 'invite')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX password_token_user_idx ON password_token(user_id);
ALTER TABLE password_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON password_token FROM app_server;

CREATE TABLE revoked_session (
  jti uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX revoked_session_expiry_idx ON revoked_session(expires_at);
ALTER TABLE revoked_session ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON revoked_session FROM app_server;

CREATE OR REPLACE FUNCTION app.issue_password_token(p_user uuid, p_purpose text, p_created_by uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  UPDATE password_token SET used_at = now() WHERE user_id = p_user AND used_at IS NULL;
  INSERT INTO password_token (user_id, token_hash, purpose, created_by, expires_at)
  VALUES (p_user, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_purpose, p_created_by, now() + interval '30 minutes');
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION app.issue_password_token(uuid, text, uuid) FROM PUBLIC;

DROP FUNCTION app.queue_password_reset(uuid);

CREATE FUNCTION app.queue_password_reset(p_user uuid, p_origin text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target app_user%ROWTYPE;
  v_token text;
  v_id uuid;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'password resets require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_target FROM app_user WHERE id = p_user;
  IF NOT FOUND OR NOT v_target.active THEN
    RAISE EXCEPTION 'user not found or inactive' USING ERRCODE = 'check_violation';
  END IF;
  v_token := app.issue_password_token(p_user, 'reset', app.uid());
  INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by)
  VALUES (
    v_target.email,
    'password_reset',
    'Reset your LedgerLine password',
    'Hello ' || v_target.full_name || E',\n\nA Council Finance administrator started a password reset for your LedgerLine account. Use the link below within 30 minutes to choose a new password. The link works once.\n\n' || rtrim(p_origin, '/') || '/reset?token=' || v_token || E'\n\nIf you did not expect this message, contact Council Finance.\n\nLedgerLine',
    NULL,
    app.uid()
  )
  RETURNING id INTO v_id;
  PERFORM app.write_audit('app_user', p_user::text, 'password_reset_requested', NULL, NULL,
    jsonb_build_object('email', v_target.email, 'outbox_id', v_id), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.queue_password_reset(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.queue_password_reset(uuid, text) TO app_server;

CREATE FUNCTION app.create_user(p_email text, p_full_name text, p_title text, p_role text, p_org uuid, p_origin text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_name text := btrim(p_full_name);
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id uuid;
  v_token text;
  v_outbox uuid;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'creating users requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = 'check_violation';
  END IF;
  IF v_name = '' OR char_length(v_name) > 120 OR char_length(coalesce(v_title, '')) > 120 THEN
    RAISE EXCEPTION 'invalid name' USING ERRCODE = 'check_violation';
  END IF;
  IF p_role NOT IN ('cbo_submitter', 'finance_viewer', 'finance_analyst', 'finance_admin') THEN
    RAISE EXCEPTION 'invalid role' USING ERRCODE = 'check_violation';
  END IF;
  IF (p_role = 'cbo_submitter') <> (p_org IS NOT NULL) THEN
    RAISE EXCEPTION 'organization users need an organization and Finance users cannot have one' USING ERRCODE = 'check_violation';
  END IF;
  IF p_org IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization WHERE id = p_org) THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM app_user WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'email already in use' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO app_user (email, full_name, title, role, org_id, can_sign_in, active)
  VALUES (v_email, v_name, v_title, p_role, p_org, false, true)
  RETURNING id INTO v_id;
  v_token := app.issue_password_token(v_id, 'invite', app.uid());
  INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by)
  VALUES (
    v_email,
    'password_set',
    'Set your LedgerLine password',
    'Hello ' || v_name || E',\n\nA LedgerLine account was created for you. Use the link below within 30 minutes to set your password. The link works once. If it expires, ask Council Finance to send a new one.\n\n' || rtrim(p_origin, '/') || '/reset?token=' || v_token || E'\n\nLedgerLine',
    NULL,
    app.uid()
  )
  RETURNING id INTO v_outbox;
  PERFORM app.write_audit('app_user', v_id::text, 'user_create', NULL, NULL,
    jsonb_build_object('email', v_email, 'role', p_role, 'org_id', p_org, 'outbox_id', v_outbox), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.create_user(text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_user(text, text, text, text, uuid, text) TO app_server;

CREATE FUNCTION app.password_token_info(p_hash text) RETURNS TABLE (email text, full_name text, purpose text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.email, u.full_name, t.purpose
  FROM password_token t JOIN app_user u ON u.id = t.user_id
  WHERE t.token_hash = p_hash AND t.used_at IS NULL AND t.expires_at > now() AND u.active
$$;
REVOKE ALL ON FUNCTION app.password_token_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.password_token_info(text) TO app_server;

CREATE FUNCTION app.reset_password(p_hash text, p_password_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token password_token%ROWTYPE;
BEGIN
  IF p_password_hash !~ '^\$2[aby]\$[0-9]{2}\$.{53}$' THEN
    RAISE EXCEPTION 'invalid password hash' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_token FROM password_token WHERE token_hash = p_hash FOR UPDATE;
  IF NOT FOUND OR v_token.used_at IS NOT NULL OR v_token.expires_at <= now()
     OR NOT EXISTS (SELECT 1 FROM app_user WHERE id = v_token.user_id AND active) THEN
    RAISE EXCEPTION 'reset link is not valid' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE app_user
  SET password_hash = p_password_hash, can_sign_in = true, session_version = session_version + 1
  WHERE id = v_token.user_id;
  UPDATE password_token SET used_at = now() WHERE user_id = v_token.user_id AND used_at IS NULL;
  INSERT INTO audit_event (actor_id, entity, entity_id, action, after)
  VALUES (v_token.user_id, 'app_user', v_token.user_id::text, 'password_set', jsonb_build_object('via', v_token.purpose));
  RETURN v_token.user_id;
END;
$$;
REVOKE ALL ON FUNCTION app.reset_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reset_password(text, text) TO app_server;

CREATE FUNCTION app.current_session_version() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT session_version FROM app_user WHERE id = app.uid() AND active
$$;
REVOKE ALL ON FUNCTION app.current_session_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_session_version() TO app_server;

CREATE FUNCTION app.session_valid(p_jti uuid, p_version int) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM app_user WHERE id = app.uid() AND active AND session_version = p_version)
     AND NOT EXISTS (SELECT 1 FROM revoked_session WHERE jti = p_jti)
$$;
REVOKE ALL ON FUNCTION app.session_valid(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.session_valid(uuid, int) TO app_server;

CREATE FUNCTION app.revoke_session(p_jti uuid, p_expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM revoked_session WHERE expires_at < now();
  INSERT INTO revoked_session (jti, user_id, expires_at) VALUES (p_jti, app.uid(), p_expires) ON CONFLICT DO NOTHING;
  PERFORM app.write_audit('user', app.uid()::text, 'sign_out', NULL, NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION app.revoke_session(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revoke_session(uuid, timestamptz) TO app_server;
