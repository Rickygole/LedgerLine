CREATE OR REPLACE FUNCTION app.in_scope_audit(p_entity text, p_entity_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
    WHEN p_entity = 'submission' THEN app.in_scope_submission(p_entity_id::uuid)
    WHEN p_entity = 'initiative' THEN app.in_scope(p_entity_id::uuid)
    WHEN p_entity = 'form_version' THEN
      coalesce((SELECT app.in_scope(f.initiative_id) FROM form_version f WHERE f.id = p_entity_id::uuid), false)
    WHEN p_entity = 'assignment' THEN
      coalesce((SELECT app.in_scope(a.initiative_id) FROM assignment a WHERE a.id = p_entity_id::uuid), false)
    WHEN p_entity = 'organization' THEN app.in_scope_org(p_entity_id::uuid)
    ELSE false
  END
$$;
