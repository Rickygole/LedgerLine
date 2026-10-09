CREATE FUNCTION app.export_tables() RETURNS TABLE (table_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.relname::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname NOT IN ('schema_migration', 'auth_attempt', 'password_token', 'revoked_session', 'demo_reset')
  ORDER BY c.relname
$$;
REVOKE ALL ON FUNCTION app.export_tables() FROM PUBLIC;

CREATE FUNCTION app.export_catalog() RETURNS TABLE (table_name text, column_name text, data_type text, is_nullable boolean, ordinal int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'the data package is for finance admins' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT c.relname::text, a.attname::text, format_type(a.atttypid, a.atttypmod), NOT a.attnotnull, a.attnum::int
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (SELECT t.table_name FROM app.export_tables() t)
    AND NOT (c.relname = 'app_user' AND a.attname IN ('password_hash', 'session_version'))
  ORDER BY c.relname, a.attnum;
END;
$$;
REVOKE ALL ON FUNCTION app.export_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.export_catalog() TO app_server;

CREATE FUNCTION app.export_rows(p_table text) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'the data package is for finance admins' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.export_tables() t WHERE t.table_name = p_table) THEN
    RAISE EXCEPTION 'table is not part of the data package' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT to_jsonb(t) - ARRAY[''password_hash'', ''session_version'']::text[] FROM %I t',
    p_table
  );
END;
$$;
REVOKE ALL ON FUNCTION app.export_rows(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.export_rows(text) TO app_server;
