import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/agent-host/src/**/*.test.ts", "scripts/**/*.test.mjs"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
