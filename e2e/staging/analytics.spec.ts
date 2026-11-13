import { apiBaseUrl, expect, openAuthenticatedAdmin, signInAdmin, test } from './fixtures'

test.describe('admin analytics', () => {
  test('analytics API and overview page load using staging admin access', async ({ page, request }) => {
    const token = await signInAdmin(request)
    const response = await request.get(`${apiBaseUrl}/analytics/admin/overview?days=30`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status()).toBe(200)
    expect((await response.json()).data).toBeTruthy()

    await openAuthenticatedAdmin(page, token, '/analytics/overview')
    await expect(page.getByRole('heading', { name: /analytics|overview/i }).first()).toBeVisible()
    await expect(page.locator('.admin-alert')).toHaveCount(0)
  })
})
