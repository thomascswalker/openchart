import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    printConsoleTrace: true,
    disableConsoleIntercept: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
