import { execSync } from "node:child_process";
import { chromium, type FullConfig } from "@playwright/test";
import { ownerQuery } from "./db";
import { authFile, PEOPLE, signIn } from "./app";

export default async function globalSetup(config: FullConfig) {
  if (process.env.E2E_SKIP_RESEED !== "1") execSync("npx tsx scripts/seed.ts fresh", { stdio: "inherit" });
  await ownerQuery("DELETE FROM auth_attempt");
  const baseURL = config.projects[0].use.baseURL;
  const browser = await chromium.launch();
  for (const who of Object.keys(PEOPLE) as (keyof typeof PEOPLE)[]) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await signIn(page, PEOPLE[who]);
    await context.storageState({ path: authFile(who) });
    await context.close();
  }
  await browser.close();
}
