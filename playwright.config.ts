import { defineConfig, devices } from '@playwright/test';

const testPort = Number(process.env.SWIFTVOICE_TEST_PORT ?? '3000');
const testBaseURL = 'http://127.0.0.1:' + testPort;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: testBaseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port ' + testPort + ' --strictPort',
    url: testBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
