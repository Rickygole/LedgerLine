import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 300_000,
  },
});
