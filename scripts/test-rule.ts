import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const id = (process.argv[2] ?? "").toUpperCase();
const known = new Set(
  (JSON.parse(readFileSync("traceability.json", "utf8")) as { requirements: { id: string }[] }).requirements.map(
    (r) => r.id,
  ),
);

if (!known.has(id)) {
  console.error(`Usage: pnpm test:rule <id>, for example BR-012. ${id || "No ID"} is not in traceability.json.`);
  process.exit(2);
}

const pattern = `\\[${id}\\]`;
const run = (label: string, command: string, args: string[]) => {
  console.log(`\n${label} tests tagged ${id}`);
  return spawnSync(command, args, { stdio: "inherit" }).status ?? 1;
};

const unit = run("Unit and database", "npx", ["vitest", "run", "-t", pattern, "--passWithNoTests"]);
const browser =
  process.env.E2E_SKIP === "1"
    ? 0
    : run("Browser", "npx", ["playwright", "test", "--grep", pattern, "--pass-with-no-tests"]);
process.exit(unit === 0 && browser === 0 ? 0 : 1);
