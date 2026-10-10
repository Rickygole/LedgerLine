import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

export type Target = { url: string; host: string; live: boolean; personaPassword: string | null };

function readEnvFile(file: string): string {
  const dir = process.env.NEON_ENV_DIR ?? process.cwd();
  try {
    return readFileSync(path.join(dir, file), "utf8");
  } catch {
    throw new Error(`${file} was not found in ${dir}`);
  }
}

function connectionString(line: string): string {
  const value = line.includes("://") && line.indexOf("=") > -1 && line.indexOf("=") < line.indexOf("://") ? line.slice(line.indexOf("=") + 1) : line;
  return value.trim().replace(/^["']|["']$/g, "");
}

function hostOf(url: string): string {
  return new URL(url).host;
}

export function liveTarget(): Target {
  const first = readEnvFile(".env.neon").split(/\r?\n/).find((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  if (!first) throw new Error(".env.neon is empty");
  const url = connectionString(first.trim());
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("The first line of .env.neon is not a Postgres connection string");
  const line = readEnvFile(".env.neon-app")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("NEON_PERSONA_PASSWORD="));
  const personaPassword = line ? line.slice("NEON_PERSONA_PASSWORD=".length).trim().replace(/^["']|["']$/g, "") : "";
  if (!personaPassword) throw new Error("NEON_PERSONA_PASSWORD is missing from .env.neon-app");
  return { url, host: hostOf(url), live: true, personaPassword };
}

export function localTarget(): Target {
  const url = process.env.DB_OWNER_URL;
  if (!url) throw new Error("DB_OWNER_URL is not set");
  return { url, host: hostOf(url), live: false, personaPassword: null };
}

export async function confirmHost(target: Target, action: string): Promise<void> {
  console.log(`Target host: ${target.host}`);
  console.log(`Action: ${action}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question("Type the host name to continue: ")).trim();
  rl.close();
  if (typed !== target.host) throw new Error("The host name did not match. Nothing was changed.");
}
