ALTER POLICY answer_read ON answer
  USING ((SELECT app.is_finance()) OR (app.submission_org(submission_id) = (SELECT app.org_id())));

ALTER POLICY budget_read ON budget_line
  USING ((SELECT app.is_finance()) OR (app.submission_org(submission_id) = (SELECT app.org_id())));

ALTER POLICY attachment_read ON attachment
  USING ((SELECT app.is_finance()) OR (app.submission_org(submission_id) = (SELECT app.org_id())));

ALTER POLICY revision_read ON submission_revision
  USING ((SELECT app.is_finance()) OR (app.submission_org(submission_id) = (SELECT app.org_id())));

ALTER POLICY submission_read ON submission
  USING ((SELECT app.is_finance()) OR (app.submission_org(id) = (SELECT app.org_id())));

ALTER POLICY assignment_read ON assignment
  USING ((SELECT app.is_finance()) OR (org_id = (SELECT app.org_id())));

ALTER POLICY sponsor_read ON assignment_sponsor
  USING (
    (SELECT app.is_finance())
    OR EXISTS (SELECT 1 FROM assignment a WHERE a.id = assignment_sponsor.assignment_id AND a.org_id = (SELECT app.org_id()))
  );

ALTER POLICY org_read ON organization
  USING ((SELECT app.is_finance()) OR (id = (SELECT app.org_id())));

ALTER POLICY contact_read ON contact
  USING ((SELECT app.is_finance()) OR (org_id = (SELECT app.org_id())));

ALTER POLICY flag_read ON flag
  USING ((SELECT app.is_finance()));

ALTER POLICY audit_read ON audit_event
  USING ((SELECT app.is_finance()) OR (entity = 'submission' AND app.submission_org(entity_id::uuid) = (SELECT app.org_id())));

ALTER POLICY outbox_read ON outbox
  USING (
    ((SELECT app.is_finance()) OR (org_id IS NOT NULL AND org_id = (SELECT app.org_id())))
    AND (template <> ALL (ARRAY['password_reset', 'password_set']) OR (SELECT app.is_admin()))
    AND (template NOT LIKE 'security\_%' OR (SELECT app.is_admin()))
  );
