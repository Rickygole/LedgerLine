CREATE OR REPLACE FUNCTION app.carry_report_setup(p_predecessors uuid[], p_new uuid, p_to text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_excluded int;
  v_custom int := 0;
  v_count int;
  v_row record;
  v_id text;
  v_label text;
BEGIN
  INSERT INTO initiative_period_exclusion (initiative_id, period_id, created_by)
  SELECT p_new, p_to || substring(x.period_id from '^FY\d{2}(.*)$'), app.uid()
  FROM initiative_period_exclusion x
  JOIN reporting_period op ON op.id = x.period_id AND op.initiative_id IS NULL
  WHERE x.initiative_id = ANY (p_predecessors)
    AND EXISTS (SELECT 1 FROM reporting_period np WHERE np.id = p_to || substring(x.period_id from '^FY\d{2}(.*)$') AND np.initiative_id IS NULL)
  GROUP BY x.period_id
  HAVING count(*) = cardinality(p_predecessors)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_excluded = ROW_COUNT;

  FOR v_row IN
    SELECT rp.label, rp.starts_on, rp.ends_on, rp.due_on
    FROM reporting_period rp
    WHERE rp.initiative_id = ANY (p_predecessors)
    ORDER BY array_position(p_predecessors, rp.initiative_id), rp.due_on, rp.label
  LOOP
    IF EXISTS (
      SELECT 1 FROM reporting_period p
      WHERE p.fiscal_year_id = p_to AND (p.initiative_id IS NULL OR p.initiative_id = p_new)
        AND lower(btrim(p.label)) = lower(btrim(v_row.label))
    ) THEN
      CONTINUE;
    END IF;
    v_id := p_to || '-X' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    INSERT INTO reporting_period (id, fiscal_year_id, label, starts_on, ends_on, due_on, initiative_id)
    VALUES (v_id, p_to, v_row.label, (v_row.starts_on + interval '1 year')::date, (v_row.ends_on + interval '1 year')::date,
      (v_row.due_on + interval '1 year')::date, p_new);
    PERFORM app.restore_reminder_defaults(v_id);
    v_custom := v_custom + 1;
  END LOOP;

  IF v_excluded > 0 OR v_custom > 0 THEN
    PERFORM app.write_audit('initiative', p_new::text, 'rollover_reports_carried',
      v_excluded || ' removed reports and ' || v_custom || ' custom reports carried to ' || p_to, NULL,
      jsonb_build_object('exclusions', v_excluded, 'custom_reports', v_custom), NULL);
  END IF;
  RETURN jsonb_build_object('exclusions', v_excluded, 'custom_reports', v_custom);
END;
$$;

REVOKE ALL ON FUNCTION app.carry_report_setup(uuid[], uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.rollover_fiscal_year(p_from text, p_to text, p_plan jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from_n int;
  v_to_n int;
  v_year_created boolean := false;
  v_periods_created int := 0;
  v_code_n int;
  v_planned record;
  v_group record;
  v_pred record;
  v_form record;
  v_new uuid;
  v_name text;
  v_kind text;
  v_funding numeric;
  v_first uuid;
  v_n_carried int := 0;
  v_n_renamed int := 0;
  v_n_combined int := 0;
  v_n_merged int := 0;
  v_n_retired int := 0;
  v_n_skipped int := 0;
  v_n_assign int := 0;
  v_n_forms int := 0;
  v_created uuid[] := ARRAY[]::uuid[];
  v_count int;
  v_carry jsonb;
  v_n_excl int := 0;
  v_n_custom int := 0;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'rollover requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from !~ '^FY\d{2}$' OR p_to !~ '^FY\d{2}$' THEN
    RAISE EXCEPTION 'fiscal years look like FY28' USING ERRCODE = 'check_violation';
  END IF;
  v_from_n := substring(p_from from '\d+$')::int;
  v_to_n := substring(p_to from '\d+$')::int;
  IF v_to_n <= v_from_n THEN
    RAISE EXCEPTION 'the new fiscal year must come after the current one' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fiscal_year WHERE id = p_from) THEN
    RAISE EXCEPTION 'fiscal year % not found', p_from USING ERRCODE = 'check_violation';
  END IF;
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'array' THEN
    RAISE EXCEPTION 'the plan must be a list of actions' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fiscal_year WHERE id = p_to) THEN
    INSERT INTO fiscal_year (id, starts_on, ends_on)
    VALUES (p_to, make_date(2000 + v_to_n - 1, 7, 1), make_date(2000 + v_to_n, 6, 30));
    v_year_created := true;
  END IF;
  INSERT INTO reporting_period (id, fiscal_year_id, label, starts_on, ends_on, due_on)
  VALUES (p_to || '-MY', p_to, p_to || ' Mid-Year', make_date(2000 + v_to_n - 1, 7, 1), make_date(2000 + v_to_n - 1, 12, 31), make_date(2000 + v_to_n, 1, 31))
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_periods_created := v_periods_created + v_count;
  INSERT INTO reporting_period (id, fiscal_year_id, label, starts_on, ends_on, due_on)
  VALUES (p_to || '-YE', p_to, p_to || ' Year-End', make_date(2000 + v_to_n - 1, 7, 1), make_date(2000 + v_to_n, 6, 30), make_date(2000 + v_to_n, 9, 30))
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_periods_created := v_periods_created + v_count;

  SELECT coalesce(max(substring(code from '(\d+)$')::int), 0) INTO v_code_n
  FROM initiative WHERE code LIKE 'CI-' || lpad(v_to_n::text, 2, '0') || '-%';

  CREATE TEMP TABLE IF NOT EXISTS rollover_plan (
    ord int,
    initiative_id uuid,
    action text,
    new_name text,
    grp text
  ) ON COMMIT DROP;
  DELETE FROM rollover_plan;
  INSERT INTO rollover_plan (ord, initiative_id, action, new_name, grp)
  SELECT t.ord::int, (t.e ->> 'initiative_id')::uuid, coalesce(t.e ->> 'action', 'carry'), nullif(btrim(coalesce(t.e ->> 'new_name', '')), ''), nullif(btrim(coalesce(t.e ->> 'group', '')), '')
  FROM jsonb_array_elements(p_plan) WITH ORDINALITY AS t(e, ord);

  IF EXISTS (SELECT 1 FROM rollover_plan WHERE action NOT IN ('carry', 'rename', 'combine', 'retire')) THEN
    RAISE EXCEPTION 'unknown rollover action' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM rollover_plan WHERE action = 'rename' AND new_name IS NULL) THEN
    RAISE EXCEPTION 'renamed initiatives need a new name' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM rollover_plan WHERE action = 'combine' AND grp IS NULL) THEN
    RAISE EXCEPTION 'combined initiatives need a group' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM rollover_plan WHERE action = 'combine' GROUP BY grp HAVING count(*) < 2) THEN
    RAISE EXCEPTION 'a combined group needs at least two initiatives' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM rollover_plan GROUP BY initiative_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'an initiative appears twice in the plan' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM rollover_plan rp LEFT JOIN initiative i ON i.id = rp.initiative_id
    WHERE i.id IS NULL OR i.fiscal_year_id <> p_from
  ) THEN
    RAISE EXCEPTION 'the plan lists an initiative outside %', p_from USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO rollover_plan (ord, initiative_id, action, new_name, grp)
  SELECT 100000 + row_number() OVER (ORDER BY i.code), i.id, 'carry', NULL, NULL
  FROM initiative i
  WHERE i.fiscal_year_id = p_from AND i.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM rollover_plan rp WHERE rp.initiative_id = i.id);

  DELETE FROM rollover_plan rp
  USING initiative i
  WHERE i.id = rp.initiative_id AND (i.status <> 'active' OR EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.predecessor_id = i.id AND l.predecessor_id IS DISTINCT FROM l.successor_id));
  GET DIAGNOSTICS v_n_skipped = ROW_COUNT;

  FOR v_planned IN
    SELECT rp.*, i.name AS old_name, i.code AS old_code
    FROM rollover_plan rp JOIN initiative i ON i.id = rp.initiative_id
    WHERE rp.action IN ('carry', 'rename', 'retire')
    ORDER BY rp.ord
  LOOP
    IF v_planned.action = 'retire' THEN
      UPDATE initiative SET status = 'retired' WHERE id = v_planned.initiative_id;
      INSERT INTO initiative_lineage (predecessor_id, successor_id, kind, fiscal_year_id, note, created_by)
      VALUES (v_planned.initiative_id, NULL, 'retired', p_to, 'Retired at rollover to ' || p_to, app.uid());
      PERFORM app.write_audit('initiative', v_planned.initiative_id::text, 'rollover_retire', 'Retired at rollover to ' || p_to,
        jsonb_build_object('status', 'active'), jsonb_build_object('status', 'retired'), NULL);
      v_n_retired := v_n_retired + 1;
      CONTINUE;
    END IF;

    v_code_n := v_code_n + 1;
    v_name := CASE WHEN v_planned.action = 'rename' THEN v_planned.new_name ELSE v_planned.old_name END;
    v_kind := CASE WHEN v_planned.action = 'rename' THEN 'renamed' ELSE 'carried' END;
    INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding, status, created_by, administering_agency)
    SELECT 'CI-' || lpad(v_to_n::text, 2, '0') || '-' || lpad(v_code_n::text, 3, '0'), v_name, i.category, i.description, p_to, i.total_funding, 'active', app.uid(), i.administering_agency
    FROM initiative i WHERE i.id = v_planned.initiative_id
    RETURNING id INTO v_new;
    v_created := v_created || v_new;

    INSERT INTO assignment (initiative_id, org_id, award_amount, sponsoring_agency, funding_source)
    SELECT v_new, a.org_id, a.award_amount, a.sponsoring_agency, a.funding_source FROM assignment a WHERE a.initiative_id = v_planned.initiative_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_n_assign := v_n_assign + v_count;
    INSERT INTO assignment_sponsor (assignment_id, district, amount)
    SELECT na.id, s.district, s.amount
    FROM assignment oa
    JOIN assignment_sponsor s ON s.assignment_id = oa.id
    JOIN assignment na ON na.initiative_id = v_new AND na.org_id = oa.org_id
    WHERE oa.initiative_id = v_planned.initiative_id;

    SELECT definition INTO v_form FROM form_version WHERE initiative_id = v_planned.initiative_id AND status = 'published';
    IF FOUND THEN
      INSERT INTO form_version (initiative_id, version, status, definition, source, created_by, published_by, published_at)
      VALUES (v_new, 1, 'published', v_form.definition, 'manual', app.uid(), app.uid(), now());
      v_n_forms := v_n_forms + 1;
    END IF;

    INSERT INTO initiative_lineage (predecessor_id, successor_id, kind, fiscal_year_id, note, created_by)
    VALUES (v_planned.initiative_id, v_new, v_kind, p_to,
      CASE WHEN v_kind = 'renamed' THEN 'Renamed from ' || v_planned.old_name ELSE 'Carried forward to ' || p_to END, app.uid());
    PERFORM app.write_audit('initiative', v_new::text, 'rollover_' || v_planned.action,
      'From ' || v_planned.old_code || ' ' || v_planned.old_name, NULL,
      jsonb_build_object('predecessor_id', v_planned.initiative_id, 'fiscal_year_id', p_to), NULL);
    v_carry := app.carry_report_setup(ARRAY[v_planned.initiative_id], v_new, p_to);
    v_n_excl := v_n_excl + (v_carry ->> 'exclusions')::int;
    v_n_custom := v_n_custom + (v_carry ->> 'custom_reports')::int;
    IF v_kind = 'renamed' THEN v_n_renamed := v_n_renamed + 1; ELSE v_n_carried := v_n_carried + 1; END IF;
  END LOOP;

  FOR v_group IN
    SELECT grp FROM rollover_plan WHERE action = 'combine' GROUP BY grp ORDER BY min(ord)
  LOOP
    SELECT rp.initiative_id INTO v_first FROM rollover_plan rp WHERE rp.action = 'combine' AND rp.grp = v_group.grp ORDER BY rp.ord LIMIT 1;
    SELECT coalesce(max(rp.new_name), (SELECT name FROM initiative WHERE id = v_first)) INTO v_name
    FROM rollover_plan rp WHERE rp.action = 'combine' AND rp.grp = v_group.grp;
    SELECT sum(i.total_funding) INTO v_funding
    FROM initiative i JOIN rollover_plan rp ON rp.initiative_id = i.id WHERE rp.action = 'combine' AND rp.grp = v_group.grp;

    v_code_n := v_code_n + 1;
    INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding, status, created_by, administering_agency)
    SELECT 'CI-' || lpad(v_to_n::text, 2, '0') || '-' || lpad(v_code_n::text, 3, '0'), v_name, i.category, i.description, p_to, v_funding, 'active', app.uid(), i.administering_agency
    FROM initiative i WHERE i.id = v_first
    RETURNING id INTO v_new;
    v_created := v_created || v_new;

    INSERT INTO assignment (initiative_id, org_id, award_amount, sponsoring_agency, funding_source)
    SELECT v_new, a.org_id, sum(a.award_amount), min(a.sponsoring_agency), min(a.funding_source)
    FROM assignment a JOIN rollover_plan rp ON rp.initiative_id = a.initiative_id AND rp.action = 'combine' AND rp.grp = v_group.grp
    GROUP BY a.org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_n_assign := v_n_assign + v_count;
    INSERT INTO assignment_sponsor (assignment_id, district, amount)
    SELECT na.id, s.district, sum(s.amount)
    FROM assignment oa
    JOIN rollover_plan rp ON rp.initiative_id = oa.initiative_id AND rp.action = 'combine' AND rp.grp = v_group.grp
    JOIN assignment_sponsor s ON s.assignment_id = oa.id
    JOIN assignment na ON na.initiative_id = v_new AND na.org_id = oa.org_id
    GROUP BY na.id, s.district;

    SELECT definition INTO v_form FROM form_version WHERE initiative_id = v_first AND status = 'published';
    IF FOUND THEN
      INSERT INTO form_version (initiative_id, version, status, definition, source, created_by, published_by, published_at)
      VALUES (v_new, 1, 'published', v_form.definition, 'manual', app.uid(), app.uid(), now());
      v_n_forms := v_n_forms + 1;
    END IF;

    FOR v_pred IN
      SELECT i.id, i.name, i.code FROM initiative i JOIN rollover_plan rp ON rp.initiative_id = i.id
      WHERE rp.action = 'combine' AND rp.grp = v_group.grp ORDER BY rp.ord
    LOOP
      INSERT INTO initiative_lineage (predecessor_id, successor_id, kind, fiscal_year_id, note, created_by)
      VALUES (v_pred.id, v_new, 'combined', p_to, 'Combined into ' || v_name, app.uid());
      v_n_merged := v_n_merged + 1;
    END LOOP;
    v_carry := app.carry_report_setup(
      ARRAY(SELECT rp.initiative_id FROM rollover_plan rp WHERE rp.action = 'combine' AND rp.grp = v_group.grp ORDER BY rp.ord),
      v_new, p_to);
    v_n_excl := v_n_excl + (v_carry ->> 'exclusions')::int;
    v_n_custom := v_n_custom + (v_carry ->> 'custom_reports')::int;
    PERFORM app.write_audit('initiative', v_new::text, 'rollover_combine',
      'Combined ' || (SELECT string_agg(i.code, ', ' ORDER BY rp.ord) FROM initiative i JOIN rollover_plan rp ON rp.initiative_id = i.id WHERE rp.action = 'combine' AND rp.grp = v_group.grp),
      NULL, jsonb_build_object('fiscal_year_id', p_to), NULL);
    v_n_combined := v_n_combined + 1;
  END LOOP;

  PERFORM app.write_audit('fiscal_year', p_to, 'rollover', 'Rolled over from ' || p_from, NULL,
    jsonb_build_object('from', p_from, 'to', p_to, 'created', v_n_carried + v_n_renamed + v_n_combined, 'retired', v_n_retired), NULL);

  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'year_created', v_year_created,
    'periods_created', v_periods_created,
    'carried', v_n_carried,
    'renamed', v_n_renamed,
    'combined', v_n_combined,
    'combined_predecessors', v_n_merged,
    'retired', v_n_retired,
    'skipped', v_n_skipped,
    'initiatives_created', v_n_carried + v_n_renamed + v_n_combined,
    'assignments_created', v_n_assign,
    'forms_copied', v_n_forms,
    'exclusions_carried', v_n_excl,
    'custom_reports_carried', v_n_custom,
    'initiative_ids', to_jsonb(v_created)
  );
END;
$$;

REVOKE ALL ON FUNCTION app.rollover_fiscal_year(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.rollover_fiscal_year(text, text, jsonb) TO app_server;
