export const ASSIGNMENT_STATE = `
  ay AS (
    SELECT a.id, a.org_id, a.initiative_id, a.award_amount, ob.submission_status AS period_status,
           ((ob.submission_status IS NULL OR ob.submission_status = 'draft') AND ob.due_on < $1::date) AS is_missing
    FROM obligation ob
    JOIN assignment a ON a.id = ob.assignment_id
    WHERE ob.period_id = $2
  )`;

export const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island", "Citywide"] as const;
export const ORG_TYPES = [
  { value: "cbo", label: "Community organization" },
  { value: "agency", label: "City agency" },
] as const;

export function orgTypeLabel(value: string): string {
  return ORG_TYPES.find((t) => t.value === value)?.label ?? value;
}

export const SPONSORS_SQL = `(SELECT jsonb_agg(jsonb_build_object('district', sp.district, 'name', cm.full_name, 'amount', sp.amount::float8) ORDER BY sp.amount DESC, sp.district)
  FROM assignment_sponsor sp JOIN council_member cm ON cm.district = sp.district WHERE sp.assignment_id = a.id)`;

export const PERIODS_SQL = `(SELECT jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'due_on', p.due_on::text, 'status', ob.submission_status) ORDER BY p.due_on)
  FROM obligation ob JOIN reporting_period p ON p.id = ob.period_id WHERE ob.assignment_id = a.id)`;
