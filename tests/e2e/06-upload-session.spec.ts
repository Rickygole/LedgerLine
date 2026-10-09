import { expect, test, type Browser } from "@playwright/test";
import { PEOPLE, signIn } from "./support/app";

async function cookieFor(browser: Browser, email: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, email);
  return { context, page };
}

test("[US-013] a signed-out session can no longer reach the upload endpoints", async ({ browser }) => {
  const { context, page } = await cookieFor(browser, PEOPLE.maria);
  const alive = await page.request.get("/api/upload/session");
  expect(alive.status()).toBe(200);
  expect(await alive.json()).toEqual({ signedIn: true });

  const cookies = await context.cookies();
  const stale = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  await page.goto("/portal");
  await page.getByRole("group").filter({ has: page.getByLabel(/Account menu for/) }).locator("summary").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);

  const replay = await page.request.get("/api/upload/session", { headers: { cookie: stale } });
  expect(replay.status()).toBe(401);
  expect(await replay.json()).toEqual({ signedIn: false });

  const token = await page.request.post("/api/upload", {
    headers: { cookie: stale, "content-type": "application/json" },
    data: { type: "blob.generate-client-token", payload: { pathname: "x/y/z.pdf", clientPayload: "{}", multipart: false, callbackUrl: "http://localhost/api/upload" } },
  });
  expect(token.status()).toBe(400);
  expect((await token.json()).error).toBe("Sign in to upload files.");
  await context.close();
});

test("[US-023] finance staff cannot mint upload sessions", async ({ browser }) => {
  const { context, page } = await cookieFor(browser, PEOPLE.daniel);
  const response = await page.request.get("/api/upload/session");
  expect(response.status()).toBe(401);
  await context.close();
});
