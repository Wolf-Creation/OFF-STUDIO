import { defineConfig, devices } from '@playwright/test'

const storefrontUrl = 'http://localhost:5173'

export default defineConfig({
  testDir: './storefront-megamenu',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: storefrontUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @off/storefront dev',
    url: storefrontUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
