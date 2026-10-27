import { Schema, model } from 'mongoose'

const storeConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'store' },
    announcement: { type: String, default: 'Complimentary shipping on orders over 500 TND', maxlength: 160 },
    advertisementMessages: { type: [String], default: [] },
    heroEyebrow: { type: String, default: 'OFF — SPRING / SUMMER 25', maxlength: 100 },
    heroTitle: { type: String, default: 'ARTS DISTRICT LOS ANGELES', maxlength: 120 },
    heroSubtitle: { type: String, default: 'A modern expression of luxury.', maxlength: 240 },
    campaignEyebrow: { type: String, default: 'THE OFF UNIFORM', maxlength: 100 },
    campaignTitle: { type: String, default: 'Made for the everyday.', maxlength: 120 },
    freeShippingThreshold: { type: Number, default: 500, min: 0 },
    supportEmail: { type: String, default: '', maxlength: 254 },
    shippingSenderName: { type: String, default: '', trim: true, maxlength: 120 },
    shippingSenderPhone: { type: String, default: '', trim: true, maxlength: 32 },
    shippingSenderAddress: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true },
)

export const StoreConfig = model('StoreConfig', storeConfigSchema)
