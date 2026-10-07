import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "ts-audio": "ts-audio/dist/index.modern.mjs",
    },
  },
  test: {
    setupFiles: ["./src/test-setup.ts"],
  },
});
