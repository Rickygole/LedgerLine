CREATE OR REPLACE FUNCTION app.transition_submission(
  p_submission uuid,
  p_action text,
  p_expected_lock int,
  p_snapshot jsonb,
  p_note text,
  p_outbox jsonb,
  p_ai uuid
) RETURNS TABLE (status text, revision int, lock_version int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;
