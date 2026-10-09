import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

type Requirement = { id: string; area: string; summary: string; route: string | null; fallback: "demonstrated" | "planned"; note?: string };
type Suite = "unit" | "sql" | "eval" | "e2e";
type TestResult = { title: string; file: string; status: "passed" | "failed" | "skipped"; retried: boolean; suite: Suite };
type State = "verified" | "failing" | "demonstrated" | "planned";

const TAG = /\[((?:US|BR)-\d{3})\]/g;
const STATES: State[] = ["verified", "failing", "demonstrated", "planned"];

function readVitest(path: string): TestResult[] {
  if (!existsSync(path)) return [];
  const report = JSON.parse(readFileSync(path, "utf8")) as {
    testResults: { name: string; assertionResults: { fullName: string; status: string; retryCount?: number }[] }[];
  };
  return report.testResults.flatMap((file) => {
    const relative = file.name.replace(`${process.cwd()}/`, "");
    const suite: Suite = relative.includes("tests/sql") ? "sql" : relative.includes("tests/eval") ? "eval" : "unit";
    return file.assertionResults.map((test) => ({
      title: test.fullName,
      file: relative,
      status: test.status === "passed" ? "passed" : test.status === "failed" ? "failed" : "skipped",
      retried: (test.retryCount ?? 0) > 0,
      suite,
    }));
  });
}

function readPlaywright(path: string): TestResult[] {
  if (!existsSync(path)) return [];
  type Spec = { title: string; file: string; tests: { results: { status: string; retry: number }[] }[] };
  type Node = { title: string; file?: string; specs?: Spec[]; suites?: Node[] };
  const report = JSON.parse(readFileSync(path, "utf8")) as { suites: Node[] };
  const out: TestResult[] = [];
  const walk = (node: Node, prefix: string) => {
    for (const spec of node.specs ?? []) {
      const results = spec.tests.flatMap((t) => t.results);
      const last = results[results.length - 1];
      out.push({
        title: [prefix, spec.title].filter(Boolean).join(" "),
        file: `tests/e2e/${spec.file}`,
        status: last?.status === "passed" ? "passed" : last?.status === "skipped" ? "skipped" : "failed",
        retried: results.some((r) => r.retry > 0),
        suite: "e2e",
      });
    }
    for (const child of node.suites ?? []) walk(child, [prefix, child.title].filter(Boolean).join(" "));
  };
  for (const suite of report.suites) walk(suite, "");
  return out;
}

function git(command: string, fallback: string): string {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return fallback;
  }
}

function main() {
  const requirements = (JSON.parse(readFileSync("traceability.json", "utf8")) as { requirements: Requirement[] }).requirements;
  const known = new Set(requirements.map((r) => r.id));
  const tests = [...readVitest("reports/vitest.json"), ...readPlaywright("reports/playwright.json")];
  const tagged = new Map<string, TestResult[]>();
  const unknown = new Set<string>();
  for (const test of tests) {
    for (const match of test.title.matchAll(TAG)) {
      if (!known.has(match[1])) unknown.add(match[1]);
      const list = tagged.get(match[1]) ?? [];
      list.push(test);
      tagged.set(match[1], list);
    }
  }
  if (unknown.size > 0) {
    console.error(`tests are tagged with IDs missing from traceability.json: ${[...unknown].join(", ")}`);
    process.exit(1);
  }

  const rows = requirements.map((req) => {
    const evidence = tagged.get(req.id) ?? [];
    let state: State;
    let reason: string | null = null;
    if (evidence.length > 0) {
      const failed = evidence.filter((t) => t.status === "failed");
      const skipped = evidence.filter((t) => t.status === "skipped");
      const flaky = evidence.filter((t) => t.retried);
      if (failed.length) [state, reason] = ["failing", `${failed.length} failing test${failed.length > 1 ? "s" : ""}`];
      else if (skipped.length) [state, reason] = ["failing", `${skipped.length} skipped test${skipped.length > 1 ? "s" : ""}`];
      else if (flaky.length) [state, reason] = ["failing", "passed only on retry"];
      else state = "verified";
    } else {
      state = req.fallback;
    }
    return {
      id: req.id,
      area: req.area,
      summary: req.summary,
      route: req.route,
      state,
      reason,
      note: req.note ?? null,
      tests: evidence.map((t) => ({ title: t.title.replace(TAG, "").replace(/\s+/g, " ").trim(), file: t.file, status: t.status, suite: t.suite })),
    };
  });

  const count = (state: State, prefix: string) => rows.filter((r) => r.state === state && r.id.startsWith(prefix)).length;
  const bySuite = (suite: Suite) => tests.filter((t) => t.suite === suite).length;
  const dirty = git("git status --porcelain --untracked-files=no -- . :!app/trust/evidence.json", "") !== "";
  const evidence = {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? git("git rev-parse HEAD", "unknown"),
    origin: process.env.GITHUB_RUN_ID ? "ci" : "local",
    uncommittedChanges: process.env.GITHUB_RUN_ID ? false : dirty,
    runUrl: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    repository: process.env.GITHUB_REPOSITORY ?? "Rickygole/LedgerLine",
    totals: {
      tests: tests.length,
      passed: tests.filter((t) => t.status === "passed").length,
      failed: tests.filter((t) => t.status === "failed").length,
      skipped: tests.filter((t) => t.status === "skipped").length,
    },
    suites: { unit: bySuite("unit"), sql: bySuite("sql"), eval: bySuite("eval"), e2e: bySuite("e2e") },
    summary: Object.fromEntries(STATES.map((s) => [s, { stories: count(s, "US"), rules: count(s, "BR") }])),
    requirements: rows,
  };
  writeFileSync("app/trust/evidence.json", `${JSON.stringify(evidence, null, 2)}\n`);
  const v = evidence.summary.verified;
  console.log(`traceability: ${v.stories} of ${count("verified", "US") + count("failing", "US") + count("demonstrated", "US") + count("planned", "US")} stories and ${v.rules} of ${rows.filter((r) => r.id.startsWith("BR")).length} rules verified by ${tests.length} tests (${evidence.origin})`);
}

main();
