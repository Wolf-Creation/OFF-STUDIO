import { Schema, model } from 'mongoose'

const mediaAssetSchema = new Schema({
  url: { type: String, required: true, maxlength: 2048 },
  storageKey: { type: String, required: true, unique: true, maxlength: 180 },
  fileName: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] },
  fileSize: { type: Number, required: true, min: 1 },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  altText: { type: String, default: '', maxlength: 300 },
  usageReferences: { type: [String], default: [] },
  uploadedBy: { type: String, default: '' },
}, { timestamps: true })

export const MediaAsset = model('MediaAsset', mediaAssetSchema)
