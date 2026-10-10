CREATE OR REPLACE FUNCTION app.queue_password_reset(p_user uuid, p_origin text) RETURNS TABLE (outbox_id uuid, link text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target app_user%ROWTYPE;
  v_token text;
  v_id uuid;
  v_link text;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'password resets require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_target FROM app_user WHERE id = p_user;
  IF NOT FOUND OR NOT v_target.active THEN
    RAISE EXCEPTION 'user not found or inactive' USING ERRCODE = 'check_violation';
  END IF;
  v_token := app.issue_password_token(p_user, 'reset', app.uid());
  v_link := rtrim(p_origin, '/') || '/reset?token=' || v_token;
  INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by)
  VALUES (
    v_target.email,
    'password_reset',
    'Reset your LedgerLine password',
    'Hello ' || v_target.full_name || E',\n\nA Council Finance administrator started a password reset for your LedgerLine account. The administrator will give you the link directly, and this message does not contain it. The link works once and expires 30 minutes after it was issued.\n\nLink as issued (the secret part is withheld here): ' || rtrim(p_origin, '/') || '/reset?token=[withheld]' || E'\n\nIf you did not expect this message, contact Council Finance.\n\nLedgerLine',
    NULL,
    app.uid()
  )
  RETURNING id INTO v_id;
  PERFORM app.write_audit('app_user', p_user::text, 'password_reset_requested', NULL, NULL,
    jsonb_build_object('email', v_target.email, 'outbox_id', v_id), NULL);
  outbox_id := v_id;
  link := v_link;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.create_user(p_email text, p_full_name text, p_title text, p_role text, p_org uuid, p_origin text) RETURNS TABLE (user_id uuid, outbox_id uuid, link text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_name text := btrim(p_full_name);
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id uuid;
  v_token text;
  v_outbox uuid;
  v_link text;
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
  v_link := rtrim(p_origin, '/') || '/reset?token=' || v_token;
  INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by)
  VALUES (
    v_email,
    'password_set',
    'Set your LedgerLine password',
    'Hello ' || v_name || E',\n\nA LedgerLine account was created for you. A Council Finance administrator will give you the link to set your password directly, and this message does not contain it. The link works once and expires 30 minutes after it was issued. If it expires, ask Council Finance for a new one.\n\nLink as issued (the secret part is withheld here): ' || rtrim(p_origin, '/') || '/reset?token=[withheld]' || E'\n\nLedgerLine',
    NULL,
    app.uid()
  )
  RETURNING id INTO v_outbox;
  PERFORM app.write_audit('app_user', v_id::text, 'user_create', NULL, NULL,
    jsonb_build_object('email', v_email, 'role', p_role, 'org_id', p_org, 'outbox_id', v_outbox), NULL);
  user_id := v_id;
  outbox_id := v_outbox;
  link := v_link;
  RETURN NEXT;
END;
$$;
