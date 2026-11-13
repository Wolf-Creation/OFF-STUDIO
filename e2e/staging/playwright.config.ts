import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

const envFilePath = path.resolve(__dirname, '../../apps/api/.env.staging')
if (fs.existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath })
}
if (process.env.ONLINE_PAYMENT_ENABLED === undefined) {
  process.env.ONLINE_PAYMENT_ENABLED = 'false'
}

const storefrontUrl = process.env.STAGING_FRONTEND_URL ?? 'http://localhost:5173'
const adminUrl = process.env.STAGING_ADMIN_URL ?? 'http://localhost:5174'
const apiBaseUrl = process.env.STAGING_API_BASE_URL ?? 'http://127.0.0.1:5000/api/v1'

export default defineConfig({
  testDir: './',
  outputDir: 'test-results',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: storefrontUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
    },
  }],
  expect: {
    timeout: 15_000,
  },
  metadata: {
    storefrontUrl,
    adminUrl,
    apiBaseUrl,
  },
})
