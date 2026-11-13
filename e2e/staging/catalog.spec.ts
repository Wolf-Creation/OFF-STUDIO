import { apiBaseUrl, expect, getAvailableProduct, selectProductVariant, storefrontUrl, test } from './fixtures'

test.describe('catalog and variants', () => {
  test('product detail shows an available color, size, price, and stock state', async ({ page, request }) => {
    const { product, variant } = await getAvailableProduct(request)
    await selectProductVariant(page, product, variant)

    await expect(page.locator('.product-price')).toContainText('TND')
    await expect(page.locator('.product-stock-badge')).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Select color ${variant.color}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: `Size ${variant.size}`, exact: true })).toHaveClass(/active/)
  })

  test('category and collection listings expose live catalog data', async ({ page, request }) => {
    const categoriesResponse = await request.get(`${apiBaseUrl}/categories`)
    const collectionsResponse = await request.get(`${apiBaseUrl}/collections`)
    expect(categoriesResponse.status()).toBe(200)
    expect(collectionsResponse.status()).toBe(200)
    const categories = await categoriesResponse.json()
    const collections = await collectionsResponse.json()
    expect(categories.data.length).toBeGreaterThan(0)
    expect(collections.data.length).toBeGreaterThan(0)

    await page.goto(`${storefrontUrl}/shop`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /ready-to-wear/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
    await expect(page.getByRole('button', { name: /All pieces \d+/ })).toBeVisible()
    await expect(page.locator('main article').first()).toBeVisible()

    await page.goto(`${storefrontUrl}/collections`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ edits/)).toBeVisible()
    await expect(page.getByRole('link', { name: /A considered uniform/i })).toBeVisible()
  })
})
