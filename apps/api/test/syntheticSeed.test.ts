import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSyntheticSeedPlan, deriveSyntheticOrderAttribution, syntheticCheckoutStep, syntheticDeleteGuard, syntheticDocumentMetadata, validateSyntheticSeedEnvironment } from '../src/syntheticSeed.js'
import { loadRuntimeEnv } from '../src/runtimeConfig.js'

test('synthetic seed plan matches the configured staging volumes', () => {
  const plan = buildSyntheticSeedPlan({ runId: 'plan-001' })

  assert.equal(plan.seedRunId, 'plan-001')
  assert.equal(plan.volumes.products, 100)
  assert.equal(plan.volumes.categories, 10)
  assert.equal(plan.volumes.collections, 15)
  assert.equal(plan.volumes.customers, 500)
  assert.equal(plan.volumes.orders, 1500)
  assert.equal(plan.volumes.wishlistEntries, 1000)
  assert.equal(plan.volumes.analyticsEvents, 100000)
  assert.equal(plan.volumes.ctaEvents, 10000)
  assert.equal(plan.volumes.campaigns, 20)
  assert.equal(plan.volumes.visitorSessions, 10000)
  assert.equal(plan.totalSyntheticDocumentTarget, 100000 + 10000 + 1500 + 1000 + 500 + 15 + 10 + 100 + 20 + 10000)
})

test('synthetic seed scenarios cover all required business use cases', () => {
  const plan = buildSyntheticSeedPlan({ runId: 'scenario-001' })
  const ids = plan.scenarios.map((scenario) => scenario.id)

  assert.deepEqual(ids, [
    'best_sellers',
    'high_interest_low_conversion',
    'abandoned_checkout',
    'wishlist_intelligence',
    'variant_demand',
    'campaign_performance',
    'customer_retention',
    'collection_performance',
    'cta_performance',
    'traffic_sources',
  ])
})

test('synthetic checkout-step events always use a supported milestone', () => {
  const steps = Array.from({ length: 10 }, (_, index) => syntheticCheckoutStep(index))

  assert.deepEqual(new Set(steps), new Set(['shipping_information_completed', 'order_confirmed']))
})

test('synthetic environment validation rejects production and unverified staging targets', () => {
  const rejected = validateSyntheticSeedEnvironment({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://example.prod.mongodb.net/off_studio_production',
    ALLOW_SYNTHETIC_DATA: 'true',
  })

  assert.equal(rejected.ok, false)
  assert.equal(rejected.verification.environmentName, 'production')
  assert.equal(rejected.issues.length > 0, true)
})

test('synthetic metadata and delete guard are explicit and safe for future seeding', () => {
  const metadata = syntheticDocumentMetadata('best_sellers', 'run-abc')
  assert.equal(metadata.isSynthetic, true)
  assert.equal(metadata.seedScenario, 'best_sellers')
  assert.equal(metadata.createdBySeed, true)
  assert.equal(syntheticDeleteGuard({ isSynthetic: true, seedRunId: 'run-abc' }), true)
  assert.equal(syntheticDeleteGuard({ isSynthetic: false, seedRunId: 'run-abc' }), false)
  assert.equal(syntheticDeleteGuard({ isSynthetic: true, seedRunId: '' }), false)
})

test('synthetic order attribution resolves to the nearest valid pre-order analytics event', () => {
  const placedAt = new Date('2026-10-15T12:00:00.000Z')
  const events = [
    { visitorId: 'visitor-10', sessionId: 'session-10', occurredAt: '2026-10-15T11:00:00.000Z', type: 'page_view', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'campaign-1' },
    { visitorId: 'visitor-10', sessionId: 'session-10', occurredAt: '2026-10-15T11:30:00.000Z', type: 'campaign_visit', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'campaign-1' },
    { visitorId: 'visitor-10', sessionId: 'session-10', occurredAt: '2026-10-15T11:45:00.000Z', type: 'add_to_cart' },
    { visitorId: 'visitor-20', sessionId: 'session-20', occurredAt: '2026-10-15T11:50:00.000Z', type: 'session_start', utmSource: 'newsletter', utmMedium: 'email', utmCampaign: 'campaign-2' },
  ]

  const attribution = deriveSyntheticOrderAttribution(placedAt, events)

  assert.equal(attribution?.analyticsVisitorId, 'visitor-20')
  assert.equal(attribution?.analyticsSessionId, 'session-20')
  assert.equal(attribution?.analyticsFirstTouch?.source, 'newsletter')
  assert.equal(attribution?.analyticsFirstTouch?.campaign, 'campaign-2')
  assert.equal(attribution?.analyticsLastTouch?.campaign, 'campaign-2')
})

test('synthetic order attribution ignores events exactly at the placed-at boundary and handles missing history', () => {
  const placedAt = new Date('2026-10-15T12:00:00.000Z')
  const atBoundary = deriveSyntheticOrderAttribution(placedAt, [{ visitorId: 'visitor-1', sessionId: 'session-1', occurredAt: placedAt, type: 'session_start' }])
  const missing = deriveSyntheticOrderAttribution(placedAt, [])

  assert.equal(atBoundary, null)
  assert.equal(missing, null)
})

test('staging runtime configuration keeps shared admin settings while targeting the staging database', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMongodbUri = process.env.MONGODB_URI
  const previousDbName = process.env.MONGODB_DB_NAME
  const previousAdminEmail = process.env.ADMIN_EMAIL

  process.env.NODE_ENV = 'staging'
  delete process.env.MONGODB_URI
  delete process.env.MONGODB_DB_NAME
  delete process.env.ADMIN_EMAIL

  try {
    const loaded = loadRuntimeEnv()
    assert.equal(loaded, '.env.staging')
    assert.equal(process.env.NODE_ENV, 'staging')
    assert.equal(process.env.MONGODB_DB_NAME, 'off_studio_staging')
    assert.equal(Boolean(process.env.ADMIN_EMAIL), true)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousMongodbUri === undefined) delete process.env.MONGODB_URI
    else process.env.MONGODB_URI = previousMongodbUri
    if (previousDbName === undefined) delete process.env.MONGODB_DB_NAME
    else process.env.MONGODB_DB_NAME = previousDbName
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL
    else process.env.ADMIN_EMAIL = previousAdminEmail
  }
})
