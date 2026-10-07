import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "ts-audio": "ts-audio/dist/index.modern.mjs",
    },
  },
  test: {
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
