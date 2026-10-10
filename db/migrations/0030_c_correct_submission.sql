CREATE OR REPLACE FUNCTION app.correct_submission(
  p_submission uuid,
  p_answers jsonb,
  p_budget jsonb,
  p_reason text,
  p_snapshot jsonb,
  p_before jsonb,
  p_after jsonb
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

REVOKE ALL ON FUNCTION app.correct_submission(uuid, jsonb, jsonb, text, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.correct_submission(uuid, jsonb, jsonb, text, jsonb, jsonb, jsonb) TO app_server;
