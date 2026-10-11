ALTER TABLE reference_counter ADD COLUMN IF NOT EXISTS code text;

CREATE OR REPLACE FUNCTION app.next_reference_no(p_period text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
  v_next int;
  v_custom boolean;
  v_year text;
BEGIN
  SELECT initiative_id IS NOT NULL INTO v_custom FROM reporting_period WHERE id = p_period;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporting period not found' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reference_counter WHERE period_id = p_period) THEN
    IF v_custom THEN
      PERFORM pg_advisory_xact_lock(hashtext('reference_counter_custom_code'));
      v_year := substring(p_period from '^FY(\d{2})');
      v_code := coalesce(v_year, '00') || 'C' ||
        ((SELECT count(*) FROM reference_counter WHERE code ~ ('^' || coalesce(v_year, '00') || 'C[0-9]+$')) + 1)::text;
    END IF;
    INSERT INTO reference_counter (period_id, last_value, code)
    SELECT p_period, coalesce(max(substring(reference_no from '-(0\d{4})$')::int), 0), v_code
    FROM submission WHERE period_id = p_period
    ON CONFLICT (period_id) DO NOTHING;
  END IF;
  SELECT code INTO v_code FROM reference_counter WHERE period_id = p_period;
  v_code := coalesce(
    v_code,
    substring(p_period from '^FY(\d{2})-[A-Z]+$') || substring(p_period from '^FY\d{2}-([A-Z]+)$'),
    upper(regexp_replace(p_period, '[^A-Za-z0-9]', '', 'g'))
  );
  UPDATE reference_counter SET last_value = last_value + 1 WHERE period_id = p_period RETURNING last_value INTO v_next;
  RETURN 'LL-' || v_code || '-' || lpad(v_next::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION app.next_reference_no(text) TO app_server;
