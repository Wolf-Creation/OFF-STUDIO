import assert from 'node:assert/strict'
import test from 'node:test'
import { canChangeOrderFulfillment, canConfirmCashOnDeliveryPayment, canReverseSyntheticCodPayment, orderQrToken, orderQrTokenHash, orderQrTokenHashForId, paymentStatusForFulfillment } from '../src/orderQr.js'
import { isConfirmedStripePayment } from '../src/routes/payments.js'

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

test('fulfillment transitions never infer or revoke payment status', () => {
  assert.equal(paymentStatusForFulfillment('unpaid', 'delivered'), 'unpaid')
  assert.equal(paymentStatusForFulfillment('paid', 'returned'), 'paid')
  assert.equal(paymentStatusForFulfillment('paid', 'cancelled'), 'paid')
  assert.equal(paymentStatusForFulfillment('unpaid', 'in_delivery'), 'unpaid')
})

test('cash-on-delivery payment can be confirmed only after delivery while still unpaid', () => {
  assert.equal(canConfirmCashOnDeliveryPayment('cash_on_delivery', 'delivered', 'unpaid'), true)
  assert.equal(canConfirmCashOnDeliveryPayment('cash_on_delivery', 'in_delivery', 'unpaid'), false)
  assert.equal(canConfirmCashOnDeliveryPayment('stripe', 'delivered', 'unpaid'), false)
  assert.equal(canConfirmCashOnDeliveryPayment('cash_on_delivery', 'delivered', 'paid'), false)
})

test('only delivered, paid, seeded synthetic COD orders can have payment confirmation reversed', () => {
  const eligible = {
    orderNumber: 'OFF-SYN-802067',
    isSynthetic: true,
    createdBySeed: true,
    paymentMethod: 'cash_on_delivery',
    fulfillmentStatus: 'delivered',
    paymentStatus: 'paid',
  }
  assert.equal(canReverseSyntheticCodPayment(eligible), true)
  assert.equal(canReverseSyntheticCodPayment({ ...eligible, orderNumber: 'OFF-REAL-802067' }), false)
  assert.equal(canReverseSyntheticCodPayment({ ...eligible, isSynthetic: false }), false)
  assert.equal(canReverseSyntheticCodPayment({ ...eligible, createdBySeed: false }), false)
  assert.equal(canReverseSyntheticCodPayment({ ...eligible, paymentMethod: 'stripe' }), false)
  assert.equal(canReverseSyntheticCodPayment({ ...eligible, fulfillmentStatus: 'processing' }), false)
  assert.equal(canReverseSyntheticCodPayment({ ...eligible, paymentStatus: 'unpaid' }), false)
})

test('only provider-confirmed Stripe checkout events mark an order paid', () => {
  assert.equal(isConfirmedStripePayment('checkout.session.completed', 'paid'), true)
  assert.equal(isConfirmedStripePayment('checkout.session.async_payment_succeeded', 'paid'), true)
  assert.equal(isConfirmedStripePayment('checkout.session.completed', 'unpaid'), false)
  assert.equal(isConfirmedStripePayment('checkout.session.async_payment_failed', 'unpaid'), false)
})
