import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import svgr from "vite-plugin-svgr"; // 1. Import the SVGR plugin
import packageJson from "../../package.json" with { type: "json" };
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react(), svgr()],
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
