import { Schema, model } from 'mongoose'

const contentRevisionSchema = new Schema({
  resourceType: { type: String, required: true, enum: ['page', 'homepage', 'navigation'] },
  resourceId: { type: String, required: true },
  version: { type: Number, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
  createdBy: { type: String, default: '' },
  status: { type: String, required: true, enum: ['draft', 'published', 'restored'] },
  publishedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } })

contentRevisionSchema.index({ resourceType: 1, resourceId: 1, version: -1 })
export const ContentRevision = model('ContentRevision', contentRevisionSchema)
