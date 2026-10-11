ALTER TABLE outbox ADD COLUMN delivered_to text;

DROP FUNCTION app.finish_outbox(uuid, text, text, text);

CREATE FUNCTION app.finish_outbox(p_id uuid, p_status text, p_provider_id text, p_reason text, p_delivered_to text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row outbox%ROWTYPE;
  v_next text;
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('sent', 'failed', 'held', 'recorded') THEN
    RAISE EXCEPTION 'invalid outbox status' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_row FROM outbox WHERE outbox.id = p_id AND outbox.status = 'sending'
    AND (app.is_finance() OR (outbox.org_id IS NOT NULL AND outbox.org_id = app.org_id()))
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_next := p_status;
  IF p_status = 'failed' AND v_row.attempts < 3 THEN
    v_next := 'queued';
  END IF;
  UPDATE outbox SET
    status = v_next,
    claimed_at = NULL,
    sent_at = CASE WHEN v_next = 'sent' THEN now() ELSE NULL END,
    provider_id = CASE WHEN v_next = 'sent' THEN p_provider_id ELSE NULL END,
    delivered_to = CASE WHEN v_next = 'sent' THEN coalesce(p_delivered_to, outbox.to_email) ELSE NULL END,
    failure_reason = CASE
      WHEN p_status = 'failed' THEN left(coalesce(p_reason, 'Delivery failed'), 200)
      WHEN p_status = 'held' AND p_reason IS NOT NULL THEN left(p_reason, 200)
      ELSE NULL
    END
  WHERE outbox.id = p_id;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION app.finish_outbox(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.finish_outbox(uuid, text, text, text, text) TO app_server;
