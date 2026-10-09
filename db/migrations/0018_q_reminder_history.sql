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
         EXISTS (SELECT 1 FROM outbox ob2 WHERE ob2.reminder_key = r.id::text || ':' || o.id::text || ':' || p_today::text)
  FROM reminder_rule r
  JOIN owing w ON true
  JOIN organization o ON o.id = w.o_id
  JOIN contacts c ON c.c_org = o.id
  WHERE r.period_id = p_period AND r.active AND v_due + r.offset_days = p_today
  ORDER BY r.offset_days, o.legal_name;
END;
$$;

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
           o.id, 'sent', v_scheduler,
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

REVOKE ALL ON FUNCTION app.backfill_reminder_history(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.backfill_reminder_history(date) FROM app_server;
