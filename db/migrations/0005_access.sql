CREATE OR REPLACE FUNCTION app.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM app_user WHERE id = app.uid() AND active
$$;

CREATE OR REPLACE FUNCTION app.org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM app_user WHERE id = app.uid() AND active
$$;

CREATE OR REPLACE FUNCTION app.ein() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.ein FROM app_user u JOIN organization o ON o.id = u.org_id WHERE u.id = app.uid() AND u.active
$$;

CREATE OR REPLACE FUNCTION app.is_finance() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(app.role() IN ('finance_viewer', 'finance_analyst', 'finance_admin'), false)
$$;

CREATE OR REPLACE FUNCTION app.can_review() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(app.role() IN ('finance_analyst', 'finance_admin'), false)
$$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(app.role() = 'finance_admin', false)
$$;

CREATE OR REPLACE FUNCTION app.submission_org(p_submission uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.org_id FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE s.id = p_submission
$$;

CREATE OR REPLACE FUNCTION app.submission_status(p_submission uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM submission WHERE id = p_submission
$$;

CREATE OR REPLACE FUNCTION app.can_access_path(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN app.is_finance() THEN true
    WHEN app.ein() IS NULL THEN false
    ELSE split_part(p_path, '/', 1) = app.ein()
  END
$$;

ALTER TABLE fiscal_year ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE question ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_reset ENABLE ROW LEVEL SECURITY;

CREATE POLICY signed_in_read ON fiscal_year FOR SELECT TO app_server USING (app.uid() IS NOT NULL);
CREATE POLICY signed_in_read ON reporting_period FOR SELECT TO app_server USING (app.uid() IS NOT NULL);
CREATE POLICY signed_in_read ON app_setting FOR SELECT TO app_server USING (app.uid() IS NOT NULL);
CREATE POLICY admin_write ON app_setting FOR UPDATE TO app_server USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY org_read ON organization FOR SELECT TO app_server
  USING (app.is_finance() OR id = app.org_id());

CREATE POLICY contact_read ON contact FOR SELECT TO app_server
  USING (app.is_finance() OR org_id = app.org_id());

CREATE POLICY user_read ON app_user FOR SELECT TO app_server
  USING (app.is_finance() OR id = app.uid() OR (org_id IS NOT NULL AND org_id = app.org_id()));
CREATE POLICY user_admin_update ON app_user FOR UPDATE TO app_server
  USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY initiative_read ON initiative FOR SELECT TO app_server USING (app.uid() IS NOT NULL);
CREATE POLICY initiative_admin_insert ON initiative FOR INSERT TO app_server WITH CHECK (app.is_admin());
CREATE POLICY initiative_admin_update ON initiative FOR UPDATE TO app_server USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY assignment_read ON assignment FOR SELECT TO app_server
  USING (app.is_finance() OR org_id = app.org_id());
CREATE POLICY assignment_admin_insert ON assignment FOR INSERT TO app_server WITH CHECK (app.is_admin());

CREATE POLICY question_read ON question FOR SELECT TO app_server USING (app.uid() IS NOT NULL);
CREATE POLICY question_admin_insert ON question FOR INSERT TO app_server WITH CHECK (app.is_admin());

CREATE POLICY form_read ON form_version FOR SELECT TO app_server
  USING (app.is_finance() OR status <> 'draft');
CREATE POLICY form_admin_insert ON form_version FOR INSERT TO app_server WITH CHECK (app.is_admin() AND status = 'draft');
CREATE POLICY form_admin_update ON form_version FOR UPDATE TO app_server
  USING (app.is_admin() AND status = 'draft') WITH CHECK (app.is_admin() AND status = 'draft');

CREATE POLICY submission_read ON submission FOR SELECT TO app_server
  USING (app.is_finance() OR app.submission_org(id) = app.org_id());
CREATE POLICY submission_cbo_insert ON submission FOR INSERT TO app_server
  WITH CHECK (
    app.role() = 'cbo_submitter'
    AND status = 'draft'
    AND EXISTS (SELECT 1 FROM assignment a WHERE a.id = assignment_id AND a.org_id = app.org_id())
  );
CREATE POLICY submission_touch ON submission FOR UPDATE TO app_server
  USING (
    (app.role() = 'cbo_submitter' AND app.submission_org(id) = app.org_id() AND status IN ('draft', 'returned'))
    OR app.can_review()
  )
  WITH CHECK (
    (app.role() = 'cbo_submitter' AND app.submission_org(id) = app.org_id())
    OR app.can_review()
  );

CREATE POLICY answer_read ON answer FOR SELECT TO app_server
  USING (app.is_finance() OR app.submission_org(submission_id) = app.org_id());
CREATE POLICY answer_cbo_write ON answer FOR ALL TO app_server
  USING (app.role() = 'cbo_submitter' AND app.submission_org(submission_id) = app.org_id() AND app.submission_status(submission_id) IN ('draft', 'returned'))
  WITH CHECK (app.role() = 'cbo_submitter' AND app.submission_org(submission_id) = app.org_id() AND app.submission_status(submission_id) IN ('draft', 'returned'));

CREATE POLICY budget_read ON budget_line FOR SELECT TO app_server
  USING (app.is_finance() OR app.submission_org(submission_id) = app.org_id());
CREATE POLICY budget_cbo_write ON budget_line FOR ALL TO app_server
  USING (app.role() = 'cbo_submitter' AND app.submission_org(submission_id) = app.org_id() AND app.submission_status(submission_id) IN ('draft', 'returned'))
  WITH CHECK (app.role() = 'cbo_submitter' AND app.submission_org(submission_id) = app.org_id() AND app.submission_status(submission_id) IN ('draft', 'returned'));

CREATE POLICY attachment_read ON attachment FOR SELECT TO app_server
  USING (app.is_finance() OR app.submission_org(submission_id) = app.org_id());
CREATE POLICY attachment_cbo_insert ON attachment FOR INSERT TO app_server
  WITH CHECK (
    app.role() = 'cbo_submitter'
    AND app.submission_org(submission_id) = app.org_id()
    AND app.submission_status(submission_id) IN ('draft', 'returned')
    AND app.can_access_path(path)
  );

CREATE POLICY flag_read ON flag FOR SELECT TO app_server USING (app.is_finance());
CREATE POLICY flag_review_insert ON flag FOR INSERT TO app_server WITH CHECK (app.can_review());
CREATE POLICY flag_review_update ON flag FOR UPDATE TO app_server USING (app.can_review()) WITH CHECK (app.can_review());

CREATE POLICY outbox_read ON outbox FOR SELECT TO app_server
  USING (app.is_finance() OR (org_id IS NOT NULL AND org_id = app.org_id()));

CREATE POLICY ai_read ON ai_action FOR SELECT TO app_server USING (app.is_finance());
CREATE POLICY ai_insert ON ai_action FOR INSERT TO app_server WITH CHECK (app.can_review() AND created_by = app.uid());
CREATE POLICY ai_decide ON ai_action FOR UPDATE TO app_server USING (app.can_review()) WITH CHECK (app.can_review());

CREATE POLICY revision_read ON submission_revision FOR SELECT TO app_server
  USING (app.is_finance() OR app.submission_org(submission_id) = app.org_id());

CREATE POLICY audit_read ON audit_event FOR SELECT TO app_server
  USING (
    app.is_finance()
    OR (entity = 'submission' AND app.submission_org(entity_id::uuid) = app.org_id())
  );
CREATE POLICY audit_insert ON audit_event FOR INSERT TO app_server
  WITH CHECK (app.uid() IS NOT NULL AND actor_id = app.uid());

GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_server;
REVOKE SELECT ON demo_reset FROM app_server;
REVOKE SELECT (password_hash) ON app_user FROM app_server;
GRANT INSERT, UPDATE, DELETE ON answer, budget_line TO app_server;
GRANT INSERT ON attachment, flag, ai_action, audit_event, initiative, assignment, question, form_version, submission TO app_server;
GRANT UPDATE (status, resolved_by, resolved_at) ON flag TO app_server;
GRANT UPDATE (status, approver, decided_at, edit_diff) ON ai_action TO app_server;
GRANT UPDATE (name, category, description, total_funding) ON initiative TO app_server;
GRANT UPDATE (definition) ON form_version TO app_server;
GRANT UPDATE (role, active) ON app_user TO app_server;
GRANT UPDATE (value) ON app_setting TO app_server;
GRANT UPDATE (lock_version, updated_at, updated_by) ON submission TO app_server;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_server;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_server;
