import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const nextDir = dirname(createRequire(import.meta.url).resolve("next/package.json"));
const compiled = (file: string) => readFileSync(join(nextDir, "dist/compiled/react-dom/cjs", file), "utf8");

function pingSuspendedRoot(source: string): string {
  const start = source.indexOf("function pingSuspendedRoot(");
  const end = source.indexOf("function retryTimedOutBoundary(", start);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, end);
}

describe("react-dom ping patch", () => {
  it("records a ping that fires while the root is rendering instead of dropping it", () => {
    const production = pingSuspendedRoot(compiled("react-dom-client.production.js"));
    expect(production).toMatch(/prepareFreshStack\(root, 0\)\s*:\s*\(workInProgressRootPingedLanes \|= pingedLanes\)/);
    const development = pingSuspendedRoot(compiled("react-dom-client.development.js"));
    expect(development).toMatch(/prepareFreshStack\(root, 0\)\s*:\s*\(workInProgressRootPingedLanes \|= pingedLanes\)/);
  });
});
