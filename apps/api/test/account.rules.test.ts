import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import {
  customerAddressInputSchema,
  customerOrderFilter,
  customerPreferencesInputSchema,
  customerProfileInputSchema,
  ownedCustomerOrderFilter,
} from '../src/routes/account.js'

const validAddress = {
  label: 'Home',
  fullName: 'Alex Martin',
  phoneNumber: '+216 22 000 000',
  addressLine1: '12 Rue de Marseille',
  city: 'Tunis',
}

test('address input fills safe defaults and uppercases the country code', () => {
  const parsed = customerAddressInputSchema.parse({ ...validAddress, country: 'tn' })
  assert.equal(parsed.country, 'TN')
  assert.equal(parsed.addressLine2, '')
  assert.equal(parsed.isDefault, false)
})

test('address input rejects malformed phone and oversized fields', () => {
  assert.equal(customerAddressInputSchema.safeParse({ ...validAddress, phoneNumber: '12' }).success, false)
  assert.equal(customerAddressInputSchema.safeParse({ ...validAddress, label: 'x'.repeat(41) }).success, false)
})

test('customer profile allowlist rejects privilege and identity fields', () => {
  assert.equal(customerProfileInputSchema.safeParse({ phoneNumber: '+216 22 000 000' }).success, true)
  assert.equal(customerProfileInputSchema.safeParse({ role: 'admin' }).success, false)
  assert.equal(customerProfileInputSchema.safeParse({ email: 'new@example.com' }).success, false)
})

test('communication preferences accept only explicit independent consent flags', () => {
  assert.equal(customerPreferencesInputSchema.safeParse({ newsletter: true }).success, true)
  assert.equal(customerPreferencesInputSchema.safeParse({ newsletter: true, marketingEmails: false }).success, true)
  assert.equal(customerPreferencesInputSchema.safeParse({ newsletter: 'yes' }).success, false)
  assert.equal(customerPreferencesInputSchema.safeParse({}).success, false)
})

test('order filters map customer-facing labels to persisted fulfillment statuses', () => {
  const customerId = new mongoose.Types.ObjectId()
  const processing = customerOrderFilter(customerId, 'processing')
  const delivered = customerOrderFilter(customerId, 'delivered')
  assert.equal(String(processing.customerId), String(customerId))
  assert.deepEqual(processing.fulfillmentStatus, { $in: ['confirmation', 'processing'] })
  assert.equal(delivered.fulfillmentStatus, 'delivered')
})

test('order detail filter always scopes the lookup to the authenticated customer', () => {
  const customerId = new mongoose.Types.ObjectId()
  const orderId = new mongoose.Types.ObjectId().toString()
  assert.deepEqual(ownedCustomerOrderFilter(customerId, orderId), { _id: orderId, customerId })
})
