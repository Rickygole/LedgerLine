ALTER POLICY audit_read ON audit_event
  USING (
    (SELECT app.is_finance())
    OR (
      entity = 'submission'
      AND action NOT LIKE 'flag\_%'
      AND app.submission_org(entity_id::uuid) = (SELECT app.org_id())
    )
  );
