import { Schema, model } from 'mongoose'

const cookieConsentLogSchema = new Schema({
  visitorId: { type: String, required: true, maxlength: 36 },
  isSynthetic: { type: Boolean, default: false },
  seedRunId: { type: String, default: '', trim: true, maxlength: 120 },
  seedScenario: { type: String, default: '', trim: true, maxlength: 120 },
  createdBySeed: { type: Boolean, default: false },
  preferences: {
    necessary: { type: Boolean, required: true, default: true },
    functional: { type: Boolean, required: true },
    analytics: { type: Boolean, required: true },
    marketing: { type: Boolean, required: true },
  },
  action: { type: String, enum: ['accept_all', 'reject_all', 'custom'], required: true },
  policyVersion: { type: String, required: true, maxlength: 40 },
}, { timestamps: true, versionKey: false })

cookieConsentLogSchema.index({ visitorId: 1, createdAt: -1 })
cookieConsentLogSchema.index({ createdAt: -1 })

export const CookieConsentLog = model('CookieConsentLog', cookieConsentLogSchema)
