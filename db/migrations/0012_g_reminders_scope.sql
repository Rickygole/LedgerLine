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
  v_fy text;
BEGIN
  IF NOT app.is_finance() THEN
    RAISE EXCEPTION 'reminders are visible to Finance staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT due_on, label, fiscal_year_id INTO v_due, v_label, v_fy FROM reporting_period WHERE id = p_period;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporting period not found' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
  WITH owing AS (
    SELECT a.org_id AS o_id, string_agg(i.name, ', ' ORDER BY i.name) AS names
    FROM assignment a
    JOIN initiative i ON i.id = a.initiative_id AND i.status = 'active'
    LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = p_period
    WHERE (s.id IS NULL OR s.status IN ('draft', 'returned'))
      AND NOT EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.successor_id = i.id AND l.fiscal_year_id > v_fy)
      AND NOT EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.predecessor_id = i.id AND l.fiscal_year_id <= v_fy)
      AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
    GROUP BY a.org_id
  ),
  contacts AS (
    SELECT DISTINCT ON (c.org_id) c.org_id AS c_org, c.email, c.full_name
    FROM contact c ORDER BY c.org_id, c.is_primary DESC, c.full_name
  )
  SELECT r.id, r.offset_days, o.id, o.legal_name, c.email, c.full_name, w.names,
         replace(replace(replace(replace(r.template_subject, '{organization}', o.legal_name), '{initiative}', w.names), '{period}', v_label), '{due_date}', to_char(v_due, 'FMMonth FMDD, YYYY')),
         replace(replace(replace(replace(r.template_body, '{organization}', o.legal_name), '{initiative}', w.names), '{period}', v_label), '{due_date}', to_char(v_due, 'FMMonth FMDD, YYYY')),
         EXISTS (SELECT 1 FROM outbox ob WHERE ob.reminder_key = r.id::text || ':' || o.id::text || ':' || p_today::text)
  FROM reminder_rule r
  JOIN owing w ON true
  JOIN organization o ON o.id = w.o_id
  JOIN contacts c ON c.c_org = o.id
  WHERE r.period_id = p_period AND r.active AND v_due + r.offset_days = p_today
  ORDER BY r.offset_days, o.legal_name;
END;
$$;
