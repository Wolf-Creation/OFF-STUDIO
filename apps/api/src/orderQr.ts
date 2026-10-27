import { createHash, createHmac } from 'node:crypto'

function qrSecret() {
  const secret = process.env.QR_TOKEN_SECRET || process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('QR_TOKEN_SECRET or a valid JWT_SECRET is required to issue order QR tokens.')
  return secret
}

export function orderQrToken(orderId: string) {
  return createHmac('sha256', qrSecret()).update(`off-order:${orderId}`).digest('base64url')
}

export function orderQrTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function orderQrTokenHashForId(orderId: string) {
  return orderQrTokenHash(orderQrToken(orderId))
}

export const orderFulfillmentTransitions: Record<string, string[]> = {
  confirmation: ['processing', 'cancelled'],
  processing: ['in_delivery', 'cancelled', 'exchange'],
  in_delivery: ['delivered', 'returned', 'cancelled', 'exchange'],
  delivered: ['returned', 'exchange'],
  returned: [],
  exchange: [],
  cancelled: [],
}

export function canChangeOrderFulfillment(current: string, next: string) {
  return current === next || orderFulfillmentTransitions[current]?.includes(next) === true
}

export function paymentStatusForFulfillment(currentPayment: string, nextFulfillment: string): 'unpaid' | 'paid' {
  if (nextFulfillment === 'delivered') return 'paid'
  if (nextFulfillment === 'cancelled' || nextFulfillment === 'returned') return 'unpaid'
  return currentPayment === 'paid' ? 'paid' : 'unpaid'
}
