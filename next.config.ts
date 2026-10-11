import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function commit(): string {
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { BUILD_COMMIT: commit() },
  outputFileTracingIncludes: {
    "/finance/submissions/[id]/pdf": ["./lib/report/fonts/**"],
    "/portal/reports/[id]/pdf": ["./lib/report/fonts/**"],
  },
  experimental: {
    authInterrupts: true,
    serverActions: {
      bodySizeLimit: "30mb",
    },
    middlewareClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
