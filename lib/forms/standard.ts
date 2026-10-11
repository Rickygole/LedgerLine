import type { FormDefinition, Question, Section } from "@/lib/rules/types";

export const STANDARD_QUESTIONS: Question[] = [
  {
    key: "org_legal_name",
    label: "Organization legal name",
    type: "text",
    required: true,
    scope: "standard",
    maxLength: 160,
    help: "Filled from the Council master list for your EIN.",
  },
  {
    key: "org_ein",
    label: "Employer Identification Number (EIN)",
    type: "ein",
    required: true,
    scope: "standard",
    help: "Nine digits, as it appears on your IRS determination letter.",
  },
  {
    key: "contact_name",
    label: "Report contact name",
    type: "text",
    required: true,
    scope: "standard",
    maxLength: 120,
  },
  {
    key: "contact_title",
    label: "Report contact title",
    type: "text",
    required: true,
    scope: "standard",
    maxLength: 120,
  },
  {
    key: "contact_email",
    label: "Report contact email",
    type: "email",
    required: true,
    scope: "standard",
    maxLength: 160,
  },
  { key: "contact_phone", label: "Report contact phone", type: "phone", required: true, scope: "standard" },
  {
    key: "participants_target",
    label: "Participants targeted this period",
    type: "integer",
    required: true,
    scope: "standard",
  },
  {
    key: "participants_actual",
    label: "Participants served this period",
    type: "integer",
    required: true,
    scope: "standard",
  },
  { key: "sites_count", label: "Number of program sites", type: "integer", required: true, scope: "standard" },
  {
    key: "delivery_model",
    label: "Primary delivery model",
    type: "select",
    required: true,
    scope: "standard",
    options: ["In person", "Remote", "Hybrid"],
  },
  {
    key: "served_youth",
    label: "Did this program serve participants under 18?",
    type: "yesno",
    required: true,
    scope: "standard",
  },
  {
    key: "youth_breakdown",
    label: "Participants under 18 by age group",
    type: "table",
    required: true,
    scope: "standard",
    visibleWhen: { key: "served_youth", equals: "Yes" },
    maxRows: 6,
    columns: [
      { key: "age_group", label: "Age group", type: "text" },
      { key: "count", label: "Participants", type: "integer" },
    ],
    help: "Complete the following table.",
  },
  {
    key: "accomplishments",
    label: "Key accomplishments this period",
    type: "textarea",
    required: true,
    scope: "standard",
    maxWords: 500,
  },
  {
    key: "challenges",
    label: "Challenges and how you addressed them",
    type: "textarea",
    required: false,
    scope: "standard",
    maxWords: 300,
  },
  {
    key: "success_story",
    label: "A participant success story",
    type: "textarea",
    required: false,
    scope: "standard",
    maxWords: 300,
  },
];

export type TemplateSection = "organization" | "performance" | "narrative";

export const TEMPLATE_SECTIONS: { key: TemplateSection; title: string; description: string }[] = [
  {
    key: "organization",
    title: "Organization and contact",
    description: "Who is reporting and how Council Finance can reach you about this report.",
  },
  { key: "performance", title: "Program performance", description: "Counts for this reporting period only." },
  {
    key: "narrative",
    title: "Narrative",
    description: "Plain language is best. Council Finance reads every response.",
  },
];

export type LibraryEntry = {
  question: Question;
  templateSection: TemplateSection | null;
  position: number;
};

const PLACEMENT: Record<string, TemplateSection> = {
  org_legal_name: "organization",
  org_ein: "organization",
  contact_name: "organization",
  contact_title: "organization",
  contact_email: "organization",
  contact_phone: "organization",
  participants_target: "performance",
  participants_actual: "performance",
  sites_count: "performance",
  delivery_model: "performance",
  served_youth: "performance",
  youth_breakdown: "performance",
  accomplishments: "narrative",
  challenges: "narrative",
  success_story: "narrative",
};

export function standardEntries(): LibraryEntry[] {
  return STANDARD_QUESTIONS.map((question, index) => ({
    question,
    templateSection: PLACEMENT[question.key] ?? null,
    position: index + 1,
  }));
}

export function buildDefinitionFrom(
  title: string,
  initiativeQuestions: Question[],
  library: LibraryEntry[],
): FormDefinition {
  const placed = (section: TemplateSection) =>
    library
      .filter((entry) => entry.templateSection === section)
      .sort((a, b) => a.position - b.position)
      .map((entry) => JSON.parse(JSON.stringify(entry.question)) as Question);
  const sections: Section[] = [
    ...TEMPLATE_SECTIONS.slice(0, 2).map((section): Section => ({
      key: section.key,
      title: section.title,
      description: section.description,
      kind: "questions",
      questions: section.key === "performance" ? [...placed(section.key), ...initiativeQuestions] : placed(section.key),
    })),
    {
      key: "narrative",
      title: TEMPLATE_SECTIONS[2].title,
      description: TEMPLATE_SECTIONS[2].description,
      kind: "questions",
      questions: placed("narrative"),
    },
    {
      key: "budget",
      title: "Budget",
      description: "Report how Council funds were spent. The total must equal your award.",
      kind: "budget",
      questions: [],
    },
  ];
  return { title, sections, budget: { enabled: true, mustEqualAward: true, maxLines: 100 } };
}

export function buildDefinition(title: string, initiativeQuestions: Question[]): FormDefinition {
  return buildDefinitionFrom(title, initiativeQuestions, standardEntries());
}

export const CATEGORY_METRICS: Record<string, Question[]> = {
  "Youth Services": [
    {
      key: "youth_program_hours",
      label: "Program hours delivered",
      type: "integer",
      required: true,
      scope: "initiative",
    },
    { key: "youth_completion_rate", label: "Completion rate", type: "percent", required: true, scope: "initiative" },
  ],
  "Older Adults": [
    {
      key: "meals_delivered",
      label: "Meals delivered or served",
      type: "integer",
      required: true,
      scope: "initiative",
    },
    {
      key: "wellness_checks",
      label: "Wellness check-ins completed",
      type: "integer",
      required: true,
      scope: "initiative",
    },
  ],
  Education: [
    {
      key: "students_tutored",
      label: "Students receiving tutoring",
      type: "integer",
      required: true,
      scope: "initiative",
    },
    {
      key: "literacy_gain_rate",
      label: "Share showing a literacy gain",
      type: "percent",
      required: true,
      scope: "initiative",
    },
  ],
  Health: [
    {
      key: "screenings_completed",
      label: "Health screenings completed",
      type: "integer",
      required: true,
      scope: "initiative",
    },
    { key: "referrals_made", label: "Referrals to care", type: "integer", required: true, scope: "initiative" },
  ],
  Housing: [
    { key: "households_assisted", label: "Households assisted", type: "integer", required: true, scope: "initiative" },
    { key: "evictions_prevented", label: "Evictions prevented", type: "integer", required: true, scope: "initiative" },
  ],
  Workforce: [
    { key: "job_placements", label: "Job placements", type: "integer", required: true, scope: "initiative" },
    {
      key: "credentials_earned",
      label: "Industry credentials earned",
      type: "integer",
      required: true,
      scope: "initiative",
    },
  ],
  "Food Security": [
    {
      key: "pounds_distributed",
      label: "Pounds of food distributed",
      type: "integer",
      required: true,
      scope: "initiative",
    },
    { key: "pantry_days", label: "Pantry distribution days", type: "integer", required: true, scope: "initiative" },
  ],
  "Immigrant Services": [
    {
      key: "legal_consultations",
      label: "Legal consultations provided",
      type: "integer",
      required: true,
      scope: "initiative",
    },
    {
      key: "language_access_hours",
      label: "Interpretation hours",
      type: "integer",
      required: true,
      scope: "initiative",
    },
  ],
  "Arts and Culture": [
    { key: "public_events", label: "Public events held", type: "integer", required: true, scope: "initiative" },
    { key: "event_attendance", label: "Total event attendance", type: "integer", required: true, scope: "initiative" },
  ],
  "Community Safety": [
    { key: "mediations_held", label: "Conflict mediations held", type: "integer", required: true, scope: "initiative" },
    {
      key: "outreach_contacts",
      label: "Street outreach contacts",
      type: "integer",
      required: true,
      scope: "initiative",
    },
  ],
  "Legal Services": [
    { key: "cases_opened", label: "Cases opened", type: "integer", required: true, scope: "initiative" },
    { key: "cases_resolved", label: "Cases resolved", type: "integer", required: true, scope: "initiative" },
  ],
  "Parks and Environment": [
    { key: "volunteer_hours", label: "Volunteer hours", type: "integer", required: true, scope: "initiative" },
    {
      key: "trees_planted",
      label: "Trees or plantings installed",
      type: "integer",
      required: true,
      scope: "initiative",
    },
  ],
};
