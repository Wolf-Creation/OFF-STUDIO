import { Schema, model } from 'mongoose'

const sectionSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, required: true, enum: ['hero', 'featured-products', 'new-arrivals', 'collection', 'categories', 'editorial', 'brand', 'featured-release', 'newsletter', 'footer-announcement', 'rich-text'] },
  title: { type: String, default: '', maxlength: 160 },
  enabled: { type: Boolean, default: true },
  order: { type: Number, required: true, min: 0 },
  settings: { type: Schema.Types.Mixed, default: {} },
}, { _id: false })

const websitePageSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  pageType: { type: String, required: true, enum: ['home', 'listing', 'template', 'content', 'system'] },
  protected: { type: Boolean, default: false },
  draftSections: { type: [sectionSchema], default: [] },
  publishedSections: { type: [sectionSchema], default: [] },
  draftVersion: { type: Number, default: 1 },
  publishedVersion: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published', 'scheduled', 'archived'], default: 'draft', index: true },
  scheduledAt: { type: Date, default: null },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' },
  publishedAt: { type: Date, default: null },
}, { timestamps: true })

export const WebsitePage = model('WebsitePage', websitePageSchema)
