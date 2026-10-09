export const ASSIGNMENT_STATE = `
  ay AS (
    SELECT a.id, a.org_id, a.initiative_id, a.award_amount, i.status AS initiative_status,
           sy.status AS ye_status,
           (EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = a.initiative_id AND fv.status = 'published') AND (sy.id IS NULL OR sy.status = 'draft') AND (SELECT due_on FROM reporting_period WHERE id = 'FY26-YE') < $1::date) AS ye_missing
    FROM assignment a
    JOIN initiative i ON i.id = a.initiative_id
    LEFT JOIN submission sy ON sy.assignment_id = a.id AND sy.period_id = 'FY26-YE'
  )`;

export const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island", "Citywide"] as const;
export const ORG_TYPES = [
  { value: "cbo", label: "Community organization" },
  { value: "agency", label: "City agency" },
] as const;

export function orgTypeLabel(value: string): string {
  return ORG_TYPES.find((t) => t.value === value)?.label ?? value;
}
