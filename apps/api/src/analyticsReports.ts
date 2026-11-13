import { Collection } from './models/Collection.js'
import { AnalyticsEvent } from './models/AnalyticsEvent.js'
import { Customer } from './models/Customer.js'
import { Order } from './models/Order.js'
import { Product } from './models/Product.js'

type DateRange = { start: Date; end: Date }
type AdvancedRange = DateRange & { previousStart: Date; previousEnd?: Date; now: Date }
type ProductActivity = {
  _id: { productId: string; visitorId: string }
  views: number
  wishlistAdds: number
  cartAdds: number
  firstView: Date | null
  firstWishlist: Date | null
  firstCart: Date | null
}
type ProductPurchase = {
  _id: { productId: string; visitorId: string; size: string; color: string }
  units: number
  revenue: number
  purchasedAt: Date
}
type ProductSales = { _id: string; units: number; revenue: number }
type VariantSales = { _id: { productId: string; size: string; color: string; visitorId?: string }; units: number; purchasedAt: Date }
type CustomerPurchaseSummary = {
  orderCount: number
  revenue: number
  firstPurchase: Date
  purchases: { date: Date; total: number }[]
}

export function intentPrecedesPurchase(intentAt: Date, purchaseAt: Date) {
  return purchaseAt >= intentAt
}

export const completedOrderMatch = (range?: DateRange) => ({
  paymentStatus: 'paid',
  fulfillmentStatus: 'delivered',
  ...(range ? { placedAt: { $gte: range.start, $lt: range.end } } : {}),
})

export const placedOnlineOrderMatch = (range: DateRange) => ({
  source: 'online',
  analyticsVisitorId: { $type: 'string', $ne: '' },
  placedAt: { $gte: range.start, $lt: range.end },
})

export const activeAnalyticsVisitorWindow = (now: Date) => ({
  $gte: new Date(now.getTime() - 5 * 60_000),
  $lt: now,
})

const percent = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : null
const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

export function resolveAnalyticsDateRange(query: { days?: number; month?: string }, now: Date) {
  if (query.month) {
    const [year, month] = query.month.split('-').map(Number)
    const start = new Date(Date.UTC(year!, month! - 1, 1))
    const nextMonthStart = new Date(Date.UTC(year!, month!, 1))
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const end = query.month === currentMonth
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      : nextMonthStart
    const previousStart = new Date(Date.UTC(year!, month! - 2, 1))
    const previousMonthEnd = start
    const previousMonthDays = (previousMonthEnd.getTime() - previousStart.getTime()) / 86_400_000
    const previousDays = query.month === currentMonth
      ? Math.min((end.getTime() - start.getTime()) / 86_400_000, previousMonthDays)
      : previousMonthDays
    return {
      start,
      end,
      previousStart,
      previousEnd: new Date(previousStart.getTime() + previousDays * 86_400_000),
      days: (end.getTime() - start.getTime()) / 86_400_000,
      month: query.month,
    }
  }
  const days = query.days ?? 30
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  const previousStart = new Date(start)
  previousStart.setUTCDate(previousStart.getUTCDate() - days)
  return { start, end, previousStart, previousEnd: start, days }
}

export function calculateFunnel(stages: { stage: string; visitors: number }[]) {
  return stages.map((stage, index) => {
    const previous = stages[index - 1]?.visitors ?? stage.visitors
    return {
      ...stage,
      conversionFromPrevious: index ? percent(stage.visitors, previous) : 100,
      dropOffFromPrevious: index ? percent(Math.max(0, previous - stage.visitors), previous) : 0,
    }
  })
}

export function calculateSequentialVisitorFunnel(stages: { stage: string; visitorIds: Set<string> }[]) {
  let eligible: Set<string> | null = null
  return stages.map(({ stage, visitorIds }) => {
    eligible = eligible ? new Set([...eligible].filter(visitorId => visitorIds.has(visitorId))) : new Set(visitorIds)
    return { stage, visitors: eligible.size }
  })
}

export function calculateCtaClickThroughRate(impressionVisitors: Set<string>, clickVisitors: Set<string>) {
  const observedClicks = [...clickVisitors].filter(visitorId => impressionVisitors.has(visitorId)).length
  return percent(observedClicks, impressionVisitors.size)
}

export function calculateProductConversion(input: {
  views: number
  viewVisitors: Set<string>
  wishlistVisitors: Set<string>
  cartVisitors: Set<string>
  purchaseVisitors: Set<string>
  wishlistAfterViewVisitors?: Set<string>
  cartAfterViewVisitors?: Set<string>
  cartAfterWishlistVisitors?: Set<string>
}) {
  const overlap = (left: Set<string>, right: Set<string>) => [...left].filter(visitor => right.has(visitor)).length
  return {
    views: input.views,
    uniqueViewers: input.viewVisitors.size,
    wishlistVisitors: input.wishlistVisitors.size,
    cartVisitors: input.cartVisitors.size,
    purchaseVisitors: overlap(input.viewVisitors, input.purchaseVisitors),
    viewToWishlistRate: percent(input.wishlistAfterViewVisitors?.size ?? overlap(input.viewVisitors, input.wishlistVisitors), input.viewVisitors.size),
    wishlistToCartRate: percent(input.cartAfterWishlistVisitors?.size ?? overlap(input.wishlistVisitors, input.cartVisitors), input.wishlistVisitors.size),
    viewToCartRate: percent(input.cartAfterViewVisitors?.size ?? overlap(input.viewVisitors, input.cartVisitors), input.viewVisitors.size),
    viewToPurchaseRate: percent(overlap(input.viewVisitors, input.purchaseVisitors), input.viewVisitors.size),
  }
}

export function calculateVariantConversion(selectedVisitors: Set<string>, purchasingVisitors: Set<string>) {
  const converting = [...selectedVisitors].filter(visitor => purchasingVisitors.has(visitor)).length
  return { convertingVisitors: converting, conversionRate: percent(converting, selectedVisitors.size) }
}

export function calculateVisitorConversionRate(periodVisitors: Set<string>, purchasingVisitors: Iterable<string>) {
  const convertingVisitors = new Set([...purchasingVisitors].filter(visitorId => visitorId !== '' && periodVisitors.has(visitorId))).size
  return {
    visitors: periodVisitors.size,
    convertingVisitors,
    conversionRate: percent(convertingVisitors, periodVisitors.size),
  }
}

export function calculateCampaignConversion(campaignVisitorIds: Set<string>, purchasingVisitorIds: Set<string>, orders: number, revenue: number) {
  const convertingVisitors = [...campaignVisitorIds].filter(visitor => purchasingVisitorIds.has(visitor)).length
  return {
    visitors: campaignVisitorIds.size,
    attributedPurchasers: convertingVisitors,
    orders,
    revenue,
    conversionRate: percent(convertingVisitors, campaignVisitorIds.size),
  }
}

export function calculateCampaignSales(
  campaignVisitorIds: Set<string>,
  sales: { visitorId: string; orders: number; revenue: number }[],
) {
  const matchedSales = sales.filter(sale => campaignVisitorIds.has(sale.visitorId))
  const purchasers = new Set(matchedSales.map(sale => sale.visitorId))
  return calculateCampaignConversion(
    campaignVisitorIds,
    purchasers,
    matchedSales.reduce((sum, sale) => sum + sale.orders, 0),
    matchedSales.reduce((sum, sale) => sum + sale.revenue, 0),
  )
}

export function createConversionTrendInsight(currentRate: number | null, previousRate: number | null, currentVisitors: number, previousVisitors: number) {
  if (currentRate === null || previousRate === null || currentVisitors < 5 || previousVisitors < 5) return null
  const changePercentagePoints = currentRate - previousRate
  if (Math.abs(changePercentagePoints) < 10) return null
  return { currentRate, previousRate, changePercentagePoints, currentVisitors }
}

export function isHighInterestLowConversion(viewers: number, wishlistVisitors: number, purchaseRate: number | null) {
  return viewers >= 3 && wishlistVisitors >= 3 && purchaseRate !== null && purchaseRate < 10
}

export function selectDistinctDemandStockAlert<T extends { productId: string; size: string; color: string }>(
  interestAlert: { productId: string; size: string; color: string } | undefined,
  stockAlerts: T[],
) {
  return stockAlerts.find(alert => !interestAlert
    || alert.productId !== interestAlert.productId
    || alert.size !== interestAlert.size
    || alert.color !== interestAlert.color)
}

export function calculateProductOpportunityScore(input: {
  views: number
  uniqueViewers: number
  wishlistAdditions: number
  cartAddEvents: number
  confirmedPurchases: number
  wishlistVisitors: number
  cartVisitors: number
  purchaseVisitors: number
  availableStock: number | null
  unitsSold90Days: number
  maximumViews: number
  maximumUniqueViewers: number
  maximumWishlistAdditions: number
  maximumCartAddEvents: number
  maximumConfirmedPurchases: number
}) {
  if (input.views < 5 || input.uniqueViewers < 5) return null
  const viewerCount = input.uniqueViewers
  const wishlistRate = Math.min(1, input.wishlistVisitors / viewerCount)
  const cartRate = Math.min(1, input.cartVisitors / viewerCount)
  const purchaseRate = Math.min(1, input.purchaseVisitors / viewerCount)
  const stockPressure = input.availableStock === null
    ? 0
    : input.unitsSold90Days / Math.max(1, input.unitsSold90Days + input.availableStock)
  const score =
    10 * Math.min(1, input.views / Math.max(1, input.maximumViews)) +
    10 * Math.min(1, viewerCount / Math.max(1, input.maximumUniqueViewers)) +
    10 * Math.min(1, input.wishlistAdditions / Math.max(1, input.maximumWishlistAdditions)) +
    10 * Math.min(1, input.cartAddEvents / Math.max(1, input.maximumCartAddEvents)) +
    10 * wishlistRate +
    10 * cartRate +
    15 * purchaseRate +
    15 * Math.min(1, input.confirmedPurchases / Math.max(1, input.maximumConfirmedPurchases)) +
    10 * stockPressure
  return Math.round(score)
}

export function isInventoryForecastEligible(unitsSold90Days: number, monthsWithSales: number) {
  return unitsSold90Days >= 3 && monthsWithSales >= 2
}

export function calculateStockCoverageDays(availableStock: number, unitsSold90Days: number) {
  return unitsSold90Days > 0 ? availableStock / (unitsSold90Days / 90) : null
}

export function calculateDemandChange(recentUnits: number, previousUnits: number) {
  if (previousUnits <= 0) return recentUnits > 0 ? null : 0
  return (recentUnits - previousUnits) / previousUnits * 100
}

export function calculateCustomerMetrics(customers: CustomerPurchaseSummary[], range: DateRange) {
  const active = customers.map(customer => {
    const purchases = customer.purchases.map(purchase => new Date(purchase.date)).sort((a, b) => a.getTime() - b.getTime())
    return {
      ...customer,
      purchases,
      periodOrders: purchases.filter(date => date >= range.start && date < range.end).length,
      intervals: purchases.slice(1).map((date, index) => (date.getTime() - purchases[index]!.getTime()) / 86_400_000),
    }
  })
  const periodCustomers = active.filter(customer => customer.periodOrders > 0)
  const customerIntervals = active.flatMap(customer => customer.intervals)
  const allOrders = active.reduce((sum, customer) => sum + customer.orderCount, 0)
  const firstTime = periodCustomers.filter(customer => customer.firstPurchase >= range.start).length
  const returning = periodCustomers.length - firstTime
  return {
    firstTimeCustomers: firstTime,
    returningCustomers: returning,
    periodCustomers: periodCustomers.length,
    repeatPurchaseRate: percent(active.filter(customer => customer.orderCount > 1).length, active.length),
    averagePurchaseFrequency: active.length ? allOrders / active.length : null,
    averageDaysBetweenPurchases: customerIntervals.length
      ? customerIntervals.reduce((sum, days) => sum + days, 0) / customerIntervals.length
      : null,
    averageLifetimeValue: active.length
      ? active.reduce((sum, customer) => sum + customer.revenue, 0) / active.length
      : null,
  }
}

export function calculateCustomerCohorts(customers: CustomerPurchaseSummary[], range: AdvancedRange) {
  const cohorts = new Map<string, CustomerPurchaseSummary[]>()
  for (const customer of customers) {
    if (customer.firstPurchase < range.start || customer.firstPurchase >= range.end) continue
    const key = monthKey(new Date(customer.firstPurchase))
    const cohort = cohorts.get(key) ?? []
    cohort.push(customer)
    cohorts.set(key, cohort)
  }
  const nowMonth = new Date(range.now)
  return [...cohorts].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, members]) => {
    const [year, month] = cohort.split('-').map(Number)
    const startMonth = new Date(Date.UTC(year!, month! - 1, 1))
    const elapsed = Math.min(12, Math.max(1, (nowMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12 + nowMonth.getUTCMonth() - startMonth.getUTCMonth() + 1))
    const months = Array.from({ length: elapsed }, (_, offset) => {
      const target = new Date(Date.UTC(year!, month! - 1 + offset, 1))
      const next = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 1))
      const retained = members.filter(customer => customer.purchases.some(purchase => {
        const date = new Date(purchase.date)
        return date >= target && date < next
      })).length
      return { month: monthKey(target), customers: retained, retentionRate: percent(retained, members.length) }
    })
    return { cohort, customers: members.length, months }
  })
}

type CheckoutSession = { sessionId: string; startedAt: Date; shippingAt?: Date }
type CheckoutOrder = { analyticsSessionId: string; placedAt: Date; paymentStatus?: string; fulfillmentStatus?: string }
type CheckoutRange = DateRange

function checkoutSessionsById(sessions: CheckoutSession[], range: CheckoutRange) {
  const grouped = new Map<string, CheckoutSession>()
  for (const session of sessions) {
    if (session.startedAt < range.start || session.startedAt >= range.end) continue
    const prior = grouped.get(session.sessionId)
    const startedAt = prior && prior.startedAt < session.startedAt ? prior.startedAt : session.startedAt
    const shippingAt = prior?.shippingAt && session.shippingAt
      ? prior.shippingAt < session.shippingAt ? prior.shippingAt : session.shippingAt
      : prior?.shippingAt ?? session.shippingAt
    grouped.set(session.sessionId, { sessionId: session.sessionId, startedAt, ...(shippingAt ? { shippingAt } : {}) })
  }
  return grouped
}

export function calculateCheckoutAbandonment(
  sessions: CheckoutSession[],
  orders: CheckoutOrder[],
  range: CheckoutRange,
  now: Date,
) {
  const sessionById = checkoutSessionsById(sessions, range)
  const startedAtBySession = new Map([...sessionById].map(([sessionId, session]) => [sessionId, session.startedAt]))
  const convertedSessionIds = new Set<string>()
  for (const order of orders) {
    const startedAt = startedAtBySession.get(order.analyticsSessionId)
    if (!startedAt || order.placedAt < startedAt || order.placedAt > now) continue
    convertedSessionIds.add(order.analyticsSessionId)
  }
  const maturityCutoff = new Date(now.getTime() - 30 * 60_000)
  const matureSessions = [...startedAtBySession].filter(([, startedAt]) => startedAt <= maturityCutoff)
  const matureConvertedSessions = matureSessions.filter(([sessionId]) => convertedSessionIds.has(sessionId))
  const abandonedCheckouts = matureSessions.length - matureConvertedSessions.length
  const abandonedByStep = new Map<string, number>()
  for (const [sessionId, startedAt] of matureSessions) {
    if (convertedSessionIds.has(sessionId)) continue
    const session = sessionById.get(sessionId)
    const lastStep = session?.shippingAt && session.shippingAt >= startedAt && session.shippingAt < range.end
      ? 'shipping_information_completed'
      : 'checkout_started'
    abandonedByStep.set(lastStep, (abandonedByStep.get(lastStep) ?? 0) + 1)
  }
  const exits = [...abandonedByStep].map(([step, count]) => ({ step, count }))
  const mostCommonExitStep = [...abandonedByStep].sort((a, b) => b[1] - a[1])[0]
  return {
    checkoutStartedSessions: startedAtBySession.size,
    convertedCheckoutSessions: convertedSessionIds.size,
    matureCheckoutSessions: matureSessions.length,
    matureConvertedCheckoutSessions: matureConvertedSessions.length,
    convertedSessionIds,
    abandonedCheckouts,
    abandonmentRate: percent(abandonedCheckouts, matureSessions.length),
    abandonedByStep: exits,
    mostCommonExitStep: mostCommonExitStep ? { step: mostCommonExitStep[0], count: mostCommonExitStep[1] } : null,
    maturityMinutes: 30,
    paymentStepsAvailable: false,
  }
}

export function calculateCheckoutFunnel(sessions: CheckoutSession[], orders: CheckoutOrder[], range: CheckoutRange, now: Date) {
  const abandonment = calculateCheckoutAbandonment(sessions, orders, range, now)
  const groupedSessions = checkoutSessionsById(sessions, range)
  const shippingSessions = new Set([...groupedSessions.values()]
    .filter(session => session.shippingAt && session.shippingAt >= session.startedAt && session.shippingAt < range.end)
    .map(session => session.sessionId))
  const counts = [
    { stage: 'checkout_started', visitors: abandonment.checkoutStartedSessions },
    { stage: 'shipping_information_completed', visitors: shippingSessions.size },
    { stage: 'order_confirmed', visitors: abandonment.convertedSessionIds.size },
  ]
  return {
    stages: calculateFunnel(counts),
    checkoutStartedSessions: abandonment.checkoutStartedSessions,
    convertedCheckoutSessions: abandonment.convertedCheckoutSessions,
    matureCheckoutSessions: abandonment.matureCheckoutSessions,
    abandonedCheckouts: abandonment.abandonedCheckouts,
    abandonmentRate: abandonment.abandonmentRate,
    abandonedByStep: abandonment.abandonedByStep,
    mostCommonExitStep: abandonment.mostCommonExitStep,
    maturityMinutes: abandonment.maturityMinutes,
    paymentStepsAvailable: abandonment.paymentStepsAvailable,
  }
}

async function productActivity(range: DateRange): Promise<ProductActivity[]> {
  const records = await AnalyticsEvent.aggregate([
    { $match: { occurredAt: { $gte: range.start, $lt: range.end }, type: { $in: ['product_view', 'wishlist_add', 'add_to_cart'] }, productId: { $exists: true } } },
    { $group: {
      _id: { productId: '$productId', visitorId: '$visitorId', type: '$type' },
      count: { $sum: 1 },
      firstAt: { $min: '$occurredAt' },
    } },
  ])
  const grouped = new Map<string, ProductActivity>()
  for (const record of records) {
    const key = `${record._id.productId}:${record._id.visitorId}`
    const row = grouped.get(key) ?? {
      _id: { productId: String(record._id.productId), visitorId: record._id.visitorId },
      views: 0,
      wishlistAdds: 0,
      cartAdds: 0,
      firstView: null,
      firstWishlist: null,
      firstCart: null,
    }
    if (record._id.type === 'product_view') {
      row.views = record.count
      row.firstView = record.firstAt
    } else if (record._id.type === 'wishlist_add') {
      row.wishlistAdds = record.count
      row.firstWishlist = record.firstAt
    } else if (record._id.type === 'add_to_cart') {
      row.cartAdds = record.count
      row.firstCart = record.firstAt
    }
    grouped.set(key, row)
  }
  return [...grouped.values()]
}

async function productPurchases(range: DateRange): Promise<ProductPurchase[]> {
  return Order.aggregate([
    { $match: { ...completedOrderMatch(range), analyticsVisitorId: { $type: 'string', $ne: '' } } },
    { $unwind: '$items' },
    { $group: {
      _id: {
        orderId: '$_id',
        productId: '$items.productId',
        visitorId: '$analyticsVisitorId',
        size: '$items.size',
        color: '$items.color',
      },
      units: { $sum: '$items.quantity' },
      revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
      purchasedAt: { $min: '$placedAt' },
    } },
  ])
}

function productRows(activity: ProductActivity[], purchases: ProductPurchase[], sales: ProductSales[]) {
  const visitorsByProduct = new Map<string, {
    viewVisitors: Set<string>
    wishlistVisitors: Set<string>
    cartVisitors: Set<string>
    firstViewByVisitor: Map<string, Date>
    firstWishlistByVisitor: Map<string, Date>
    firstCartByVisitor: Map<string, Date>
    views: number
    wishlistAdds: number
    cartAdds: number
  }>()
  for (const event of activity) {
    const productId = String(event._id.productId)
    const row = visitorsByProduct.get(productId) ?? {
      viewVisitors: new Set<string>(),
      wishlistVisitors: new Set<string>(),
      cartVisitors: new Set<string>(),
      firstViewByVisitor: new Map<string, Date>(),
      firstWishlistByVisitor: new Map<string, Date>(),
      firstCartByVisitor: new Map<string, Date>(),
      views: 0,
      wishlistAdds: 0,
      cartAdds: 0,
    }
    if (event.views) {
      row.viewVisitors.add(event._id.visitorId)
      row.views += event.views
      if (event.firstView) row.firstViewByVisitor.set(event._id.visitorId, new Date(event.firstView))
    }
    if (event.wishlistAdds) {
      row.wishlistVisitors.add(event._id.visitorId)
      row.wishlistAdds += event.wishlistAdds
      if (event.firstWishlist) row.firstWishlistByVisitor.set(event._id.visitorId, new Date(event.firstWishlist))
    }
    if (event.cartAdds) {
      row.cartVisitors.add(event._id.visitorId)
      row.cartAdds += event.cartAdds
      if (event.firstCart) row.firstCartByVisitor.set(event._id.visitorId, new Date(event.firstCart))
    }
    visitorsByProduct.set(productId, row)
  }
  const purchasesByProduct = new Map<string, Map<string, { units: number; purchaseDates: Date[] }>>()
  const unitsByProduct = new Map(sales.map(sale => [String(sale._id), sale.units]))
  for (const purchase of purchases) {
    const productId = String(purchase._id.productId)
    const byVisitor = purchasesByProduct.get(productId) ?? new Map<string, { units: number; purchaseDates: Date[] }>()
    const existing = byVisitor.get(purchase._id.visitorId)
    byVisitor.set(purchase._id.visitorId, {
      units: (existing?.units ?? 0) + purchase.units,
      purchaseDates: [...(existing?.purchaseDates ?? []), purchase.purchasedAt],
    })
    purchasesByProduct.set(productId, byVisitor)
  }
  return [...visitorsByProduct].map(([productId, activityRow]) => {
    const completedByVisitor = purchasesByProduct.get(productId) ?? new Map<string, { units: number; purchaseDates: Date[] }>()
    const firstPurchaseAfterView = new Map([...activityRow.viewVisitors].flatMap(visitor => {
      const viewedAt = activityRow.firstViewByVisitor.get(visitor)
      const purchasedAt = completedByVisitor.get(visitor)?.purchaseDates
        .filter(date => viewedAt && intentPrecedesPurchase(viewedAt, date))
        .sort((a, b) => a.getTime() - b.getTime())[0]
      return viewedAt && purchasedAt ? [[visitor, purchasedAt] as const] : []
    }))
    const purchaseVisitors = new Set(firstPurchaseAfterView.keys())
    const wishlistAfterViewVisitors = new Set([...activityRow.wishlistVisitors].filter(visitor => {
      const viewedAt = activityRow.firstViewByVisitor.get(visitor)
      const wishedAt = activityRow.firstWishlistByVisitor.get(visitor)
      return viewedAt && wishedAt && wishedAt >= viewedAt
    }))
    const cartAfterViewVisitors = new Set([...activityRow.cartVisitors].filter(visitor => {
      const viewedAt = activityRow.firstViewByVisitor.get(visitor)
      const cartAt = activityRow.firstCartByVisitor.get(visitor)
      return viewedAt && cartAt && cartAt >= viewedAt
    }))
    const cartAfterWishlistVisitors = new Set([...activityRow.wishlistVisitors].filter(visitor => {
      const wishedAt = activityRow.firstWishlistByVisitor.get(visitor)
      const cartAt = activityRow.firstCartByVisitor.get(visitor)
      return wishedAt && cartAt && cartAt >= wishedAt
    }))
    const metrics = calculateProductConversion({
      views: activityRow.views,
      viewVisitors: activityRow.viewVisitors,
      wishlistVisitors: activityRow.wishlistVisitors,
      cartVisitors: activityRow.cartVisitors,
      purchaseVisitors,
      wishlistAfterViewVisitors,
      cartAfterViewVisitors,
      cartAfterWishlistVisitors,
    })
    const purchaseHours = [...purchaseVisitors].flatMap(visitor => {
      const viewedAt = activityRow.firstViewByVisitor.get(visitor)
      const purchasedAt = firstPurchaseAfterView.get(visitor)
      return viewedAt && purchasedAt && purchasedAt >= viewedAt
        ? [(purchasedAt.getTime() - viewedAt.getTime()) / 3_600_000]
        : []
    })
    const unitsPurchased = unitsByProduct.get(productId) ?? 0
    return {
      productId,
      ...metrics,
      wishlistAdditions: activityRow.wishlistAdds,
      cartAddEvents: activityRow.cartAdds,
      unitsPurchased,
      averageHoursToPurchase: purchaseHours.length ? purchaseHours.reduce((sum, hours) => sum + hours, 0) / purchaseHours.length : null,
      wishlistAfterViewVisitorCount: wishlistAfterViewVisitors.size,
      highInterestLowConversion: isHighInterestLowConversion(metrics.uniqueViewers, wishlistAfterViewVisitors.size, metrics.viewToPurchaseRate),
      mostViewedWithoutPurchases: metrics.uniqueViewers >= 3 && unitsPurchased === 0,
    }
  })
}

async function productSales(range: DateRange): Promise<ProductSales[]> {
  return Order.aggregate([
    { $match: completedOrderMatch(range) },
    { $unwind: '$items' },
    { $group: {
      _id: '$items.productId',
      units: { $sum: '$items.quantity' },
      revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
    } },
  ])
}

async function variantSales(range: DateRange): Promise<VariantSales[]> {
  return Order.aggregate([
    { $match: completedOrderMatch(range) },
    { $unwind: '$items' },
    { $group: {
      _id: { productId: '$items.productId', size: '$items.size', color: '$items.color' },
      units: { $sum: '$items.quantity' },
      purchasedAt: { $min: '$placedAt' },
    } },
  ])
}

async function inventoryIntelligence(range: AdvancedRange) {
  const historyStart = new Date(range.now.getTime() - 90 * 86_400_000)
  const recentStart = new Date(range.now.getTime() - 30 * 86_400_000)
  const previousStart = new Date(range.now.getTime() - 60 * 86_400_000)
  const [history, stock] = await Promise.all([
    Order.aggregate([
      { $match: { ...completedOrderMatch({ start: historyStart, end: range.now }) } },
      { $unwind: '$items' },
      { $group: {
        _id: {
          productId: '$items.productId',
          size: '$items.size',
          color: '$items.color',
          month: { $dateToString: { format: '%Y-%m', date: '$placedAt' } },
        },
        units: { $sum: '$items.quantity' },
        recentUnits: { $sum: { $cond: [{ $gte: ['$placedAt', recentStart] }, '$items.quantity', 0] } },
        previousUnits: { $sum: { $cond: [{ $and: [{ $gte: ['$placedAt', previousStart] }, { $lt: ['$placedAt', recentStart] }] }, '$items.quantity', 0] } },
      } },
      { $sort: { '_id.month': 1 } },
    ]),
    Product.aggregate([
      { $match: { status: 'active' } },
      { $unwind: '$variants' },
      { $match: { 'variants.active': true } },
      { $group: {
        _id: { productId: '$_id', size: '$variants.size', color: '$variants.color' },
        stock: { $sum: '$variants.stock' },
      } },
    ]),
  ])
  type VariantHistory = { productId: string; size: string; color: string; units: number; recentUnits: number; previousUnits: number; months: Map<string, number>; stock: number }
  const variants = new Map<string, VariantHistory>()
  const products = new Map<string, { unitsSold90Days: number; recentUnits: number; previousUnits: number; months: Map<string, number>; availableStock: number }>()
  const variantKey = (productId: string, size: string, color: string) => `${productId}:${size}:${color}`
  for (const row of history) {
    const productId = String(row._id.productId)
    const key = variantKey(productId, row._id.size ?? '', row._id.color ?? '')
    const variant = variants.get(key) ?? {
      productId, size: row._id.size ?? '', color: row._id.color ?? '',
      units: 0, recentUnits: 0, previousUnits: 0, months: new Map<string, number>(), stock: 0,
    }
    variant.units += row.units
    variant.recentUnits += row.recentUnits
    variant.previousUnits += row.previousUnits
    variant.months.set(row._id.month, (variant.months.get(row._id.month) ?? 0) + row.units)
    variants.set(key, variant)

    const product = products.get(productId) ?? { unitsSold90Days: 0, recentUnits: 0, previousUnits: 0, months: new Map<string, number>(), availableStock: 0 }
    product.unitsSold90Days += row.units
    product.recentUnits += row.recentUnits
    product.previousUnits += row.previousUnits
    product.months.set(row._id.month, (product.months.get(row._id.month) ?? 0) + row.units)
    products.set(productId, product)
  }
  for (const item of stock) {
    const productId = String(item._id.productId)
    const key = variantKey(productId, item._id.size ?? '', item._id.color ?? '')
    const variant = variants.get(key) ?? {
      productId, size: item._id.size ?? '', color: item._id.color ?? '',
      units: 0, recentUnits: 0, previousUnits: 0, months: new Map<string, number>(), stock: 0,
    }
    variant.stock = item.stock
    variants.set(key, variant)
    const product = products.get(productId) ?? { unitsSold90Days: 0, recentUnits: 0, previousUnits: 0, months: new Map<string, number>(), availableStock: 0 }
    product.availableStock += item.stock
    products.set(productId, product)
  }
  const names = await Product.find({ _id: { $in: [...products.keys()] } }).select('name').lean()
  const nameById = new Map(names.map(product => [String(product._id), product.name]))
  const productDemand = [...products].map(([productId, row]) => {
    const months = [...row.months].sort(([a], [b]) => a.localeCompare(b))
    const forecastAvailable = isInventoryForecastEligible(row.unitsSold90Days, months.filter(([, units]) => units > 0).length)
    return {
      productId,
      productName: nameById.get(productId) ?? 'Unavailable product',
      availableStock: row.availableStock,
      unitsSold90Days: row.unitsSold90Days,
      unitsPerDay: row.unitsSold90Days / 90,
      recent30DayUnits: row.recentUnits,
      previous30DayUnits: row.previousUnits,
      trendPercent: calculateDemandChange(row.recentUnits, row.previousUnits),
      monthlyUnits: months.map(([month, units]) => ({ month, units })),
      monthsWithSales: months.filter(([, units]) => units > 0).length,
      forecastAvailable,
      estimatedDaysOfStock: forecastAvailable ? calculateStockCoverageDays(row.availableStock, row.unitsSold90Days) : null,
    }
  }).sort((a, b) => b.recent30DayUnits - a.recent30DayUnits || b.unitsSold90Days - a.unitsSold90Days)
  const variantAlerts = [...variants.values()].flatMap(row => {
    if (row.units < 3 || row.stock > Math.max(2, row.units * 14 / 90)) return []
    const monthsWithSales = [...row.months.values()].filter(units => units > 0).length
    const forecastAvailable = isInventoryForecastEligible(row.units, monthsWithSales)
    return [{
      productId: row.productId,
      productName: nameById.get(row.productId) ?? 'Unavailable product',
      size: row.size,
      color: row.color,
      unitsSold90Days: row.units,
      availableStock: row.stock,
      estimatedDaysOfStock: forecastAvailable ? calculateStockCoverageDays(row.stock, row.units) : null,
      forecastAvailable,
      severity: row.stock <= row.units * 7 / 90 ? 'high' as const : 'medium' as const,
    }]
  }).sort((a, b) => (a.estimatedDaysOfStock ?? Number.POSITIVE_INFINITY) - (b.estimatedDaysOfStock ?? Number.POSITIVE_INFINITY))
  return { products: productDemand, variantAlerts }
}

async function variantIntelligence(range: DateRange, purchases: ProductPurchase[], sales: VariantSales[]) {
  const selected = await AnalyticsEvent.aggregate([
    { $match: { occurredAt: { $gte: range.start, $lt: range.end }, type: 'product_variant_select', productId: { $exists: true } } },
    { $group: {
      _id: { productId: '$productId', size: '$variantSize', color: '$variantColor', visitorId: '$visitorId' },
      selections: { $sum: 1 },
      selectedAt: { $min: '$occurredAt' },
    } },
  ])
  const stock = await Product.aggregate([
    { $match: { status: 'active' } },
    { $unwind: '$variants' },
    { $match: { 'variants.active': true } },
    { $group: {
      _id: { productId: '$_id', size: '$variants.size', color: '$variants.color' },
      stock: { $sum: '$variants.stock' },
    } },
  ])
  type VariantRow = { productId: string; size: string; color: string; viewers: Set<string>; selectedAt: Map<string, Date>; selections: number; purchasers: Set<string>; unitsPurchased: number; stock: number }
  type DimensionRow = { productId: string; value: string; viewers: Set<string>; selectedAt: Map<string, Date>; purchasers: Set<string>; unitsPurchased: number; stock: number }
  const rows = new Map<string, VariantRow>()
  const sizes = new Map<string, DimensionRow>()
  const colors = new Map<string, DimensionRow>()
  const dimensionKey = (productId: string, value: string) => `${productId}:${value}`
  const pairKey = (productId: string, size: string, color: string) => `${productId}:${size}:${color}`
  const variantRow = (productId: string, size: string, color: string) => {
    const key = pairKey(productId, size, color)
    const row = rows.get(key) ?? { productId, size, color, viewers: new Set<string>(), selectedAt: new Map<string, Date>(), selections: 0, purchasers: new Set<string>(), unitsPurchased: 0, stock: 0 }
    rows.set(key, row)
    return row
  }
  const dimensionRow = (dimension: 'size' | 'color', productId: string, value: string) => {
    const groups = dimension === 'size' ? sizes : colors
    const key = dimensionKey(productId, value)
    const row = groups.get(key) ?? { productId, value, viewers: new Set<string>(), selectedAt: new Map<string, Date>(), purchasers: new Set<string>(), unitsPurchased: 0, stock: 0 }
    groups.set(key, row)
    return row
  }
  for (const item of selected) {
    const productId = String(item._id.productId)
    const size = item._id.size ?? ''
    const color = item._id.color ?? ''
    if (size) {
      const row = dimensionRow('size', productId, size)
      row.viewers.add(item._id.visitorId)
      row.selectedAt.set(item._id.visitorId, new Date(item.selectedAt))
    }
    if (color) {
      const row = dimensionRow('color', productId, color)
      row.viewers.add(item._id.visitorId)
      row.selectedAt.set(item._id.visitorId, new Date(item.selectedAt))
    }
    if (size && color) {
      const row = variantRow(productId, size, color)
      row.viewers.add(item._id.visitorId)
      row.selectedAt.set(item._id.visitorId, new Date(item.selectedAt))
      row.selections += item.selections
    }
  }
  for (const purchase of purchases) {
    const productId = String(purchase._id.productId)
    const { size, color } = purchase._id
    const selectedVariant = variantRow(productId, size, color)
    const selectedVariantAt = selectedVariant.selectedAt.get(purchase._id.visitorId)
    if (selectedVariantAt && intentPrecedesPurchase(selectedVariantAt, purchase.purchasedAt)) selectedVariant.purchasers.add(purchase._id.visitorId)
    if (size) {
      const row = dimensionRow('size', productId, size)
      const selectedAt = row.selectedAt.get(purchase._id.visitorId)
      if (selectedAt && intentPrecedesPurchase(selectedAt, purchase.purchasedAt)) row.purchasers.add(purchase._id.visitorId)
    }
    if (color) {
      const row = dimensionRow('color', productId, color)
      const selectedAt = row.selectedAt.get(purchase._id.visitorId)
      if (selectedAt && intentPrecedesPurchase(selectedAt, purchase.purchasedAt)) row.purchasers.add(purchase._id.visitorId)
    }
  }
  for (const sale of sales) {
    const productId = String(sale._id.productId)
    const pair = variantRow(productId, sale._id.size, sale._id.color)
    pair.unitsPurchased += sale.units
    if (sale._id.size) dimensionRow('size', productId, sale._id.size).unitsPurchased += sale.units
    if (sale._id.color) dimensionRow('color', productId, sale._id.color).unitsPurchased += sale.units
  }
  for (const item of stock) {
    const productId = String(item._id.productId)
    variantRow(productId, item._id.size, item._id.color).stock = item.stock
    dimensionRow('size', productId, item._id.size).stock += item.stock
    dimensionRow('color', productId, item._id.color).stock += item.stock
  }
  const productIds = [...new Set([...rows.values()].map(row => row.productId))]
  const products = await Product.find({ _id: { $in: productIds } }).select('name').lean()
  const names = new Map(products.map(product => [String(product._id), product.name]))
  const variants = [...rows.values()].map(row => {
    const conversion = calculateVariantConversion(row.viewers, row.purchasers)
    return {
      productId: row.productId,
      productName: names.get(row.productId) ?? 'Unavailable product',
      size: row.size,
      color: row.color,
      selectedVisitors: row.viewers.size,
      selections: row.selections,
      purchaseVisitors: conversion.convertingVisitors,
      unitsPurchased: row.unitsPurchased,
      conversionRate: conversion.conversionRate,
      availableStock: row.stock,
    }
  }).sort((a, b) => b.selectedVisitors - a.selectedVisitors)
  const tally = (groups: Map<string, DimensionRow>) => {
    const aggregated = new Map<string, { viewers: Set<string>; purchasers: Set<string>; unitsPurchased: number; stock: number }>()
    for (const row of groups.values()) {
      const aggregate = aggregated.get(row.value) ?? { viewers: new Set<string>(), purchasers: new Set<string>(), unitsPurchased: 0, stock: 0 }
      for (const visitor of row.viewers) aggregate.viewers.add(visitor)
      for (const visitor of row.purchasers) aggregate.purchasers.add(visitor)
      aggregate.unitsPurchased += row.unitsPurchased
      aggregate.stock += row.stock
      aggregated.set(row.value, aggregate)
    }
    return [...aggregated].map(([value, aggregate]) => {
      const conversion = calculateVariantConversion(aggregate.viewers, aggregate.purchasers)
      return {
        value,
        selectedVisitors: aggregate.viewers.size,
        purchaseVisitors: conversion.convertingVisitors,
        unitsPurchased: aggregate.unitsPurchased,
        availableStock: aggregate.stock,
        conversionRate: conversion.conversionRate,
      }
    }).sort((a, b) => b.selectedVisitors - a.selectedVisitors)
  }
  return { variants, sizes: tally(sizes), colors: tally(colors) }
}

async function checkoutFunnel(range: AdvancedRange) {
  const events = await AnalyticsEvent.find({
    occurredAt: { $gte: range.start, $lt: range.end },
    $or: [{ type: 'begin_checkout' }, { type: 'checkout_step' }],
  }).select('sessionId type checkoutStep occurredAt').sort({ occurredAt: 1 }).lean()
  const sessions = new Map<string, { startedAt: Date; shippingAt?: Date }>()
  for (const event of events) {
    const record = sessions.get(event.sessionId)
    if (event.type === 'begin_checkout') {
      if (!record || event.occurredAt < record.startedAt) {
        sessions.set(event.sessionId, { startedAt: event.occurredAt, ...(record?.shippingAt ? { shippingAt: record.shippingAt } : {}) })
      }
      continue
    }
    if (!record) continue
    if (event.checkoutStep === 'shipping_information_completed' && (!record.shippingAt || event.occurredAt < record.shippingAt)) record.shippingAt = event.occurredAt
  }
  const startedEntries = [...sessions.entries()]
  const orders = startedEntries.length
    ? await Order.find({
      source: 'online',
      placedAt: { $gte: range.start, $lte: range.now },
      analyticsSessionId: { $in: [...sessions.keys()] },
    }).select('analyticsSessionId placedAt paymentStatus fulfillmentStatus').lean()
    : []
  return calculateCheckoutFunnel(
    startedEntries.map(([sessionId, session]) => ({ sessionId, ...session })),
    orders.flatMap(order => order.analyticsSessionId ? [{ analyticsSessionId: order.analyticsSessionId, placedAt: order.placedAt, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus }] : []),
    { start: range.start, end: range.end },
    range.now,
  )
}

async function campaignIntelligence(range: DateRange) {
  const visitors = await AnalyticsEvent.aggregate([
    { $match: { occurredAt: { $gte: range.start, $lt: range.end }, type: 'campaign_visit' } },
    { $group: {
      _id: {
        source: { $ifNull: ['$utmSource', { $ifNull: ['$trafficSource', { $ifNull: ['$referrerHost', 'Direct'] }] }] },
        medium: { $ifNull: ['$utmMedium', '(not set)'] },
        campaign: { $ifNull: ['$utmCampaign', ''] },
      },
      visitors: { $addToSet: '$visitorId' },
      sessions: { $addToSet: '$sessionId' },
    } },
    { $project: { _id: 1, visitors: 1, visitorCount: { $size: '$visitors' }, sessions: { $size: '$sessions' } } },
    { $sort: { visitorCount: -1 } },
    { $limit: 100 },
  ])
  const [first, last] = await Promise.all((['analyticsFirstTouch', 'analyticsLastTouch'] as const).map(field => Order.aggregate([
    { $match: {
      ...completedOrderMatch(range),
      [`${field}.source`]: { $exists: true },
      analyticsVisitorId: { $type: 'string', $ne: '' },
    } },
    { $group: {
      _id: { source: `$${field}.source`, medium: { $ifNull: [`$${field}.medium`, '(not set)'] }, campaign: { $ifNull: [`$${field}.campaign`, ''] }, visitorId: '$analyticsVisitorId' },
      orders: { $sum: 1 },
      revenue: { $sum: '$total' },
    } },
    { $sort: { '_id.source': 1, '_id.campaign': 1 } },
  ])))
  const campaignKey = (source: string, medium: string, campaign: string) => `${source}|${medium}|${campaign}`
  const visitorMap = new Map(visitors.map(row => [
    campaignKey(row._id.source ?? 'Unknown', row._id.medium ?? '(not set)', row._id.campaign ?? ''),
    row,
  ]))
  const campaignVisitorSets = new Map([...visitorMap].map(([key, row]) => [key, new Set<string>(row.visitors)]))
  const merge = (sales: typeof first) => {
    const groups = new Map<string, { source: string; medium: string; campaign: string; sales: { visitorId: string; orders: number; revenue: number }[] }>()
    for (const sale of sales) {
      const source = sale._id.source ?? 'Unknown'
      const medium = sale._id.medium ?? '(not set)'
      const campaign = sale._id.campaign || ''
      const key = campaignKey(source, medium, campaign)
      let group = groups.get(key)
      if (!group) {
        group = { source, medium, campaign, sales: [] }
        groups.set(key, group)
      }
      group.sales.push({ visitorId: sale._id.visitorId, orders: sale.orders, revenue: sale.revenue })
    }
    return [...groups].flatMap(([key, group]) => {
      const campaignVisitors = campaignVisitorSets.get(key)
      if (!campaignVisitors) return []
      const conversion = calculateCampaignSales(campaignVisitors, group.sales)
      if (!conversion.orders) return []
      return [{ source: group.source, medium: group.medium, campaign: group.campaign || '(not set)', ...conversion }]
    }).sort((a, b) => b.revenue - a.revenue).slice(0, 100)
  }
  return {
    visitors: visitors.map(row => ({ source: row._id.source ?? 'Unknown', medium: row._id.medium ?? '(not set)', campaign: row._id.campaign || '(not set)', visitors: row.visitorCount, sessions: row.sessions })),
    firstTouch: merge(first),
    lastTouch: merge(last),
    campaignCostDataAvailable: false,
    roiAvailable: false,
  }
}

async function collectionIntelligence(range: DateRange) {
  const [views, clicks, purchaseItems] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: range.start, $lt: range.end }, type: 'collection_view', collectionId: { $exists: true } } },
      { $group: { _id: { collectionId: '$collectionId', visitorId: '$visitorId' }, views: { $sum: 1 } } },
    ]),
    AnalyticsEvent.find({
      occurredAt: { $gte: range.start, $lt: range.end },
      type: 'collection_product_click',
      collectionId: { $exists: true },
      productId: { $exists: true },
    }).select('collectionId productId visitorId occurredAt').sort({ occurredAt: 1 }).lean(),
    Order.aggregate([
      { $match: { ...completedOrderMatch(range), analyticsVisitorId: { $type: 'string', $ne: '' } } },
      { $unwind: '$items' },
      { $project: {
        visitorId: '$analyticsVisitorId',
        productId: '$items.productId',
        purchasedAt: '$placedAt',
        revenue: { $multiply: ['$items.unitPrice', '$items.quantity'] },
      } },
    ]),
  ])
  const collectionRows = new Map<string, {
    visitors: Set<string>
    views: number
    clickVisitors: Set<string>
    purchasingVisitors: Set<string>
    revenue: number
  }>()
  for (const view of views) {
    const collectionId = String(view._id.collectionId)
    const row = collectionRows.get(collectionId) ?? { visitors: new Set<string>(), views: 0, clickVisitors: new Set<string>(), purchasingVisitors: new Set<string>(), revenue: 0 }
    row.visitors.add(view._id.visitorId)
    row.views += view.views
    collectionRows.set(collectionId, row)
  }
  const clickHistory = new Map<string, { collectionId: string; occurredAt: Date }[]>()
  for (const click of clicks) {
    const key = `${click.visitorId}:${String(click.productId)}`
    const history = clickHistory.get(key) ?? []
    history.push({ collectionId: String(click.collectionId), occurredAt: click.occurredAt })
    clickHistory.set(key, history)
    const row = collectionRows.get(String(click.collectionId)) ?? { visitors: new Set<string>(), views: 0, clickVisitors: new Set<string>(), purchasingVisitors: new Set<string>(), revenue: 0 }
    row.clickVisitors.add(click.visitorId)
    collectionRows.set(String(click.collectionId), row)
  }
  for (const purchase of purchaseItems) {
    const visitorProduct = `${purchase.visitorId}:${String(purchase.productId)}`
    const history = clickHistory.get(visitorProduct)
    const click = history?.filter(item => item.occurredAt <= purchase.purchasedAt).at(-1)
    if (!click) continue
    const row = collectionRows.get(click.collectionId)
    if (!row) continue
    row.purchasingVisitors.add(purchase.visitorId)
    row.revenue += purchase.revenue
  }
  const collectionIds = [...collectionRows.keys()]
  const documents = await Collection.find({ _id: { $in: collectionIds } }).select('name slug').lean()
  const names = new Map(documents.map(collection => [String(collection._id), { name: collection.name, slug: collection.slug }]))
  return [...collectionRows].map(([collectionId, row]) => ({
    collectionId,
    collection: names.get(collectionId) ?? null,
    views: row.views,
    visitors: row.visitors.size,
    productClickVisitors: row.clickVisitors.size,
    purchasingVisitors: row.purchasingVisitors.size,
    revenue: row.revenue,
    conversionRate: percent(row.purchasingVisitors.size, row.clickVisitors.size),
  })).sort((a, b) => b.revenue - a.revenue || (b.conversionRate ?? 0) - (a.conversionRate ?? 0))
}

async function customerIntelligence(range: AdvancedRange) {
  const summaries = await Order.aggregate([
    { $match: completedOrderMatch() },
    { $group: {
      _id: '$customerId',
      orderCount: { $sum: 1 },
      revenue: { $sum: '$total' },
      firstPurchase: { $min: '$placedAt' },
      purchases: { $push: { date: '$placedAt', total: '$total' } },
    } },
    { $lookup: { from: Customer.collection.name, localField: '_id', foreignField: '_id', as: 'account' } },
    { $match: { 'account.0.clerkId': { $type: 'string', $ne: '' } } },
    { $project: { _id: 0, orderCount: 1, revenue: 1, firstPurchase: 1, purchases: 1 } },
  ]) as CustomerPurchaseSummary[]
  const metrics = calculateCustomerMetrics(summaries, range)
  return { metrics, cohorts: calculateCustomerCohorts(summaries, range) }
}

export async function getAdvancedAnalytics(range: AdvancedRange) {
  const previousRange = { start: range.previousStart, end: range.previousEnd ?? range.start }
  const [currentActivity, previousActivity, currentPurchases, previousPurchases, currentSales, previousSales, currentVariantSales, checkout, campaigns, customers, inventory] = await Promise.all([
    productActivity(range),
    productActivity(previousRange),
    productPurchases(range),
    productPurchases(previousRange),
    productSales(range),
    productSales(previousRange),
    variantSales(range),
    checkoutFunnel(range),
    campaignIntelligence(range),
    customerIntelligence(range),
    inventoryIntelligence(range),
  ])
  const [variantReport, currentProducts, previousProducts, collectionPerformance] = await Promise.all([
    variantIntelligence(range, currentPurchases, currentVariantSales),
    Promise.resolve(productRows(currentActivity, currentPurchases, currentSales)),
    Promise.resolve(productRows(previousActivity, previousPurchases, previousSales)),
    collectionIntelligence(range),
  ])
  const previousById = new Map(previousProducts.map(row => [row.productId, row]))
  const productIds = [...new Set([
    ...currentProducts.map(row => row.productId),
    ...previousProducts.map(row => row.productId),
    ...currentSales.map(row => String(row._id)),
  ])]
  const products = await Product.find({ _id: { $in: productIds } }).select('name slug images').lean()
  const productById = new Map(products.map(product => [String(product._id), {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    image: product.images[0]?.url ?? '',
  }]))
  const inventoryById = new Map(inventory.products.map(row => [row.productId, row]))
  const maximumViews = Math.max(1, ...currentProducts.map(row => row.views))
  const maximumUniqueViewers = Math.max(1, ...currentProducts.map(row => row.uniqueViewers))
  const maximumWishlistAdditions = Math.max(1, ...currentProducts.map(row => row.wishlistAdditions))
  const maximumCartAddEvents = Math.max(1, ...currentProducts.map(row => row.cartAddEvents))
  const maximumConfirmedPurchases = Math.max(1, ...currentProducts.map(row => row.unitsPurchased))
  const productReports = currentProducts.map(product => {
    const stock = inventoryById.get(product.productId)
    const opportunityScore = calculateProductOpportunityScore({
      views: product.views,
      uniqueViewers: product.uniqueViewers,
      wishlistAdditions: product.wishlistAdditions,
      cartAddEvents: product.cartAddEvents,
      confirmedPurchases: product.unitsPurchased,
      wishlistVisitors: product.wishlistVisitors,
      cartVisitors: product.cartVisitors,
      purchaseVisitors: product.purchaseVisitors,
      availableStock: stock?.availableStock ?? null,
      unitsSold90Days: stock?.unitsSold90Days ?? 0,
      maximumViews,
      maximumUniqueViewers,
      maximumWishlistAdditions,
      maximumCartAddEvents,
      maximumConfirmedPurchases,
    })
    const opportunityConfidence = opportunityScore === null ? 'insufficient_data' as const
      : product.uniqueViewers >= 20 ? 'supported' as const : 'limited' as const
    return {
      ...product,
      product: productById.get(product.productId) ?? null,
      availableStock: stock?.availableStock ?? null,
      unitsSold90Days: stock?.unitsSold90Days ?? 0,
      opportunityScore,
      opportunityConfidence,
      highOpportunity: opportunityScore !== null && opportunityScore >= 60 && opportunityConfidence === 'supported',
      previous: {
        views: previousById.get(product.productId)?.views ?? 0,
        viewToPurchaseRate: previousById.get(product.productId)?.viewToPurchaseRate ?? null,
      },
    }
  }).sort((a, b) => b.views - a.views)
  const bestPerformingProducts = [...currentSales]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(row => ({
      productId: String(row._id),
      product: productById.get(String(row._id)) ?? null,
      unitsPurchased: row.units,
      revenue: row.revenue,
    }))
  const previousOverall = previousProducts.reduce((sum, product) => sum + product.purchaseVisitors, 0)
  const previousViewers = previousProducts.reduce((sum, product) => sum + product.uniqueViewers, 0)
  const overallPreviousConversion = percent(previousOverall, previousViewers)
  const currentOverallPurchases = currentProducts.reduce((sum, product) => sum + product.purchaseVisitors, 0)
  const currentOverallViewers = currentProducts.reduce((sum, product) => sum + product.uniqueViewers, 0)
  const overallCurrentConversion = percent(currentOverallPurchases, currentOverallViewers)
  const conversionTrend = createConversionTrendInsight(overallCurrentConversion, overallPreviousConversion, currentOverallViewers, previousViewers)
  const variantNameByProduct = new Map(products.map(product => [String(product._id), product.name]))
  const variantsWithProducts = variantReport.variants.map(row => ({ ...row, productName: variantNameByProduct.get(row.productId) ?? row.productName }))
  const insightRecords: {
    title: string
    description: string
    metrics: Record<string, number | string | null>
    comparisonPeriod: string
    severity: 'low' | 'medium' | 'high'
    recommendedAction: string
  }[] = []
  for (const product of productReports) {
    const prior = product.previous
    if (product.product && prior.views >= 5 && product.views >= prior.views * 1.2 && prior.viewToPurchaseRate !== null
      && product.viewToPurchaseRate !== null && product.viewToPurchaseRate < prior.viewToPurchaseRate - 5) {
      insightRecords.push({
        title: `Interest is rising for ${product.product.name}, but conversion is falling`,
        description: 'Recorded product views increased while the view-to-purchase rate declined.',
        metrics: { views: product.views, previousViews: prior.views, conversionRate: product.viewToPurchaseRate, previousConversionRate: prior.viewToPurchaseRate },
        comparisonPeriod: `${previousRange.start.toISOString()} – ${previousRange.end.toISOString()}`,
        severity: 'high',
        recommendedAction: 'Review product availability, sizing information, imagery, and price presentation.',
      })
    }
    if (product.product && product.highInterestLowConversion) insightRecords.push({
      title: `Wishlist interest, low purchases: ${product.product.name}`,
      description: 'At least three consented visitors wishlisted the product after viewing it, while fewer than 10% of viewers purchased it.',
      metrics: { wishlistAfterViewVisitors: product.wishlistAfterViewVisitorCount, viewers: product.uniqueViewers, purchaseRate: product.viewToPurchaseRate },
      comparisonPeriod: `${range.start.toISOString()} – ${range.end.toISOString()}`,
      severity: 'medium',
      recommendedAction: 'Review product detail content and variant availability before increasing promotion.',
    })
  }
  if (checkout.abandonmentRate !== null && checkout.abandonmentRate >= 50 && checkout.abandonedCheckouts >= 3) insightRecords.push({
    title: 'Checkout abandonment is elevated',
    description: 'At least half of matured, consented checkout sessions ended without an order confirmation.',
    metrics: { abandonmentRate: checkout.abandonmentRate, abandonedCheckouts: checkout.abandonedCheckouts },
    comparisonPeriod: `${range.start.toISOString()} – ${range.end.toISOString()}`,
    severity: checkout.abandonmentRate >= 75 ? 'high' : 'medium',
    recommendedAction: 'Review delivery and address completion friction; payment-stage diagnosis is unavailable for cash-on-delivery checkout.',
  })
  const bestCollection = collectionPerformance.find(row => row.productClickVisitors >= 3 && row.revenue > 0)
  if (bestCollection) insightRecords.push({
    title: `Best-performing collection: ${bestCollection.collection?.name ?? 'Collection'}`,
    description: 'This collection generated the highest attributed confirmed revenue after recorded product clicks.',
    metrics: { productClickVisitors: bestCollection.productClickVisitors, purchasingVisitors: bestCollection.purchasingVisitors, conversionRate: bestCollection.conversionRate, revenue: bestCollection.revenue },
    comparisonPeriod: `${range.start.toISOString()} – ${range.end.toISOString()}`,
    severity: 'low',
    recommendedAction: 'Review its assortment and availability, then compare the same collection over the next reporting period.',
  })
  const bestChannel = campaigns.lastTouch.find(row => row.attributedPurchasers >= 3 && row.revenue > 0)
  if (bestChannel) insightRecords.push({
    title: `Revenue-leading channel: ${bestChannel.source}`,
    description: 'This last-touch campaign/source generated the highest reported confirmed revenue among channels with at least three attributed purchasers.',
    metrics: { campaign: bestChannel.campaign, orders: bestChannel.orders, revenue: bestChannel.revenue, conversionRate: bestChannel.conversionRate },
    comparisonPeriod: `${range.start.toISOString()} – ${range.end.toISOString()}`,
    severity: 'low',
    recommendedAction: 'Validate this channel’s campaign performance against actual spend before reallocating budget.',
  })
  const lowStockVariant = variantsWithProducts.find(variant => variant.selectedVisitors >= 3 && variant.availableStock <= 2)
  if (lowStockVariant) insightRecords.push({
    title: `High variant interest, low stock: ${lowStockVariant.productName}`,
    description: `${lowStockVariant.color || 'Selected'} ${lowStockVariant.size || 'variant'} has at most two available units.`,
    metrics: { selectedVisitors: lowStockVariant.selectedVisitors, unitsPurchased: lowStockVariant.unitsPurchased, availableStock: lowStockVariant.availableStock },
    comparisonPeriod: `${range.start.toISOString()} – ${range.end.toISOString()}`,
    severity: lowStockVariant.availableStock === 0 ? 'high' : 'medium',
    recommendedAction: 'Review replenishment plans and confirm the variant inventory before promoting it.',
  })
  const demandStockAlert = selectDistinctDemandStockAlert(lowStockVariant, inventory.variantAlerts)
  if (demandStockAlert) insightRecords.push({
    title: `Sales demand is close to available stock: ${demandStockAlert.productName}`,
    description: 'Confirmed sales over the last 90 days indicate that this active variant is at or below the 14-day demand threshold.',
    metrics: { size: demandStockAlert.size, color: demandStockAlert.color, unitsSold90Days: demandStockAlert.unitsSold90Days, availableStock: demandStockAlert.availableStock, estimatedDaysOfStock: demandStockAlert.estimatedDaysOfStock },
    comparisonPeriod: `${new Date(range.now.getTime() - 90 * 86_400_000).toISOString()} – ${range.now.toISOString()}`,
    severity: demandStockAlert.severity,
    recommendedAction: 'Review replenishment needs and verify supplier lead times before promoting this variant.',
  })
  if (conversionTrend) insightRecords.push({
    title: `Product view-to-purchase conversion ${conversionTrend.changePercentagePoints > 0 ? 'increased' : 'decreased'} significantly`,
    description: 'The consented visitor-level product conversion rate changed by at least 10 percentage points.',
    metrics: { conversionRate: conversionTrend.currentRate, previousConversionRate: conversionTrend.previousRate, changePercentagePoints: conversionTrend.changePercentagePoints, viewers: conversionTrend.currentVisitors },
    comparisonPeriod: `${previousRange.start.toISOString()} – ${previousRange.end.toISOString()}`,
    severity: conversionTrend.changePercentagePoints < 0 ? 'high' : 'low',
    recommendedAction: conversionTrend.changePercentagePoints < 0 ? 'Inspect stock, price, and product-page changes during this period.' : 'Identify the product and merchandising changes that accompanied the improvement.',
  })
  return {
    products: productReports.slice(0, 100),
    highOpportunityProducts: productReports.filter(row => row.highOpportunity).sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)).slice(0, 10),
    highInterestLowConversion: productReports.filter(row => row.highInterestLowConversion).slice(0, 10),
    mostViewedWithoutPurchases: productReports.filter(row => row.mostViewedWithoutPurchases).slice(0, 10),
    bestPerformingProducts,
    inventory: {
      products: inventory.products.slice(0, 50),
      variantAlerts: inventory.variantAlerts.slice(0, 50),
    },
    variants: variantsWithProducts.slice(0, 100),
    variantSizes: variantReport.sizes,
    variantColors: variantReport.colors,
    collectionPerformance,
    checkout,
    campaigns,
    customers,
    insights: insightRecords.slice(0, 12),
  }
}
