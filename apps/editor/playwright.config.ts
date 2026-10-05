import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173/midiview/",
    viewport: { width: 1600, height: 1000 },
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173/midiview/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
