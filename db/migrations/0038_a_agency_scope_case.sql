CREATE OR REPLACE FUNCTION app.in_scope(p_initiative uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT u.role = 'finance_admin'
            OR (u.role IN ('finance_viewer', 'finance_analyst')
                AND ((cardinality(u.scope_agencies) = 0 AND cardinality(u.scope_initiatives) = 0)
                     OR p_initiative = ANY (u.scope_initiatives)
                     OR EXISTS (
                       SELECT 1 FROM initiative i, unnest(u.scope_agencies) AS s(agency)
                       WHERE i.id = p_initiative AND upper(btrim(i.administering_agency)) = upper(btrim(s.agency)))))
     FROM app_user u WHERE u.id = app.uid() AND u.active),
    false)
$$;
