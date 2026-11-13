import { expect, getAvailableProduct, selectProductVariant, test, storefrontUrl } from './fixtures'

test.describe('local cart', () => {
  test('add item, change quantity, persist after reload, and remove it', async ({ page, request }) => {
    const { product, variant } = await getAvailableProduct(request, 2)
    await selectProductVariant(page, product, variant)
    await page.getByRole('button', { name: 'ADD TO BAG' }).click()
    await expect(page.getByText('Added to your bag.')).toBeVisible()

    await page.goto(`${storefrontUrl}/cart`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'YOUR BAG (1)' })).toBeVisible()
    const line = page.locator('.cart-line').filter({ hasText: product.name })
    await expect(line).toBeVisible()
    await expect(line.locator('.quantity-control span')).toHaveText('1')
    await line.getByRole('button', { name: 'Increase quantity' }).click()
    await expect(line.locator('.quantity-control span')).toHaveText('2')
    await expect(page.locator('.order-summary')).toContainText('Total')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'YOUR BAG (2)' })).toBeVisible()
    const storedBag = await page.evaluate(() => JSON.parse(localStorage.getItem('off-preview-bag') ?? '[]'))
    expect(storedBag).toHaveLength(1)
    expect(storedBag[0].quantity).toBe(2)

    await page.locator('.cart-line').filter({ hasText: product.name }).getByRole('button', { name: `Remove ${product.name}` }).click()
    await expect(page.getByText('Your bag is currently empty.')).toBeVisible()
    await expect(page.evaluate(() => localStorage.getItem('off-preview-bag'))).resolves.toBe('[]')
  })
})
