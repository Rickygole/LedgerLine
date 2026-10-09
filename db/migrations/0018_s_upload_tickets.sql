CREATE TABLE upload_ticket (
  path text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES submission(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upload_ticket_expiry_idx ON upload_ticket(expires_at);
ALTER TABLE upload_ticket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON upload_ticket FROM app_server;

CREATE FUNCTION app.issue_upload_ticket(p_path text, p_submission uuid, p_expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM upload_ticket WHERE expires_at < now() - interval '2 days';
  INSERT INTO upload_ticket (path, user_id, submission_id, expires_at)
  VALUES (p_path, app.uid(), p_submission, p_expires);
END;
$$;
REVOKE ALL ON FUNCTION app.issue_upload_ticket(text, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_upload_ticket(text, uuid, timestamptz) TO app_server;

CREATE FUNCTION app.redeem_upload_ticket(p_path text, p_submission uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app.uid() IS NULL THEN
    RETURN false;
  END IF;
  UPDATE upload_ticket SET used_at = now()
  WHERE path = p_path AND user_id = app.uid() AND submission_id = p_submission
    AND used_at IS NULL AND expires_at > now();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION app.redeem_upload_ticket(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.redeem_upload_ticket(text, uuid) TO app_server;
