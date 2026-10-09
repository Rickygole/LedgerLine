import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    authInterrupts: true,
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
