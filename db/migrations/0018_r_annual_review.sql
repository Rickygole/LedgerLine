CREATE TABLE annual_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id text NOT NULL UNIQUE REFERENCES fiscal_year(id),
  review_date date NOT NULL,
  check_initiatives boolean NOT NULL DEFAULT false,
  check_forms boolean NOT NULL DEFAULT false,
  check_periods boolean NOT NULL DEFAULT false,
  check_users boolean NOT NULL DEFAULT false,
  check_rules boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed_off')),
  signed_off_by uuid REFERENCES app_user(id),
  signed_off_on date,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'signed_off') = (signed_off_by IS NOT NULL AND signed_off_on IS NOT NULL)),
  CHECK (signed_off_on IS NULL OR signed_off_on >= review_date)
);

CREATE TABLE annual_review_participant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES annual_review(id),
  full_name text NOT NULL CHECK (btrim(full_name) <> '' AND char_length(full_name) <= 120),
  affiliation text NOT NULL CHECK (btrim(affiliation) <> '' AND char_length(affiliation) <= 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX annual_review_participant_idx ON annual_review_participant(review_id);

CREATE TABLE annual_review_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES annual_review(id),
  area text NOT NULL CHECK (area IN ('initiatives', 'forms', 'periods', 'users', 'rules', 'other')),
  decision text NOT NULL CHECK (btrim(decision) <> '' AND char_length(decision) <= 1000),
  decided_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX annual_review_decision_idx ON annual_review_decision(review_id);

ALTER TABLE annual_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_review_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_review_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY annual_review_read ON annual_review FOR SELECT TO app_server USING (app.is_finance());
CREATE POLICY annual_review_participant_read ON annual_review_participant FOR SELECT TO app_server USING (app.is_finance());
CREATE POLICY annual_review_decision_read ON annual_review_decision FOR SELECT TO app_server USING (app.is_finance());
GRANT SELECT ON annual_review, annual_review_participant, annual_review_decision TO app_server;

CREATE FUNCTION app.annual_review_editable(p_review uuid) RETURNS annual_review
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review annual_review%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'annual reviews require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_review FROM annual_review WHERE id = p_review FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'check_violation';
  END IF;
  IF v_review.status = 'signed_off' THEN
    RAISE EXCEPTION 'review is signed off' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_review;
END;
$$;
REVOKE ALL ON FUNCTION app.annual_review_editable(uuid) FROM PUBLIC;

CREATE FUNCTION app.start_annual_review(p_fiscal_year text, p_review_date date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'annual reviews require a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fiscal_year WHERE id = p_fiscal_year) THEN
    RAISE EXCEPTION 'fiscal year not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  INSERT INTO annual_review (fiscal_year_id, review_date, created_by) VALUES (p_fiscal_year, p_review_date, app.uid()) RETURNING id INTO v_id;
  PERFORM app.write_audit('annual_review', v_id::text, 'review_started', p_fiscal_year, NULL, jsonb_build_object('review_date', p_review_date), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.start_annual_review(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.start_annual_review(text, date) TO app_server;

CREATE FUNCTION app.set_review_check(p_review uuid, p_item text, p_done boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review annual_review%ROWTYPE;
BEGIN
  v_review := app.annual_review_editable(p_review);
  IF p_item NOT IN ('initiatives', 'forms', 'periods', 'users', 'rules') THEN
    RAISE EXCEPTION 'unknown checklist item' USING ERRCODE = 'check_violation';
  END IF;
  EXECUTE format('UPDATE annual_review SET %I = $1 WHERE id = $2', 'check_' || p_item) USING p_done, p_review;
  PERFORM app.write_audit('annual_review', p_review::text, 'review_check', v_review.fiscal_year_id || ': ' || p_item, NULL, jsonb_build_object('done', p_done), NULL);
END;
$$;
REVOKE ALL ON FUNCTION app.set_review_check(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_review_check(uuid, text, boolean) TO app_server;

CREATE FUNCTION app.add_review_participant(p_review uuid, p_name text, p_affiliation text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review annual_review%ROWTYPE;
  v_id uuid;
BEGIN
  v_review := app.annual_review_editable(p_review);
  INSERT INTO annual_review_participant (review_id, full_name, affiliation) VALUES (p_review, btrim(p_name), btrim(p_affiliation)) RETURNING id INTO v_id;
  PERFORM app.write_audit('annual_review', p_review::text, 'review_participant_added', v_review.fiscal_year_id || ': ' || btrim(p_name), NULL, NULL, NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.add_review_participant(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.add_review_participant(uuid, text, text) TO app_server;

CREATE FUNCTION app.add_review_decision(p_review uuid, p_area text, p_decision text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review annual_review%ROWTYPE;
  v_id uuid;
BEGIN
  v_review := app.annual_review_editable(p_review);
  INSERT INTO annual_review_decision (review_id, area, decision, decided_by) VALUES (p_review, p_area, btrim(p_decision), app.uid()) RETURNING id INTO v_id;
  PERFORM app.write_audit('annual_review', p_review::text, 'review_decision_added', v_review.fiscal_year_id || ': ' || p_area, NULL, jsonb_build_object('decision', btrim(p_decision)), NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app.add_review_decision(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.add_review_decision(uuid, text, text) TO app_server;

CREATE FUNCTION app.sign_off_annual_review(p_review uuid, p_signed_on date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review annual_review%ROWTYPE;
BEGIN
  v_review := app.annual_review_editable(p_review);
  IF NOT (v_review.check_initiatives AND v_review.check_forms AND v_review.check_periods AND v_review.check_users AND v_review.check_rules) THEN
    RAISE EXCEPTION 'complete every checklist item first' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM annual_review_participant WHERE review_id = p_review) THEN
    RAISE EXCEPTION 'record who took part first' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM annual_review_decision WHERE review_id = p_review) THEN
    RAISE EXCEPTION 'record at least one decision first' USING ERRCODE = 'check_violation';
  END IF;
  IF p_signed_on < v_review.review_date OR p_signed_on > (now() AT TIME ZONE 'America/New_York')::date THEN
    RAISE EXCEPTION 'sign-off date must fall between the review date and today' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE annual_review SET status = 'signed_off', signed_off_by = app.uid(), signed_off_on = p_signed_on WHERE id = p_review;
  PERFORM app.write_audit('annual_review', p_review::text, 'review_signed_off', v_review.fiscal_year_id, NULL, jsonb_build_object('signed_off_on', p_signed_on), NULL);
END;
$$;
REVOKE ALL ON FUNCTION app.sign_off_annual_review(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sign_off_annual_review(uuid, date) TO app_server;
