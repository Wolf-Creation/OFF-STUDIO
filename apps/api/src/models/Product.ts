import { Schema, model } from 'mongoose'

const productImageSchema = new Schema(
  { url: { type: String, required: true }, alt: { type: String, default: '' }, order: { type: Number, default: 0 } },
  { _id: false },
)

const variantSchema = new Schema(
  {
    sku: { type: String, required: true, uppercase: true, trim: true },
    color: { type: String, required: true, trim: true },
    size: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    image: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { _id: false },
)

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', maxlength: 5000 },
    shortDescription: { type: String, default: '', maxlength: 500 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    images: { type: [productImageSchema], default: [] },
    variants: {
      type: [variantSchema],
      validate: {
        validator(variants: { sku: string }[]) {
          return new Set(variants.map((variant) => variant.sku.toUpperCase())).size === variants.length
        },
        message: 'Variant SKUs must be unique within a product.',
      },
    },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'draft', index: true },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true },
)

productSchema.index({ name: 'text', shortDescription: 'text', description: 'text' })

export const Product = model('Product', productSchema)
