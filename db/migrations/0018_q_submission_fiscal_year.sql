CREATE OR REPLACE FUNCTION app.submission_period_matches_fiscal_year()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM assignment a
    JOIN initiative i ON i.id = a.initiative_id
    JOIN reporting_period p ON p.fiscal_year_id = i.fiscal_year_id
    WHERE a.id = NEW.assignment_id AND p.id = NEW.period_id
  ) THEN
    RAISE EXCEPTION 'reporting period % is not owed by this assignment', NEW.period_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submission_period_fiscal_year ON submission;
CREATE TRIGGER submission_period_fiscal_year
BEFORE INSERT OR UPDATE OF assignment_id, period_id ON submission
FOR EACH ROW EXECUTE FUNCTION app.submission_period_matches_fiscal_year();
