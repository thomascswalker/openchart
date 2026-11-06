import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-storybook',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:6007',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command:
      'npm run build-storybook && vite preview --outDir storybook-static --host 127.0.0.1 --port 6007 --strictPort --base /',
    url: 'http://127.0.0.1:6007',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
