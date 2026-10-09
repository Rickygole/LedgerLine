ALTER TABLE outbox ADD COLUMN attempts int NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN sent_at timestamptz;
ALTER TABLE outbox ADD COLUMN provider_id text;
ALTER TABLE outbox ADD COLUMN failure_reason text;
ALTER TABLE outbox ADD COLUMN claimed_at timestamptz;

ALTER TABLE outbox DROP CONSTRAINT outbox_status_check;

UPDATE outbox SET status = 'recorded' WHERE status IN ('sent', 'queued', 'failed');

ALTER TABLE outbox ADD CONSTRAINT outbox_status_check
  CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'held', 'recorded'));
ALTER TABLE outbox ADD CONSTRAINT outbox_sent_has_proof
  CHECK (status <> 'sent' OR (sent_at IS NOT NULL AND provider_id IS NOT NULL));

CREATE FUNCTION app.claim_outbox(p_submission uuid, p_limit int) RETURNS TABLE (id uuid, to_email text, template text, subject text, body_text text, attempts int)
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
      AND (app.is_finance() OR (o.org_id IS NOT NULL AND o.org_id = app.org_id()))
      AND (o.template NOT IN ('password_reset', 'password_set') OR app.is_admin())
    ORDER BY o.created_at, o.id
    LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE outbox o SET status = 'sending', claimed_at = now(), attempts = o.attempts + 1
  FROM picked WHERE o.id = picked.id
  RETURNING o.id, o.to_email, o.template, o.subject, o.body_text, o.attempts;
END;
$$;

CREATE FUNCTION app.finish_outbox(p_id uuid, p_status text, p_provider_id text, p_reason text) RETURNS text
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
    failure_reason = CASE WHEN p_status = 'failed' THEN left(coalesce(p_reason, 'Delivery failed'), 200) ELSE NULL END
  WHERE outbox.id = p_id;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION app.claim_outbox(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.finish_outbox(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_outbox(uuid, int) TO app_server;
GRANT EXECUTE ON FUNCTION app.finish_outbox(uuid, text, text, text) TO app_server;

CREATE OR REPLACE FUNCTION app.backfill_reminder_history(p_today date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_scheduler uuid;
BEGIN
  SELECT id INTO v_scheduler FROM app_user WHERE email = 'system.scheduler@ledgerline.example';
  WITH fired AS (
    SELECT r.id AS rule_id, r.period_id, r.template_subject, r.template_body,
           p.label, p.due_on, (p.due_on + r.offset_days) AS fired_on
    FROM reminder_rule r
    JOIN reporting_period p ON p.id = r.period_id
    WHERE r.active AND p.due_on + r.offset_days < p_today
  ),
  owing AS (
    SELECT f.rule_id, ob.org_id AS o_id, string_agg(i.name, ', ' ORDER BY i.name) AS names
    FROM fired f
    JOIN obligation ob ON ob.period_id = f.period_id
    JOIN initiative i ON i.id = ob.initiative_id
    LEFT JOIN submission s ON s.id = ob.submission_id
    WHERE s.id IS NULL
       OR s.submitted_at IS NULL
       OR (s.submitted_at AT TIME ZONE 'America/New_York')::date > f.fired_on
    GROUP BY f.rule_id, ob.org_id
  ),
  contacts AS (
    SELECT DISTINCT ON (c.org_id) c.org_id AS c_org, c.email, c.full_name
    FROM contact c ORDER BY c.org_id, c.is_primary DESC, c.full_name
  ),
  inserted AS (
    INSERT INTO outbox (to_email, template, subject, body_text, org_id, status, created_by, created_at, reminder_key)
    SELECT c.email, 'reminder',
           replace(replace(replace(replace(f.template_subject, '{organization}', o.legal_name), '{initiative}', w.names), '{period}', f.label), '{due_date}', to_char(f.due_on, 'FMMonth FMDD, YYYY')),
           regexp_replace(replace(replace(replace(replace(replace(f.template_body, '{contact}', c.full_name), '{organization}', o.legal_name), '{initiative}', w.names), '{period}', f.label), '{due_date}', to_char(f.due_on, 'FMMonth FMDD, YYYY')), '^Hello,', 'Hello ' || c.full_name || ','),
           o.id, 'recorded', v_scheduler,
           (f.fired_on::timestamp + interval '13 hours') AT TIME ZONE 'UTC',
           f.rule_id::text || ':' || o.id::text || ':' || f.fired_on::text
    FROM fired f
    JOIN owing w ON w.rule_id = f.rule_id
    JOIN organization o ON o.id = w.o_id
    JOIN contacts c ON c.c_org = o.id
    ON CONFLICT (reminder_key) WHERE reminder_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM inserted;
  RETURN v_count;
END;
$$;
