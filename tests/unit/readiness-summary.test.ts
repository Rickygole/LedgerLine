import { describe, expect, it } from "vitest";
import {
  latestPerScenario,
  passRate,
  percent,
  requiredModules,
  trainedShare,
  type TrainingModule,
} from "@/lib/ops/readiness";

const modules: TrainingModule[] = [
  { key: "a", title: "Orientation", audience: ["finance_viewer", "finance_analyst", "finance_admin"] },
  { key: "b", title: "Review", audience: ["finance_analyst", "finance_admin"] },
  { key: "c", title: "Users", audience: ["finance_admin"] },
];

describe("[US-066] training progress is the share of Finance users who finished every module for their role", () => {
  it("requires more modules for roles with more responsibility", () => {
    expect(requiredModules(modules, "finance_viewer").map((m) => m.key)).toEqual(["a"]);
    expect(requiredModules(modules, "finance_analyst").map((m) => m.key)).toEqual(["a", "b"]);
    expect(requiredModules(modules, "finance_admin").map((m) => m.key)).toEqual(["a", "b", "c"]);
  });

  it("counts a person as trained only when every required module is recorded", () => {
    const users = [
      { id: "1", role: "finance_viewer" },
      { id: "2", role: "finance_analyst" },
      { id: "3", role: "finance_admin" },
      { id: "4", role: "finance_analyst" },
    ];
    const records = [
      { user_id: "1", module_key: "a" },
      { user_id: "2", module_key: "a" },
      { user_id: "2", module_key: "b" },
      { user_id: "3", module_key: "a" },
      { user_id: "3", module_key: "b" },
      { user_id: "4", module_key: "b" },
    ];
    expect(trainedShare(users, modules, records)).toEqual({ users: 4, trained: 2, percent: 50 });
    expect(trainedShare([], modules, [])).toEqual({ users: 0, trained: 0, percent: null });
  });

  it("rounds a percentage and returns nothing for an empty whole", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBeNull();
  });
});

describe("[US-065] the test pass rate uses the latest session of each scenario", () => {
  const entry = (scenario: string, session_on: string, result: string, recorded_at = `${session_on}T20:00:00Z`) => ({
    scenario,
    session_on,
    result,
    recorded_at,
  });

  it("lets a passing retest replace an earlier failure", () => {
    const entries = [
      entry("Upload", "2026-09-24", "failed"),
      entry("Upload", "2026-10-05", "passed"),
      entry("Export", "2026-10-02", "passed"),
      entry("Rollover", "2026-10-01", "blocked"),
    ];
    expect(latestPerScenario(entries)).toHaveLength(3);
    expect(passRate(entries)).toEqual({ scenarios: 3, passed: 2, percent: 67 });
  });

  it("breaks a tie on the same day by the time it was recorded", () => {
    const entries = [
      entry("Print", "2026-10-07", "passed", "2026-10-07T15:00:00Z"),
      entry("Print", "2026-10-07", "failed", "2026-10-07T18:00:00Z"),
    ];
    expect(passRate(entries)).toEqual({ scenarios: 1, passed: 0, percent: 0 });
  });

  it("has no rate before any session exists", () => {
    expect(passRate([])).toEqual({ scenarios: 0, passed: 0, percent: null });
  });
});
