import { expect, test } from '@playwright/test'

const apiOrigin = 'http://127.0.0.1:5000/api/v1'

test('shared footer renders manifesto, live social links, and navigation', async ({ page }) => {
  const products = [
    { _id: 'p-outerwear', name: 'Leather Jacket', slug: 'leather-jacket', category: 'Outerwear', categoryId: 'outerwear', price: 4200, images: [{ url: '/jacket.png', alt: '', order: 0 }], variants: [], status: 'active', featured: true, createdAt: '2026-10-10T00:00:00Z' },
    { _id: 'p-accessories', name: 'MA Cap', slug: 'ma-cap', category: 'Accessories', categoryId: 'accessories', price: 450, images: [{ url: '/cap.png', alt: '', order: 0 }], variants: [], status: 'active', featured: false, createdAt: '2026-10-09T00:00:00Z' },
  ]
  await page.route(`${apiOrigin}/**`, async route => {
    const url = new URL(route.request().url())
    let data: unknown = {}
    if (url.pathname.endsWith('/products')) data = products
    else if (url.pathname.endsWith('/categories')) data = [
      { _id: 'outerwear', name: 'Outerwear', slug: 'outerwear', image: '', productCount: 1 },
      { _id: 'accessories', name: 'Accessories', slug: 'accessories', image: '', productCount: 1 },
    ]
    else if (url.pathname.endsWith('/collections')) data = [{
      _id: 'menswear',
      name: 'Menswear',
      slug: 'menswear',
      description: '',
      image: '',
      productIds: ['p-outerwear'],
      productCount: 1,
      displayOrder: 0,
      status: 'active',
    }]
    else if (url.pathname.endsWith('/store/content')) data = { freeShippingThreshold: 500 }
    else if (url.pathname.endsWith('/home') || url.pathname.endsWith('/navigation')) data = null
    else if (url.pathname.endsWith('/settings')) data = {
      instagramUrl: 'https://instagram.com/off',
      facebookUrl: 'https://facebook.com/off',
      tiktokUrl: 'https://tiktok.com/@off',
      whatsappNumber: '+216 20 000 000',
    }
    await route.fulfill({ json: { data, pagination: { page: 1, limit: 100, total: products.length, pages: 1 } } })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const cookieBanner = page.getByRole('complementary', { name: 'Cookie consent' })
  if (await cookieBanner.isVisible()) await page.getByRole('button', { name: 'Reject All' }).click()
  await expect(page.getByRole('region', { name: 'OFF manifesto' })).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(page.locator('.off-site-footer')).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(page.locator('.off-manifesto-notes')).toHaveCount(0)
  await expect(page.locator('.off-footer-assurances')).toHaveCount(0)
  await expect(page.getByText('Join the OFF list')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Shop' })).toContainText('Menswear')
  await expect(page.getByRole('navigation', { name: 'OFF sur les réseaux sociaux' }).getByRole('link')).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'OFF sur WhatsApp' })).toHaveAttribute('href', 'https://wa.me/21620000000')

  await page.goto('/shop')
  await expect(page.getByRole('region', { name: 'OFF manifesto' })).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(page.locator('.off-footer-assurances')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Help' })).toContainText('Cash on delivery')
  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  await expect(page.getByRole('navigation', { name: 'Studio' })).toBeVisible()

  await page.goto('/checkout')
  await expect(page.locator('.off-site-footer')).toHaveCount(0)
  await expect(page.locator('.checkout-footer')).toBeVisible()
})
