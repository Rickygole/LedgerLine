import { describe, expect, it } from "vitest";
import {
  COLUMN_TYPES,
  FIELD_TYPES,
  defaultTable,
  newColumn,
  newQuestion,
  questionProblems,
  validateDefinition,
} from "@/lib/forms/editor/definition";
import { definitionSchema } from "@/lib/forms/editor/schema";
import { cellText, tableRows } from "@/lib/report/format";
import { buildDefinition } from "@/lib/forms/standard";
import type { Answers, FormDefinition, Question } from "@/lib/rules/types";
import { blockingIssues, validateSubmission } from "@/lib/rules/validate";

function withTable(table: Question): FormDefinition {
  const definition = buildDefinition("Fixture", []);
  definition.sections[1].questions.push(table);
  return definition;
}

function table(): Question {
  const question = newQuestion(buildDefinition("Fixture", []), "Sites and visits", "table");
  question.columns = [
    newColumn([], "Site name", "text"),
    { key: "visits", label: "Visits", type: "integer" },
    { key: "hours", label: "Hours", type: "number" },
    { key: "cost", label: "Cost", type: "currency" },
    { key: "rate", label: "Rate", type: "percent" },
  ];
  question.columns[0].key = "site";
  question.maxRows = 3;
  question.required = true;
  return question;
}

function issues(question: Question, answers: Answers) {
  const definition = withTable(question);
  const base: Answers = {};
  return blockingIssues(
    validateSubmission({
      definition: { ...definition, sections: definition.sections.filter((s) => s.key !== "budget") },
      answers: { ...base, ...answers },
      budget: [],
      awardAmount: 0,
    }),
  ).filter((issue) => issue.field === question.key);
}

describe("[US-007] a question can embed a table", () => {
  it("offers Table among the question types and starts a new table with two columns and a row limit", () => {
    expect(FIELD_TYPES).toContain("table");
    const fresh = newQuestion(buildDefinition("Fixture", []), "Staff by site", "table");
    expect(fresh.type).toBe("table");
    expect(fresh.columns?.map((c) => c.type)).toEqual(["text", "number"]);
    expect(fresh.maxRows).toBe(10);
    expect(fresh.columns).toEqual(defaultTable().columns);
  });

  it("supports text, number, whole number, dollar and percent columns", () => {
    expect(COLUMN_TYPES).toEqual(["text", "number", "integer", "currency", "percent"]);
    expect(questionProblems(table())).toEqual([]);
  });

  it("saves through the same schema the editor sends, including number columns", () => {
    const definition = withTable(table());
    expect(definitionSchema.safeParse(definition).success).toBe(true);
  });

  it("requires one to eight labelled columns of distinct keys and a row limit", () => {
    const none = { ...table(), columns: [] };
    expect(questionProblems(none)).toContain('"Sites and visits" needs between 1 and 8 columns.');
    const unlabeled = { ...table(), columns: [{ key: "a", label: " ", type: "text" as const }] };
    expect(questionProblems(unlabeled)).toContain('Every column in "Sites and visits" needs a label.');
    const same = {
      ...table(),
      columns: [
        { key: "a", label: "A", type: "text" as const },
        { key: "a", label: "B", type: "text" as const },
      ],
    };
    expect(questionProblems(same)).toContain('"Sites and visits" has two columns with the same key.');
    expect(questionProblems({ ...table(), maxRows: 0 })).toContain(
      '"Sites and visits" needs a row limit between 1 and 50.',
    );
    expect(questionProblems({ ...table(), maxRows: 51 })).toContain(
      '"Sites and visits" needs a row limit between 1 and 50.',
    );
    expect(validateDefinition(withTable(none))).toContain('"Sites and visits" needs between 1 and 8 columns.');
  });

  it("validates each cell by its column type and the row limit, and asks for a missing cell", () => {
    const question = table();
    const good = [{ site: "North", visits: "12", hours: "7.5", cost: "$1,200.00", rate: "50%" }];
    expect(issues(question, { [question.key]: good })).toEqual([]);

    const bad = [{ site: "North", visits: "1.5", hours: "abc", cost: "lots", rate: "150" }];
    const messages = issues(question, { [question.key]: bad }).map((i) => i.message);
    expect(messages).toEqual([
      "Visits in row 1 must be a whole number.",
      "Hours in row 1 must be a number.",
      "Cost in row 1 must be a dollar amount, like 1250.00.",
      "Rate in row 1 must be a percentage between 0 and 100.",
    ]);

    const partial = [{ site: "North", visits: "", hours: "1", cost: "1", rate: "1" }];
    expect(issues(question, { [question.key]: partial })[0].message).toBe(
      "Sites and visits, row 1: fill in Visits, or remove the row.",
    );

    const tooMany = Array.from({ length: 4 }, () => ({ site: "x", visits: "1", hours: "1", cost: "1", rate: "1" }));
    expect(issues(question, { [question.key]: tooMany })[0].message).toBe("Sites and visits can have at most 3 rows.");
  });

  it("requires a required table to have a row", () => {
    const question = table();
    expect(issues(question, {})[0].message).toBe("Fill in the sites and visits table.");
  });

  it("formats stored table values for the submitted copy and exports", () => {
    const question = table();
    const rows = [{ site: "North", visits: "1200", hours: "7.5", cost: "1200", rate: "50" }];
    expect(tableRows(question, rows)).toEqual([["North", "1,200", "7.5", "$1,200", "50%"]]);
    expect(cellText("number", "3000")).toBe("3,000");
  });
});
