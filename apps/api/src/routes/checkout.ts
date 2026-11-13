import { randomBytes, randomUUID } from 'node:crypto'
import type { CashOnDeliveryOrderRequest } from '@off/shared-types'
import { TUNISIA_LOCATIONS } from '@off/shared-types/tunisia-locations'
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { authenticateOptionalCustomer, CustomerAuthError, resolveClerkCustomer } from '../customerAuth.js'
import { Customer } from '../models/Customer.js'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { AnalyticsEvent } from '../models/AnalyticsEvent.js'
import { CookieConsentLog } from '../models/CookieConsentLog.js'
import { orderQrTokenHashForId } from '../orderQr.js'
import { isOnlinePaymentEnabled } from '../runtimeConfig.js'

const router = Router()
const cashOnDeliverySchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, z.string().trim().email().max(254).optional()),
  }),
  shippingAddress: z.object({
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(160).default(''),
    phoneNumber: z.string().trim().min(7).max(32).optional().or(z.literal('')),
    city: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().max(24).default(''),
    country: z.literal('TN'),
    governorate: z.string().min(1),
    delegation: z.string().min(1),
  }).superRefine((address, context) => {
    const delegations = TUNISIA_LOCATIONS[address.governorate]
    if (!delegations) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['governorate'], message: 'Choose a valid Tunisian governorate.' })
    } else if (!delegations.includes(address.delegation)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['delegation'], message: 'Choose a delegation belonging to the selected governorate.' })
    }
  }),
  items: z.array(z.object({
    productId: z.string().refine(mongoose.isValidObjectId),
    sku: z.string().trim().min(1).max(80),
    quantity: z.number().int().min(1).max(10),
  })).min(1).max(20),
  orderNote: z.string().trim().max(500).optional().default(''),
  analyticsAttribution: z.object({ visitorId: z.string().uuid(), sessionId: z.string().uuid() }).strict().optional(),
})
class CashOnDeliveryError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

async function releaseReservedStock(items: { productId: mongoose.Types.ObjectId; sku: string; quantity: number }[]) {
  await Promise.all(items.map(({ productId, sku, quantity }) =>
    Product.updateOne({ _id: productId, 'variants.sku': sku }, { $inc: { 'variants.$.stock': quantity } }),
  ))
}

async function markOrderPaid(orderId: string, paymentIntentId: string) {
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(async () => {
      const order = await Order.findOneAndUpdate(
        { _id: orderId, paymentMethod: 'stripe', gatewayPaymentStatus: 'pending', paymentStatus: 'unpaid' },
        { $set: { gatewayPaymentStatus: 'paid', paymentStatus: 'paid', stripePaymentIntentId: paymentIntentId } },
        { new: true, session },
      )
      if (!order) return
      const customerUpdate = await Customer.updateOne(
        { _id: order.customerId },
        { $inc: { orderCount: 1, totalSpent: order.total } },
        { session },
      )
      if (customerUpdate.matchedCount !== 1) throw new Error('The order customer record is missing.')
      return order
    })
  } finally {
    await session.endSession()
  }
}

async function cancelPendingOrder(orderId: string) {
  const changedAt = new Date()
  const order = await Order.findOneAndUpdate(
    { _id: orderId, paymentMethod: 'stripe', gatewayPaymentStatus: 'pending', paymentStatus: 'unpaid' },
    { $set: { gatewayPaymentStatus: 'failed', paymentStatus: 'unpaid', fulfillmentStatus: 'cancelled' }, $push: { statusHistory: { status: 'cancelled', previousStatus: 'confirmation', changedAt } } },
    { new: true },
  )
  if (order?.items.length) {
    await releaseReservedStock(order.items.map(item => ({
      productId: item.productId,
      sku: item.sku,
      quantity: item.quantity,
    })))
  }
  return order
}

router.post('/cod', authenticateOptionalCustomer, async (request, response, next) => {
  const parsed = cashOnDeliverySchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'INVALID_CASH_ON_DELIVERY_ORDER', message: 'Check your contact, Tunisian shipping address, and order items.' } })
    return
  }
  const input: CashOnDeliveryOrderRequest = parsed.data
  const requestedItems = new Map<string, { productId: string; sku: string; quantity: number }>()
  for (const item of input.items) {
    const key = `${item.productId}:${item.sku}`
    const current = requestedItems.get(key)
    const quantity = (current?.quantity ?? 0) + item.quantity
    if (quantity > 10) {
      response.status(400).json({ error: { code: 'INVALID_QUANTITY', message: 'The combined quantity for a variant cannot exceed 10.' } })
      return
    }
    requestedItems.set(key, { ...item, quantity })
  }

  const reserved: { productId: mongoose.Types.ObjectId; sku: string; quantity: number }[] = []
  let orderId: mongoose.Types.ObjectId | undefined
  try {
    const items = []
    for (const item of requestedItems.values()) {
      const productId = new mongoose.Types.ObjectId(item.productId)
      const product = await Product.findOne({
        _id: productId,
        status: 'active',
        variants: { $elemMatch: { sku: item.sku, active: true, stock: { $gte: item.quantity } } },
      }).lean()
      const variant = product?.variants.find(entry => entry.sku === item.sku && entry.active && entry.stock >= item.quantity)
      if (!product || !variant) {
        throw new CashOnDeliveryError(409, 'ITEM_UNAVAILABLE', 'A selected item is no longer available in that quantity. Review your bag and try again.')
      }
      const reservation = await Product.updateOne(
        { _id: productId, status: 'active', variants: { $elemMatch: { sku: item.sku, active: true, stock: { $gte: item.quantity } } } },
        { $inc: { 'variants.$.stock': -item.quantity } },
      )
      if (reservation.modifiedCount !== 1) {
        throw new CashOnDeliveryError(409, 'ITEM_UNAVAILABLE', 'Stock changed while placing the order. Review your bag and try again.')
      }
      reserved.push({ productId, sku: item.sku, quantity: item.quantity })
      items.push({
        productId,
        name: product.name,
        image: product.images?.[0]?.url ?? '',
        sku: item.sku,
        color: variant.color,
        size: variant.size,
        unitPrice: Math.round(variant.price * 100) / 100,
        quantity: item.quantity,
      })
    }

    const linkedCustomer = request.clerkUserId ? await resolveClerkCustomer(request.clerkUserId) : null
    const normalizedEmail = linkedCustomer?.email ?? input.customer.email?.toLowerCase()
    const orderContactEmail = input.customer.email?.toLowerCase() ?? linkedCustomer?.email
    const customerName = linkedCustomer?.name ?? input.customer.name
    const customer = linkedCustomer ?? (normalizedEmail
      ? await Customer.findOneAndUpdate(
        { email: normalizedEmail },
        { $set: { name: customerName, status: 'active' }, $setOnInsert: { orderCount: 0, totalSpent: 0 } },
        { upsert: true, new: true, runValidators: true },
      )
      : await Customer.create({
        name: customerName,
        email: `cod-${randomBytes(12).toString('hex')}@no-email.invalid`,
        status: 'active',
      }))
    if (!customer) throw new Error('Unable to resolve the customer record for this order.')
    let analyticsAttribution: typeof input.analyticsAttribution
    let analyticsFirstTouch: { source: string; medium?: string; campaign?: string; content?: string; term?: string } | undefined
    let analyticsLastTouch: typeof analyticsFirstTouch
    if (input.analyticsAttribution) {
      const [consent, sessionExists] = await Promise.all([
        CookieConsentLog.findOne({ visitorId: input.analyticsAttribution.visitorId }).sort({ createdAt: -1 }).select('preferences.analytics').lean(),
        AnalyticsEvent.exists({ visitorId: input.analyticsAttribution.visitorId, sessionId: input.analyticsAttribution.sessionId }),
      ])
      if (consent?.preferences?.analytics && sessionExists) {
        analyticsAttribution = input.analyticsAttribution
        const [firstSession, lastEvent] = await Promise.all([
          AnalyticsEvent.findOne({ visitorId: input.analyticsAttribution.visitorId, type: 'session_start' }).sort({ occurredAt: 1 }).select('sessionId trafficSource referrerHost occurredAt').lean(),
          AnalyticsEvent.findOne({ visitorId: input.analyticsAttribution.visitorId, type: { $in: ['session_start', 'campaign_visit'] } }).sort({ occurredAt: -1 }).select('type sessionId trafficSource referrerHost utmSource utmMedium utmCampaign utmContent utmTerm occurredAt').lean(),
        ])
        const [firstCampaign, lastSession, lastCampaign] = await Promise.all([
          firstSession
          ? await AnalyticsEvent.findOne({ visitorId: input.analyticsAttribution.visitorId, sessionId: firstSession.sessionId, type: 'campaign_visit' })
            .sort({ occurredAt: 1 })
            .select('utmSource utmMedium utmCampaign utmContent utmTerm')
            .lean()
          : AnalyticsEvent.findOne({ visitorId: input.analyticsAttribution.visitorId, type: 'campaign_visit' }).sort({ occurredAt: 1 }).select('utmSource utmMedium utmCampaign utmContent utmTerm referrerHost').lean(),
          lastEvent?.type === 'session_start'
            ? Promise.resolve(lastEvent)
            : lastEvent
              ? AnalyticsEvent.findOne({ visitorId: input.analyticsAttribution.visitorId, sessionId: lastEvent.sessionId, type: 'session_start' }).sort({ occurredAt: -1 }).select('sessionId trafficSource referrerHost occurredAt').lean()
              : Promise.resolve(null),
          lastEvent?.type === 'campaign_visit'
            ? Promise.resolve(lastEvent)
            : lastEvent
              ? AnalyticsEvent.findOne({ visitorId: input.analyticsAttribution.visitorId, sessionId: lastEvent.sessionId, type: 'campaign_visit' }).sort({ occurredAt: -1 }).select('sessionId trafficSource referrerHost utmSource utmMedium utmCampaign utmContent utmTerm occurredAt').lean()
              : Promise.resolve(null),
        ])
        const toTouch = (sessionEvent: typeof firstSession, campaignEvent: typeof firstCampaign | typeof lastEvent) => sessionEvent || campaignEvent ? {
          source: campaignEvent?.utmSource || sessionEvent?.trafficSource || campaignEvent?.referrerHost || sessionEvent?.referrerHost || 'Direct',
          ...((campaignEvent?.utmMedium) ? { medium: campaignEvent.utmMedium } : {}),
          ...((campaignEvent?.utmCampaign) ? { campaign: campaignEvent.utmCampaign } : {}),
          ...((campaignEvent?.utmContent) ? { content: campaignEvent.utmContent } : {}),
          ...((campaignEvent?.utmTerm) ? { term: campaignEvent.utmTerm } : {}),
        } : undefined
        analyticsFirstTouch = toTouch(firstSession, firstCampaign)
        analyticsLastTouch = toTouch(lastSession, lastCampaign)
      }
    }
    if (analyticsAttribution) {
      const currentConsent = await CookieConsentLog.findOne({ visitorId: analyticsAttribution.visitorId })
        .sort({ createdAt: -1 })
        .select('preferences.analytics')
        .lean()
      if (!currentConsent?.preferences?.analytics) {
        analyticsAttribution = undefined
        analyticsFirstTouch = undefined
        analyticsLastTouch = undefined
      }
    }
    const total = items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity, 0) / 100
    const placedAt = new Date()
    const suffix = randomBytes(3).toString('hex').toUpperCase()
    const createdOrderId = new mongoose.Types.ObjectId()
    const order = await Order.create({
      _id: createdOrderId,
      qrTokenHash: orderQrTokenHashForId(String(createdOrderId)),
      orderNumber: `OFF${Date.now()}${suffix}`,
      customerId: customer._id,
      customerName,
      customerEmail: orderContactEmail ?? customer.email,
      items,
      orderNote: input.orderNote ?? '',
      shippingAddress: { ...input.shippingAddress, fullName: input.customer.name, phoneNumber: input.shippingAddress.phoneNumber ?? '' },
      subtotal: total,
      total,
      currency: 'TND',
      paymentStatus: 'unpaid',
      gatewayPaymentStatus: 'pending',
      paymentMethod: 'cash_on_delivery',
      fulfillmentStatus: 'confirmation',
      ...(analyticsAttribution ? { analyticsVisitorId: analyticsAttribution.visitorId, analyticsSessionId: analyticsAttribution.sessionId } : {}),
      ...(analyticsFirstTouch ? { analyticsFirstTouch } : {}),
      ...(analyticsLastTouch ? { analyticsLastTouch } : {}),
      statusHistory: [{ status: 'confirmation', changedAt: placedAt }],
      source: 'online',
      placedAt,
    })
    orderId = order._id
    if (analyticsAttribution) {
      try {
        await AnalyticsEvent.create([
          {
            eventId: randomUUID(),
            type: 'checkout_step',
            checkoutStep: 'order_confirmed',
            visitorId: analyticsAttribution.visitorId,
            sessionId: analyticsAttribution.sessionId,
            page: '/checkout',
          },
          {
            eventId: randomUUID(),
            type: 'purchase',
            visitorId: analyticsAttribution.visitorId,
            sessionId: analyticsAttribution.sessionId,
            page: '/checkout',
          },
        ])
      } catch (error) {
        console.warn('Unable to record confirmed checkout analytics:', error instanceof Error ? error.name : 'Unknown error')
      }
    }
    response.status(201).json({ data: { orderNumber: order.orderNumber, total, currency: 'TND' } })
  } catch (error) {
    try {
      if (orderId) await Order.deleteOne({ _id: orderId })
      await releaseReservedStock(reserved)
    } catch (rollbackError) {
      console.error('Unable to fully roll back cash-on-delivery order:', rollbackError instanceof Error ? rollbackError.name : 'Unknown error')
    }
    if (error instanceof CashOnDeliveryError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof CustomerAuthError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    next(error)
  }
})

router.post('/', (_request, response) => {
  response.status(503).json({
    error: {
      code: isOnlinePaymentEnabled() ? 'TND_PAYMENT_NOT_CONFIGURED' : 'ONLINE_PAYMENT_DISABLED',
      message: isOnlinePaymentEnabled()
        ? 'Online payment in TND is not available yet. Please contact the store to place your order.'
        : 'Online payment is currently disabled. Choose cash on delivery.',
    },
  })
})

router.get('/session/:sessionId', async (request, response, next) => {
  try {
    if (!isOnlinePaymentEnabled()) {
      response.status(503).json({ error: { code: 'ONLINE_PAYMENT_DISABLED', message: 'Online payment is currently disabled.' } })
      return
    }
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(request.params.sessionId)) {
      response.status(400).json({ error: { code: 'INVALID_SESSION', message: 'Checkout session is invalid.' } })
      return
    }
    const order = await Order.findOne({ checkoutSessionId: request.params.sessionId }).select('_id orderNumber gatewayPaymentStatus').lean()
    if (!order) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches this checkout session.' } })
      return
    }
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      response.status(503).json({ error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'Payment status is temporarily unavailable.' } })
      return
    }
    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(request.params.sessionId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(8_000),
    })
    const session = await stripeResponse.json() as { status?: string; payment_status?: string; payment_intent?: string | { id: string } | null }
    if (!stripeResponse.ok) {
      response.status(502).json({ error: { code: 'PAYMENT_STATUS_UNAVAILABLE', message: 'Payment status is temporarily unavailable.' } })
      return
    }
    if (session.payment_status === 'paid') {
      const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? ''
      await markOrderPaid(String(order._id), intentId)
    } else if (session.status === 'expired') {
      await cancelPendingOrder(String(order._id))
    }
    const latestOrder = await Order.findById(order._id).select('orderNumber gatewayPaymentStatus').lean()
    response.json({ data: { orderNumber: latestOrder?.orderNumber ?? order.orderNumber, paymentStatus: latestOrder?.gatewayPaymentStatus ?? order.gatewayPaymentStatus } })
  } catch (error) {
    next(error)
  }
})

export { cancelPendingOrder, markOrderPaid }
export const checkoutRouter = router
