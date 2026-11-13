import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import { z } from 'zod'
import { authenticateAdmin } from '../auth.js'
import { AnalyticsEvent } from '../models/AnalyticsEvent.js'
import { CookieConsentLog } from '../models/CookieConsentLog.js'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { Collection } from '../models/Collection.js'
import { activeAnalyticsVisitorWindow, calculateCtaClickThroughRate, calculateSequentialVisitorFunnel, calculateVisitorConversionRate, completedOrderMatch, getAdvancedAnalytics, placedOnlineOrderMatch, resolveAnalyticsDateRange } from '../analyticsReports.js'

const router = Router()
const eventLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false })
const overviewCache = new Map<string, { expiresAt: number; data: unknown }>()
export function invalidateAnalyticsOverviewCache() {
  overviewCache.clear()
}
export const analyticsOverviewQuerySchema = z.object({
  days: z.coerce.number().int().refine(value => [7, 30, 90].includes(value)).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  refresh: z.literal('1').optional(),
}).superRefine((query, context) => {
  if (query.days !== undefined && query.month !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['month'], message: 'Choose either a day range or a calendar month.' })
  }
})
const eventTypes = [
  'page_view', 'session_start', 'session_end', 'scroll_depth', 'search',
  'product_view', 'product_variant_select', 'wishlist_add', 'wishlist_remove',
  'add_to_cart', 'remove_from_cart', 'collection_view', 'collection_product_click',
  'begin_checkout', 'checkout_step', 'purchase', 'cta_impression', 'cta_click',
  'campaign_visit', 'login', 'registration',
] as const
const optionalText = (max: number) => z.string().trim().max(max).optional()
const containsPersonalText = (value: string) => /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value) || /\+?\d[\d\s()-]{6,}\d/.test(value)
export function isDuplicateAnalyticsEventError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}
export function hasAnalyticsConsent(consent: { preferences?: { analytics?: boolean } | null } | null | undefined) {
  return consent?.preferences?.analytics === true
}

export const analyticsEventSchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(eventTypes),
  visitorId: z.string().uuid(),
  sessionId: z.string().uuid(),
  page: z.string().startsWith('/').max(500).refine(value => !value.startsWith('//') && !value.includes('?') && !value.includes('#')),
  trafficSource: optionalText(253),
  referrerHost: optionalText(253),
  deviceCategory: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).optional(),
  productId: z.string().refine(mongoose.isValidObjectId).optional(),
  variantSize: optionalText(40),
  variantColor: optionalText(80),
  collectionId: z.string().refine(mongoose.isValidObjectId).optional(),
  ctaId: optionalText(100),
  ctaLabel: optionalText(120),
  ctaLocation: optionalText(120),
  searchTerm: optionalText(120),
  searchResults: z.number().int().min(0).max(10_000).optional(),
  scrollDepth: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]).optional(),
  checkoutStep: z.enum(['shipping_information_completed', 'order_confirmed']).optional(),
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(120),
  utmContent: optionalText(120),
  utmTerm: optionalText(120),
}).strict().superRefine((event, context) => {
  if (event.type.startsWith('product_') || event.type === 'wishlist_add' || event.type === 'wishlist_remove' || event.type === 'add_to_cart' || event.type === 'remove_from_cart') {
    if (!event.productId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['productId'], message: 'Product events require a product.' })
  }
  if (event.type === 'collection_product_click' && (!event.productId || !event.collectionId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['collectionId'], message: 'Collection product clicks require both product and collection identifiers.' })
  if (event.type === 'scroll_depth' && event.scrollDepth === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['scrollDepth'], message: 'Scroll events require a depth.' })
  if (event.type === 'checkout_step' && event.checkoutStep === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['checkoutStep'], message: 'Checkout-step events require a supported step.' })
  if (event.type !== 'checkout_step' && event.checkoutStep !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['checkoutStep'], message: 'Checkout steps are only valid for checkout-step events.' })
  if (event.type === 'cta_click' || event.type === 'cta_impression') {
    if (!event.ctaId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['ctaId'], message: 'CTA events require an identifier.' })
  }
  for (const field of ['page', 'trafficSource', 'variantSize', 'variantColor', 'ctaId', 'ctaLabel', 'ctaLocation', 'searchTerm', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm'] as const) {
    const value = event[field]
    if (value && containsPersonalText(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Analytics text fields must not include contact details.' })
    }
  }
})

router.post('/events', eventLimit, async (request, response, next) => {
  try {
    const parsed = analyticsEventSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_ANALYTICS_EVENT', message: 'The analytics event is invalid.' } })
      return
    }
    const consent = await CookieConsentLog.findOne({ visitorId: parsed.data.visitorId }).sort({ createdAt: -1 }).select('preferences.analytics').lean()
    if (!hasAnalyticsConsent(consent)) {
      response.status(403).json({ error: { code: 'ANALYTICS_CONSENT_REQUIRED', message: 'Analytics consent is not active.' } })
      return
    }
    try {
      await AnalyticsEvent.create(parsed.data)
    } catch (error) {
      if (isDuplicateAnalyticsEventError(error)) {
        response.status(202).json({ data: { accepted: true, duplicate: true } })
        return
      }
      throw error
    }
    response.status(202).json({ data: { accepted: true, duplicate: false } })
  } catch (error) {
    next(error)
  }
})

router.use('/admin', authenticateAdmin)
router.get('/admin/overview', async (request, response, next) => {
  try {
    const query = analyticsOverviewQuerySchema.safeParse(request.query)
    if (!query.success) {
      response.status(400).json({ error: { code: 'INVALID_ANALYTICS_RANGE', message: 'Choose a 7, 30, or 90 day period, or a valid calendar month.' } })
      return
    }
    const now = new Date()
    const { start, end, previousStart, previousEnd, days, month } = resolveAnalyticsDateRange(query.data, now)
    if (month && month > now.toISOString().slice(0, 7)) {
      response.status(400).json({ error: { code: 'INVALID_ANALYTICS_RANGE', message: 'A monthly report cannot be generated for a future month.' } })
      return
    }
    const cacheKey = `${start.toISOString()}|${end.toISOString()}`
    const cached = overviewCache.get(cacheKey)
    if (query.data.refresh !== '1' && cached && cached.expiresAt > Date.now()) {
      response.json({ data: cached.data })
      return
    }
    const eventsFilter = { occurredAt: { $gte: start, $lt: end } }
    const previousEventsFilter = { occurredAt: { $gte: previousStart, $lt: previousEnd } }
    const completedOrderFilter = completedOrderMatch({ start, end })
    const previousOrderFilter = completedOrderMatch({ start: previousStart, end: previousEnd })
    const [summary, previousSummary, completedOrders, previousOrders, dailyEvents, dailyOrders, viewed, wishlisted, addedToCart, purchased, collections, sources, active, returning, pages, funnelEvents, firstTouchSales, lastTouchSales, ctas, sizeDemand, colorDemand, sizeStock, colorStock, advanced] = await Promise.all([
      AnalyticsEvent.aggregate([
        { $match: eventsFilter },
        { $group: { _id: null, pageViews: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } }, visitorIds: { $addToSet: '$visitorId' }, sessions: { $addToSet: '$sessionId' }, cartAdds: { $sum: { $cond: [{ $eq: ['$type', 'add_to_cart'] }, 1, 0] } }, checkoutStarts: { $sum: { $cond: [{ $eq: ['$type', 'begin_checkout'] }, 1, 0] } } } },
        { $project: { _id: 0, pageViews: 1, visitorIds: 1, visitors: { $size: '$visitorIds' }, sessions: { $size: '$sessions' }, cartAdds: 1, checkoutStarts: 1 } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: previousEventsFilter },
        { $group: { _id: null, pageViews: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } }, visitorIds: { $addToSet: '$visitorId' }, sessions: { $addToSet: '$sessionId' } } },
        { $project: { _id: 0, pageViews: 1, visitors: { $size: '$visitorIds' }, sessions: { $size: '$sessions' } } },
      ]),
      Order.aggregate([{ $match: completedOrderFilter }, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
      Order.aggregate([{ $match: previousOrderFilter }, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
      AnalyticsEvent.aggregate([
        { $match: { ...eventsFilter, type: { $in: ['page_view', 'session_start'] } } },
        { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }, visitorId: '$visitorId' }, visits: { $sum: { $cond: [{ $eq: ['$type', 'session_start'] }, 1, 0] } }, pageViews: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } } } },
        { $group: { _id: '$_id.day', visitors: { $sum: 1 }, sessions: { $sum: '$visits' }, pageViews: { $sum: '$pageViews' } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([{ $match: completedOrderFilter }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { _id: 1 } }]),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: 'product_view', productId: { $exists: true } } }, { $group: { _id: '$productId', views: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } }, { $sort: { views: -1 } }, { $limit: 5 }]),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: 'wishlist_add', productId: { $exists: true } } }, { $group: { _id: '$productId', additions: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } }, { $sort: { additions: -1 } }, { $limit: 5 }]),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: 'add_to_cart', productId: { $exists: true } } }, { $group: { _id: '$productId', additions: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } }, { $sort: { additions: -1 } }, { $limit: 5 }]),
      Order.aggregate([{ $match: completedOrderFilter }, { $unwind: '$items' }, { $group: { _id: '$items.productId', purchases: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } } } }, { $sort: { purchases: -1 } }, { $limit: 5 }]),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: 'collection_view', collectionId: { $exists: true } } }, { $group: { _id: '$collectionId', views: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } }, { $project: { _id: 1, views: 1, visitors: { $size: '$visitors' } } }, { $sort: { views: -1 } }, { $limit: 8 }]),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: 'session_start' } }, { $group: { _id: { $ifNull: ['$trafficSource', 'Direct'] }, sessions: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } }, { $project: { _id: 1, sessions: 1, visitors: { $size: '$visitors' } } }, { $sort: { sessions: -1 } }, { $limit: 8 }]),
      AnalyticsEvent.distinct('visitorId', { occurredAt: activeAnalyticsVisitorWindow(now) }),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: 'session_start' } }, { $group: { _id: '$visitorId', sessions: { $addToSet: '$sessionId' } } }, { $group: { _id: null, visitors: { $sum: 1 }, returning: { $sum: { $cond: [{ $gt: [{ $size: '$sessions' }, 1] }, 1, 0] } } } }]),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: 'page_view' } }, { $group: { _id: '$page', views: { $sum: 1 }, visitors: { $addToSet: '$visitorId' }, sessions: { $addToSet: '$sessionId' } } }, { $project: { _id: 1, views: 1, visitors: { $size: '$visitors' }, sessions: { $size: '$sessions' } } }, { $sort: { views: -1 } }, { $limit: 10 }]),
      AnalyticsEvent.aggregate([{ $match: { ...eventsFilter, type: { $in: ['page_view', 'product_view', 'add_to_cart', 'begin_checkout'] } } }, { $group: { _id: '$type', visitors: { $addToSet: '$visitorId' } } }]),
      Order.aggregate([{ $match: { ...completedOrderFilter, 'analyticsFirstTouch.source': { $exists: true } } }, { $group: { _id: '$analyticsFirstTouch.source', orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { revenue: -1 } }, { $limit: 8 }]),
      Order.aggregate([{ $match: { ...completedOrderFilter, 'analyticsLastTouch.source': { $exists: true } } }, { $group: { _id: '$analyticsLastTouch.source', orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { revenue: -1 } }, { $limit: 8 }]),
      AnalyticsEvent.aggregate([
        { $match: { ...eventsFilter, type: { $in: ['cta_impression', 'cta_click'] }, ctaId: { $exists: true } } },
        { $group: {
          _id: '$ctaId',
          label: { $first: '$ctaLabel' },
          location: { $first: '$ctaLocation' },
          impressions: { $sum: { $cond: [{ $eq: ['$type', 'cta_impression'] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ['$type', 'cta_click'] }, 1, 0] } },
          impressionVisitors: { $addToSet: { $cond: [{ $eq: ['$type', 'cta_impression'] }, '$visitorId', '__no_impression__'] } },
          clickVisitors: { $addToSet: { $cond: [{ $eq: ['$type', 'cta_click'] }, '$visitorId', '__no_click__'] } },
        } },
        { $project: {
          _id: 1,
          label: 1,
          location: 1,
          impressions: 1,
          clicks: 1,
          impressionVisitors: { $setDifference: ['$impressionVisitors', ['__no_impression__']] },
          clickVisitors: { $setDifference: ['$clickVisitors', ['__no_click__']] },
        } },
        { $sort: { clicks: -1, impressions: -1 } },
        { $limit: 20 },
      ]),
      Order.aggregate([{ $match: completedOrderFilter }, { $unwind: '$items' }, { $group: { _id: '$items.size', unitsSold: { $sum: '$items.quantity' } } }, { $sort: { unitsSold: -1 } }]),
      Order.aggregate([{ $match: completedOrderFilter }, { $unwind: '$items' }, { $group: { _id: '$items.color', unitsSold: { $sum: '$items.quantity' } } }, { $sort: { unitsSold: -1 } }]),
      Product.aggregate([{ $match: { status: 'active' } }, { $unwind: '$variants' }, { $match: { 'variants.active': true } }, { $group: { _id: '$variants.size', unitsInStock: { $sum: '$variants.stock' } } }, { $sort: { unitsInStock: -1 } }]),
      Product.aggregate([{ $match: { status: 'active' } }, { $unwind: '$variants' }, { $match: { 'variants.active': true } }, { $group: { _id: '$variants.color', unitsInStock: { $sum: '$variants.stock' } } }, { $sort: { unitsInStock: -1 } }]),
      getAdvancedAnalytics({ start, end, previousStart, previousEnd, now }),
    ])
    const productIds = [...new Set([...viewed, ...wishlisted, ...addedToCart, ...purchased].map(item => String(item._id)))].filter(mongoose.isValidObjectId)
    const collectionIds = [...new Set(collections.map(item => String(item._id)))].filter(mongoose.isValidObjectId)
    const [products, collectionRecords] = await Promise.all([
      Product.find({ _id: { $in: productIds } }).select('name slug images').lean(),
      Collection.find({ _id: { $in: collectionIds } }).select('name slug image').lean(),
    ])
    const activeConsentLogs = active.length
      ? await CookieConsentLog.find({ visitorId: { $in: active } }).sort({ visitorId: 1, createdAt: -1 }).select('visitorId preferences.analytics').lean()
      : []
    const currentlyConsentedVisitors = new Set<string>()
    const checkedConsentVisitors = new Set<string>()
    for (const log of activeConsentLogs) {
      const visitorId = String(log.visitorId)
      if (checkedConsentVisitors.has(visitorId)) continue
      checkedConsentVisitors.add(visitorId)
      if (log.preferences?.analytics) currentlyConsentedVisitors.add(visitorId)
    }
    const productById = new Map(products.map(product => [String(product._id), product]))
    const collectionById = new Map(collectionRecords.map(collection => [String(collection._id), collection]))
    const mapProducts = <T extends { _id: mongoose.Types.ObjectId }>(items: T[]) => items.map(item => ({
      ...item,
      product: productById.get(String(item._id)) ? {
        id: String(item._id),
        name: productById.get(String(item._id))!.name,
        slug: productById.get(String(item._id))!.slug,
        image: productById.get(String(item._id))!.images[0]?.url ?? '',
      } : null,
    })).filter(item => item.product)
    const visitorCount = summary[0]?.visitors ?? 0
    const orderCount = completedOrders[0]?.orders ?? 0
    const attributedOrderFilter = {
      ...placedOnlineOrderMatch({ start, end }),
      analyticsSessionId: { $type: 'string', $ne: '' },
    }
    const attributedPurchasers = await Order.distinct('analyticsVisitorId', attributedOrderFilter)
    const periodVisitorIds = new Set<string>(summary[0]?.visitorIds ?? [])
    const conversion = calculateVisitorConversionRate(periodVisitorIds, new Set<string>(attributedPurchasers))
    const previousVisitorCount = previousSummary[0]?.visitors ?? 0
    const previousOrderCount = previousOrders[0]?.orders ?? 0
    const dailyByDate = new Map<string, { visitors: number; sessions: number; pageViews: number; orders: number; revenue: number }>()
    for (let index = 0; index < days; index += 1) {
      const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10)
      dailyByDate.set(date, { visitors: 0, sessions: 0, pageViews: 0, orders: 0, revenue: 0 })
    }
    for (const point of dailyEvents) dailyByDate.set(point._id, { ...dailyByDate.get(point._id), visitors: point.visitors, sessions: point.sessions, pageViews: point.pageViews } as { visitors: number; sessions: number; pageViews: number; orders: number; revenue: number })
    for (const point of dailyOrders) dailyByDate.set(point._id, { ...dailyByDate.get(point._id), orders: point.orders, revenue: point.revenue } as { visitors: number; sessions: number; pageViews: number; orders: number; revenue: number })
    const data = {
      period: { days, from: start.toISOString(), to: end.toISOString(), ...(month ? { month } : {}) },
      metrics: {
        visitors: visitorCount,
        sessions: summary[0]?.sessions ?? 0,
        pageViews: summary[0]?.pageViews ?? 0,
        orders: orderCount,
        revenue: completedOrders[0]?.revenue ?? 0,
        conversionRate: conversion.conversionRate,
        averageOrderValue: orderCount ? (completedOrders[0]?.revenue ?? 0) / orderCount : null,
        cartAdds: summary[0]?.cartAdds ?? 0,
        checkoutStarts: summary[0]?.checkoutStarts ?? 0,
        checkoutAbandonedSessions: advanced.checkout.abandonedCheckouts,
        checkoutAbandonmentRate: advanced.checkout.abandonmentRate,
        activeVisitors: currentlyConsentedVisitors.size,
        returningVisitorRate: visitorCount ? (returning[0]?.returning ?? 0) / visitorCount * 100 : null,
      },
      comparison: {
        visitors: previousVisitorCount,
        sessions: previousSummary[0]?.sessions ?? 0,
        pageViews: previousSummary[0]?.pageViews ?? 0,
        orders: previousOrderCount,
        revenue: previousOrders[0]?.revenue ?? 0,
      },
      daily: [...dailyByDate].map(([date, values]) => ({ date, ...values })),
      topViewed: mapProducts(viewed),
      topWishlisted: mapProducts(wishlisted),
      topAddedToCart: mapProducts(addedToCart),
      topPurchased: mapProducts(purchased),
      topCollections: collections.map(item => ({ ...item, collection: collectionById.get(String(item._id)) ? {
        id: String(item._id),
        name: collectionById.get(String(item._id))!.name,
        slug: collectionById.get(String(item._id))!.slug,
        image: collectionById.get(String(item._id))!.image,
      } : null })).filter(item => item.collection),
      sources,
      pages,
      funnel: (() => {
        const visitorSets = new Map<string, Set<string>>(funnelEvents.map(item => [item._id, new Set<string>(item.visitors)]))
        visitorSets.set('purchase', new Set(attributedPurchasers))
        return calculateSequentialVisitorFunnel(['page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'purchase'].map(stage => ({
          stage,
          visitorIds: visitorSets.get(stage) ?? new Set<string>(),
        })))
      })(),
      attribution: { firstTouch: firstTouchSales, lastTouch: lastTouchSales },
      ctas: ctas.map(cta => {
        const impressions = new Set(cta.impressionVisitors as string[])
        return {
          _id: cta._id as string,
          label: cta.label as string | undefined,
          location: cta.location as string | undefined,
          impressions: cta.impressions as number,
          clicks: cta.clicks as number,
          ctr: calculateCtaClickThroughRate(impressions, new Set(cta.clickVisitors as string[])),
        }
      }),
      demand: { sizes: sizeDemand, colors: colorDemand, sizeStock, colorStock },
      advanced,
    }
    const cacheNow = Date.now()
    for (const [key, entry] of overviewCache) if (entry.expiresAt <= cacheNow) overviewCache.delete(key)
    if (overviewCache.size >= 12) overviewCache.delete(overviewCache.keys().next().value!)
    overviewCache.set(cacheKey, { expiresAt: cacheNow + 15_000, data })
    response.json({ data })
  } catch (error) {
    next(error)
  }
})

export const analyticsRouter = router
