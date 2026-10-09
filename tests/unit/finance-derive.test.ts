import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyFilters, boroughSeries, completionByCategory, countBuckets, finishRow, paginate } from "@/lib/finance/review/derive";
import { filtersToParams, parseFilters } from "@/lib/finance/review/filters";
import type { ReportRow } from "@/lib/finance/review/types";
import { buildDefinition } from "@/lib/forms/standard";
import type { Answers, BudgetLine } from "@/lib/rules/types";

const definition = buildDefinition("Test report", []);

const completeAnswers: Answers = {
  org_legal_name: "Test Org",
  org_ein: "00-1234567",
  contact_name: "A Person",
  contact_title: "Director",
  contact_email: "a@example.org",
  contact_phone: "7185550142",
  participants_target: "100",
  participants_actual: "90",
  sites_count: "2",
  delivery_model: "In person",
  served_youth: "No",
  accomplishments: "We ran the program.",
};

function budget(total: number): BudgetLine[] {
  return [{ rowId: "r1", position: 1, category: "PS", description: "Staff", amount: total }];
}

let previous: string | undefined;
beforeAll(() => {
  previous = process.env.DEMO_TODAY;
  process.env.DEMO_TODAY = "2026-10-14";
});
afterAll(() => {
  if (previous === undefined) delete process.env.DEMO_TODAY;
  else process.env.DEMO_TODAY = previous;
});

function row(over: Partial<Omit<ReportRow, "issues" | "bucket" | "daysPastDue" | "flags">> = {}): ReportRow {
  return finishRow({
    councilDistrict: 8,
    orgType: "cbo",
    assignmentId: "a1",
    orgId: "o1",
    orgName: "Mott Haven Youth Futures, Inc.",
    ein: "00-1040217",
    borough: "Bronx",
    initiativeId: "11111111-1111-1111-1111-111111111111",
    initiativeName: "Youth Mentoring Networks",
    initiativeCode: "CI-004",
    category: "Youth Services",
    award: 90000,
    fundingSource: "citywide",
    agency: "DYCD",
    contractStatus: "registered",
    contractRegisteredOn: "2025-10-14",
    contractNumber: "DYCD-26-04218",
    sponsors: [{ district: 8, name: "Delia Cordero", amount: 90000 }],
    periodId: "FY26-YE",
    dueOn: "2026-09-30",
    submissionId: null,
    referenceNo: null,
    status: null,
    revision: 0,
    lockVersion: 0,
    submittedAt: null,
    updatedAt: null,
    formVersionId: "f1",
    answers: {},
    budget: [],
    definition,
    openFlags: [],
    ...over,
  });
}

describe("dashboard buckets", () => {
  it("puts a past due assignment with no submission in missing", () => {
    const r = row();
    expect(r.bucket).toBe("missing");
    expect(r.daysPastDue).toBe(14);
    expect(r.flags.map((f) => f.reason)).toEqual(["missing"]);
  });

  it("[US-040] counts a past due draft that fails required rules as missing and flags it incomplete", () => {
    const r = row({ submissionId: "s1", status: "draft", answers: { org_legal_name: "Test Org" } });
    expect(r.bucket).toBe("missing");
    expect(r.flags.map((f) => f.reason)).toEqual(expect.arrayContaining(["missing", "incomplete"]));
  });

  it("[US-040] defines missing once: nothing submitted or a draft, past due", () => {
    expect(row().bucket).toBe("missing");
    expect(row({ submissionId: "s1", status: "draft" }).bucket).toBe("missing");
    expect(row({ submissionId: "s1", status: "returned", answers: completeAnswers, budget: budget(90000) }).bucket).toBe("returned");
    expect(row({ submissionId: "s1", status: "submitted", answers: completeAnswers, budget: budget(90000) }).bucket).toBe("submitted");
    expect(row({ dueOn: "2026-10-30" }).bucket).toBe("outstanding");
  });

  it("keeps not yet due work outstanding", () => {
    const r = row({ periodId: "FY27-MY", dueOn: "2027-01-31" });
    expect(r.bucket).toBe("outstanding");
    expect(r.flags).toEqual([]);
  });

  it("counts every bucket and sums to the number of rows", () => {
    const rows = [row(), row({ submissionId: "s1", status: "accepted", answers: completeAnswers, budget: budget(90000) }), row({ submissionId: "s2", status: "submitted", answers: completeAnswers, budget: budget(90000) })];
    const counts = countBuckets(rows);
    expect(counts.missing).toBe(1);
    expect(counts.accepted).toBe(1);
    expect(counts.submitted).toBe(1);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });
});

describe("flag evidence", () => {
  it("shows the total against the award for an unbalanced draft", () => {
    const r = row({ submissionId: "s1", status: "draft", answers: completeAnswers, budget: budget(91750) });
    const flag = r.flags.find((f) => f.reason === "unbalanced");
    expect(flag?.evidence).toBe("Total $91,750.00 vs award $90,000.00 (over by $1,750.00)");
  });

  it("does not flag a draft with no budget lines as unbalanced", () => {
    const r = row({ submissionId: "s1", status: "draft", answers: completeAnswers, budget: [] });
    expect(r.flags.find((f) => f.reason === "unbalanced")).toBeUndefined();
  });

  it("flags zero and low outcomes on submitted reports", () => {
    const zero = row({ submissionId: "s1", status: "submitted", answers: { ...completeAnswers, participants_actual: "0" }, budget: budget(90000) });
    expect(zero.flags.find((f) => f.reason === "zero_outcomes")?.evidence).toBe("Participants served 0 of 100 targeted");
    const low = row({ submissionId: "s2", status: "accepted", answers: { ...completeAnswers, participants_actual: "30" }, budget: budget(90000) });
    expect(low.flags.find((f) => f.reason === "low_outcomes")?.evidence).toContain("30 of 100");
    const fine = row({ submissionId: "s3", status: "accepted", answers: { ...completeAnswers, participants_actual: "40" }, budget: budget(90000) });
    expect(fine.flags).toEqual([]);
  });

  it("ignores participants served when branching hides that question", () => {
    const branched = {
      ...definition,
      sections: definition.sections.map((section) => ({
        ...section,
        questions: section.questions.map((q) => (q.key === "participants_actual" ? { ...q, visibleWhen: { key: "served_youth", equals: "Yes" } } : q)),
      })),
    };
    const r = row({ submissionId: "s1", status: "submitted", definition: branched, answers: { ...completeAnswers, participants_actual: "0" }, budget: budget(90000) });
    expect(r.flags.find((f) => f.reason === "zero_outcomes")).toBeUndefined();
  });

  it("adds open manual flags with their note", () => {
    const r = row({ submissionId: "s1", status: "submitted", answers: completeAnswers, budget: budget(90000), openFlags: [{ id: "f1", kind: "manual", note: "Check the vendor invoice" }] });
    expect(r.flags).toEqual([{ reason: "manual", evidence: "Flagged by Finance: Check the vendor invoice" }]);
  });
});

const periods = [
  { id: "FY26-YE", label: "FY26 Year-End", dueOn: "2026-09-30", fiscalYearId: "FY26" },
  { id: "FY27-MY", label: "FY27 Mid-Year", dueOn: "2027-01-31", fiscalYearId: "FY27" },
];

describe("filters", () => {
  const rows = [
    row(),
    row({ orgName: "Harborview Youth Alliance", ein: "00-1109729", borough: "Brooklyn", category: "Health", initiativeId: "22222222-2222-2222-2222-222222222222", initiativeName: "Diabetes Prevention", initiativeCode: "CI-050", submissionId: "s2", status: "accepted", answers: completeAnswers, budget: budget(90000) }),
  ];

  it("matches organization name or EIN", () => {
    expect(applyFilters(rows, { q: "harborview" })).toHaveLength(1);
    expect(applyFilters(rows, { q: "1040217" })).toHaveLength(1);
    expect(applyFilters(rows, { q: "00-1109729" })[0].borough).toBe("Brooklyn");
  });

  it("[US-041] finds a report by reference number, contract number or initiative", () => {
    const withRef = row({ submissionId: "s9", referenceNo: "LL-26YE-00148", status: "accepted", answers: completeAnswers, budget: budget(90000) });
    expect(applyFilters([withRef, ...rows], { q: "LL-26YE-00148" })).toHaveLength(1);
    expect(applyFilters(rows, { q: "dyCD-26-04218" })).toHaveLength(2);
    expect(applyFilters(rows, { q: "diabetes" })).toHaveLength(1);
  });

  it("[US-041] filters by sponsoring Council Member, funding source and contract status", () => {
    const other = row({ orgName: "Larkspur Youth Alliance", sponsors: [{ district: 33, name: "Walter Pennington", amount: 90000 }], fundingSource: "local", contractStatus: "pending", submissionId: "s3", status: "accepted", answers: completeAnswers, budget: budget(90000) });
    const all = [...rows, other];
    expect(applyFilters(all, { member: "33" }).map((r) => r.orgName)).toEqual(["Larkspur Youth Alliance"]);
    expect(applyFilters(all, { member: "8" })).toHaveLength(2);
    expect(applyFilters(all, { funding: "local" })).toHaveLength(1);
    expect(applyFilters(all, { contract: "pending" })).toHaveLength(1);
  });

  it("combines filters", () => {
    expect(applyFilters(rows, { borough: "Bronx", category: "Health" })).toHaveLength(0);
    expect(applyFilters(rows, { borough: "Brooklyn", status: "accepted", bucket: "accepted" })).toHaveLength(1);
    expect(applyFilters(rows, { status: "not_started" })).toHaveLength(1);
  });

  it("matches initiative by name, code or id", () => {
    expect(applyFilters(rows, { initiative: "diabetes" })).toHaveLength(1);
    expect(applyFilters(rows, { initiative: "ci-004" })).toHaveLength(1);
    expect(applyFilters(rows, { initiative: "22222222-2222-2222-2222-222222222222" })).toHaveLength(1);
  });

  it("filters by flag reason and any", () => {
    expect(applyFilters(rows, { flag: "missing" })).toHaveLength(1);
    expect(applyFilters(rows, { flag: "any" })).toHaveLength(1);
    expect(applyFilters(rows, { flag: "manual" })).toHaveLength(0);
  });

  it("can skip a filter when counting alternatives", () => {
    expect(applyFilters(rows, { bucket: "accepted", borough: "Bronx" }, ["bucket"])).toHaveLength(1);
  });
});

describe("pagination and parameters", () => {
  it("pages 50 at a time and clamps the page", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const second = paginate(items, 2);
    expect(second.items).toHaveLength(50);
    expect(second.from).toBe(51);
    expect(second.to).toBe(100);
    expect(second.pages).toBe(3);
    expect(paginate(items, 9).page).toBe(3);
    expect(paginate([], 1)).toMatchObject({ total: 0, from: 0, to: 0, pages: 1 });
  });

  it("parses filters with a safe period and rebuilds the query", () => {
    const filters = parseFilters({ period: "BOGUS", q: " mott ", page: "3", borough: ["Bronx", "Queens"] }, periods);
    expect(filters).toMatchObject({ period: "FY26-YE", q: "mott", page: 3, borough: "Bronx" });
    expect(filtersToParams(filters).toString()).toBe("q=mott&borough=Bronx&period=FY26-YE");
    expect(filtersToParams(filters, { page: true }).get("page")).toBe("3");
  });
});

describe("chart series", () => {
  it("builds borough and category summaries", () => {
    const rows = [row(), row({ borough: "Queens", category: "Health", submissionId: "s2", status: "accepted", answers: completeAnswers, budget: budget(90000) })];
    expect(boroughSeries(rows).map((b) => b.borough)).toEqual(["Bronx", "Queens"]);
    const completion = completionByCategory(rows);
    expect(completion[0]).toMatchObject({ category: "Health", rate: 100 });
    expect(completion[1]).toMatchObject({ category: "Youth Services", rate: 0 });
  });
});
