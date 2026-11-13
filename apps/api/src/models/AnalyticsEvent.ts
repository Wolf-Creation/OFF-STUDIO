import { Schema, model } from 'mongoose'

const analyticsEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true, maxlength: 36 },
  isSynthetic: { type: Boolean, default: false },
  seedRunId: { type: String, default: '', trim: true, maxlength: 120 },
  seedScenario: { type: String, default: '', trim: true, maxlength: 120 },
  createdBySeed: { type: Boolean, default: false },
  type: {
    type: String,    required: true,
    enum: [
      'page_view', 'session_start', 'session_end', 'scroll_depth', 'search',
      'product_view', 'product_variant_select', 'wishlist_add', 'wishlist_remove',
      'add_to_cart', 'remove_from_cart', 'collection_view', 'collection_product_click',
      'begin_checkout', 'checkout_step', 'purchase', 'cta_impression', 'cta_click',
      'campaign_visit', 'login', 'registration',
    ],
  },
  visitorId: { type: String, required: true, maxlength: 36 },
  sessionId: { type: String, required: true, maxlength: 36 },
  checkoutStep: { type: String, enum: ['shipping_information_completed', 'order_confirmed'] },
  occurredAt: { type: Date, required: true, default: Date.now },
  page: { type: String, required: true, maxlength: 500 },
  trafficSource: { type: String, maxlength: 253 },
  referrerHost: { type: String, default: '', maxlength: 253 },
  deviceCategory: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'], default: 'unknown' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  variantSize: { type: String, maxlength: 40 },
  variantColor: { type: String, maxlength: 80 },
  collectionId: { type: Schema.Types.ObjectId, ref: 'Collection' },
  ctaId: { type: String, maxlength: 100 },
  ctaLabel: { type: String, maxlength: 120 },
  ctaLocation: { type: String, maxlength: 120 },
  searchTerm: { type: String, maxlength: 120 },
  searchResults: { type: Number, min: 0 },
  scrollDepth: { type: Number, enum: [25, 50, 75, 100] },
  utmSource: { type: String, maxlength: 120 },
  utmMedium: { type: String, maxlength: 120 },
  utmCampaign: { type: String, maxlength: 120 },
  utmContent: { type: String, maxlength: 120 },
  utmTerm: { type: String, maxlength: 120 },
}, { timestamps: true, versionKey: false })

analyticsEventSchema.index({ visitorId: 1, occurredAt: -1 })
analyticsEventSchema.index({ visitorId: 1, type: 1, occurredAt: 1 })
analyticsEventSchema.index({ sessionId: 1, occurredAt: 1 })
analyticsEventSchema.index({ type: 1, occurredAt: -1 })
analyticsEventSchema.index({ type: 1, occurredAt: -1, productId: 1, visitorId: 1 })
analyticsEventSchema.index({ productId: 1, type: 1, occurredAt: -1 })
analyticsEventSchema.index({ visitorId: 1, productId: 1, occurredAt: 1 })
analyticsEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 34_128_000 })

export const AnalyticsEvent = model('AnalyticsEvent', analyticsEventSchema)
