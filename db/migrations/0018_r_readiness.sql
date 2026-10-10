CREATE TABLE training_module (
  key text PRIMARY KEY,
  title text NOT NULL,
  audience text[] NOT NULL CHECK (audience <@ ARRAY['finance_viewer', 'finance_analyst', 'finance_admin']::text[] AND cardinality(audience) > 0),
  position int NOT NULL UNIQUE
);
INSERT INTO training_module (key, title, audience, position) VALUES
  ('orientation', 'Orientation and signing in', ARRAY['finance_viewer', 'finance_analyst', 'finance_admin'], 1),
  ('reading-reports', 'Reading submitted reports', ARRAY['finance_viewer', 'finance_analyst', 'finance_admin'], 2),
  ('review-workflow', 'Reviewing and returning reports', ARRAY['finance_analyst', 'finance_admin'], 3),
  ('exports-queries', 'Exports and saved queries', ARRAY['finance_analyst', 'finance_admin'], 4),
  ('forms-initiatives', 'Initiatives and report forms', ARRAY['finance_admin'], 5),
  ('users-roles', 'Users, roles and password resets', ARRAY['finance_admin'], 6),
  ('rollover-reminders', 'Annual rollover and reminders', ARRAY['finance_admin'], 7);

CREATE TABLE training_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  module_key text NOT NULL REFERENCES training_module(key),
  completed_on date NOT NULL,
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

CREATE TABLE uat_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_on date NOT NULL,
  scenario text NOT NULL CHECK (btrim(scenario) <> '' AND char_length(scenario) <= 160),
  tester_name text NOT NULL CHECK (btrim(tester_name) <> '' AND char_length(tester_name) <= 120),
  tester_role text NOT NULL CHECK (btrim(tester_role) <> '' AND char_length(tester_role) <= 120),
  result text NOT NULL CHECK (result IN ('passed', 'failed', 'blocked')),
  notes text CHECK (char_length(notes) <= 2000),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uat_session_scenario_idx ON uat_session(scenario, session_on DESC);

CREATE TABLE uat_defect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES uat_session(id),
  description text NOT NULL CHECK (btrim(description) <> '' AND char_length(description) <= 1000),
  severity text NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed')),
  fixed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'fixed') = (fixed_on IS NOT NULL))
);
CREATE INDEX uat_defect_session_idx ON uat_defect(session_id);

ALTER TABLE training_module ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_defect ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_module_read ON training_module FOR SELECT TO app_server USING (app.is_finance());
CREATE POLICY training_record_read ON training_record FOR SELECT TO app_server USING (app.is_admin());
CREATE POLICY uat_session_read ON uat_session FOR SELECT TO app_server USING (app.is_admin());
CREATE POLICY uat_defect_read ON uat_defect FOR SELECT TO app_server USING (app.is_admin());
GRANT SELECT ON training_module, training_record, uat_session, uat_defect TO app_server;

CREATE FUNCTION app.record_training(p_user uuid, p_module text, p_completed_on date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user app_user%ROWTYPE;
  v_module training_module%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'training records require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_user FROM app_user WHERE id = p_user;
  IF NOT FOUND OR v_user.role = 'cbo_submitter' THEN
    RAISE EXCEPTION 'training is recorded for Finance users only' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_module FROM training_module WHERE key = p_module;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown training module' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p_completed_on > (now() AT TIME ZONE 'America/New_York')::date THEN
    RAISE EXCEPTION 'completed date is in the future' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO training_record (user_id, module_key, completed_on, recorded_by) VALUES (p_user, p_module, p_completed_on, app.uid()) RETURNING id INTO v_id;
  PERFORM app.write_audit('training_record', v_id::text, 'training_recorded', v_user.full_name || ': ' || v_module.title, NULL, jsonb_build_object('completed_on', p_completed_on), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.record_training(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_training(uuid, text, date) TO app_server;

CREATE FUNCTION app.record_uat_session(p_on date, p_scenario text, p_tester text, p_tester_role text, p_result text, p_notes text, p_defects jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_defect jsonb;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'test sessions require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_on > (now() AT TIME ZONE 'America/New_York')::date THEN
    RAISE EXCEPTION 'session date is in the future' USING ERRCODE = 'check_violation';
  END IF;
  IF p_result = 'passed' AND jsonb_array_length(coalesce(p_defects, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'a passed session cannot list defects' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO uat_session (session_on, scenario, tester_name, tester_role, result, notes, recorded_by)
  VALUES (p_on, btrim(p_scenario), btrim(p_tester), btrim(p_tester_role), p_result, nullif(btrim(coalesce(p_notes, '')), ''), app.uid())
  RETURNING id INTO v_id;
  FOR v_defect IN SELECT * FROM jsonb_array_elements(coalesce(p_defects, '[]'::jsonb)) LOOP
    INSERT INTO uat_defect (session_id, description, severity) VALUES (v_id, btrim(v_defect ->> 'description'), v_defect ->> 'severity');
  END LOOP;
  PERFORM app.write_audit('uat_session', v_id::text, 'uat_recorded', btrim(p_scenario), NULL, jsonb_build_object('result', p_result, 'defects', jsonb_array_length(coalesce(p_defects, '[]'::jsonb))), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.record_uat_session(date, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_uat_session(date, text, text, text, text, text, jsonb) TO app_server;

CREATE FUNCTION app.fix_uat_defect(p_defect uuid, p_fixed_on date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_defect uat_defect%ROWTYPE;
  v_session uat_session%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'test defects require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_defect FROM uat_defect WHERE id = p_defect FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'defect not found' USING ERRCODE = 'check_violation';
  END IF;
  IF v_defect.status = 'fixed' THEN
    RETURN;
  END IF;
  SELECT * INTO v_session FROM uat_session WHERE id = v_defect.session_id;
  IF p_fixed_on < v_session.session_on OR p_fixed_on > (now() AT TIME ZONE 'America/New_York')::date THEN
    RAISE EXCEPTION 'fixed date must fall between the session and today' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE uat_defect SET status = 'fixed', fixed_on = p_fixed_on WHERE id = p_defect;
  PERFORM app.write_audit('uat_session', v_defect.session_id::text, 'uat_defect_fixed', v_session.scenario, NULL, jsonb_build_object('defect', v_defect.description), NULL);
END;
$$;
REVOKE ALL ON FUNCTION app.fix_uat_defect(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fix_uat_defect(uuid, date) TO app_server;
