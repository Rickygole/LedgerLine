ALTER TABLE app_user
  ADD COLUMN scope_agencies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN scope_initiatives uuid[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT app_user_scope_staff_only CHECK (
    role IN ('finance_viewer', 'finance_analyst')
    OR (cardinality(scope_agencies) = 0 AND cardinality(scope_initiatives) = 0)
  );

GRANT SELECT (scope_agencies, scope_initiatives), UPDATE (scope_agencies, scope_initiatives) ON app_user TO app_server;

CREATE FUNCTION app.scope_open() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT u.role IN ('finance_viewer', 'finance_analyst', 'finance_admin')
            AND (u.role = 'finance_admin' OR (cardinality(u.scope_agencies) = 0 AND cardinality(u.scope_initiatives) = 0))
     FROM app_user u WHERE u.id = app.uid() AND u.active),
    false)
$$;

CREATE FUNCTION app.in_scope(p_initiative uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT u.role = 'finance_admin'
            OR (u.role IN ('finance_viewer', 'finance_analyst')
                AND ((cardinality(u.scope_agencies) = 0 AND cardinality(u.scope_initiatives) = 0)
                     OR p_initiative = ANY (u.scope_initiatives)
                     OR EXISTS (SELECT 1 FROM initiative i WHERE i.id = p_initiative AND i.administering_agency = ANY (u.scope_agencies))))
     FROM app_user u WHERE u.id = app.uid() AND u.active),
    false)
$$;

CREATE FUNCTION app.submission_initiative(p_submission uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.initiative_id FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE s.id = p_submission
$$;

CREATE FUNCTION app.in_scope_submission(p_submission uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app.in_scope(app.submission_initiative(p_submission))
$$;

CREATE FUNCTION app.in_scope_org(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM assignment a WHERE a.org_id = p_org AND app.in_scope(a.initiative_id))
$$;

CREATE FUNCTION app.in_scope_audit(p_entity text, p_entity_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_entity = 'submission' AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN app.in_scope_submission(p_entity_id::uuid)
    WHEN p_entity = 'initiative' AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN app.in_scope(p_entity_id::uuid)
    ELSE true
  END
$$;

REVOKE ALL ON FUNCTION app.scope_open() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.in_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.submission_initiative(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.in_scope_submission(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.in_scope_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.in_scope_audit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.scope_open() TO app_server;
GRANT EXECUTE ON FUNCTION app.in_scope(uuid) TO app_server;
GRANT EXECUTE ON FUNCTION app.submission_initiative(uuid) TO app_server;
GRANT EXECUTE ON FUNCTION app.in_scope_submission(uuid) TO app_server;
GRANT EXECUTE ON FUNCTION app.in_scope_org(uuid) TO app_server;
GRANT EXECUTE ON FUNCTION app.in_scope_audit(text, text) TO app_server;

ALTER POLICY submission_read ON submission
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_submission(id)))
    OR (app.submission_org(id) = (SELECT app.org_id()))
  );

ALTER POLICY answer_read ON answer
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id)))
    OR (app.submission_org(submission_id) = (SELECT app.org_id()))
  );

ALTER POLICY budget_read ON budget_line
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id)))
    OR (app.submission_org(submission_id) = (SELECT app.org_id()))
  );

ALTER POLICY attachment_read ON attachment
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id)))
    OR (app.submission_org(submission_id) = (SELECT app.org_id()))
  );

ALTER POLICY revision_read ON submission_revision
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id)))
    OR (app.submission_org(submission_id) = (SELECT app.org_id()))
  );

ALTER POLICY assignment_read ON assignment
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope(initiative_id)))
    OR (org_id = (SELECT app.org_id()))
  );

ALTER POLICY sponsor_read ON assignment_sponsor
  USING (
    ((SELECT app.is_finance())
      AND ((SELECT app.scope_open())
        OR EXISTS (SELECT 1 FROM assignment a WHERE a.id = assignment_sponsor.assignment_id AND app.in_scope(a.initiative_id))))
    OR EXISTS (SELECT 1 FROM assignment a WHERE a.id = assignment_sponsor.assignment_id AND a.org_id = (SELECT app.org_id()))
  );

ALTER POLICY flag_read ON flag
  USING ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id)));

ALTER POLICY flag_review_insert ON flag
  WITH CHECK (
    app.can_review()
    AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id))
    AND ((kind <> 'manual') OR (app.submission_status(submission_id) <> 'draft'))
  );

ALTER POLICY flag_review_update ON flag
  USING (app.can_review() AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id)))
  WITH CHECK (app.can_review() AND ((SELECT app.scope_open()) OR app.in_scope_submission(submission_id)));

ALTER POLICY audit_read ON audit_event
  USING (
    ((SELECT app.is_finance()) AND ((SELECT app.scope_open()) OR app.in_scope_audit(entity, entity_id)))
    OR (entity = 'submission' AND action NOT LIKE 'flag\_%' AND app.submission_org(entity_id::uuid) = (SELECT app.org_id()))
  );

ALTER POLICY outbox_read ON outbox
  USING (
    (
      ((SELECT app.is_finance())
        AND ((SELECT app.scope_open())
          OR (submission_id IS NOT NULL AND app.in_scope_submission(submission_id))
          OR (submission_id IS NULL AND org_id IS NOT NULL AND app.in_scope_org(org_id))))
      OR (org_id IS NOT NULL AND org_id = (SELECT app.org_id()))
    )
    AND (template <> ALL (ARRAY['password_reset', 'password_set']) OR (SELECT app.is_admin()))
    AND (template NOT LIKE 'security\_%' OR (SELECT app.is_admin()))
  );

ALTER POLICY ai_read ON ai_action
  USING (
    (SELECT app.is_finance())
    AND ((SELECT app.scope_open()) OR app.in_scope(coalesce(initiative_id, app.submission_initiative(submission_id))))
  );

ALTER POLICY submission_touch ON submission
  USING (
    (app.role() = 'cbo_submitter' AND app.submission_org(id) = app.org_id() AND status IN ('draft', 'returned'))
    OR (app.can_review() AND ((SELECT app.scope_open()) OR app.in_scope_submission(id)))
  )
  WITH CHECK (
    (app.role() = 'cbo_submitter' AND app.submission_org(id) = app.org_id())
    OR (app.can_review() AND ((SELECT app.scope_open()) OR app.in_scope_submission(id)))
  );

CREATE OR REPLACE FUNCTION app.transition_submission(p_submission uuid, p_action text, p_expected_lock integer, p_snapshot jsonb, p_note text, p_outbox jsonb, p_ai uuid)
 RETURNS TABLE(status text, revision integer, lock_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub submission%ROWTYPE;
  v_org uuid;
  v_role text := app.role();
  v_next text;
  v_rev int;
  v_award numeric;
  v_definition jsonb;
  v_lines numeric;
  v_snapshot_lines numeric;
BEGIN
  IF app.uid() IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sub FROM submission WHERE id = p_submission FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT org_id INTO v_org FROM assignment WHERE id = v_sub.assignment_id;
  IF p_action <> 'submit' AND NOT app.in_scope(app.submission_initiative(p_submission)) THEN
    RAISE EXCEPTION 'this report is outside your access scope' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_expected_lock IS NOT NULL AND p_expected_lock <> v_sub.lock_version THEN
    RAISE EXCEPTION 'stale write' USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_action = 'submit' THEN
    IF v_role <> 'cbo_submitter' OR v_org IS DISTINCT FROM app.org_id() THEN
      RAISE EXCEPTION 'only the reporting organization can submit' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_sub.status NOT IN ('draft', 'returned') THEN
      RAISE EXCEPTION 'cannot submit from %', v_sub.status USING ERRCODE = 'check_violation';
    END IF;
    IF p_snapshot IS NULL THEN
      RAISE EXCEPTION 'snapshot required' USING ERRCODE = 'check_violation';
    END IF;
    IF p_expected_lock IS NULL THEN
      RAISE EXCEPTION 'a submit must carry the lock version it was prepared from' USING ERRCODE = 'serialization_failure';
    END IF;
    SELECT f.definition INTO v_definition FROM form_version f WHERE f.id = v_sub.form_version_id;
    SELECT a.award_amount INTO v_award FROM assignment a WHERE a.id = v_sub.assignment_id;
    SELECT coalesce(sum(b.amount), 0) INTO v_lines FROM budget_line b WHERE b.submission_id = p_submission;
    IF jsonb_typeof(p_snapshot -> 'budget') = 'array' THEN
      SELECT coalesce(sum((e ->> 'amount')::numeric), 0) INTO v_snapshot_lines FROM jsonb_array_elements(p_snapshot -> 'budget') e;
    ELSE
      v_snapshot_lines := 0;
    END IF;
    IF v_snapshot_lines <> v_lines THEN
      RAISE EXCEPTION 'the snapshot budget does not match the saved budget lines' USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce((v_definition -> 'budget' ->> 'enabled')::boolean, false)
       AND coalesce((v_definition -> 'budget' ->> 'mustEqualAward')::boolean, false)
       AND v_lines <> v_award THEN
      RAISE EXCEPTION 'the budget total must equal the award' USING ERRCODE = 'check_violation';
    END IF;
    v_next := 'submitted';
    v_rev := v_sub.revision + 1;
  ELSIF p_action = 'start_review' THEN
    IF NOT app.can_review() THEN
      RAISE EXCEPTION 'review requires a finance analyst' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_sub.status <> 'submitted' THEN
      RAISE EXCEPTION 'cannot review from %', v_sub.status USING ERRCODE = 'check_violation';
    END IF;
    v_next := 'under_review';
    v_rev := v_sub.revision;
  ELSIF p_action = 'request_update' THEN
    IF NOT app.can_review() THEN
      RAISE EXCEPTION 'requesting updates requires a finance analyst' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_sub.status NOT IN ('submitted', 'under_review') THEN
      RAISE EXCEPTION 'cannot request update from %', v_sub.status USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce(btrim(p_note), '') = '' THEN
      RAISE EXCEPTION 'a note is required' USING ERRCODE = 'check_violation';
    END IF;
    v_next := 'returned';
    v_rev := v_sub.revision;
  ELSIF p_action = 'accept' THEN
    IF NOT app.can_review() THEN
      RAISE EXCEPTION 'accepting requires a finance analyst' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_sub.status NOT IN ('submitted', 'under_review') THEN
      RAISE EXCEPTION 'cannot accept from %', v_sub.status USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM flag f WHERE f.submission_id = p_submission AND f.status = 'open' AND f.kind IN ('unbalanced', 'incomplete', 'validation')) THEN
      RAISE EXCEPTION 'resolve blocking flags before accepting' USING ERRCODE = 'check_violation';
    END IF;
    v_next := 'accepted';
    v_rev := v_sub.revision;
  ELSIF p_action = 'reopen' THEN
    IF NOT app.is_admin() THEN
      RAISE EXCEPTION 'reopening requires a finance admin' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_sub.status <> 'accepted' THEN
      RAISE EXCEPTION 'only accepted reports can be reopened' USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce(btrim(p_note), '') = '' THEN
      RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation';
    END IF;
    v_next := 'under_review';
    v_rev := v_sub.revision;
  ELSE
    RAISE EXCEPTION 'unknown action %', p_action USING ERRCODE = 'check_violation';
  END IF;

  UPDATE submission s SET
    status = v_next,
    revision = v_rev,
    lock_version = s.lock_version + 1,
    submitted_by = CASE WHEN p_action = 'submit' THEN app.uid() ELSE s.submitted_by END,
    submitted_at = CASE WHEN p_action = 'submit' THEN now() ELSE s.submitted_at END,
    updated_by = app.uid(),
    updated_at = now()
  WHERE s.id = p_submission;

  IF p_action = 'submit' THEN
    INSERT INTO submission_revision (submission_id, revision, kind, snapshot, sha256, actor)
    VALUES (p_submission, v_rev, 'submit', p_snapshot, encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex'), app.uid());
  END IF;

  IF p_outbox IS NOT NULL THEN
    INSERT INTO outbox (to_email, template, subject, body_text, submission_id, org_id, created_by)
    VALUES (p_outbox ->> 'to', p_outbox ->> 'template', p_outbox ->> 'subject', p_outbox ->> 'body', p_submission, v_org, app.uid());
  END IF;

  PERFORM app.write_audit(
    'submission', p_submission::text, p_action, p_note,
    jsonb_build_object('status', v_sub.status, 'revision', v_sub.revision),
    jsonb_build_object('status', v_next, 'revision', v_rev),
    p_ai
  );

  RETURN QUERY SELECT s.status, s.revision, s.lock_version FROM submission s WHERE s.id = p_submission;
END;
$function$;

CREATE OR REPLACE FUNCTION app.correct_answer(p_submission uuid, p_question_key text, p_value jsonb, p_reason text, p_snapshot jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub submission%ROWTYPE;
  v_old jsonb;
  v_rev int;
BEGIN
  IF NOT app.can_review() THEN
    RAISE EXCEPTION 'corrections require a finance analyst' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_sub FROM submission WHERE id = p_submission FOR UPDATE;
  IF FOUND AND NOT app.in_scope(app.submission_initiative(p_submission)) THEN
    RAISE EXCEPTION 'this report is outside your access scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT FOUND OR v_sub.status NOT IN ('submitted', 'under_review', 'accepted') THEN
    RAISE EXCEPTION 'corrections apply to submitted reports only' USING ERRCODE = 'check_violation';
  END IF;

  SELECT value INTO v_old FROM answer WHERE submission_id = p_submission AND question_key = p_question_key;
  INSERT INTO answer (submission_id, question_key, value, updated_by, updated_at)
  VALUES (p_submission, p_question_key, p_value, app.uid(), now())
  ON CONFLICT (submission_id, question_key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  v_rev := v_sub.revision + 1;
  UPDATE submission SET revision = v_rev, lock_version = lock_version + 1, updated_by = app.uid(), updated_at = now() WHERE id = p_submission;

  INSERT INTO submission_revision (submission_id, revision, kind, snapshot, sha256, actor, reason)
  VALUES (p_submission, v_rev, 'correction', p_snapshot, encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex'), app.uid(), p_reason);

  PERFORM app.write_audit(
    'submission', p_submission::text, 'correction', p_reason,
    jsonb_build_object('question_key', p_question_key, 'value', v_old),
    jsonb_build_object('question_key', p_question_key, 'value', p_value),
    NULL
  );
  RETURN v_rev;
END;
$function$;

CREATE OR REPLACE FUNCTION app.correct_submission(p_submission uuid, p_answers jsonb, p_budget jsonb, p_reason text, p_snapshot jsonb, p_before jsonb, p_after jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub submission%ROWTYPE;
  v_rev int;
  v_key text;
  v_ids uuid[];
BEGIN
  IF NOT app.can_review() THEN
    RAISE EXCEPTION 'corrections require a finance analyst' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  IF length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'the reason is too long' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_sub FROM submission WHERE id = p_submission FOR UPDATE;
  IF FOUND AND NOT app.in_scope(app.submission_initiative(p_submission)) THEN
    RAISE EXCEPTION 'this report is outside your access scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT FOUND OR v_sub.status NOT IN ('submitted', 'under_review', 'accepted') THEN
    RAISE EXCEPTION 'corrections apply to submitted reports only' USING ERRCODE = 'check_violation';
  END IF;

  IF p_answers IS NOT NULL THEN
    FOR v_key IN SELECT jsonb_object_keys(p_answers) LOOP
      INSERT INTO answer (submission_id, question_key, value, updated_by, updated_at)
      VALUES (p_submission, v_key, p_answers -> v_key, app.uid(), now())
      ON CONFLICT (submission_id, question_key) DO UPDATE
        SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
    END LOOP;
  END IF;

  IF p_budget IS NOT NULL THEN
    SELECT coalesce(array_agg((l ->> 'row_id')::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements(p_budget) AS l;
    DELETE FROM budget_line WHERE submission_id = p_submission AND NOT (row_id = ANY (v_ids));
    INSERT INTO budget_line (submission_id, row_id, position, category, description, amount, actual_spent)
    SELECT p_submission, (l ->> 'row_id')::uuid, (l ->> 'position')::int, l ->> 'category', coalesce(l ->> 'description', ''),
           (l ->> 'amount')::numeric, (l ->> 'actual_spent')::numeric
    FROM jsonb_array_elements(p_budget) AS l
    ON CONFLICT (submission_id, row_id) DO UPDATE
      SET position = excluded.position, category = excluded.category, description = excluded.description,
          amount = excluded.amount, actual_spent = excluded.actual_spent;
  END IF;

  v_rev := v_sub.revision + 1;
  UPDATE submission SET revision = v_rev, lock_version = lock_version + 1, updated_by = app.uid(), updated_at = now() WHERE id = p_submission;

  INSERT INTO submission_revision (submission_id, revision, kind, snapshot, sha256, actor, reason)
  VALUES (p_submission, v_rev, 'correction', p_snapshot, encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex'), app.uid(), p_reason);

  PERFORM app.write_audit('submission', p_submission::text, 'correction', p_reason, p_before, p_after, NULL);
  RETURN v_rev;
END;
$function$;
