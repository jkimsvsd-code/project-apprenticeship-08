import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 90_000, expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'], baseURL: 'http://localhost:4318',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
    locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1440, height: 1000 },
    trace: 'off', video: 'off', screenshot: 'off',
  },
  webServer: { command: 'node --import tsx scripts/test-server.ts', url: 'http://localhost:4318/api/health', reuseExistingServer: false, timeout: 30_000 },
});
