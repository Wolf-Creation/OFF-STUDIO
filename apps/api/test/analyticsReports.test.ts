import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeAnalyticsVisitorWindow,
  calculateCampaignConversion,
  calculateCampaignSales,
  calculateCheckoutAbandonment,
  calculateCheckoutFunnel,
  calculateCustomerCohorts,
  calculateCustomerMetrics,
  calculateCtaClickThroughRate,
  calculateFunnel,
  calculateDemandChange,
  calculateProductOpportunityScore,
  calculateProductConversion,
  calculateSequentialVisitorFunnel,
  calculateStockCoverageDays,
  calculateVariantConversion,
  calculateVisitorConversionRate,
  completedOrderMatch,
  placedOnlineOrderMatch,
  createConversionTrendInsight,
  intentPrecedesPurchase,
  isInventoryForecastEligible,
  isHighInterestLowConversion,
  resolveAnalyticsDateRange,
  selectDistinctDemandStockAlert,
} from '../src/analyticsReports.js'

test('checkout funnel reports consecutive conversion and drop-off rates', () => {
  assert.deepEqual(calculateFunnel([
    { stage: 'checkout_started', visitors: 100 },
    { stage: 'shipping_information_completed', visitors: 70 },
    { stage: 'order_confirmed', visitors: 35 },
  ]), [
    { stage: 'checkout_started', visitors: 100, conversionFromPrevious: 100, dropOffFromPrevious: 0 },
    { stage: 'shipping_information_completed', visitors: 70, conversionFromPrevious: 70, dropOffFromPrevious: 30 },
    { stage: 'order_confirmed', visitors: 35, conversionFromPrevious: 50, dropOffFromPrevious: 50 },
  ])
})

test('visitor funnel intersects each stage instead of comparing independent totals', () => {
  assert.deepEqual(calculateSequentialVisitorFunnel([
    { stage: 'page_view', visitorIds: new Set(['a', 'b', 'c']) },
    { stage: 'product_view', visitorIds: new Set(['b', 'c', 'd']) },
    { stage: 'add_to_cart', visitorIds: new Set(['c', 'd']) },
    { stage: 'purchase', visitorIds: new Set(['c', 'e']) },
  ]), [
    { stage: 'page_view', visitors: 3 },
    { stage: 'product_view', visitors: 2 },
    { stage: 'add_to_cart', visitors: 1 },
    { stage: 'purchase', visitors: 1 },
  ])
})

test('CTA click-through rate uses clicked visitors with a measured impression', () => {
  assert.ok(Math.abs((calculateCtaClickThroughRate(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd'])) ?? 0) - 200 / 3) < 1e-10)
  assert.equal(calculateCtaClickThroughRate(new Set(), new Set(['a'])), null)
})

test('checkout abandonment is session-based, uses order chronology, and excludes immature sessions', () => {
  const now = new Date('2026-03-15T12:00:00.000Z')
  const range = { start: new Date('2026-03-15T00:00:00.000Z'), end: new Date('2026-03-16T00:00:00.000Z') }
  const sessions = [
    { sessionId: 'recent', startedAt: new Date('2026-03-15T11:50:00.000Z') },
    { sessionId: 'abandoned', startedAt: new Date('2026-03-15T11:00:00.000Z') },
    { sessionId: 'shipping', startedAt: new Date('2026-03-15T10:00:00.000Z'), shippingAt: new Date('2026-03-15T10:05:00.000Z') },
    { sessionId: 'converted', startedAt: new Date('2026-03-15T09:00:00.000Z') },
  ]
  const orders = [
    { analyticsSessionId: 'converted', placedAt: new Date('2026-03-15T08:59:00.000Z'), paymentStatus: 'unpaid' },
    { analyticsSessionId: 'converted', placedAt: new Date('2026-03-15T09:30:00.000Z'), paymentStatus: 'unpaid' },
    { analyticsSessionId: 'converted', placedAt: new Date('2026-03-15T10:00:00.000Z'), paymentStatus: 'paid' },
  ]
  const report = calculateCheckoutFunnel(sessions, orders, range, now)
  assert.equal(report.stages[0]?.visitors, 4)
  assert.equal(report.stages[1]?.visitors, 1)
  assert.equal(report.stages[2]?.visitors, 1)
  assert.equal(report.matureCheckoutSessions, 3)
  assert.equal(report.convertedCheckoutSessions, 1)
  assert.equal(report.abandonedCheckouts, 2)
  assert.ok(Math.abs((report.abandonmentRate ?? 0) - 200 / 3) < 1e-10)
  assert.deepEqual(report.abandonedByStep, [
    { step: 'checkout_started', count: 1 },
    { step: 'shipping_information_completed', count: 1 },
  ])
})

test('checkout abandonment deduplicates repeated starts and orders within a session', () => {
  const now = new Date('2026-03-15T12:00:00.000Z')
  const range = { start: new Date('2026-03-15T00:00:00.000Z'), end: new Date('2026-03-16T00:00:00.000Z') }
  const result = calculateCheckoutAbandonment([
    { sessionId: 'multi', startedAt: new Date('2026-03-15T10:00:00.000Z') },
    { sessionId: 'multi', startedAt: new Date('2026-03-15T10:05:00.000Z') },
    { sessionId: 'no-order', startedAt: new Date('2026-03-15T10:15:00.000Z') },
    { sessionId: 'no-order', startedAt: new Date('2026-03-15T10:20:00.000Z'), shippingAt: new Date('2026-03-15T10:18:00.000Z') },
  ], [
    { analyticsSessionId: 'multi', placedAt: new Date('2026-03-15T09:59:00.000Z') },
    { analyticsSessionId: 'multi', placedAt: new Date('2026-03-15T10:10:00.000Z'), paymentStatus: 'unpaid' },
    { analyticsSessionId: 'multi', placedAt: new Date('2026-03-15T10:20:00.000Z'), paymentStatus: 'paid' },
  ], range, now)
  assert.equal(result.checkoutStartedSessions, 2)
  assert.equal(result.convertedCheckoutSessions, 1)
  assert.equal(result.matureCheckoutSessions, 2)
  assert.equal(result.matureConvertedCheckoutSessions, 1)
  assert.equal(result.abandonedCheckouts, 1)
  assert.equal(result.abandonmentRate, 50)
  assert.deepEqual(result.abandonedByStep, [{ step: 'shipping_information_completed', count: 1 }])
})

test('checkout abandonment applies inclusive start and exclusive end timestamps', () => {
  const now = new Date('2026-03-15T12:00:00.000Z')
  const range = { start: new Date('2026-03-15T10:00:00.000Z'), end: new Date('2026-03-15T11:00:00.000Z') }
  const result = calculateCheckoutAbandonment([
    { sessionId: 'at-start', startedAt: range.start },
    { sessionId: 'at-end', startedAt: range.end },
  ], [
    { analyticsSessionId: 'at-start', placedAt: new Date('2026-03-15T10:30:00.000Z'), paymentStatus: 'unpaid' },
    { analyticsSessionId: 'at-start', placedAt: range.end, paymentStatus: 'paid' },
  ], range, now)
  assert.equal(result.checkoutStartedSessions, 1)
  assert.equal(result.convertedCheckoutSessions, 1)
  assert.equal(result.matureCheckoutSessions, 1)
  assert.equal(result.abandonedCheckouts, 0)
  assert.equal(result.abandonmentRate, 0)
})

test('checkout abandonment excludes a session with an order placed after the reporting interval', () => {
  const range = { start: new Date('2026-03-15T10:00:00.000Z'), end: new Date('2026-03-15T11:00:00.000Z') }
  const now = new Date('2026-03-15T12:00:00.000Z')
  const result = calculateCheckoutAbandonment([
    { sessionId: 'converted-after-end', startedAt: new Date('2026-03-15T10:00:00.000Z') },
  ], [
    { analyticsSessionId: 'converted-after-end', placedAt: new Date('2026-03-15T11:15:00.000Z'), paymentStatus: 'unpaid' },
  ], range, now)

  assert.equal(result.convertedCheckoutSessions, 1)
  assert.equal(result.abandonedCheckouts, 0)
})

test('product conversion uses distinct visitor overlap and handles empty denominators', () => {
  const viewers = new Set(['a', 'b', 'c', 'd'])
  const wishlist = new Set(['a', 'b'])
  const cart = new Set(['b', 'c'])
  const purchases = new Set(['c'])
  assert.deepEqual(calculateProductConversion({
    views: 10,
    viewVisitors: viewers,
    wishlistVisitors: wishlist,
    cartVisitors: cart,
    purchaseVisitors: purchases,
    wishlistAfterViewVisitors: new Set(['a']),
    cartAfterViewVisitors: new Set(['c']),
    cartAfterWishlistVisitors: new Set(['b']),
  }), {
    views: 10,
    uniqueViewers: 4,
    wishlistVisitors: 2,
    cartVisitors: 2,
    purchaseVisitors: 1,
    viewToWishlistRate: 25,
    wishlistToCartRate: 50,
    viewToCartRate: 25,
    viewToPurchaseRate: 25,
  })
  assert.equal(calculateProductConversion({
    views: 0,
    viewVisitors: new Set(),
    wishlistVisitors: new Set(),
    cartVisitors: new Set(),
    purchaseVisitors: new Set(),
  }).viewToPurchaseRate, null)
})

test('variant conversion counts only selected visitors who purchased', () => {
  const result = calculateVariantConversion(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))
  assert.equal(result.convertingVisitors, 2)
  assert.ok(Math.abs((result.conversionRate ?? 0) - 200 / 3) < 1e-10)
  assert.equal(intentPrecedesPurchase(new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z')), true)
  assert.equal(intentPrecedesPurchase(new Date('2026-01-02T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z')), false)
})

test('visitor conversion deduplicates multiple orders and intersects purchasers with the report period', () => {
  const conversion = calculateVisitorConversionRate(
    new Set(['visitor-1', 'visitor-2', 'visitor-3']),
    ['visitor-1', 'visitor-1', 'outside-period', ''],
  )

  assert.equal(conversion.visitors, 3)
  assert.equal(conversion.convertingVisitors, 1)
  assert.ok(Math.abs((conversion.conversionRate ?? 0) - 100 / 3) < 1e-10)
  assert.deepEqual(calculateVisitorConversionRate(new Set(), new Set(['visitor-1'])), {
    visitors: 0,
    convertingVisitors: 0,
    conversionRate: null,
  })
})

test('campaign conversion intersects first/last-touch purchasers with campaign visitors', () => {
  assert.deepEqual(calculateCampaignConversion(new Set(['a', 'b', 'c', 'd']), new Set(['b', 'c', 'e']), 5, 725), {
    visitors: 4,
    attributedPurchasers: 2,
    orders: 5,
    revenue: 725,
    conversionRate: 50,
  })
})

test('campaign sales include revenue and orders only from the measured campaign visitor cohort', () => {
  assert.deepEqual(calculateCampaignSales(new Set(['visitor-a', 'visitor-b']), [
    { visitorId: 'visitor-a', orders: 2, revenue: 180 },
    { visitorId: 'visitor-b', orders: 1, revenue: 90 },
    { visitorId: 'visitor-outside', orders: 4, revenue: 4000 },
  ]), {
    visitors: 2,
    attributedPurchasers: 2,
    orders: 3,
    revenue: 270,
    conversionRate: 100,
  })
})

test('customer metrics separate new and returning customers and calculate lifetime values', () => {
  const range = { start: new Date('2026-03-01T00:00:00.000Z'), end: new Date('2026-04-01T00:00:00.000Z') }
  const metrics = calculateCustomerMetrics([
    {
      orderCount: 2,
      revenue: 300,
      firstPurchase: new Date('2026-02-01T00:00:00.000Z'),
      purchases: [{ date: new Date('2026-02-01T00:00:00.000Z'), total: 100 }, { date: new Date('2026-03-01T00:00:00.000Z'), total: 200 }],
    },
    {
      orderCount: 1,
      revenue: 150,
      firstPurchase: new Date('2026-03-15T00:00:00.000Z'),
      purchases: [{ date: new Date('2026-03-15T00:00:00.000Z'), total: 150 }],
    },
  ], range)
  assert.deepEqual(metrics, {
    firstTimeCustomers: 1,
    returningCustomers: 1,
    periodCustomers: 2,
    repeatPurchaseRate: 50,
    averagePurchaseFrequency: 1.5,
    averageDaysBetweenPurchases: 28,
    averageLifetimeValue: 225,
  })
})

test('monthly cohorts include first-purchase month and later monthly retention', () => {
  const start = new Date('2026-03-01T00:00:00.000Z')
  const customers = calculateCustomerCohorts([
    {
      orderCount: 2,
      revenue: 200,
      firstPurchase: new Date('2026-03-10T00:00:00.000Z'),
      purchases: [{ date: new Date('2026-03-10T00:00:00.000Z'), total: 100 }, { date: new Date('2026-04-10T00:00:00.000Z'), total: 100 }],
    },
    {
      orderCount: 1,
      revenue: 50,
      firstPurchase: new Date('2026-03-20T00:00:00.000Z'),
      purchases: [{ date: new Date('2026-03-20T00:00:00.000Z'), total: 50 }],
    },
  ], { start, end: new Date('2026-04-01T00:00:00.000Z'), previousStart: new Date('2025-12-01T00:00:00.000Z'), now: new Date('2026-05-15T00:00:00.000Z') })
  assert.equal(customers.length, 1)
  assert.equal(customers[0]?.cohort, '2026-03')
  assert.deepEqual(customers[0]?.months.map(month => [month.month, month.customers, month.retentionRate]), [
    ['2026-03', 2, 100],
    ['2026-04', 1, 50],
    ['2026-05', 0, 0],
  ])
})

test('conversion insight requires a meaningful change and adequate samples', () => {
  assert.deepEqual(createConversionTrendInsight(30, 15, 20, 20), {
    currentRate: 30,
    previousRate: 15,
    changePercentagePoints: 15,
    currentVisitors: 20,
  })
  assert.equal(createConversionTrendInsight(20, 15, 20, 20), null)
  assert.equal(createConversionTrendInsight(30, 15, 4, 20), null)
  assert.equal(isHighInterestLowConversion(10, 4, 9.9), true)
  assert.equal(isHighInterestLowConversion(2, 4, 0), false)
  assert.equal(isHighInterestLowConversion(10, 4, 10), false)
})

test('product opportunity score is evidence-qualified and uses demand, conversion, and stock inputs', () => {
  const baseline = {
    views: 100,
    uniqueViewers: 30,
    wishlistAdditions: 12,
    cartAddEvents: 8,
    confirmedPurchases: 6,
    wishlistVisitors: 8,
    cartVisitors: 6,
    purchaseVisitors: 3,
    availableStock: 5,
    unitsSold90Days: 15,
    maximumViews: 200,
    maximumUniqueViewers: 60,
    maximumWishlistAdditions: 24,
    maximumCartAddEvents: 16,
    maximumConfirmedPurchases: 12,
  }
  assert.equal(calculateProductOpportunityScore({ ...baseline, views: 4 }), null)
  assert.equal(calculateProductOpportunityScore({ ...baseline, uniqueViewers: 4 }), null)
  const score = calculateProductOpportunityScore(baseline)
  assert.equal(score, 41)
  assert.ok((calculateProductOpportunityScore({ ...baseline, wishlistAdditions: 24 }) ?? 0) > score)
  assert.ok((calculateProductOpportunityScore({ ...baseline, cartAddEvents: 16 }) ?? 0) > score)
  assert.ok((calculateProductOpportunityScore({ ...baseline, confirmedPurchases: 12 }) ?? 0) > score)
  assert.ok((calculateProductOpportunityScore({ ...baseline, availableStock: 0 }) ?? 0) > (score ?? 0))
})

test('inventory forecasts and velocity are withheld unless history is sufficient', () => {
  assert.equal(isInventoryForecastEligible(2, 3), false)
  assert.equal(isInventoryForecastEligible(3, 1), false)
  assert.equal(isInventoryForecastEligible(3, 2), true)
  assert.equal(calculateStockCoverageDays(10, 30), 30)
  assert.equal(calculateDemandChange(6, 3), 100)
  assert.equal(calculateDemandChange(4, 0), null)
})

test('stock insights do not repeat a variant already surfaced for high interest and low stock', () => {
  const highInterest = { productId: 'p1', size: 'M', color: 'Black' }
  const otherVariant = { productId: 'p1', size: 'L', color: 'Black' }
  assert.deepEqual(selectDistinctDemandStockAlert(highInterest, [highInterest, otherVariant]), otherVariant)
  assert.equal(selectDistinctDemandStockAlert(highInterest, [highInterest]), undefined)
  assert.deepEqual(selectDistinctDemandStockAlert(undefined, [highInterest]), highInterest)
})

test('date ranges support calendar months, leap years, and previous-month comparison', () => {
  const range = resolveAnalyticsDateRange({ month: '2024-03' }, new Date('2024-06-15T12:00:00.000Z'))
  assert.equal(range.start.toISOString(), '2024-03-01T00:00:00.000Z')
  assert.equal(range.end.toISOString(), '2024-04-01T00:00:00.000Z')
  assert.equal(range.previousStart.toISOString(), '2024-02-01T00:00:00.000Z')
  assert.equal(range.previousEnd.toISOString(), '2024-03-01T00:00:00.000Z')
  assert.equal(range.days, 31)
  const february = resolveAnalyticsDateRange({ month: '2024-02' }, new Date('2024-06-15T12:00:00.000Z'))
  assert.equal(february.days, 29)
  const monthToDate = resolveAnalyticsDateRange({ month: '2026-11' }, new Date('2026-11-04T08:00:00.000Z'))
  assert.equal(monthToDate.end.toISOString(), '2026-11-05T00:00:00.000Z')
  assert.equal(monthToDate.previousStart.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(monthToDate.previousEnd.toISOString(), '2026-10-05T00:00:00.000Z')
  assert.equal(monthToDate.days, 4)
})

test('all order-backed analytics share the paid-and-delivered revenue source filter', () => {
  const start = new Date('2026-03-01T00:00:00.000Z')
  const end = new Date('2026-04-01T00:00:00.000Z')
  assert.deepEqual(completedOrderMatch({ start, end }), {
    paymentStatus: 'paid',
    fulfillmentStatus: 'delivered',
    placedAt: { $gte: start, $lt: end },
  })
  assert.deepEqual(completedOrderMatch(), { paymentStatus: 'paid', fulfillmentStatus: 'delivered' })
})

test('conversion counts attributed online order placements independently from realized-revenue eligibility', () => {
  const start = new Date('2026-03-01T00:00:00.000Z')
  const end = new Date('2026-04-01T00:00:00.000Z')
  assert.deepEqual(placedOnlineOrderMatch({ start, end }), {
    source: 'online',
    analyticsVisitorId: { $type: 'string', $ne: '' },
    placedAt: { $gte: start, $lt: end },
  })
  assert.deepEqual(completedOrderMatch({ start, end }), {
    paymentStatus: 'paid',
    fulfillmentStatus: 'delivered',
    placedAt: { $gte: start, $lt: end },
  })
})

test('active visitor snapshots use the actual five-minute window, not the selected report end', () => {
  const now = new Date('2026-11-04T07:40:00.000Z')
  const window = activeAnalyticsVisitorWindow(now)
  assert.equal(window.$gte.toISOString(), '2026-11-04T07:35:00.000Z')
  assert.equal(window.$lt.toISOString(), now.toISOString())
})
