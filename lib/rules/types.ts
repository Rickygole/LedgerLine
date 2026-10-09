export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "integer"
  | "currency"
  | "percent"
  | "date"
  | "email"
  | "phone"
  | "ein"
  | "select"
  | "yesno"
  | "table";

export type TableColumn = {
  key: string;
  label: string;
  type: "text" | "integer" | "currency" | "percent";
};

export type Citation = {
  quote: string;
  paragraph: number;
};

export type Question = {
  key: string;
  label: string;
  help?: string;
  type: FieldType;
  required: boolean;
  scope: "standard" | "initiative";
  options?: string[];
  maxLength?: number;
  maxWords?: number;
  visibleWhen?: { key: string; equals: string };
  columns?: TableColumn[];
  maxRows?: number;
  citation?: Citation;
};

export type Section = {
  key: string;
  title: string;
  description?: string;
  kind: "questions" | "budget";
  questions: Question[];
};

export type FormDefinition = {
  title: string;
  sections: Section[];
  budget: {
    enabled: boolean;
    mustEqualAward: boolean;
    maxLines: number;
  };
};

export type BudgetLine = {
  rowId: string;
  position: number;
  category: "PS" | "OTPS";
  description: string;
  amount: number;
  actual?: number | null;
};

export type AnswerValue = string | number | boolean | null | Array<Record<string, string | number | null>>;

export type Answers = Record<string, AnswerValue>;

export type Issue = {
  field: string;
  ruleId: string;
  message: string;
  severity: "block" | "warn";
};

export type ValidationInput = {
  definition: FormDefinition;
  answers: Answers;
  budget: BudgetLine[];
  awardAmount: number;
};
