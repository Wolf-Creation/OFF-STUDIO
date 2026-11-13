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

export function paymentStatusForFulfillment(currentPayment: string, _nextFulfillment: string): 'unpaid' | 'paid' {
  return currentPayment === 'paid' ? 'paid' : 'unpaid'
}

export function canConfirmCashOnDeliveryPayment(paymentMethod: string, fulfillmentStatus: string, paymentStatus: string) {
  return paymentMethod === 'cash_on_delivery' && fulfillmentStatus === 'delivered' && paymentStatus === 'unpaid'
}

export function canReverseSyntheticCodPayment(order: {
  orderNumber: string
  isSynthetic: boolean
  createdBySeed: boolean
  paymentMethod: string
  fulfillmentStatus: string
  paymentStatus: string
}) {
  return order.orderNumber.startsWith('OFF-SYN-')
    && order.isSynthetic
    && order.createdBySeed
    && order.paymentMethod === 'cash_on_delivery'
    && order.fulfillmentStatus === 'delivered'
    && order.paymentStatus === 'paid'
}
