import { adminUrl, apiBaseUrl, expect, signInAdmin, storefrontUrl, test } from './fixtures'

function isStagingSafe() {
  const isLocalService = (value: string) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    } catch {
      return false
    }
  }

  return process.env.NODE_ENV === 'staging'
    && process.env.MONGODB_DB_NAME === 'off_studio_staging'
    && process.env.ONLINE_PAYMENT_ENABLED === 'false'
    && process.env.ALLOW_SYNTHETIC_DATA === 'false'
    && !!process.env.ADMIN_EMAIL
    && !!process.env.ADMIN_PASSWORD
    && !!process.env.JWT_SECRET
    && isLocalService(apiBaseUrl)
    && isLocalService(storefrontUrl)
    && isLocalService(adminUrl)
}

test.describe('staging smoke @smoke', () => {
  test.beforeAll(() => {
    if (!isStagingSafe()) {
      throw new Error('Staging E2E refused: staging config, local service URLs, and secure admin credentials are required.')
    }
  })

  test('API health is ready and stays on the staging database', async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/health`)
    expect(response.ok()).toBeTruthy()

    const payload = await response.json()
    expect(payload.mode).toBe('staging')
    expect(payload.databaseName ?? '').toBe('off_studio_staging')
    expect(payload.targetVerified).toBe(true)
    expect(payload.onlinePaymentEnabled).toBe(false)
    expect(payload.syntheticDataPermission).toBe(false)
  })

  test('admin login succeeds and the protected me endpoint accepts the JWT', async ({ request }) => {
    const token = await signInAdmin(request)

    const meResponse = await request.get(`${apiBaseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(meResponse.ok()).toBeTruthy()
    const me = await meResponse.json()
    expect(me.data?.role).toBe('admin')

    const adminReads = [
      { path: '/admin-preview/dashboard', isList: false },
      { path: '/admin-preview/orders', isList: true },
      { path: '/admin-preview/products', isList: true },
      { path: '/analytics/admin/overview?days=30', isList: false },
    ]
    for (const endpoint of adminReads) {
      const response = await request.get(`${apiBaseUrl}${endpoint.path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(response.ok(), `${endpoint.path} should be readable by the staging admin`).toBeTruthy()
      const payload = await response.json()
      expect(payload.data).toBeTruthy()
      if (endpoint.isList) expect(Array.isArray(payload.data)).toBeTruthy()
    }
  })

  test('storefront catalog, categories, and collections are available', async ({ request }) => {
    const endpoints = ['/products?limit=100', '/categories', '/collections']
    for (const endpoint of endpoints) {
      const response = await request.get(`${apiBaseUrl}${endpoint}`)
      expect(response.ok(), `${endpoint} should be available`).toBeTruthy()
      const payload = await response.json()
      expect(Array.isArray(payload.data)).toBeTruthy()
      expect(payload.data.length).toBeGreaterThan(0)
    }
  })

  test('storefront loads and exposes the primary storefront navigation', async ({ page }) => {
    const response = await page.goto(storefrontUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    expect(response?.ok()).toBeTruthy()

    for (const label of ['Shop', 'Collections', 'About']) {
      await expect(page.getByRole('link', { name: new RegExp(label, 'i') }).first()).toBeVisible({ timeout: 15_000 })
    }
  })

  test('admin sign-in page loads', async ({ page }) => {
    const response = await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    expect(response?.ok()).toBeTruthy()
    await expect(page.getByText(/sign in|login|OFF Studio|admin/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('payment endpoints remain disabled in staging', async ({ request }) => {
    const responses = [
      await request.post(`${apiBaseUrl}/orders/checkout`, { data: {} }),
      await request.get(`${apiBaseUrl}/orders/checkout/session/cs_test_readonly`),
      await request.post(`${apiBaseUrl}/payments/webhook`, {
        headers: { 'content-type': 'application/json' },
        data: '{}',
      }),
    ]

    for (const response of responses) {
      expect(response.status()).toBe(503)
      const payload = await response.json()
      expect(payload.error?.code).toBe('ONLINE_PAYMENT_DISABLED')
    }
  })
})
