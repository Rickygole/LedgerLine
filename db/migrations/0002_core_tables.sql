CREATE TABLE fiscal_year (
  id text PRIMARY KEY,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  CHECK (ends_on > starts_on)
);

CREATE TABLE organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ein text NOT NULL UNIQUE CHECK (ein ~ '^\d{2}-\d{7}$'),
  legal_name text NOT NULL,
  dba_name text,
  org_type text NOT NULL CHECK (org_type IN ('cbo', 'agency')),
  borough text NOT NULL CHECK (borough IN ('Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island', 'Citywide')),
  council_district int CHECK (council_district BETWEEN 1 AND 51),
  address_line text NOT NULL,
  city text NOT NULL DEFAULT 'New York',
  state text NOT NULL DEFAULT 'NY',
  postal_code text NOT NULL,
  phone text,
  website text,
  mission text,
  founded_year int,
  annual_budget numeric(14, 2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  full_name text NOT NULL,
  title text NOT NULL,
  email text NOT NULL,
  phone text,
  is_primary boolean NOT NULL DEFAULT false
);
CREATE INDEX contact_org_idx ON contact(org_id);

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  title text,
  role text NOT NULL CHECK (role IN ('cbo_submitter', 'finance_viewer', 'finance_analyst', 'finance_admin')),
  org_id uuid REFERENCES organization(id),
  password_hash text,
  can_sign_in boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'cbo_submitter') = (org_id IS NOT NULL))
);

CREATE TABLE initiative (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  fiscal_year_id text NOT NULL REFERENCES fiscal_year(id),
  total_funding numeric(14, 2) NOT NULL CHECK (total_funding >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reporting_period (
  id text PRIMARY KEY,
  fiscal_year_id text NOT NULL REFERENCES fiscal_year(id),
  label text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  due_on date NOT NULL,
  CHECK (due_on >= ends_on)
);

CREATE TABLE assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES initiative(id),
  org_id uuid NOT NULL REFERENCES organization(id),
  award_amount numeric(14, 2) NOT NULL CHECK (award_amount > 0),
  sponsoring_agency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiative_id, org_id)
);
CREATE INDEX assignment_org_idx ON assignment(org_id);

CREATE TABLE app_setting (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
