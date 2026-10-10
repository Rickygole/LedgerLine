CREATE TABLE support_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL UNIQUE,
  reference text GENERATED ALWAYS AS ('SR-' || lpad(seq::text, 5, '0')) STORED,
  requester uuid NOT NULL REFERENCES app_user(id),
  category text NOT NULL CHECK (category IN ('account', 'password', 'report', 'data', 'other')),
  subject text NOT NULL CHECK (btrim(subject) <> '' AND char_length(subject) <= 120),
  body text NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  first_responder uuid REFERENCES app_user(id),
  closed_at timestamptz,
  CHECK (first_response_at IS NULL OR first_response_at >= created_at),
  CHECK ((first_response_at IS NULL) = (first_responder IS NULL)),
  CHECK (closed_at IS NULL OR first_response_at IS NOT NULL)
);
CREATE INDEX support_request_requester_idx ON support_request(requester);
CREATE INDEX support_request_created_idx ON support_request(created_at DESC);

CREATE TABLE support_message (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support_request(id),
  author uuid NOT NULL REFERENCES app_user(id),
  from_staff boolean NOT NULL,
  body text NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_message_request_idx ON support_message(request_id, created_at);

CREATE TRIGGER support_message_append_only
  BEFORE UPDATE OR DELETE ON support_message
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER support_message_no_truncate
  BEFORE TRUNCATE ON support_message
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER support_request_no_delete
  BEFORE DELETE ON support_request
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE support_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_message ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_request_read ON support_request FOR SELECT TO app_server
  USING (requester = app.uid() OR app.is_admin());
CREATE POLICY support_message_read ON support_message FOR SELECT TO app_server
  USING (EXISTS (SELECT 1 FROM support_request r WHERE r.id = request_id));

GRANT SELECT ON support_request, support_message TO app_server;

CREATE VIEW support_queue WITH (security_invoker = true) AS
SELECT r.id, r.reference, r.requester, r.category, r.subject, r.body, r.created_at,
       r.created_at + interval '24 hours' AS due_at,
       r.first_response_at, r.first_responder, r.closed_at,
       CASE
         WHEN r.closed_at IS NOT NULL THEN 'closed'
         WHEN r.first_response_at IS NOT NULL THEN 'responded'
         WHEN now() > r.created_at + interval '24 hours' THEN 'overdue'
         ELSE 'open'
       END AS state,
       CASE WHEN r.first_response_at IS NOT NULL THEN round(extract(epoch FROM r.first_response_at - r.created_at) / 60)::int END AS response_minutes,
       CASE WHEN r.first_response_at IS NOT NULL THEN r.first_response_at <= r.created_at + interval '24 hours' END AS met_target
FROM support_request r;
GRANT SELECT ON support_queue TO app_server;

CREATE FUNCTION app.create_support_request(p_category text, p_subject text, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_ref text;
BEGIN
  IF app.uid() IS NULL OR app.role() IS NULL THEN
    RAISE EXCEPTION 'sign in to ask for help' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO support_request (requester, category, subject, body)
  VALUES (app.uid(), p_category, btrim(p_subject), btrim(p_body))
  RETURNING id, reference INTO v_id, v_ref;
  INSERT INTO support_message (request_id, author, from_staff, body) VALUES (v_id, app.uid(), false, btrim(p_body));
  PERFORM app.write_audit('support_request', v_id::text, 'support_request_created', v_ref || ': ' || btrim(p_subject), NULL,
    jsonb_build_object('category', p_category), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.create_support_request(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_support_request(text, text, text) TO app_server;

CREATE FUNCTION app.reply_support_request(p_request uuid, p_body text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req support_request%ROWTYPE;
  v_staff boolean := app.is_admin();
  v_requester app_user%ROWTYPE;
  v_first boolean;
BEGIN
  IF app.uid() IS NULL OR app.role() IS NULL THEN
    RAISE EXCEPTION 'sign in to reply' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_req FROM support_request WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR (v_req.requester <> app.uid() AND NOT v_staff) THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_req.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'request is closed' USING ERRCODE = 'check_violation';
  END IF;
  v_staff := v_staff AND v_req.requester <> app.uid();
  INSERT INTO support_message (request_id, author, from_staff, body) VALUES (p_request, app.uid(), v_staff, btrim(p_body));
  IF v_staff THEN
    v_first := v_req.first_response_at IS NULL;
    IF v_first THEN
      UPDATE support_request SET first_response_at = now(), first_responder = app.uid() WHERE id = p_request;
    END IF;
    SELECT * INTO v_requester FROM app_user WHERE id = v_req.requester;
    INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by)
    VALUES (
      v_requester.email,
      'support_response',
      'Reply to your help request ' || v_req.reference,
      'Hello ' || v_requester.full_name || E',\n\nLedgerLine support replied to ' || v_req.reference || ' (' || v_req.subject || E').\n\n' || btrim(p_body) || E'\n\nYou can read the full conversation under Get help after you sign in.',
      v_requester.org_id,
      app.uid()
    );
    PERFORM app.write_audit('support_request', p_request::text, CASE WHEN v_first THEN 'support_first_response' ELSE 'support_reply' END,
      v_req.reference, NULL, jsonb_build_object('first_response', v_first), NULL);
  ELSE
    PERFORM app.write_audit('support_request', p_request::text, 'support_follow_up', v_req.reference, NULL, NULL, NULL);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app.reply_support_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reply_support_request(uuid, text) TO app_server;

CREATE FUNCTION app.close_support_request(p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req support_request%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'closing requests requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_req FROM support_request WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'check_violation';
  END IF;
  IF v_req.first_response_at IS NULL THEN
    RAISE EXCEPTION 'respond before closing' USING ERRCODE = 'check_violation';
  END IF;
  IF v_req.closed_at IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE support_request SET closed_at = now() WHERE id = p_request;
  PERFORM app.write_audit('support_request', p_request::text, 'support_closed', v_req.reference, NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION app.close_support_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.close_support_request(uuid) TO app_server;
