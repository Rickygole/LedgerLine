import "../lib/load-env";
import { Client } from "pg";
import { sslFor } from "../lib/db-ssl";
import { applyPreset, SCENES, type Scene } from "./presets";
import { confirmHost, liveTarget, localTarget } from "./target";

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const scene = args.find((arg) => !arg.startsWith("--")) as Scene | undefined;
  if (!scene || !SCENES.includes(scene)) throw new Error(`Usage: pnpm preset <${SCENES.join("|")}> [--live]`);
  const target = live ? liveTarget() : localTarget();
  if (live)
    await confirmHost(
      target,
      scene === "fresh" ? "erase everything and reseed the database" : `apply the ${scene} scene`,
    );
  else console.log(`Target host: ${target.host}`);

  if (scene === "fresh") {
    if (live) process.env.PERSONA_PASSWORD = target.personaPassword ?? "";
    process.env.DB_OWNER_URL = target.url;
    const { runSeed } = await import("./seed");
    console.log(await runSeed(target.url, "fresh"));
    return;
  }
  const client = new Client({ connectionString: target.url, ssl: sslFor(target.url) });
  await client.connect();
  try {
    console.log(await applyPreset(client, scene));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
