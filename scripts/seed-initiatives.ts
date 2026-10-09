import type { Category } from "./seed-data";

export type InitiativeSpec = {
  name: string;
  category: Category;
  kind: "named" | "local";
  awards: [number, number];
  amount: [number, number];
  description: string;
  open?: boolean;
  renamedTo?: string;
  retiredAtRollover?: boolean;
  newInFy27?: boolean;
};

export const SMALL_PER_CATEGORY: Record<Category, number> = {
  "Youth Services": 14,
  "Older Adults": 11,
  Education: 16,
  "Health": 12,
  Housing: 10,
  Workforce: 11,
  "Food Security": 11,
  "Immigrant Services": 10,
  "Arts and Culture": 10,
  "Community Safety": 8,
  "Legal Services": 8,
  "Parks and Environment": 10,
};

export const NEW_IN_FY27_PER_CATEGORY: Partial<Record<Category, number>> = {
  "Youth Services": 1,
  "Older Adults": 1,
  Education: 1,
  Health: 1,
  Workforce: 1,
  "Food Security": 1,
  "Arts and Culture": 1,
};

export const RETIRED_AT_ROLLOVER: Partial<Record<Category, number>> = {
  "Youth Services": 1,
  Education: 1,
  Health: 1,
  Housing: 1,
  "Arts and Culture": 1,
  "Immigrant Services": 1,
};

export const AMOUNT_BY_CATEGORY: Record<Category, [number, number]> = {
  "Youth Services": [20000, 120000],
  "Older Adults": [20000, 110000],
  Education: [15000, 80000],
  Health: [25000, 140000],
  Housing: [30000, 160000],
  Workforce: [35000, 190000],
  "Food Security": [15000, 90000],
  "Immigrant Services": [20000, 120000],
  "Arts and Culture": [10000, 70000],
  "Community Safety": [35000, 190000],
  "Legal Services": [40000, 200000],
  "Parks and Environment": [10000, 65000],
};

const MODIFIERS = [
  "Neighborhood", "Community", "Gateway", "Cornerstone", "Open Door", "Common Ground", "Harbor", "Keystone", "Pathways", "Bridgeway",
  "Lantern", "Crossroads", "Evergreen", "Bedrock", "Riverside", "Sunrise", "Foundation", "Stepping Stone", "Compass", "Beacon",
  "Tri-Borough", "Citywide", "Family First", "Block by Block", "Rising", "Anchor", "Trailhead", "Frontline", "Hometown", "Shared Table",
  "Lifeline", "Milestone", "Next Chapter", "First Steps", "Good Neighbor", "Mainstreet", "Waypoint", "Fresh Start", "Landmark", "Commons",
];

const TAILS = ["Program", "Fund", "Initiative", "Network", "Collaborative", "Partnership", "Project", "Alliance", "Services", "Support"];

const FOCUS: Record<Category, string[]> = {
  "Youth Services": ["Mentoring", "Leadership", "Tutoring", "Job Readiness", "Summer Learning", "College Access", "Peer Support", "Sports and Recreation", "Digital Skills", "Youth Council"],
  "Older Adults": ["Senior Center", "Companion Visits", "Caregiver Respite", "Intergenerational", "Transportation", "Fall Prevention", "Technology Access", "Meal Delivery", "Social Club", "Benefits Counseling"],
  Education: ["Literacy", "GED Preparation", "English Language", "Math Tutoring", "Family Learning", "Library Access", "STEM Enrichment", "After-School Reading", "Citizenship Class", "Parent Workshop"],
  Health: ["Nutrition Counseling", "Diabetes Prevention", "Mental Health", "Maternal Health", "Asthma Care", "Vision Screening", "Dental Outreach", "Health Navigation", "Vaccination Outreach", "Recovery Support"],
  Housing: ["Tenant Rights", "Eviction Prevention", "Repair Grants", "Shelter Transition", "Housing Court Help", "Rental Assistance", "Landlord Mediation", "Housing Search", "Building Safety", "Homeowner Counseling"],
  Workforce: ["Job Training", "Apprenticeship", "Resume and Interview", "Small Business", "Healthcare Careers", "Construction Trades", "Technology Careers", "Placement", "Entrepreneur Coaching", "Returning Worker"],
  "Food Security": ["Pantry", "Produce Distribution", "Community Fridge", "Cooking Class", "Meal Program", "Urban Farm", "Mobile Market", "Food Rescue", "School Pantry", "Nutrition Education"],
  "Immigrant Services": ["Welcome Center", "Interpretation", "Know Your Rights", "Citizenship Application", "Benefits Screening", "Refugee Support", "Language Access", "Family Reunification", "Workplace Rights", "Orientation"],
  "Arts and Culture": ["Public Mural", "Youth Theater", "Dance Studio", "Music Lessons", "Heritage Festival", "Gallery Access", "Film Screening", "Poetry and Spoken Word", "Craft Studio", "Community Choir"],
  "Community Safety": ["Violence Interruption", "Block Watch", "Mediation", "Crisis Response", "Youth Outreach", "Safe Passage", "Victim Support", "Restorative Justice", "Night Programming", "Street Lighting Walks"],
  "Legal Services": ["Tenant Defense", "Immigration Clinic", "Benefits Appeals", "Family Court Help", "Consumer Debt", "Wage Claims", "Records Clearing", "Guardianship", "Small Claims", "Know Your Rights"],
  "Parks and Environment": ["Community Garden", "Tree Care", "Shoreline Cleanup", "Green Roof", "Composting", "Park Stewardship", "Environmental Education", "Rain Garden", "Recycling Outreach", "Pollinator Habitat"],
};

const DESCRIPTION_STYLES = [
  (focus: string, category: Category) => `Grants to neighborhood organizations for ${focus.toLowerCase()}, with reporting on people served and spending by category.`,
  (focus: string, category: Category) => `Supports ${focus.toLowerCase()} delivered by community groups in ${category.toLowerCase()}, with a participant target set at award.`,
  (focus: string, category: Category) => `Funds staff and supplies for ${focus.toLowerCase()} at local sites, reported mid-year and at year-end.`,
  (focus: string, category: Category) => `Provides operating support for ${focus.toLowerCase()} programs that serve residents in ${category.toLowerCase()}.`,
];

export const CITYWIDE_INITIATIVES: InitiativeSpec[] = [
  { name: "Cultural Access Fund", category: "Arts and Culture", kind: "named", awards: [8, 12], amount: [8000, 60000], open: true, description: "Operating grants that keep neighborhood arts and cultural groups open to the public." },
  { name: "Neighborhood Food Resilience Grants", category: "Food Security", kind: "named", awards: [7, 10], amount: [12000, 75000], open: true, description: "Capacity grants for pantries, community kitchens and food buying clubs across all five boroughs." },
  { name: "Senior Center Enhancement Program", category: "Older Adults", kind: "named", awards: [5, 8], amount: [15000, 90000], open: true, description: "Equipment, programming and staffing support for senior centers and older adult clubs." },
  { name: "Youth Opportunity Citywide Grants", category: "Youth Services", kind: "named", awards: [6, 9], amount: [20000, 100000], open: true, description: "Flexible grants for organizations that serve young people in school, out of school and in transition." },
  { name: "Immigrant Navigation Network", category: "Immigrant Services", kind: "named", awards: [5, 7], amount: [15000, 90000], open: true, description: "Language access, benefits screening and referral support for recent arrivals, delivered through neighborhood partners." },
  { name: "Community Health Access Partnership", category: "Health", kind: "named", awards: [5, 8], amount: [20000, 110000], open: true, description: "Health education, screening and enrollment help delivered by trusted community organizations." },
];

export function smallAwardCount(roll: number): [number, number] {
  if (roll < 0.6) return [1, 1];
  if (roll < 0.86) return [2, 2];
  if (roll < 0.96) return [3, 3];
  return [4, 4];
}

type Helpers = {
  shuffle: <T>(items: readonly T[]) => T[];
  pick: <T>(items: readonly T[]) => T;
  random: () => number;
};

export function generateInitiatives(categories: Category[], taken: Set<string>, helpers: Helpers): InitiativeSpec[] {
  const specs: InitiativeSpec[] = [];
  const modifiers = helpers.shuffle(MODIFIERS);
  let modifierIndex = 0;
  for (const category of categories) {
    const total = SMALL_PER_CATEGORY[category] + (NEW_IN_FY27_PER_CATEGORY[category] ?? 0);
    const focuses = helpers.shuffle(FOCUS[category]);
    const retire = RETIRED_AT_ROLLOVER[category] ?? 0;
    for (let n = 0; n < total; n++) {
      const focus = focuses[n % focuses.length];
      let name = "";
      let tail = "";
      for (let attempt = 0; attempt < 200; attempt++) {
        const modifier = modifiers[modifierIndex++ % modifiers.length];
        tail = helpers.pick(TAILS);
        name = `${modifier} ${focus} ${tail}`;
        if (!taken.has(name)) break;
      }
      if (taken.has(name)) throw new Error("initiative name pool exhausted");
      taken.add(name);
      const [lo, hi] = AMOUNT_BY_CATEGORY[category];
      const style = DESCRIPTION_STYLES[Math.floor(helpers.random() * DESCRIPTION_STYLES.length)];
      const isNew = n >= SMALL_PER_CATEGORY[category];
      const spec: InitiativeSpec = {
        name,
        category,
        kind: "named",
        awards: smallAwardCount(helpers.random()),
        amount: [lo, hi],
        description: style(focus, category),
        newInFy27: isNew,
      };
      if (!isNew && n < retire) spec.retiredAtRollover = true;
      specs.push(spec);
    }
  }
  const renameable = specs.filter((s) => !s.newInFy27 && !s.retiredAtRollover);
  const renames = helpers.shuffle(renameable).slice(0, 5);
  for (const spec of renames) {
    const parts = spec.name.split(" ");
    const current = parts[parts.length - 1];
    const next = helpers.pick(TAILS.filter((t) => t !== current));
    const renamed = [...parts.slice(0, -1), next].join(" ");
    if (taken.has(renamed)) continue;
    taken.add(renamed);
    spec.renamedTo = renamed;
  }
  return specs;
}
