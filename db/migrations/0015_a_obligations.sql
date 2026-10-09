UPDATE reporting_period p SET starts_on = f.starts_on
FROM fiscal_year f
WHERE f.id = p.fiscal_year_id AND p.id = f.id || '-YE';

INSERT INTO reporting_period (id, fiscal_year_id, label, starts_on, ends_on, due_on)
SELECT f.id || '-MY', f.id, f.id || ' Mid-Year', f.starts_on, make_date(extract(year FROM f.starts_on)::int, 12, 31), make_date(extract(year FROM f.starts_on)::int + 1, 1, 31)
FROM fiscal_year f
ON CONFLICT (id) DO NOTHING;

INSERT INTO reporting_period (id, fiscal_year_id, label, starts_on, ends_on, due_on)
SELECT f.id || '-YE', f.id, f.id || ' Year-End', f.starts_on, f.ends_on, make_date(extract(year FROM f.ends_on)::int, 9, 30)
FROM fiscal_year f
ON CONFLICT (id) DO NOTHING;

INSERT INTO reminder_rule (period_id, offset_days, template_subject, template_body, created_by)
SELECT p.id, d.offset_days, d.subject, d.body, (SELECT id FROM app_user WHERE email = 'system.scheduler@ledgerline.example')
FROM reporting_period p
CROSS JOIN (VALUES
  (-14, 'Upcoming: {period} report due {due_date}', E'Hello,\n\n{organization} has a {period} report for {initiative} due on {due_date}. Please sign in to LedgerLine to finish and submit it.\n\nThank you,\nCouncil Finance'),
  (-3, 'Due soon: {period} report due {due_date}', E'Hello,\n\nThis is a reminder that the {period} report for {initiative} from {organization} is due on {due_date}. Please submit it in LedgerLine before then.\n\nThank you,\nCouncil Finance'),
  (1, 'Past due: {period} report was due {due_date}', E'Hello,\n\nThe {period} report for {initiative} from {organization} was due on {due_date} and has not been submitted. Please submit it in LedgerLine as soon as you can.\n\nThank you,\nCouncil Finance'),
  (14, 'Second notice: {period} report past due', E'Hello,\n\nThe {period} report for {initiative} from {organization} is now two weeks past its {due_date} due date. Please submit it in LedgerLine, or reply to this message if you need help.\n\nThank you,\nCouncil Finance')
) AS d(offset_days, subject, body)
WHERE EXISTS (SELECT 1 FROM app_user WHERE email = 'system.scheduler@ledgerline.example')
  AND NOT EXISTS (SELECT 1 FROM reminder_rule r WHERE r.period_id = p.id);

CREATE VIEW obligation WITH (security_invoker = true) AS
SELECT a.id AS assignment_id,
       a.org_id,
       a.initiative_id,
       p.id AS period_id,
       p.fiscal_year_id,
       p.due_on,
       s.id AS submission_id,
       s.status AS submission_status
FROM assignment a
JOIN initiative i ON i.id = a.initiative_id
JOIN reporting_period p ON p.fiscal_year_id = i.fiscal_year_id
LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = p.id
WHERE s.id IS NOT NULL
   OR EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published');

GRANT SELECT ON obligation TO app_server;

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
         replace(replace(replace(replace(r.template_body, '{organization}', o.legal_name), '{initiative}', w.names), '{period}', v_label), '{due_date}', to_char(v_due, 'FMMonth FMDD, YYYY')),
         EXISTS (SELECT 1 FROM outbox ob2 WHERE ob2.reminder_key = r.id::text || ':' || o.id::text || ':' || p_today::text)
  FROM reminder_rule r
  JOIN owing w ON true
  JOIN organization o ON o.id = w.o_id
  JOIN contacts c ON c.c_org = o.id
  WHERE r.period_id = p_period AND r.active AND v_due + r.offset_days = p_today
  ORDER BY r.offset_days, o.legal_name;
END;
$$;
