ALTER TABLE submission_revision ADD CONSTRAINT submission_revision_reason_len CHECK (reason IS NULL OR char_length(reason) <= 2000) NOT VALID;
ALTER TABLE audit_event ADD CONSTRAINT audit_event_note_len CHECK (note IS NULL OR char_length(note) <= 4000) NOT VALID;
ALTER TABLE flag ADD CONSTRAINT flag_note_len CHECK (note IS NULL OR char_length(note) <= 2000) NOT VALID;
