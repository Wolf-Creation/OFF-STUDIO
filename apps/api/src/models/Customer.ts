import { Schema, model } from 'mongoose'

const customerAddressSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 32 },
    addressLine1: { type: String, required: true, trim: true, maxlength: 160 },
    addressLine2: { type: String, default: '', trim: true, maxlength: 160 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, default: '', trim: true, maxlength: 24 },
    country: { type: String, required: true, minlength: 2, maxlength: 2, uppercase: true, default: 'TN' },
    governorate: { type: String, default: '', trim: true, maxlength: 80 },
    delegation: { type: String, default: '', trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
)

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    clerkId: { type: String, unique: true, sparse: true, trim: true },
    orderCount: { type: Number, default: 0, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },
    phoneNumber: { type: String, default: '', trim: true, maxlength: 32 },
    dateOfBirth: { type: Date, default: null },
    addresses: { type: [customerAddressSchema], default: [] },
    wishlistProductIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    communicationPreferences: {
      newsletter: { type: Boolean, default: false },
      marketingEmails: { type: Boolean, default: false },
    },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  },
  { timestamps: true },
)

export const Customer = model('Customer', customerSchema)
