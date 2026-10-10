DROP POLICY outbox_read ON outbox;
CREATE POLICY outbox_read ON outbox FOR SELECT TO app_server
  USING (
    (app.is_finance() OR (org_id IS NOT NULL AND org_id = app.org_id()))
    AND (template NOT IN ('password_reset', 'password_set') OR app.is_admin())
    AND (template NOT LIKE 'security\_%' OR app.is_admin())
  );
