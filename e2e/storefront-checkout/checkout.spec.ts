import { expect, test } from '@playwright/test'

const apiOrigin = 'http://127.0.0.1:5000/api/v1'

test('checkout separates information, delivery, and payment into navigable steps', async ({ page }) => {
  const orderWrites: string[] = []
  await page.addInitScript(() => localStorage.setItem('off-preview-bag', JSON.stringify([{
    productId: 'product-1',
    quantity: 2,
    size: 'M',
    color: 'White',
    sku: 'OFF-TEE-M',
    name: 'Logo T-shirt',
    price: 690,
    image: '/product-shirt.png',
  }])))
  await page.route(`${apiOrigin}/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/orders/checkout/cod')) orderWrites.push(route.request().method())
    let data: unknown = {}
    if (url.pathname.endsWith('/products')) data = [{
      _id: 'product-1',
      name: 'Logo T-shirt',
      slug: 'logo-t-shirt',
      description: '',
      shortDescription: '',
      categoryId: 'tops',
      category: 'Tops',
      images: [{ url: '/product-shirt.png', alt: 'Logo T-shirt', order: 0 }],
      variants: [{ sku: 'OFF-TEE-M', color: 'White', size: 'M', price: 690, stock: 10, image: '', active: true }],
      price: 690,
      status: 'active',
      featured: false,
    }]
    else if (url.pathname.endsWith('/categories') || url.pathname.endsWith('/collections')) data = []
    else if (url.pathname.endsWith('/store/content')) data = { freeShippingThreshold: 500 }
    else if (url.pathname.endsWith('/home') || url.pathname.endsWith('/navigation')) data = null
    else if (url.pathname.endsWith('/settings')) data = {}
    await route.fulfill({ json: { data } })
  })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Contact info' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Where should we deliver?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Delivery method' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Payment', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Email address')).toHaveAttribute('type', 'email')
  await expect(page.getByLabel('First name')).toHaveAttribute('autocomplete', 'given-name')
  await expect(page.getByLabel('Last name')).toHaveAttribute('autocomplete', 'family-name')
  await expect(page.getByLabel('Phone number')).toHaveAttribute('autocomplete', 'tel')
  await expect(page.getByLabel('Street address')).toHaveAttribute('autocomplete', 'address-line1')
  await expect(page.getByLabel('Apartment, suite, etc. Optional')).toHaveAttribute('autocomplete', 'address-line2')
  await expect(page.getByLabel('Governorate')).toBeVisible()
  await expect(page.getByLabel('Delegation')).toBeVisible()
  await expect(page.getByLabel('Postal code Optional')).toHaveAttribute('autocomplete', 'postal-code')
  await expect(page.getByRole('heading', { name: 'In your bag (2)' })).toBeVisible()
  await expect(page.locator('.checkout-summary-product strong')).toHaveText('Logo T-shirt')
  await expect(page.locator('.checkout-summary-totals')).toContainText(/1\s?380 TND/)
  await expect(page.locator('.checkout-summary-totals')).toContainText('Complimentary')
  await expect(page.locator('.store-header')).toHaveCount(0)
  await expect(page.locator('.store-footer')).toHaveCount(0)
  await expect(page.locator('.whatsapp-float')).toHaveCount(0)
  await expect(page.locator('.checkout-steps')).toBeVisible()
  const emailHeight = await page.locator('#checkout-email').evaluate(element => element.getBoundingClientRect().height)
  await page.getByLabel('First name').fill('Amina')
  await page.getByLabel('Last name').fill('Ben Ali')
  await page.getByLabel('Street address').fill('10 Avenue Habib Bourguiba')
  await page.getByRole('button', { name: 'Continue to delivery' }).click()
  await expect(page.getByRole('heading', { name: 'Delivery method' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Contact info' })).toHaveCount(0)
  await expect(page.locator('.checkout-steps [aria-current="step"]')).toHaveText('02 Delivery')
  await page.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(page.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Delivery method' })).toHaveCount(0)
  await expect(page.locator('.checkout-steps [aria-current="step"]')).toHaveText('03 Payment')
  await expect(page.locator('.checkout-total')).toContainText(/1\s?380 TND/)
  await page.getByRole('button', { name: 'Back to delivery' }).click()
  await expect(page.getByRole('heading', { name: 'Delivery method' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue to payment' }).click()
  expect(orderWrites).toEqual([])

  const desktopOrder = await page.evaluate(() => ({
    form: document.querySelector('.checkout-form-column')!.getBoundingClientRect(),
    summary: document.querySelector('.checkout-summary')!.getBoundingClientRect(),
    headerHeight: document.querySelector('.checkout-header')!.getBoundingClientRect().height,
  }))
  expect(desktopOrder.summary.x).toBeGreaterThan(desktopOrder.form.x)
  expect(emailHeight).toBe(52)
  expect(desktopOrder.headerHeight).toBe(76)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.checkout-steps')).toBeHidden()
  const mobileOrder = await page.evaluate(() => ({
    formTop: document.querySelector('.checkout-form-column')!.getBoundingClientRect().top,
    summaryTop: document.querySelector('.checkout-summary')!.getBoundingClientRect().top,
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }))
  expect(mobileOrder.summaryTop).toBeLessThan(mobileOrder.formTop)
  expect(mobileOrder.documentWidth).toBe(mobileOrder.viewportWidth)
  expect(orderWrites).toEqual([])
})
