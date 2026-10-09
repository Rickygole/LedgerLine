CREATE OR REPLACE FUNCTION app.write_audit(p_entity text, p_entity_id text, p_action text, p_note text, p_before jsonb, p_after jsonb, p_ai uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO audit_event (actor_id, entity, entity_id, action, note, before, after, ai_action_id)
  VALUES (app.uid(), p_entity, p_entity_id, p_action, p_note, p_before, p_after, p_ai)
$$;

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

CREATE OR REPLACE FUNCTION app.correct_answer(
  p_submission uuid,
  p_question_key text,
  p_value jsonb,
  p_reason text,
  p_snapshot jsonb
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.publish_form(p_form uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_form form_version%ROWTYPE;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'publishing requires a finance admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_form FROM form_version WHERE id = p_form FOR UPDATE;
  IF NOT FOUND OR v_form.status <> 'draft' THEN
    RAISE EXCEPTION 'only drafts can be published' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE form_version SET status = 'superseded' WHERE initiative_id = v_form.initiative_id AND status = 'published';
  UPDATE form_version SET status = 'published', published_by = app.uid(), published_at = now() WHERE id = p_form;
  PERFORM app.write_audit('form_version', p_form::text, 'publish', NULL,
    NULL, jsonb_build_object('initiative_id', v_form.initiative_id, 'version', v_form.version), NULL);
  RETURN v_form.version;
END;
$$;

REVOKE ALL ON FUNCTION app.write_audit(text, text, text, text, jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.transition_submission(uuid, text, int, jsonb, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.correct_answer(uuid, text, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.publish_form(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.write_audit(text, text, text, text, jsonb, jsonb, uuid) TO app_server;
GRANT EXECUTE ON FUNCTION app.transition_submission(uuid, text, int, jsonb, text, jsonb, uuid) TO app_server;
GRANT EXECUTE ON FUNCTION app.correct_answer(uuid, text, jsonb, text, jsonb) TO app_server;
GRANT EXECUTE ON FUNCTION app.publish_form(uuid) TO app_server;
