CREATE TABLE incident_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (btrim(full_name) <> '' AND char_length(full_name) <= 120),
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 120),
  email text NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length(email) <= 254),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX incident_contact_email_idx ON incident_contact (lower(email));

CREATE TABLE security_incident (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL UNIQUE,
  reference text GENERATED ALWAYS AS ('INC-' || lpad(seq::text, 4, '0')) STORED,
  detected_at timestamptz NOT NULL,
  description text NOT NULL CHECK (btrim(description) <> '' AND char_length(description) <= 4000),
  affected_data text NOT NULL CHECK (btrim(affected_data) <> '' AND char_length(affected_data) <= 2000),
  severity text NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  notify_due_at timestamptz NOT NULL,
  remediation_due_at timestamptz NOT NULL,
  notified_at timestamptz NOT NULL,
  contacts_notified int NOT NULL CHECK (contacts_notified > 0),
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (notified_at >= recorded_at)
);

CREATE TABLE incident_remediation (
  id bigserial PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES security_incident(id),
  root_cause text NOT NULL CHECK (btrim(root_cause) <> '' AND char_length(root_cause) <= 4000),
  actions text NOT NULL CHECK (btrim(actions) <> '' AND char_length(actions) <= 4000),
  prevention text NOT NULL CHECK (btrim(prevention) <> '' AND char_length(prevention) <= 4000),
  completed_on date,
  recorded_by uuid NOT NULL REFERENCES app_user(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_remediation_incident_idx ON incident_remediation(incident_id, id);

CREATE TABLE incident_event (
  id bigserial PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES security_incident(id),
  at timestamptz NOT NULL DEFAULT now(),
  actor uuid NOT NULL REFERENCES app_user(id),
  kind text NOT NULL CHECK (kind IN ('recorded', 'notified', 'remediation_reported', 'remediation_completed')),
  detail text
);
CREATE INDEX incident_event_incident_idx ON incident_event(incident_id, id);

CREATE TRIGGER security_incident_append_only BEFORE UPDATE OR DELETE ON security_incident FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER security_incident_no_truncate BEFORE TRUNCATE ON security_incident FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER incident_remediation_append_only BEFORE UPDATE OR DELETE ON incident_remediation FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER incident_remediation_no_truncate BEFORE TRUNCATE ON incident_remediation FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER incident_event_append_only BEFORE UPDATE OR DELETE ON incident_event FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER incident_event_no_truncate BEFORE TRUNCATE ON incident_event FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER incident_contact_no_delete BEFORE DELETE ON incident_contact FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE incident_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incident ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_remediation ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_contact_read ON incident_contact FOR SELECT TO app_server USING (app.is_admin());
CREATE POLICY security_incident_read ON security_incident FOR SELECT TO app_server USING (app.is_admin());
CREATE POLICY incident_remediation_read ON incident_remediation FOR SELECT TO app_server USING (app.is_admin());
CREATE POLICY incident_event_read ON incident_event FOR SELECT TO app_server USING (app.is_admin());
GRANT SELECT ON incident_contact, security_incident, incident_remediation, incident_event TO app_server;

DROP POLICY outbox_read ON outbox;
CREATE POLICY outbox_read ON outbox FOR SELECT TO app_server
  USING (
    (app.is_finance() AND (template NOT LIKE 'security\_%' OR app.is_admin()))
    OR (org_id IS NOT NULL AND org_id = app.org_id())
  );

CREATE FUNCTION app.add_incident_contact(p_name text, p_title text, p_email text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'managing incident contacts requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO incident_contact (full_name, title, email, created_by)
  VALUES (btrim(p_name), btrim(p_title), lower(btrim(p_email)), app.uid())
  RETURNING id INTO v_id;
  PERFORM app.write_audit('incident_contact', v_id::text, 'incident_contact_added', btrim(p_name), NULL, jsonb_build_object('email', lower(btrim(p_email))), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.add_incident_contact(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.add_incident_contact(text, text, text) TO app_server;

CREATE FUNCTION app.set_incident_contact_active(p_contact uuid, p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact incident_contact%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'managing incident contacts requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_contact FROM incident_contact WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found' USING ERRCODE = 'check_violation';
  END IF;
  IF v_contact.active = p_active THEN
    RETURN;
  END IF;
  IF NOT p_active AND (SELECT count(*) FROM incident_contact WHERE active) <= 1 THEN
    RAISE EXCEPTION 'at least one contact must stay active' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE incident_contact SET active = p_active WHERE id = p_contact;
  PERFORM app.write_audit('incident_contact', p_contact::text, CASE WHEN p_active THEN 'incident_contact_activated' ELSE 'incident_contact_deactivated' END, v_contact.full_name, NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION app.set_incident_contact_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_incident_contact_active(uuid, boolean) TO app_server;

CREATE FUNCTION app.record_incident(p_detected_at timestamptz, p_description text, p_affected text, p_severity text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_ref text;
  v_now timestamptz := now();
  v_due timestamptz;
  v_count int;
  v_contact incident_contact%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'recording incidents requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_detected_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'detection time is in the future' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO v_count FROM incident_contact WHERE active;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'no designated contacts' USING ERRCODE = 'check_violation';
  END IF;
  v_due := p_detected_at + interval '24 hours';
  INSERT INTO security_incident (detected_at, description, affected_data, severity, notify_due_at, remediation_due_at, notified_at, contacts_notified, recorded_by, recorded_at)
  VALUES (p_detected_at, btrim(p_description), btrim(p_affected), p_severity, v_due, p_detected_at + interval '7 days', v_now, v_count, app.uid(), v_now)
  RETURNING id, reference INTO v_id, v_ref;
  FOR v_contact IN SELECT * FROM incident_contact WHERE active ORDER BY created_at, id LOOP
    INSERT INTO outbox (to_email, template, subject, body_text, created_by)
    VALUES (
      v_contact.email,
      'security_incident',
      'Security incident ' || v_ref || ' (' || p_severity || ' severity)',
      'Hello ' || v_contact.full_name || E',\n\nA security incident was recorded in LedgerLine.\n\nReference: ' || v_ref || E'\nSeverity: ' || p_severity || E'\nDetected: ' || to_char(p_detected_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') || E' Eastern\n\nWhat happened:\n' || btrim(p_description) || E'\n\nData affected:\n' || btrim(p_affected) || E'\n\nA written remediation report and a plan to reduce the risk of a repeat will follow within 7 days of detection.\n\nLedgerLine',
      app.uid()
    );
  END LOOP;
  INSERT INTO incident_event (incident_id, actor, kind, detail) VALUES (v_id, app.uid(), 'recorded', p_severity);
  INSERT INTO incident_event (incident_id, actor, kind, detail) VALUES (v_id, app.uid(), 'notified', v_count || ' designated contacts');
  PERFORM app.write_audit('security_incident', v_id::text, 'incident_recorded', v_ref || ': ' || btrim(p_description), NULL,
    jsonb_build_object('severity', p_severity, 'detected_at', p_detected_at, 'contacts_notified', v_count, 'on_time', v_now <= v_due), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.record_incident(timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_incident(timestamptz, text, text, text) TO app_server;

CREATE FUNCTION app.record_remediation(p_incident uuid, p_root_cause text, p_actions text, p_prevention text, p_completed_on date) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inc security_incident%ROWTYPE;
  v_id bigint;
  v_contact incident_contact%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'recording remediation requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_inc FROM security_incident WHERE id = p_incident;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incident not found' USING ERRCODE = 'check_violation';
  END IF;
  IF p_completed_on IS NOT NULL AND (p_completed_on < (v_inc.detected_at AT TIME ZONE 'America/New_York')::date OR p_completed_on > (now() AT TIME ZONE 'America/New_York')::date) THEN
    RAISE EXCEPTION 'completed date must fall between detection and today' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO incident_remediation (incident_id, root_cause, actions, prevention, completed_on, recorded_by)
  VALUES (p_incident, btrim(p_root_cause), btrim(p_actions), btrim(p_prevention), p_completed_on, app.uid())
  RETURNING id INTO v_id;
  FOR v_contact IN SELECT * FROM incident_contact WHERE active ORDER BY created_at, id LOOP
    INSERT INTO outbox (to_email, template, subject, body_text, created_by)
    VALUES (
      v_contact.email,
      'security_remediation',
      'Remediation report for ' || v_inc.reference || CASE WHEN p_completed_on IS NULL THEN ' (in progress)' ELSE ' (completed)' END,
      'Hello ' || v_contact.full_name || E',\n\nRemediation report for ' || v_inc.reference || E'.\n\nRoot cause:\n' || btrim(p_root_cause) || E'\n\nActions taken:\n' || btrim(p_actions) || E'\n\nPlan to reduce the risk of a repeat:\n' || btrim(p_prevention) || E'\n\nCompleted: ' || coalesce(to_char(p_completed_on, 'Mon DD, YYYY'), 'not yet') || E'\n\nLedgerLine',
      app.uid()
    );
  END LOOP;
  INSERT INTO incident_event (incident_id, actor, kind, detail) VALUES (p_incident, app.uid(), 'remediation_reported', NULL);
  IF p_completed_on IS NOT NULL THEN
    INSERT INTO incident_event (incident_id, actor, kind, detail) VALUES (p_incident, app.uid(), 'remediation_completed', p_completed_on::text);
  END IF;
  PERFORM app.write_audit('security_incident', p_incident::text, 'incident_remediation_reported', v_inc.reference, NULL,
    jsonb_build_object('completed_on', p_completed_on), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.record_remediation(uuid, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_remediation(uuid, text, text, text, date) TO app_server;
