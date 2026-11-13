import { expect, getAvailableProduct, selectProductVariant, test, storefrontUrl } from './fixtures'

test.describe('COD checkout presentation', () => {
  test('validates shipping details, displays totals, and offers COD without online payment choices', async ({ page, request }) => {
    const { product, variant } = await getAvailableProduct(request)
    await selectProductVariant(page, product, variant)
    await page.getByRole('button', { name: 'ADD TO BAG' }).click()
    await page.goto(`${storefrontUrl}/checkout`, { waitUntil: 'domcontentloaded' })

    const form = page.locator('form.checkout-form')
    await expect(form).toBeVisible()
    await expect(form.getByLabel('First name')).toBeVisible()
    await expect(form.getByLabel('Last name')).toBeVisible()
    await expect(form.getByLabel('Phone number')).toBeVisible()
    await expect(form.getByLabel('Address', { exact: true })).toBeVisible()
    await expect(form.getByLabel('Governorate')).toBeVisible()
    await expect(form.getByLabel('Delegation')).toBeVisible()
    expect(await form.evaluate(element => (element as HTMLFormElement).checkValidity())).toBe(false)

    await expect(form.getByText('Cash on delivery')).toBeVisible()
    await expect(form.getByText('Standard delivery · 3–5 days')).toBeVisible()
    await expect(form.getByText('Complimentary')).toBeVisible()
    await expect(form.getByText('Order total', { exact: true })).toBeVisible()
    await expect(form.getByRole('button', { name: /confirm order — pay on delivery/i })).toBeVisible()
    await expect(form.getByText(/stripe|credit card|card payment|pay by card/i)).toHaveCount(0)
    await expect(form.locator('input[name="payment"]')).toHaveCount(1)
    await expect(form.locator('input[name="payment"]')).toBeChecked()
  })

  test('a COD order is not submitted by validation-only checkout coverage', async ({ page }) => {
    await page.goto(`${storefrontUrl}/checkout`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Add something to your bag before checkout.')).toBeVisible()
    await expect(page.getByRole('button', { name: /confirm order/i })).toHaveCount(0)
  })

  test('creates an isolated COD test order and safely removes only its test data', async () => {
    test.skip(true, 'SKIPPED: staging has no explicitly test-reserved, non-synthetic stocked product; there is also no verified scoped cleanup procedure that safely restores stock and removes only test-owned records.')
  })
})
