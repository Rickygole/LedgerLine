CREATE OR REPLACE FUNCTION app.in_scope_audit(p_entity text, p_entity_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_entity IN ('security_incident', 'incident_contact', 'uat_session', 'training_record', 'app_user') THEN app.is_admin()
    WHEN p_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN app.scope_open()
    WHEN p_entity = 'submission' THEN app.in_scope_submission(p_entity_id::uuid)
    WHEN p_entity = 'initiative' THEN app.in_scope(p_entity_id::uuid)
    WHEN p_entity = 'form_version' THEN
      coalesce((SELECT app.in_scope(f.initiative_id) FROM form_version f WHERE f.id = p_entity_id::uuid), false)
    WHEN p_entity = 'assignment' THEN
      coalesce((SELECT app.in_scope(a.initiative_id) FROM assignment a WHERE a.id = p_entity_id::uuid), false)
    WHEN p_entity = 'organization' THEN app.in_scope_org(p_entity_id::uuid)
    ELSE app.scope_open()
  END
$$;

CREATE OR REPLACE FUNCTION app.reminder_targets(p_period text, p_today date)
RETURNS TABLE (
  rule_id uuid,
  offset_days int,
  org_id uuid,
  org_name text,
  to_email text,
  contact_name text,
  initiatives text,
  subject text,
  body text,
  already_sent boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_due date;
  v_label text;
BEGIN
  IF NOT app.is_finance() THEN
    RAISE EXCEPTION 'reminders are visible to Finance staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT due_on, label INTO v_due, v_label FROM reporting_period WHERE id = p_period;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporting period not found' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
  WITH owing AS (
    SELECT ob.org_id AS o_id, string_agg(i.name, ', ' ORDER BY i.name) AS names
    FROM obligation ob
    JOIN initiative i ON i.id = ob.initiative_id
    WHERE ob.period_id = p_period
      AND (ob.submission_status IS NULL OR ob.submission_status IN ('draft', 'returned'))
      AND ((SELECT app.scope_open()) OR app.in_scope(ob.initiative_id))
    GROUP BY ob.org_id
  ),
  contacts AS (
    SELECT DISTINCT ON (c.org_id) c.org_id AS c_org, c.email, c.full_name
    FROM contact c ORDER BY c.org_id, c.is_primary DESC, c.full_name
  )
  SELECT r.id, r.offset_days, o.id, o.legal_name, c.email, c.full_name, w.names,
         replace(replace(replace(replace(r.template_subject, '{organization}', o.legal_name), '{initiative}', w.names), '{period}', v_label), '{due_date}', to_char(v_due, 'FMMonth FMDD, YYYY')),
         regexp_replace(replace(replace(replace(replace(replace(r.template_body, '{contact}', c.full_name), '{organization}', o.legal_name), '{initiative}', w.names), '{period}', v_label), '{due_date}', to_char(v_due, 'FMMonth FMDD, YYYY')), '^Hello,', 'Hello ' || c.full_name || ','),
         EXISTS (SELECT 1 FROM outbox ob2 WHERE ob2.reminder_key = r.id::text || ':' || o.id::text || ':' || (v_due + r.offset_days)::text)
  FROM reminder_rule r
  JOIN owing w ON true
  JOIN organization o ON o.id = w.o_id
  JOIN contacts c ON c.c_org = o.id
  WHERE r.period_id = p_period AND r.active AND v_due + r.offset_days <= p_today AND v_due + r.offset_days > p_today - 3
  ORDER BY r.offset_days, o.legal_name;
END;
$$;

ALTER POLICY contact_read ON contact
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_org(org_id)))
    OR (org_id = (SELECT app.org_id()))
  );

CREATE FUNCTION app.outbox_actionable(p_submission uuid, p_org uuid, p_template text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
      (app.is_finance()
        AND (app.scope_open()
          OR (p_submission IS NOT NULL AND app.in_scope_submission(p_submission))
          OR (p_submission IS NULL AND p_org IS NOT NULL AND app.in_scope_org(p_org))))
      OR (p_org IS NOT NULL AND p_org = app.org_id())
    )
    AND (p_template <> ALL (ARRAY['password_reset', 'password_set']) OR app.is_admin())
    AND (p_template NOT LIKE 'security\_%' OR app.is_admin())
$$;

REVOKE ALL ON FUNCTION app.outbox_actionable(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.outbox_actionable(uuid, uuid, text) TO app_server;

CREATE OR REPLACE FUNCTION app.claim_outbox(p_submission uuid, p_limit int) RETURNS TABLE (id uuid, to_email text, template text, subject text, body_text text, attempts int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT o.id FROM outbox o
    WHERE (o.status = 'queued' OR (o.status = 'sending' AND o.claimed_at < now() - interval '10 minutes'))
      AND (p_submission IS NULL OR o.submission_id = p_submission)
      AND app.outbox_actionable(o.submission_id, o.org_id, o.template)
    ORDER BY o.created_at, o.id
    LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE outbox o SET status = 'sending', claimed_at = now(), attempts = o.attempts + 1
  FROM picked WHERE o.id = picked.id
  RETURNING o.id, o.to_email, o.template, o.subject, o.body_text, o.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION app.finish_outbox(p_id uuid, p_status text, p_provider_id text, p_reason text, p_delivered_to text DEFAULT NULL) RETURNS text
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
    AND app.outbox_actionable(outbox.submission_id, outbox.org_id, outbox.template)
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

