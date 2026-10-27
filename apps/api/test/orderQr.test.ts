import assert from 'node:assert/strict'
import test from 'node:test'
import { canChangeOrderFulfillment, orderQrToken, orderQrTokenHash, orderQrTokenHashForId, paymentStatusForFulfillment } from '../src/orderQr.js'

process.env.QR_TOKEN_SECRET = 'off-test-qr-token-secret-at-least-32-chars'

test('order QR token is opaque, stable per order, and stores only a one-way hash', () => {
  const first = orderQrToken('507f1f77bcf86cd799439011')
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(orderQrToken('507f1f77bcf86cd799439011'), first)
  assert.notEqual(orderQrToken('507f1f77bcf86cd799439012'), first)
  assert.equal(orderQrTokenHashForId('507f1f77bcf86cd799439011'), orderQrTokenHash(first))
  assert.notEqual(orderQrTokenHash(first), first)
})

test('fulfillment only advances through the configured order workflow', () => {
  assert.equal(canChangeOrderFulfillment('confirmation', 'processing'), true)
  assert.equal(canChangeOrderFulfillment('processing', 'in_delivery'), true)
  assert.equal(canChangeOrderFulfillment('in_delivery', 'delivered'), true)
  assert.equal(canChangeOrderFulfillment('delivered', 'returned'), true)
  assert.equal(canChangeOrderFulfillment('delivered', 'exchange'), true)
  assert.equal(canChangeOrderFulfillment('exchange', 'processing'), false)
  assert.equal(canChangeOrderFulfillment('confirmation', 'delivered'), false)
  assert.equal(canChangeOrderFulfillment('cancelled', 'processing'), false)
})

test('payment becomes paid on delivery and unpaid on cancellation or return', () => {
  assert.equal(paymentStatusForFulfillment('unpaid', 'delivered'), 'paid')
  assert.equal(paymentStatusForFulfillment('paid', 'returned'), 'unpaid')
  assert.equal(paymentStatusForFulfillment('paid', 'cancelled'), 'unpaid')
  assert.equal(paymentStatusForFulfillment('unpaid', 'in_delivery'), 'unpaid')
})
