import { Schema, model } from 'mongoose'

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', maxlength: 1000 },
    image: { type: String, default: '' },
    isSynthetic: { type: Boolean, default: false },
    seedRunId: { type: String, default: '', trim: true, maxlength: 120 },
    seedScenario: { type: String, default: '', trim: true, maxlength: 120 },
    createdBySeed: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'hidden'], default: 'active', index: true },
  },
  { timestamps: true },
)

export const Category = model('Category', categorySchema)
