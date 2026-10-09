DROP POLICY flag_review_insert ON flag;

CREATE POLICY flag_review_insert ON flag FOR INSERT TO app_server
  WITH CHECK (app.can_review() AND (kind <> 'manual' OR app.submission_status(submission_id) <> 'draft'));
