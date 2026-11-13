import { adminUrl, apiBaseUrl, expect, openAuthenticatedAdmin, signInAdmin, test } from './fixtures'

test.describe('admin authentication and dashboard', () => {
  test('admin login issues a JWT accepted by /auth/me and loads the dashboard', async ({ page, request }) => {
    const token = await signInAdmin(request)
    const me = await request.get(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(me.status()).toBe(200)
    expect((await me.json()).data.role).toBe('admin')

    await openAuthenticatedAdmin(page, token, '/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByText('Total Sales')).toBeVisible()

    await page.goto(adminUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in to OFF Studio' })).toBeVisible()
  })

  test('protected admin read and mutation routes reject requests without a JWT', async ({ request }) => {
    for (const [method, path] of [
      ['GET', '/admin-preview/dashboard'],
      ['GET', '/admin-preview/orders'],
      ['GET', '/analytics/admin/overview?days=30'],
      ['PATCH', '/admin-preview/orders/000000000000000000000001/fulfillment'],
      ['PATCH', '/admin-preview/orders/000000000000000000000001/payment'],
    ] as const) {
      const response = method === 'GET'
        ? await request.get(`${apiBaseUrl}${path}`)
        : await request.patch(`${apiBaseUrl}${path}`, { data: { fulfillmentStatus: 'processing' } })
      expect(response.status(), `${method} ${path} must require admin authentication`).toBe(401)
      expect((await response.json()).error.code).toBe('UNAUTHENTICATED')
    }
  })
})
