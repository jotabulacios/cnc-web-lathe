import { defineConfig } from '@playwright/test';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:3199${basePath}/`,
    browserName: 'chromium',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-export.mjs',
    url: `http://127.0.0.1:3199${basePath}/`,
    reuseExistingServer: false,
  },
});
