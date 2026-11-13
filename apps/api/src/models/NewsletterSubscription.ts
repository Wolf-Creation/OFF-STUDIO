import { Schema, model } from 'mongoose'

const newsletterSubscriptionSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  consentAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false })

export const NewsletterSubscription = model('NewsletterSubscription', newsletterSubscriptionSchema)
