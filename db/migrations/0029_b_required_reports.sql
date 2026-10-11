ALTER TABLE reporting_period
  ADD COLUMN initiative_id uuid REFERENCES initiative(id);
CREATE INDEX reporting_period_initiative_idx ON reporting_period(initiative_id) WHERE initiative_id IS NOT NULL;

CREATE TABLE initiative_period_exclusion (
  initiative_id uuid NOT NULL REFERENCES initiative(id),
  period_id text NOT NULL REFERENCES reporting_period(id),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (initiative_id, period_id)
);

ALTER TABLE initiative_period_exclusion ENABLE ROW LEVEL SECURITY;
CREATE POLICY signed_in_read ON initiative_period_exclusion FOR SELECT TO app_server USING (app.uid() IS NOT NULL);
GRANT SELECT ON initiative_period_exclusion TO app_server;

CREATE OR REPLACE FUNCTION app.requires_period(p_initiative uuid, p_period text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM initiative i
    JOIN reporting_period p ON p.fiscal_year_id = i.fiscal_year_id AND (p.initiative_id IS NULL OR p.initiative_id = i.id)
    WHERE i.id = p_initiative AND p.id = p_period
      AND NOT EXISTS (SELECT 1 FROM initiative_period_exclusion x WHERE x.initiative_id = i.id AND x.period_id = p.id)
  )
$$;

GRANT EXECUTE ON FUNCTION app.requires_period(uuid, text) TO app_server;

CREATE OR REPLACE VIEW obligation WITH (security_invoker = true) AS
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
JOIN reporting_period p ON p.fiscal_year_id = i.fiscal_year_id AND (p.initiative_id IS NULL OR p.initiative_id = i.id)
LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = p.id
WHERE s.id IS NOT NULL
   OR (
     i.retired_on IS NULL
     AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
     AND NOT EXISTS (SELECT 1 FROM initiative_period_exclusion x WHERE x.initiative_id = i.id AND x.period_id = p.id)
   );

CREATE OR REPLACE FUNCTION app.submission_period_matches_fiscal_year()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_initiative uuid;
BEGIN
  SELECT a.initiative_id INTO v_initiative FROM assignment a WHERE a.id = NEW.assignment_id;
  IF v_initiative IS NULL OR NOT app.requires_period(v_initiative, NEW.period_id) THEN
    RAISE EXCEPTION 'reporting period % is not owed by this assignment', NEW.period_id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM initiative i WHERE i.id = v_initiative AND i.retired_on IS NOT NULL) THEN
    RAISE EXCEPTION 'this initiative is retired and no longer accepts new reports' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.public_calendar(p_today date)
RETURNS TABLE (
  kind text,
  id text,
  fiscal_year_id text,
  label text,
  starts_on date,
  ends_on date,
  due_on date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_year AS (
    SELECT f.id, f.starts_on, f.ends_on
    FROM fiscal_year f
    WHERE p_today BETWEEN f.starts_on AND f.ends_on
    ORDER BY f.starts_on DESC
    LIMIT 1
  )
  SELECT 'fiscal_year'::text, f.id, f.id, f.id, f.starts_on, f.ends_on, NULL::date
  FROM current_year f
  UNION ALL
  SELECT 'period'::text, rp.id, rp.fiscal_year_id, rp.label, rp.starts_on, rp.ends_on, rp.due_on
  FROM reporting_period rp, current_year f
  WHERE rp.initiative_id IS NULL
    AND (rp.fiscal_year_id = f.id OR (rp.due_on BETWEEN f.starts_on AND f.ends_on))
$$;

CREATE OR REPLACE FUNCTION app.set_required_period(p_initiative uuid, p_period text, p_required boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_init initiative%ROWTYPE;
  v_period reporting_period%ROWTYPE;
  v_left int;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'required reports can only be changed by a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_init FROM initiative WHERE id = p_initiative FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'initiative not found' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_period FROM reporting_period WHERE id = p_period;
  IF NOT FOUND OR v_period.initiative_id IS NOT NULL OR v_period.fiscal_year_id <> v_init.fiscal_year_id THEN
    RAISE EXCEPTION 'that reporting period does not belong to this initiative''s fiscal year' USING ERRCODE = 'check_violation';
  END IF;
  IF p_required THEN
    DELETE FROM initiative_period_exclusion WHERE initiative_id = p_initiative AND period_id = p_period;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    PERFORM app.write_audit('initiative', p_initiative::text, 'required_report_added', v_period.label, NULL,
      jsonb_build_object('period_id', p_period), NULL);
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM initiative_period_exclusion WHERE initiative_id = p_initiative AND period_id = p_period) THEN
    RETURN;
  END IF;
  IF v_init.status <> 'active' THEN
    RAISE EXCEPTION 'a retired initiative cannot change its required reports' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM submission s JOIN assignment a ON a.id = s.assignment_id
    WHERE a.initiative_id = p_initiative AND s.period_id = p_period
  ) THEN
    RAISE EXCEPTION 'a report for % has already been started, so it cannot be removed', v_period.label USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO v_left
  FROM reporting_period p
  WHERE p.fiscal_year_id = v_init.fiscal_year_id AND (p.initiative_id IS NULL OR p.initiative_id = p_initiative)
    AND p.id <> p_period
    AND NOT EXISTS (SELECT 1 FROM initiative_period_exclusion x WHERE x.initiative_id = p_initiative AND x.period_id = p.id);
  IF v_left = 0 THEN
    RAISE EXCEPTION 'an initiative must require at least one report' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO initiative_period_exclusion (initiative_id, period_id, created_by) VALUES (p_initiative, p_period, app.uid());
  PERFORM app.write_audit('initiative', p_initiative::text, 'required_report_removed', v_period.label,
    jsonb_build_object('period_id', p_period), NULL, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION app.add_custom_report(p_initiative uuid, p_label text, p_starts date, p_ends date, p_due date) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_init initiative%ROWTYPE;
  v_fy fiscal_year%ROWTYPE;
  v_label text := btrim(coalesce(p_label, ''));
  v_starts date;
  v_ends date;
  v_id text;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'required reports can only be changed by a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_label = '' OR length(v_label) > 80 THEN
    RAISE EXCEPTION 'the report name must be 1 to 80 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF p_due IS NULL THEN
    RAISE EXCEPTION 'a due date is required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_init FROM initiative WHERE id = p_initiative FOR UPDATE;
  IF NOT FOUND OR v_init.status <> 'active' THEN
    RAISE EXCEPTION 'only an active initiative can require another report' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_fy FROM fiscal_year WHERE id = v_init.fiscal_year_id;
  v_starts := coalesce(p_starts, v_fy.starts_on);
  v_ends := coalesce(p_ends, least(p_due, v_fy.ends_on));
  IF v_ends < v_starts THEN
    RAISE EXCEPTION 'the report cannot end before it starts' USING ERRCODE = 'check_violation';
  END IF;
  IF p_due < v_ends THEN
    RAISE EXCEPTION 'the due date cannot be before the end of the period covered' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM reporting_period p
    WHERE p.fiscal_year_id = v_init.fiscal_year_id AND (p.initiative_id IS NULL OR p.initiative_id = p_initiative)
      AND lower(btrim(p.label)) = lower(v_label)
  ) THEN
    RAISE EXCEPTION 'this initiative already has a report with that name' USING ERRCODE = 'unique_violation';
  END IF;
  v_id := v_init.fiscal_year_id || '-X' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  INSERT INTO reporting_period (id, fiscal_year_id, label, starts_on, ends_on, due_on, initiative_id)
  VALUES (v_id, v_init.fiscal_year_id, v_label, v_starts, v_ends, p_due, p_initiative);
  PERFORM app.restore_reminder_defaults(v_id);
  PERFORM app.write_audit('initiative', p_initiative::text, 'custom_report_added', v_label, NULL,
    jsonb_build_object('period_id', v_id, 'due_on', p_due, 'starts_on', v_starts, 'ends_on', v_ends), NULL);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.remove_custom_report(p_initiative uuid, p_period text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period reporting_period%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'required reports can only be changed by a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_period FROM reporting_period WHERE id = p_period AND initiative_id = p_initiative FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that custom report was not found' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM submission WHERE period_id = p_period) THEN
    RAISE EXCEPTION 'a report for % has already been started, so it cannot be removed', v_period.label USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM reminder_rule WHERE period_id = p_period;
  DELETE FROM reference_counter WHERE period_id = p_period;
  DELETE FROM initiative_period_exclusion WHERE period_id = p_period;
  DELETE FROM reporting_period WHERE id = p_period;
  PERFORM app.write_audit('initiative', p_initiative::text, 'custom_report_removed', v_period.label,
    jsonb_build_object('period_id', p_period, 'due_on', v_period.due_on), NULL, NULL);
END;
$$;

REVOKE ALL ON FUNCTION app.set_required_period(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_required_period(uuid, text, boolean) TO app_server;
REVOKE ALL ON FUNCTION app.add_custom_report(uuid, text, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.add_custom_report(uuid, text, date, date, date) TO app_server;
REVOKE ALL ON FUNCTION app.remove_custom_report(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.remove_custom_report(uuid, text) TO app_server;
