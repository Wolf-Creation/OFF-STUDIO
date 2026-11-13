import assert from 'node:assert/strict'
import test from 'node:test'
import { analyticsEventSchema, analyticsOverviewQuerySchema, hasAnalyticsConsent, isDuplicateAnalyticsEventError } from '../src/routes/analytics.js'
import { AnalyticsEvent } from '../src/models/AnalyticsEvent.js'
import { getDatabaseVerification, normalizeMongoUri } from '../src/runtimeConfig.js'

const validPageView = {
  eventId: '4c4a4b7f-4efb-4b79-9f4b-d1028f6162ca',
  type: 'page_view',
  visitorId: '122635db-cb1d-40c4-8e2c-fccb267b0584',
  sessionId: '7c162e58-cf76-4c15-96c8-61322bf6f09f',
  page: '/shop',
}

test('analytics events accept anonymous, allowlisted page-view data', () => {
  assert.equal(analyticsEventSchema.safeParse(validPageView).success, true)
})

test('analytics events reject URL query strings and unknown personal fields', () => {
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, page: '/shop?email=person@example.com' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, email: 'person@example.com' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'search', searchTerm: 'person@example.com' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, utmCampaign: 'call-555-123-4567' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, occurredAt: '2026-01-01T00:00:00.000Z' }).success, false)
})

test('event IDs are uniquely indexed and duplicate-key errors are treated as idempotent', () => {
  const uniqueEventIdIndex = AnalyticsEvent.schema.indexes().some(([keys, options]) => keys.eventId === 1 && options.unique === true)
  assert.equal(uniqueEventIdIndex, true)
  assert.equal(isDuplicateAnalyticsEventError({ code: 11000 }), true)
  assert.equal(isDuplicateAnalyticsEventError({ code: 121 }), false)
  assert.equal(isDuplicateAnalyticsEventError(null), false)
})

test('analytics event collection requires an explicit active analytics-consent preference', () => {
  assert.equal(hasAnalyticsConsent({ preferences: { analytics: true } }), true)
  assert.equal(hasAnalyticsConsent({ preferences: { analytics: false } }), false)
  assert.equal(hasAnalyticsConsent({ preferences: {} }), false)
  assert.equal(hasAnalyticsConsent(null), false)
  assert.equal(hasAnalyticsConsent(undefined), false)
})

test('analytics date query accepts either supported day windows or valid months', () => {
  assert.equal(analyticsOverviewQuerySchema.safeParse({ days: '7' }).success, true)
  assert.equal(analyticsOverviewQuerySchema.safeParse({ month: '2026-11' }).success, true)
  assert.equal(analyticsOverviewQuerySchema.safeParse({ month: '2026-13' }).success, false)
  assert.equal(analyticsOverviewQuerySchema.safeParse({ month: '2026-11', days: '30' }).success, false)
  assert.equal(analyticsOverviewQuerySchema.safeParse({ days: '14' }).success, false)
})

test('product and CTA events require the matching identifiers', () => {
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'product_view' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'product_view', productId: '507f1f77bcf86cd799439011' }).success, true)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'cta_click' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'cta_click', ctaId: 'home:button:shop now' }).success, true)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'collection_product_click', productId: '507f1f77bcf86cd799439011' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'collection_product_click', productId: '507f1f77bcf86cd799439011', collectionId: '507f1f77bcf86cd799439012' }).success, true)
})

test('scroll-depth events accept only supported checkpoints', () => {
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'scroll_depth', scrollDepth: 50 }).success, true)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'scroll_depth', scrollDepth: 33 }).success, false)
})

test('checkout steps accept only explicit existing checkout milestones', () => {
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'checkout_step', checkoutStep: 'shipping_information_completed' }).success, true)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'checkout_step', checkoutStep: 'order_confirmed' }).success, true)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'checkout_step', checkoutStep: 'payment_failed' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'checkout_step' }).success, false)
  assert.equal(analyticsEventSchema.safeParse({ ...validPageView, type: 'page_view', checkoutStep: 'order_confirmed' }).success, false)
})

test('a consented storefront order can be recorded as a privacy-safe purchase event', () => {
  const purchase = { ...validPageView, type: 'purchase' }
  assert.equal(analyticsEventSchema.safeParse(purchase).success, true)
  assert.equal(AnalyticsEvent.schema.path('type').enumValues.includes('purchase'), true)
})

test('MongoDB staging URIs normalize usernames that contain @ before connecting', () => {
  const rawUri = 'mongodb+srv://off_studio_staging_user@admin:superSecretPassword@off-studio-staging-clus.dxcqee5.mongodb.net/off_studio_staging'
  const normalizedUri = normalizeMongoUri(rawUri)

  assert.equal(normalizedUri.includes('off_studio_staging_user%40admin'), true)
  assert.equal(normalizedUri.includes('@off-studio-staging-clus.dxcqee5.mongodb.net/off_studio_staging'), true)

  const verification = getDatabaseVerification({
    NODE_ENV: 'staging',
    MONGODB_URI: rawUri,
    ALLOW_SYNTHETIC_DATA: 'true',
  })

  assert.equal(verification.environmentName, 'staging')
  assert.equal(verification.databaseName, 'off_studio_staging')
  assert.equal(verification.clusterHost, 'off-studio-staging-clus.dxcqee5.mongodb.net')
  assert.equal(verification.syntheticDataPermission, true)
})
