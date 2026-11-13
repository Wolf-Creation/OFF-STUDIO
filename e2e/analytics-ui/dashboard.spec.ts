import { expect, test } from '@playwright/test'

const apiOrigin = 'http://127.0.0.1:5000/api/v1'

type Overview = {
  period: { month?: string; from: string; to: string }
  metrics: {
    visitors: number
    sessions: number
    pageViews: number
    orders: number
    revenue: number
    conversionRate: number | null
    averageOrderValue: number | null
    returningVisitorRate: number | null
    activeVisitors: number
    checkoutAbandonedSessions: number
    checkoutAbandonmentRate: number | null
  }
  comparison: { visitors: number; sessions: number; pageViews: number; orders: number; revenue: number }
  daily: { date: string; visitors: number; sessions: number; pageViews: number; orders: number; revenue: number }[]
  topViewed: unknown[]
  topWishlisted: unknown[]
  topAddedToCart: unknown[]
  topPurchased: unknown[]
  topCollections: unknown[]
  sources: unknown[]
  pages: unknown[]
  funnel: unknown[]
  attribution: { firstTouch: unknown[]; lastTouch: unknown[] }
  ctas: unknown[]
  demand: { sizes: unknown[]; colors: unknown[]; sizeStock: unknown[]; colorStock: unknown[] }
  advanced: {
    insights: unknown[]
    campaigns: { visitors: unknown[]; firstTouch: unknown[]; lastTouch: unknown[]; campaignCostDataAvailable: boolean; roiAvailable: boolean }
    products: unknown[]
    highInterestLowConversion: unknown[]
    mostViewedWithoutPurchases: unknown[]
    highOpportunityProducts: unknown[]
    bestPerformingProducts: unknown[]
    inventory: { products: unknown[]; variantAlerts: unknown[] }
    variants: unknown[]
    variantSizes: unknown[]
    variantColors: unknown[]
    collectionPerformance: unknown[]
    checkout: { stages: unknown[]; abandonedCheckouts: number; abandonmentRate: number | null; abandonedByStep: unknown[]; mostCommonExitStep: unknown | null; maturityMinutes: number; paymentStepsAvailable: boolean }
    customers: { metrics: { firstTimeCustomers: number; returningCustomers: number; periodCustomers: number; repeatPurchaseRate: number | null; averagePurchaseFrequency: number | null; averageDaysBetweenPurchases: number | null; averageLifetimeValue: number | null }; cohorts: unknown[] }
  }
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    from: new Date(Date.UTC(year!, monthNumber! - 1, 1)).toISOString(),
    to: new Date(Date.UTC(year!, monthNumber!, 1)).toISOString(),
  }
}

function overview(month = '2024-12', visitors = 0, date = '2024-12-01'): Overview {
  const bounds = monthBounds(month)
  return {
    period: { month, ...bounds },
    metrics: {
      visitors,
      sessions: visitors,
      pageViews: visitors,
      orders: 0,
      revenue: 0,
      conversionRate: null,
      averageOrderValue: null,
      returningVisitorRate: null,
      activeVisitors: 0,
      checkoutAbandonedSessions: 0,
      checkoutAbandonmentRate: null,
    },
    comparison: { visitors: 0, sessions: 0, pageViews: 0, orders: 0, revenue: 0 },
    daily: visitors ? [{ date, visitors, sessions: visitors, pageViews: visitors, orders: 0, revenue: 0 }] : [],
    topViewed: [],
    topWishlisted: [],
    topAddedToCart: [],
    topPurchased: [],
    topCollections: [],
    sources: [],
    pages: [],
    funnel: [],
    attribution: { firstTouch: [], lastTouch: [] },
    ctas: [],
    demand: { sizes: [], colors: [], sizeStock: [], colorStock: [] },
    advanced: {
      insights: [],
      campaigns: { visitors: [], firstTouch: [], lastTouch: [], campaignCostDataAvailable: false, roiAvailable: false },
      products: [],
      highInterestLowConversion: [],
      mostViewedWithoutPurchases: [],
      highOpportunityProducts: [],
      bestPerformingProducts: [],
      inventory: { products: [], variantAlerts: [] },
      variants: [],
      variantSizes: [],
      variantColors: [],
      collectionPerformance: [],
      checkout: { stages: [], abandonedCheckouts: 0, abandonmentRate: null, abandonedByStep: [], mostCommonExitStep: null, maturityMinutes: 30, paymentStepsAvailable: false },
      customers: {
        metrics: {
          firstTimeCustomers: 0,
          returningCustomers: 0,
          periodCustomers: 0,
          repeatPurchaseRate: null,
          averagePurchaseFrequency: null,
          averageDaysBetweenPurchases: null,
          averageLifetimeValue: null,
        },
        cohorts: [],
      },
    },
  }
}

async function installApiMocks(page: import('@playwright/test').Page, handler: (request: URL) => Promise<{ status?: number; data?: Overview; delay?: number }>) {
  await page.addInitScript(() => sessionStorage.setItem('off-admin-token', 'analytics-ui-test-token'))
  await page.route(`${apiOrigin}/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill({ json: { data: { email: 'admin@example.invalid' } } })
      return
    }
    if (url.pathname.endsWith('/analytics/admin/overview')) {
      const response = await handler(url)
      if (response.delay) await new Promise(resolve => setTimeout(resolve, response.delay))
      if (response.status && response.status !== 200) {
        await route.fulfill({ status: response.status, json: { error: { message: 'Analytics unavailable' } } })
        return
      }
      await route.fulfill({ json: { data: response.data ?? overview() } })
      return
    }
    await route.fulfill({ status: 404, json: { error: { message: 'Unexpected API request in isolated UI test' } } })
  })
}

test('initial and refreshed loading states preserve valid data and surface request failures', async ({ page }) => {
  let requestCount = 0
  await installApiMocks(page, async () => {
    requestCount += 1
    if (requestCount <= 2) return { data: overview('2024-12', 23), delay: 500 }
    return { status: 503, delay: 500 }
  })

  await page.goto('/analytics/overview', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Loading analytics…')).toBeVisible()
  await expect(page.locator('.metric-card')).toHaveCount(0)
  const visitorMetric = page.locator('.metric-card').filter({ hasText: 'Unique Visitors' }).locator('strong')
  await expect(visitorMetric).toHaveText('23')
  const initialRequestCount = requestCount
  await expect(page.getByText('Loading analytics…')).toHaveCount(0)
  await expect(page.locator('.analytics-chart')).toBeVisible()
  await expect(page.locator('.analytics-chart svg circle')).toHaveCount(2)

  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByText('Updating this report…')).toBeVisible()
  await expect(visitorMetric).toHaveText('23')
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Analytics unavailable')
  await expect(page.getByText('Showing the last successful report while the selected period could not be loaded.')).toBeVisible()
  await expect(page.getByText('Updating this report…')).toHaveCount(0)
  await expect(visitorMetric).toHaveText('23')
  expect(requestCount).toBe(initialRequestCount + 1)
})

test('valid empty responses render explicit empty states without errors or fake activity', async ({ page }) => {
  await installApiMocks(page, async () => ({ data: overview() }))
  await page.goto('/analytics/overview')

  await expect(page.getByRole('heading', { name: 'Analytics & Intelligence' })).toBeVisible()
  await expect(page.getByText('No consented traffic or delivered sales in this period yet.')).toBeVisible()
  await expect(page.getByText('No product views recorded for this period.')).toBeVisible()
  await expect(page.getByText('No wishlist activity recorded for this period.')).toBeVisible()
  await expect(page.getByText('No collection views recorded.')).toBeVisible()
  await expect(page.locator('.metric-card').filter({ hasText: 'Unique Visitors' }).locator('strong')).toHaveText('0')
  await expect(page.locator('.admin-alert')).toHaveCount(0)

  await page.getByRole('navigation', { name: 'Analytics reports' }).getByRole('link', { name: 'Website' }).click()
  await expect(page.getByText('No page-view records for this period.')).toBeVisible()
  await expect(page.getByText('No activity for the selected period.')).toBeVisible()

  await page.getByRole('navigation', { name: 'Analytics reports' }).getByRole('link', { name: 'Marketing' }).click()
  await expect(page.getByText('No traffic source data recorded for this period.')).toBeVisible()
  await expect(page.getByText('No attributed completed orders yet.').first()).toBeVisible()
  await expect(page.getByText('No CTA impression or click events have been recorded yet.')).toBeVisible()
  await expect(page.locator('.admin-alert')).toHaveCount(0)
})

test('monthly report sends the selected calendar month and renders the matching response across year and timezone boundaries', async ({ page }) => {
  const requestedMonths: string[] = []
  await installApiMocks(page, async url => {
    const month = url.searchParams.get('month')
    if (!month) throw new Error('Monthly report request did not include a month parameter.')
    requestedMonths.push(month)
    if (month === '2024-12') return { data: overview(month, 12, '2024-12-31') }
    if (month === '2025-01') return { data: overview(month, 1, '2025-01-01') }
    return { data: overview(month) }
  })

  await page.goto('/analytics/reports')
  const monthInput = page.getByLabel('Report month')
  await expect(monthInput).toHaveValue(/^\d{4}-\d{2}$/)

  await monthInput.fill('2024-12')
  await expect(page.locator('.metric-card').filter({ hasText: 'Unique Visitors' }).locator('strong')).toHaveText('12')
  await expect(page.getByRole('cell', { name: '2024-12-31' })).toBeVisible()
  expect(requestedMonths).toContain('2024-12')

  await monthInput.fill('2025-01')
  await expect(page.locator('.metric-card').filter({ hasText: 'Unique Visitors' }).locator('strong')).toHaveText('1')
  await expect(page.getByRole('cell', { name: '2025-01-01' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2024-12-31' })).toHaveCount(0)
  expect(requestedMonths).toContain('2025-01')
  expect(monthBounds('2024-12')).toEqual({ from: '2024-12-01T00:00:00.000Z', to: '2025-01-01T00:00:00.000Z' })
  expect(monthBounds('2025-01')).toEqual({ from: '2025-01-01T00:00:00.000Z', to: '2025-02-01T00:00:00.000Z' })
})

test('analytics navigation and layouts remain usable from desktop through mobile widths', async ({ page }) => {
  await installApiMocks(page, async () => ({ data: overview() }))
  const sections = [
    ['/analytics/overview', 'Analytics & Intelligence'],
    ['/analytics/website', 'Website Performance'],
    ['/analytics/ecommerce', 'E-commerce Performance'],
    ['/analytics/products', 'Product Intelligence'],
    ['/analytics/wishlist', 'Wishlist Performance'],
    ['/analytics/collections', 'Collection Performance'],
    ['/analytics/marketing', 'Marketing Performance'],
    ['/analytics/customers', 'Customer Intelligence'],
    ['/analytics/reports', 'Reports & Insights'],
  ] as const
  for (const [path, title] of sections) {
    await page.goto(path)
    await expect(page.locator('h1')).toHaveText(title)
    const analyticsNavigation = page.getByRole('navigation', { name: 'Analytics reports' })
    await expect(analyticsNavigation.getByRole('link')).toHaveCount(sections.length)
    await expect(analyticsNavigation.locator(`a[href="${path}"]`)).toHaveClass(/active/)
  }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/analytics/overview')
    await expect(page.getByRole('heading', { name: 'Analytics & Intelligence' })).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.documentWidth, `No horizontal page overflow at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.viewportWidth)
    if (viewport.width <= 700) {
      await expect(page.getByRole('button', { name: 'Open admin navigation' })).toBeVisible()
      await page.getByRole('button', { name: 'Open admin navigation' }).click()
      await expect(page.locator('.admin-sidebar').getByRole('link', { name: 'Wishlist', exact: true })).toBeVisible()
    } else {
      await expect(page.locator('.admin-sidebar').getByRole('link', { name: 'Wishlist', exact: true })).toBeVisible()
    }
  }
})
