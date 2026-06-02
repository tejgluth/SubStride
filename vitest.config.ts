import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["analytics/tests/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@substride/analytics": new URL("./analytics/src/index.ts", import.meta.url).pathname
    }
  }
});
