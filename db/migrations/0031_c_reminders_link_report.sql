CREATE FUNCTION app.reminder_report(p_key text, p_org uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period text;
  v_fired date;
  v_id uuid;
BEGIN
  SELECT period_id INTO v_period FROM reminder_rule WHERE id::text = split_part(p_key, ':', 1);
  IF v_period IS NULL THEN
    RETURN NULL;
  END IF;
  v_fired := split_part(p_key, ':', 3)::date;
  SELECT (array_agg(s.id))[1] INTO v_id
  FROM submission s
  JOIN assignment a ON a.id = s.assignment_id
  WHERE a.org_id = p_org
    AND s.period_id = v_period
    AND (s.submitted_at IS NULL OR (s.submitted_at AT TIME ZONE 'America/New_York')::date > v_fired)
  HAVING count(*) = 1;
  RETURN v_id;
END;
$$;

CREATE FUNCTION app.link_reminder_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.template = 'reminder' AND NEW.submission_id IS NULL AND NEW.org_id IS NOT NULL AND NEW.reminder_key IS NOT NULL THEN
    NEW.submission_id := app.reminder_report(NEW.reminder_key, NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_link_reminder_report BEFORE INSERT ON outbox
  FOR EACH ROW EXECUTE FUNCTION app.link_reminder_report();

REVOKE ALL ON FUNCTION app.reminder_report(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.link_reminder_report() FROM PUBLIC;

UPDATE outbox
SET submission_id = app.reminder_report(reminder_key, org_id)
WHERE template = 'reminder' AND submission_id IS NULL AND org_id IS NOT NULL AND reminder_key IS NOT NULL;
