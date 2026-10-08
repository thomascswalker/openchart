import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "ts-audio": "ts-audio/dist/index.modern.mjs",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
