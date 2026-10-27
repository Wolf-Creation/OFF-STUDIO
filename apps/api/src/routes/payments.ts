import { createHmac, timingSafeEqual } from 'node:crypto'
import express, { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { cancelPendingOrder, markOrderPaid } from './checkout.js'

const router = Router()
const webhookLimit = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false })
const stripeSessionSchema = z.object({
  id: z.string(),
  payment_status: z.string().optional(),
  payment_intent: z.union([z.string(), z.object({ id: z.string() }), z.null()]).optional(),
  metadata: z.object({ orderId: z.string().optional() }).optional(),
})
const stripeEventSchema = z.object({
  type: z.string().min(1),
  data: z.object({ object: z.unknown() }),
})

function validStripeSignature(payload: Buffer, header: string, secret: string) {
  const parts = header.split(',').map(part => part.split('=', 2))
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload.toString('utf8')}`).digest()
  return signatures.some(value => {
    if (!/^[a-f0-9]{64}$/i.test(value)) return false
    const actual = Buffer.from(value, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

router.post('/webhook', webhookLimit, express.raw({ type: 'application/json', limit: '1mb' }), async (request, response) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.get('stripe-signature')
  if (!secret) {
    response.status(503).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Payment webhook is not configured.' } })
    return
  }
  if (!Buffer.isBuffer(request.body) || !signature || !validStripeSignature(request.body, signature, secret)) {
    response.status(400).json({ error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Payment webhook signature is invalid.' } })
    return
  }
  let rawEvent: unknown
  try {
    rawEvent = JSON.parse(request.body.toString('utf8')) as unknown
  } catch {
    response.status(400).json({ error: { code: 'INVALID_WEBHOOK_BODY', message: 'Payment webhook payload is invalid.' } })
    return
  }
  const parsedEvent = stripeEventSchema.safeParse(rawEvent)
  if (!parsedEvent.success) {
    response.status(400).json({ error: { code: 'INVALID_WEBHOOK_EVENT', message: 'Payment webhook event is invalid.' } })
    return
  }
  const event = parsedEvent.data
  const parsedSession = stripeSessionSchema.safeParse(event.data?.object)
  if (!parsedSession.success) {
    response.status(400).json({ error: { code: 'INVALID_WEBHOOK_EVENT', message: 'Payment webhook event is invalid.' } })
    return
  }
  const session = parsedSession.data
  const orderId = session.metadata?.orderId
  if (!orderId) {
    response.status(200).json({ received: true })
    return
  }
  try {
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid') {
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? ''
      await markOrderPaid(orderId, paymentIntentId)
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await cancelPendingOrder(orderId)
    }
    response.status(200).json({ received: true })
  } catch (error) {
    console.error('Stripe webhook processing failed:', error instanceof Error ? error.name : 'Unknown error')
    response.status(500).json({ error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Payment event could not be applied.' } })
  }
})

export const paymentsRouter = router
