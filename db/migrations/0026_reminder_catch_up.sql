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

CREATE OR REPLACE FUNCTION app.queue_reminders(p_period text, p_today date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_due date;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'sending reminders requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT due_on INTO v_due FROM reporting_period WHERE id = p_period;
  WITH queued AS (
    INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by, reminder_key)
    SELECT t.to_email, 'reminder', t.subject, t.body, t.org_id, app.uid(), t.rule_id::text || ':' || t.org_id::text || ':' || (v_due + t.offset_days)::text
    FROM app.reminder_targets(p_period, p_today) t
    WHERE NOT t.already_sent
    ON CONFLICT (reminder_key) WHERE reminder_key IS NOT NULL DO NOTHING
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM queued;
  PERFORM app.write_audit('reporting_period', p_period, 'reminders_queued',
    v_count || ' reminder' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || ' queued for ' || p_today::text,
    NULL, jsonb_build_object('period', p_period, 'date', p_today, 'queued', v_count), NULL);
  RETURN v_count;
END;
$$;
