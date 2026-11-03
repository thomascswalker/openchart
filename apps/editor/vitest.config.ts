import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import packageJson from "../../package.json" with { type: "json" };
import viteConfig from "./vite.config.js";

export default defineConfig((configEnv) =>
  mergeConfig(viteConfig(configEnv), {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
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
  }),
);
