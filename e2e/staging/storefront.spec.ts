import { expect, test, storefrontUrl } from './fixtures'

test.describe('storefront navigation', () => {
  test('home, shop, collections, and about navigation work', async ({ page }) => {
    const homeResponse = await page.goto(storefrontUrl, { waitUntil: 'domcontentloaded' })
    expect(homeResponse?.status()).toBe(200)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()

    await page.getByRole('link', { name: 'Shop all' }).click()
    await expect(page).toHaveURL(/\/shop$/)
    await expect(page.getByRole('heading', { name: /ready-to-wear/i })).toBeVisible()

    await page.getByRole('link', { name: 'Collections', exact: true }).click()
    await expect(page).toHaveURL(/\/collections$/)
    await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible()

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'About', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { name: /about off/i })).toBeVisible()
  })
})
