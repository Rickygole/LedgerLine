import { liveTarget, confirmHost } from "./target";

async function main() {
  const target = liveTarget();
  await confirmHost(target, "erase everything and reseed the database");
  process.env.DB_OWNER_URL = target.url;
  process.env.PERSONA_PASSWORD = target.personaPassword ?? "";
  const { runSeed } = await import("./seed");
  console.log(await runSeed(target.url, "fresh"));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
