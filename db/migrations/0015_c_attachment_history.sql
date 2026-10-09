ALTER TABLE attachment ADD COLUMN removed_at timestamptz;
ALTER TABLE attachment ADD COLUMN removed_by uuid REFERENCES app_user(id);

GRANT UPDATE (removed_at, removed_by) ON attachment TO app_server;

CREATE POLICY attachment_cbo_remove ON attachment FOR UPDATE TO app_server
  USING (
    app.role() = 'cbo_submitter'
    AND app.submission_org(submission_id) = app.org_id()
    AND app.submission_status(submission_id) IN ('draft', 'returned')
  )
  WITH CHECK (app.role() = 'cbo_submitter' AND app.submission_org(submission_id) = app.org_id());
