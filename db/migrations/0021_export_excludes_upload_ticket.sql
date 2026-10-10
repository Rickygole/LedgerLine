CREATE OR REPLACE FUNCTION app.export_tables() RETURNS TABLE (table_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.relname::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname NOT IN ('schema_migration', 'auth_attempt', 'password_token', 'revoked_session', 'upload_ticket', 'demo_reset')
  ORDER BY c.relname
$$;
