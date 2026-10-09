ALTER TABLE outbox ADD COLUMN reminder_key text;
CREATE UNIQUE INDEX outbox_reminder_key_idx ON outbox(reminder_key) WHERE reminder_key IS NOT NULL;

CREATE TABLE reminder_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id text NOT NULL REFERENCES reporting_period(id),
  offset_days int NOT NULL CHECK (offset_days BETWEEN -365 AND 365),
  template_subject text NOT NULL CHECK (btrim(template_subject) <> ''),
  template_body text NOT NULL CHECK (btrim(template_body) <> ''),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, offset_days)
);

ALTER TABLE reminder_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminder_read ON reminder_rule FOR SELECT TO app_server USING (app.is_finance());
CREATE POLICY reminder_admin_insert ON reminder_rule FOR INSERT TO app_server WITH CHECK (app.is_admin());
CREATE POLICY reminder_admin_update ON reminder_rule FOR UPDATE TO app_server USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY reminder_admin_delete ON reminder_rule FOR DELETE TO app_server USING (app.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON reminder_rule TO app_server;

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
    SELECT a.org_id AS o_id, string_agg(i.name, ', ' ORDER BY i.name) AS names
    FROM assignment a
    JOIN initiative i ON i.id = a.initiative_id AND i.status = 'active'
    LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = p_period
    WHERE (s.id IS NULL OR s.status IN ('draft', 'returned'))
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

CREATE OR REPLACE FUNCTION app.queue_reminders(p_period text, p_today date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'sending reminders requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  WITH queued AS (
    INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by, reminder_key)
    SELECT t.to_email, 'reminder', t.subject, t.body, t.org_id, app.uid(), t.rule_id::text || ':' || t.org_id::text || ':' || p_today::text
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

CREATE OR REPLACE FUNCTION app.restore_reminder_defaults(p_period text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'reminder rules require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reporting_period WHERE id = p_period) THEN
    RAISE EXCEPTION 'reporting period not found' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO reminder_rule (period_id, offset_days, template_subject, template_body, created_by)
  SELECT p_period, d.offset_days, d.subject, d.body, app.uid()
  FROM (VALUES
    (-14, 'Upcoming: {period} report due {due_date}', E'Hello,\n\n{organization} has a {period} report for {initiative} due on {due_date}. Please sign in to LedgerLine to finish and submit it.\n\nThank you,\nCouncil Finance'),
    (-3, 'Due soon: {period} report due {due_date}', E'Hello,\n\nThis is a reminder that the {period} report for {initiative} from {organization} is due on {due_date}. Please submit it in LedgerLine before then.\n\nThank you,\nCouncil Finance'),
    (1, 'Past due: {period} report was due {due_date}', E'Hello,\n\nThe {period} report for {initiative} from {organization} was due on {due_date} and has not been submitted. Please submit it in LedgerLine as soon as you can.\n\nThank you,\nCouncil Finance'),
    (14, 'Second notice: {period} report past due', E'Hello,\n\nThe {period} report for {initiative} from {organization} is now two weeks past its {due_date} due date. Please submit it in LedgerLine, or reply to this message if you need help.\n\nThank you,\nCouncil Finance')
  ) AS d(offset_days, subject, body)
  ON CONFLICT (period_id, offset_days) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM app.write_audit('reporting_period', p_period, 'reminder_defaults_restored', v_count || ' rules added', NULL, NULL, NULL);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_scheduler() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO app_user (email, full_name, title, role, can_sign_in, active)
  VALUES ('system.scheduler@ledgerline.example', 'System scheduler', 'Automated jobs', 'finance_admin', false, true)
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO v_id FROM app_user WHERE email = 'system.scheduler@ledgerline.example';
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.reminder_targets(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.queue_reminders(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.restore_reminder_defaults(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ensure_scheduler() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reminder_targets(text, date) TO app_server;
GRANT EXECUTE ON FUNCTION app.queue_reminders(text, date) TO app_server;
GRANT EXECUTE ON FUNCTION app.restore_reminder_defaults(text) TO app_server;
GRANT EXECUTE ON FUNCTION app.ensure_scheduler() TO app_server;

SELECT app.ensure_scheduler();

INSERT INTO reminder_rule (period_id, offset_days, template_subject, template_body, created_by)
SELECT p.id, d.offset_days, d.subject, d.body, (SELECT id FROM app_user WHERE email = 'system.scheduler@ledgerline.example')
FROM reporting_period p
CROSS JOIN (VALUES
  (-14, 'Upcoming: {period} report due {due_date}', E'Hello,\n\n{organization} has a {period} report for {initiative} due on {due_date}. Please sign in to LedgerLine to finish and submit it.\n\nThank you,\nCouncil Finance'),
  (-3, 'Due soon: {period} report due {due_date}', E'Hello,\n\nThis is a reminder that the {period} report for {initiative} from {organization} is due on {due_date}. Please submit it in LedgerLine before then.\n\nThank you,\nCouncil Finance'),
  (1, 'Past due: {period} report was due {due_date}', E'Hello,\n\nThe {period} report for {initiative} from {organization} was due on {due_date} and has not been submitted. Please submit it in LedgerLine as soon as you can.\n\nThank you,\nCouncil Finance'),
  (14, 'Second notice: {period} report past due', E'Hello,\n\nThe {period} report for {initiative} from {organization} is now two weeks past its {due_date} due date. Please submit it in LedgerLine, or reply to this message if you need help.\n\nThank you,\nCouncil Finance')
) AS d(offset_days, subject, body);
