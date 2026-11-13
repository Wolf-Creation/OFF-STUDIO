import { expect, test } from '@playwright/test'

const apiOrigin = 'http://127.0.0.1:5000/api/v1'

test('desktop mega menus and mobile drawer accordions use live catalog data', async ({ page }) => {
  const products = [
    { _id: 'jacket', name: 'Leather Jacket', slug: 'leather-jacket', category: 'Outerwear', categoryId: 'outerwear', price: 4200, images: [{ url: '/jacket.png', alt: '', order: 0 }], variants: [], status: 'active', featured: true, createdAt: '2026-10-10T00:00:00Z' },
    { _id: 'cap', name: 'MA Cap', slug: 'ma-cap', category: 'Accessories', categoryId: 'accessories', price: 450, images: [{ url: '/cap.png', alt: '', order: 0 }], variants: [], status: 'active', featured: false, createdAt: '2026-10-09T00:00:00Z' },
    { _id: 'denim', name: 'Denim Jeans', slug: 'denim-jeans', category: 'Denim', categoryId: 'denim', price: 1280, images: [{ url: '/denim.png', alt: '', order: 0 }], variants: [], status: 'active', featured: false, createdAt: '2026-10-08T00:00:00Z' },
  ]
  const categories = [
    { _id: 'outerwear', name: 'Outerwear', slug: 'outerwear', image: '', productCount: 1 },
    { _id: 'denim', name: 'Denim', slug: 'denim', image: '', productCount: 1 },
    { _id: 'accessories', name: 'Accessories', slug: 'accessories', image: '', productCount: 1 },
  ]
  await page.route(`${apiOrigin}/**`, async route => {
    const url = new URL(route.request().url())
    let data: unknown = {}
    if (url.pathname.endsWith('/products')) data = products
    else if (url.pathname.endsWith('/categories')) data = categories
    else if (url.pathname.endsWith('/collections')) data = [{
      _id: 'menswear',
      name: 'Menswear',
      slug: 'menswear',
      description: '',
      image: '',
      productIds: ['jacket'],
      productCount: 1,
      displayOrder: 0,
      status: 'active',
    }]
    else if (url.pathname.endsWith('/store/content')) data = { freeShippingThreshold: 500 }
    else if (url.pathname.endsWith('/home') || url.pathname.endsWith('/navigation')) data = null
    else if (url.pathname.endsWith('/settings')) data = {}
    await route.fulfill({ json: { data, pagination: { page: 1, limit: 100, total: products.length, pages: 1 } } })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const cookieBanner = page.getByRole('complementary', { name: 'Cookie consent' })
  if (await cookieBanner.isVisible()) await page.getByRole('button', { name: 'Reject All' }).click()
  const shopTrigger = page.getByRole('button', { name: 'Shop all' })
  await expect(shopTrigger).toHaveAttribute('aria-expanded', 'false')
  await shopTrigger.click()
  await expect(shopTrigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { name: 'The latest edit' })).toBeVisible()
  await expect(page.locator('.mega-category-list')).toContainText('Outerwear')
  await expect(page.locator('.mega-category-list')).toContainText('1')
  await expect(page.locator('.mega-product-card')).toHaveCount(2)
  await page.mouse.click(8, 820)
  await expect(shopTrigger).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Collections' }).click()
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible()
  await expect(page.locator('.mega-collection-link').first()).toContainText('Menswear')
  await expect(page.locator('.mega-feature-column .mega-product-card')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator('.mega-menu-panel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Shop all' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'The latest edit' })).toBeVisible()
  await page.locator('.mega-menu-list').getByRole('link', { name: 'Shop all' }).click()
  await expect(page).toHaveURL(/\/shop$/)
  await expect(page.locator('.mega-menu-panel')).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Shop all' }).last().click()
  await expect(page.locator('.drawer-menu-submenu')).toBeVisible()
  await expect(page.locator('.drawer-menu-submenu .mega-product-card')).toHaveCount(0)
  await expect(page.locator('.drawer-menu-submenu')).toContainText('Outerwear')
  await page.getByRole('button', { name: 'Collections' }).last().click()
  await expect(page.locator('#drawer-collections-links')).toBeVisible()
  await expect(page.locator('#drawer-collections-links .mega-collection-link')).toHaveCount(3)
})
