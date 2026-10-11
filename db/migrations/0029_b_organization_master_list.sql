CREATE POLICY org_admin_insert ON organization FOR INSERT TO app_server WITH CHECK (app.is_admin());
CREATE POLICY org_admin_update ON organization FOR UPDATE TO app_server
  USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY contact_admin_insert ON contact FOR INSERT TO app_server WITH CHECK (app.is_admin());
CREATE POLICY contact_admin_update ON contact FOR UPDATE TO app_server
  USING (app.is_admin()) WITH CHECK (app.is_admin());

GRANT INSERT ON organization, contact TO app_server;
GRANT UPDATE (legal_name, org_type, borough, council_district, address_line, postal_code) ON organization TO app_server;
GRANT UPDATE (full_name, title, email, phone) ON contact TO app_server;
