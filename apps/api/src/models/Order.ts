import { Schema, model } from 'mongoose'

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    image: { type: String, default: '' },
    sku: { type: String, required: true },
    color: { type: String, required: true },
    size: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, default: '', trim: true, maxlength: 120 },
    phoneNumber: { type: String, default: '', trim: true, maxlength: 32 },
    line1: { type: String, required: true, maxlength: 160 },
    line2: { type: String, default: '', maxlength: 160 },
    city: { type: String, required: true, maxlength: 100 },
    postalCode: { type: String, default: '', maxlength: 24 },
    country: { type: String, required: true, minlength: 2, maxlength: 2, uppercase: true },
    governorate: { type: String, default: '', maxlength: 80 },
    delegation: { type: String, default: '', maxlength: 100 },
  },
  { _id: false },
)

const orderStatusEntrySchema = new Schema(
  {
    status: { type: String, enum: ['confirmation', 'processing', 'in_delivery', 'delivered', 'returned', 'cancelled', 'exchange'], required: true },
    previousStatus: { type: String, enum: ['confirmation', 'processing', 'in_delivery', 'delivered', 'returned', 'cancelled', 'exchange'] },
    changedAt: { type: Date, required: true },
    changedBy: { type: String, default: '', trim: true, maxlength: 254 },
  },
  { _id: false },
)

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    qrTokenHash: { type: String, unique: true, sparse: true, select: false },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, required: true, lowercase: true, trim: true },
    items: { type: [orderItemSchema], default: [] },
    orderNote: { type: String, default: '', trim: true, maxlength: 500 },
    shippingAddress: { type: shippingAddressSchema },
    subtotal: { type: Number, min: 0 },
    shippingAmount: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'TND', uppercase: true },
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    gatewayPaymentStatus: { type: String, enum: ['pending', 'paid', 'failed'] },
    paymentMethod: { type: String, enum: ['stripe', 'cash_on_delivery'], default: 'stripe' },
    fulfillmentStatus: { type: String, enum: ['confirmation', 'processing', 'in_delivery', 'delivered', 'returned', 'cancelled', 'exchange'], default: 'confirmation', index: true },
    statusHistory: { type: [orderStatusEntrySchema], default: [] },
    trackingNumber: { type: String, default: '', trim: true, maxlength: 100 },
    source: { type: String, enum: ['online', 'manual'], default: 'online', index: true },
    checkoutSessionId: { type: String, sparse: true, unique: true },
    stripePaymentIntentId: { type: String, default: '' },
    placedAt: { type: Date, required: true },
  },
  { timestamps: true },
)

export const Order = model('Order', orderSchema)
