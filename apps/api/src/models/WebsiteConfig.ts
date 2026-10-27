import { Schema, model } from 'mongoose'

const websiteConfigSchema = new Schema({
  key: { type: String, default: 'website', unique: true },
  draft: { type: Schema.Types.Mixed, default: {} },
  published: { type: Schema.Types.Mixed, default: {} },
  draftVersion: { type: Number, default: 1 },
  publishedVersion: { type: Number, default: 0 },
  publishedAt: { type: Date, default: null },
  updatedBy: { type: String, default: '' },
}, { timestamps: true })

export const WebsiteConfig = model('WebsiteConfig', websiteConfigSchema)
