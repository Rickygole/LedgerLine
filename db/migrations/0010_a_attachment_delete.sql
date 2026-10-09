CREATE POLICY attachment_cbo_delete ON attachment FOR DELETE TO app_server
  USING (
    app.role() = 'cbo_submitter'
    AND app.submission_org(submission_id) = app.org_id()
    AND app.submission_status(submission_id) IN ('draft', 'returned')
  );

GRANT DELETE ON attachment TO app_server;
