CREATE OR REPLACE FUNCTION app.queue_password_reset(p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target app_user%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'password resets require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_target FROM app_user WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by)
  VALUES (
    v_target.email,
    'password_reset',
    '[DEMO] Reset your LedgerLine password',
    'Hello ' || v_target.full_name || E',\n\nA Council Finance administrator asked us to help you choose a new LedgerLine password. In a live system this message would contain a single use link that expires in one hour.\n\nThis is a demonstration message. No link was created and your password has not changed.\n\nLedgerLine, New York City Council Finance Division',
    v_target.org_id,
    app.uid()
  )
  RETURNING id INTO v_id;
  PERFORM app.write_audit('app_user', p_user::text, 'password_reset_requested', NULL, NULL,
    jsonb_build_object('email', v_target.email, 'outbox_id', v_id), NULL);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.queue_password_reset(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.queue_password_reset(uuid) TO app_server;
