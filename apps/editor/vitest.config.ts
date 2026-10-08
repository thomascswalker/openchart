import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import svgr from "vite-plugin-svgr"; // 1. Import the SVGR plugin
export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      "ts-audio": "ts-audio/dist/index.modern.mjs",
    },
  },
  test: {
    fileParallelism: false,
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./src/testSetup.ts"],
    reporters: ["default", "hanging-process"],
    teardownTimeout: 10_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
