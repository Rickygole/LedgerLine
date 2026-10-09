import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3105";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/support/global-setup.ts",
  reporter: [["list"], ["json", { outputFile: "reports/playwright.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start -p ${port}`,
    url: `http://localhost:${port}/gate`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
