import { defineConfig, devices } from '@playwright/test'

const adminUrl = 'http://localhost:5174'

export default defineConfig({
  testDir: './analytics-ui',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: adminUrl,
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @off/admin dev',
    url: adminUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
