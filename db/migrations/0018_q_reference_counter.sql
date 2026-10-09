CREATE TABLE reference_counter (
  period_id text PRIMARY KEY REFERENCES reporting_period(id),
  last_value int NOT NULL
);

CREATE OR REPLACE FUNCTION app.next_reference_no(p_period text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
  v_next int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reporting_period WHERE id = p_period) THEN
    RAISE EXCEPTION 'reporting period not found' USING ERRCODE = 'check_violation';
  END IF;
  v_code := coalesce(
    substring(p_period from '^FY(\d{2})-[A-Z]+$') || substring(p_period from '^FY\d{2}-([A-Z]+)$'),
    upper(regexp_replace(p_period, '[^A-Za-z0-9]', '', 'g'))
  );
  INSERT INTO reference_counter (period_id, last_value)
  SELECT p_period, coalesce(max(substring(reference_no from '-(0\d{4})$')::int), 0)
  FROM submission WHERE period_id = p_period
  ON CONFLICT (period_id) DO NOTHING;
  UPDATE reference_counter SET last_value = last_value + 1 WHERE period_id = p_period RETURNING last_value INTO v_next;
  RETURN 'LL-' || v_code || '-' || lpad(v_next::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION app.next_reference_no(text) TO app_server;
