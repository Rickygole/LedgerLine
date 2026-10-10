CREATE OR REPLACE FUNCTION app.public_calendar(p_today date)
RETURNS TABLE (
  kind text,
  id text,
  fiscal_year_id text,
  label text,
  starts_on date,
  ends_on date,
  due_on date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_year AS (
    SELECT f.id, f.starts_on, f.ends_on
    FROM fiscal_year f
    WHERE p_today BETWEEN f.starts_on AND f.ends_on
    ORDER BY f.starts_on DESC
    LIMIT 1
  )
  SELECT 'fiscal_year'::text, f.id, f.id, f.id, f.starts_on, f.ends_on, NULL::date
  FROM current_year f
  UNION ALL
  SELECT 'period'::text, rp.id, rp.fiscal_year_id, rp.label, rp.starts_on, rp.ends_on, rp.due_on
  FROM reporting_period rp, current_year f
  WHERE rp.fiscal_year_id = f.id
     OR (rp.due_on BETWEEN f.starts_on AND f.ends_on)
$$;

REVOKE ALL ON FUNCTION app.public_calendar(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.public_calendar(date) TO app_server;
