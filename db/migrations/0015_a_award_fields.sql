ALTER TABLE initiative ADD COLUMN administering_agency text;

ALTER TABLE assignment
  ADD COLUMN funding_source text NOT NULL DEFAULT 'local' CHECK (funding_source IN ('local', 'citywide', 'speaker', 'delegation')),
  ADD COLUMN contract_status text NOT NULL DEFAULT 'awaiting' CHECK (contract_status IN ('awaiting', 'pending', 'registered')),
  ADD COLUMN contract_registered_on date,
  ADD COLUMN contract_number text,
  ADD CONSTRAINT assignment_registration_dated CHECK ((contract_status = 'registered') = (contract_registered_on IS NOT NULL)),
  ADD CONSTRAINT assignment_registered_numbered CHECK (contract_status <> 'registered' OR contract_number IS NOT NULL);

CREATE TABLE council_member (
  district int PRIMARY KEY CHECK (district BETWEEN 1 AND 51),
  full_name text NOT NULL
);

CREATE TABLE assignment_sponsor (
  assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  district int NOT NULL REFERENCES council_member(district),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (assignment_id, district)
);
CREATE INDEX assignment_sponsor_district_idx ON assignment_sponsor(district);

ALTER TABLE council_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_sponsor ENABLE ROW LEVEL SECURITY;
CREATE POLICY signed_in_read ON council_member FOR SELECT TO app_server USING (app.uid() IS NOT NULL);
CREATE POLICY sponsor_read ON assignment_sponsor FOR SELECT TO app_server
  USING (app.is_finance() OR EXISTS (SELECT 1 FROM assignment a WHERE a.id = assignment_id AND a.org_id = app.org_id()));
GRANT SELECT ON council_member, assignment_sponsor TO app_server;

CREATE OR REPLACE FUNCTION app.default_agency_for(p_category text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_category
    WHEN 'Youth Services' THEN 'DYCD'
    WHEN 'Education' THEN 'DYCD'
    WHEN 'Older Adults' THEN 'DFTA'
    WHEN 'Health' THEN 'DOHMH'
    WHEN 'Food Security' THEN 'HRA'
    WHEN 'Legal Services' THEN 'HRA'
    WHEN 'Housing' THEN 'HPD'
    WHEN 'Workforce' THEN 'SBS'
    WHEN 'Arts and Culture' THEN 'DCLA'
    WHEN 'Immigrant Services' THEN 'MOIA'
    WHEN 'Community Safety' THEN 'MOCJ'
    WHEN 'Parks and Environment' THEN 'DPR'
    ELSE NULL
  END
$$;

UPDATE initiative SET administering_agency = app.default_agency_for(category) WHERE administering_agency IS NULL;
UPDATE assignment a SET sponsoring_agency = i.administering_agency FROM initiative i WHERE i.id = a.initiative_id AND a.sponsoring_agency IS NULL;

CREATE OR REPLACE FUNCTION app.initiative_default_agency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.administering_agency IS NULL THEN
    NEW.administering_agency := app.default_agency_for(NEW.category);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER initiative_default_agency
  BEFORE INSERT ON initiative
  FOR EACH ROW EXECUTE FUNCTION app.initiative_default_agency();

CREATE OR REPLACE FUNCTION app.assignment_inherit_agency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sponsoring_agency IS NULL THEN
    SELECT administering_agency INTO NEW.sponsoring_agency FROM initiative WHERE id = NEW.initiative_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assignment_inherit_agency
  BEFORE INSERT ON assignment
  FOR EACH ROW EXECUTE FUNCTION app.assignment_inherit_agency();

CREATE UNIQUE INDEX initiative_name_year_idx ON initiative (fiscal_year_id, lower(btrim(name)));
