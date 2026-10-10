import "../lib/load-env";

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  const base = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
  const response = await fetch(`${base}/api/cron/reminders`, { headers: { authorization: `Bearer ${secret}` } });
  const text = await response.text();
  console.log(`${response.status} ${text}`);
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
