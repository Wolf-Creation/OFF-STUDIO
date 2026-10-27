import { Schema, model } from 'mongoose'

const collectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', maxlength: 1000 },
    image: { type: String, default: '' },
    productIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Product' }], default: [] },
    displayOrder: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'hidden'], default: 'active', index: true },
  },
  { timestamps: true },
)

export const Collection = model('Collection', collectionSchema)
