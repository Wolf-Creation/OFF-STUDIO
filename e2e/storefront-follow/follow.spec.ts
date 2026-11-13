import { expect, test } from '@playwright/test'

const apiOrigin = 'http://127.0.0.1:5000/api/v1'

async function mockStoreApi(page: import('@playwright/test').Page) {
  await page.route(`${apiOrigin}/**`, async route => {
    const url = new URL(route.request().url())
    let data: unknown = {}
    if (url.pathname.endsWith('/products') || url.pathname.endsWith('/categories') || url.pathname.endsWith('/collections')) data = []
    else if (url.pathname.endsWith('/store/content')) data = {}
    else if (url.pathname.endsWith('/store/content/home') || url.pathname.endsWith('/store/content/navigation')) data = null
    else if (url.pathname.endsWith('/store/content/settings')) data = {
      instagramUrl: 'https://instagram.com/off.studio',
      tiktokUrl: 'https://www.tiktok.com/@offstudio',
      facebookUrl: 'https://facebook.com/offstudio',
      whatsappNumber: '+216 20 123 456',
    }
    await route.fulfill({ json: { data } })
  })
}

test('Follow landing renders configured social links as a standalone page at mobile width', async ({ page }) => {
  await mockStoreApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/follow')

  await expect(page).toHaveTitle('Follow OFF')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText('Stay outside the frame.')
  await expect(page.locator('.social-card')).toHaveCount(4)
  await expect(page.locator('.social-card').nth(0)).toHaveAttribute('href', 'https://instagram.com/off.studio')
  await expect(page.locator('.social-card').nth(0)).toContainText('@off.studio')
  await expect(page.locator('.social-card').nth(1)).toContainText('@offstudio')
  await expect(page.locator('.social-card').nth(2)).toContainText('offstudio')
  await expect(page.locator('.social-card').nth(3)).toHaveAttribute('href', 'https://wa.me/21620123456')
  await expect(page.locator('.social-card').nth(3)).toContainText('+216 20 123 456')
  await expect(page.locator('.store-header')).toHaveCount(0)
  await expect(page.locator('.store-footer')).toHaveCount(0)
  await expect(page.locator('.whatsapp-float')).toHaveCount(0)
  await expect(page.locator('.bag-link')).toHaveCount(0)

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    landingWidth: document.querySelector('.social-landing')?.getBoundingClientRect().width ?? 0,
  }))
  expect(dimensions.documentWidth).toBe(dimensions.viewportWidth)
  expect(dimensions.landingWidth).toBe(390)
  for (const width of [320, 520]) {
    await page.setViewportSize({ width, height: 844 })
    const responsiveWidth = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }))
    expect(responsiveWidth.documentWidth).toBe(responsiveWidth.viewportWidth)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  const desktop = await page.locator('.social-landing').boundingBox()
  expect(desktop?.width).toBe(520)
  expect(desktop?.x).toBe(460)

  await page.goto('/shop')
  await expect(page.locator('.store-header')).toBeVisible()
  await expect(page.locator('.store-footer')).toBeAttached()
  await expect(page.locator('.whatsapp-float')).toBeAttached()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('Follow social cards are omitted for missing settings and the normal storefront shell returns on other routes', async ({ page }) => {
  await page.route(`${apiOrigin}/**`, async route => {
    const url = new URL(route.request().url())
    let data: unknown = {}
    if (url.pathname.endsWith('/products') || url.pathname.endsWith('/categories') || url.pathname.endsWith('/collections')) data = []
    else if (url.pathname.endsWith('/store/content')) data = {}
    else if (url.pathname.endsWith('/store/content/home') || url.pathname.endsWith('/store/content/navigation')) data = null
    else if (url.pathname.endsWith('/store/content/settings')) data = { instagramUrl: '', tiktokUrl: '', facebookUrl: '', whatsappNumber: '' }
    await route.fulfill({ json: { data } })
  })
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/follow')
  await expect(page.locator('.social-card')).toHaveCount(0)
  const narrowWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }))
  expect(narrowWidth.document).toBe(narrowWidth.viewport)

  await page.goto('/shop')
  await expect(page.locator('.store-header')).toBeVisible()
  await expect(page.locator('.store-footer')).toBeAttached()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('reduced motion presents the first film word without animated card entrances', async ({ page }) => {
  await mockStoreApi(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/follow')
  await expect(page.locator('.social-card')).toHaveCount(4)
  const motion = await page.locator('.social-film-words span').evaluateAll(elements => elements.map(element => ({
    display: getComputedStyle(element).display,
    animationName: getComputedStyle(element).animationName,
  })))
  expect(motion[0]).toMatchObject({ display: 'block', animationName: 'none' })
  expect(motion.slice(1).every(word => word.display === 'none')).toBe(true)
  expect(await page.locator('.social-card').first().evaluate(element => getComputedStyle(element).opacity)).toBe('1')
})
