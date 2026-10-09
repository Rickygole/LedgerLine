ALTER TABLE submission ADD COLUMN last_save_id uuid;
GRANT UPDATE (last_save_id) ON submission TO app_server;
