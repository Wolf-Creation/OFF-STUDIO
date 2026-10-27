import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { generateProductGallery, ImageGenerationError } from '../imageGeneration.js'
import { z } from 'zod'
import mongoose from 'mongoose'
import type { ManualOrderRequest } from '@off/shared-types'
import { TUNISIA_LOCATIONS } from '@off/shared-types/tunisia-locations'
import { authenticateAdmin } from '../auth.js'
import { Category } from '../models/Category.js'
import { Collection } from '../models/Collection.js'
import { Customer } from '../models/Customer.js'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { StoreConfig } from '../models/StoreConfig.js'
import { MediaAsset } from '../models/MediaAsset.js'
import { canChangeOrderFulfillment, orderQrToken, orderQrTokenHash, orderQrTokenHashForId, paymentStatusForFulfillment } from '../orderQr.js'

const router = Router()
const imageGenerationLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false })
const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(''),
  image: z.union([z.string().url().max(2048), z.literal('')]).default(''),
  displayOrder: z.number().int().min(0).max(100_000).default(0),
  status: z.enum(['active', 'hidden']).default('active'),
})
const productImageUrlSchema = z.union([
  z.string().url().max(2048),
  z.string().regex(/^\/media\/[a-zA-Z0-9._-]+$/).max(2048),
])
const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80).default('Ready-to-Wear'),
  price: z.number().finite().min(0).default(990),
  shortDescription: z.string().trim().max(500).default(''),
  description: z.string().trim().max(5000).default(''),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  image: z.union([productImageUrlSchema, z.literal('')]).default(''),
  images: z.array(z.object({ url: productImageUrlSchema, alt: z.string().trim().max(300).default(''), order: z.number().int().min(0).max(100) })).max(24).optional(),
  featured: z.boolean().default(false),
  variants: z.array(z.object({
    sku: z.string().trim().min(1).max(80),
    color: z.string().trim().min(1).max(60),
    size: z.string().trim().min(1).max(30),
    price: z.number().finite().min(0),
    stock: z.number().int().min(0).max(100_000),
    image: z.union([z.string().url().max(2048), z.literal('')]).default(''),
    active: z.boolean(),
  })).min(1).max(100).optional().refine(variants => !variants || new Set(variants.map(variant => variant.sku.toUpperCase())).size === variants.length),
})
const collectionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).default(''),
  image: z.union([z.string().url().max(2048), z.literal('')]).default(''),
  productIds: z.array(z.string().refine(mongoose.isValidObjectId)).max(500).default([]).refine(ids => new Set(ids).size === ids.length),
  displayOrder: z.number().int().min(0).max(100_000).default(0),
  status: z.enum(['active', 'hidden']).default('active'),
})
const inventorySchema = z.object({
  variants: z.array(z.object({ sku: z.string().trim().min(1).max(80), stock: z.number().int().min(0).max(100_000) })).min(1).max(100),
}).refine(data => new Set(data.variants.map(variant => variant.sku)).size === data.variants.length)
const fulfillmentStatuses = ['confirmation', 'processing', 'in_delivery', 'delivered', 'returned', 'cancelled', 'exchange'] as const
const orderStatusSchema = z.object({ fulfillmentStatus: z.enum(fulfillmentStatuses) })
const manualOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, z.string().trim().email().max(254).optional()),
  }),
  shippingAddress: z.object({
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(160).default(''),
    city: z.string().trim().min(2).max(100),
    postalCode: z.string().max(24).default(''),
    country: z.literal('TN'),
    governorate: z.string().min(1),
    delegation: z.string().min(1),
  }).superRefine((address, context) => {
    const delegations = TUNISIA_LOCATIONS[address.governorate]
    if (!delegations) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['governorate'], message: 'Choose a valid Tunisian governorate.' })
    } else if (!delegations.includes(address.delegation)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['delegation'], message: 'Choose a delegation belonging to the selected governorate.' })
    }
  }),
  items: z.array(z.object({
    productId: z.string().refine(mongoose.isValidObjectId),
    sku: z.string().trim().min(1).max(80),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(50),
  orderNote: z.string().trim().max(500).optional().default(''),
})
class ManualOrderError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}
const contentSchema = z.object({
  announcement: z.string().trim().min(1).max(160),
  heroEyebrow: z.string().trim().min(1).max(100),
  heroTitle: z.string().trim().min(1).max(120),
  heroSubtitle: z.string().trim().min(1).max(240),
  campaignEyebrow: z.string().trim().min(1).max(100),
  campaignTitle: z.string().trim().min(1).max(120),
})
const settingsSchema = z.object({
  freeShippingThreshold: z.number().finite().min(0).max(100_000),
  supportEmail: z.union([z.string().trim().email().max(254), z.literal('')]),
  advertisementMessages: z.array(z.string().trim().min(1).max(160)).max(10).optional(),
  shippingSenderName: z.string().trim().max(120).default(''),
  shippingSenderPhone: z.string().trim().max(32).default(''),
  shippingSenderAddress: z.string().trim().max(300).default(''),
})
const slugify = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

router.use(authenticateAdmin)

router.get('/categories', async (_request, response, next) => {
  try {
    const categories = await Category.aggregate([
      { $lookup: { from: 'products', localField: '_id', foreignField: 'categoryId', as: 'products' } },
      { $addFields: { productCount: { $size: '$products' } } },
      { $project: { products: 0 } },
      { $sort: { displayOrder: 1, name: 1 } },
    ])
    response.json({ data: categories })
  } catch (error) {
    next(error)
  }
})

router.get('/products', async (_request, response, next) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).limit(100).lean()
    response.json({ data: products })
  } catch (error) {
    next(error)
  }
})

router.patch('/products/:id', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_PRODUCT_ID', message: 'Product identifier is invalid.' } })
      return
    }
    const parsed = productSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_PRODUCT', message: 'Product details are invalid.', details: parsed.error.flatten() } })
      return
    }
    const category = await Category.findOne({ name: parsed.data.category, status: 'active' })
    if (!category) {
      response.status(400).json({ error: { code: 'CATEGORY_NOT_FOUND', message: 'Choose an existing active category.' } })
      return
    }
    const product = await Product.findById(request.params.id)
    if (!product) {
      response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } })
      return
    }
    const previousName = product.name
    const previousPrice = product.price
    product.name = parsed.data.name
    product.slug = previousName === parsed.data.name ? product.slug : `${slugify(parsed.data.name)}-${Date.now().toString(36)}`
    product.categoryId = category._id
    product.category = category.name
    product.price = parsed.data.price
    product.shortDescription = parsed.data.shortDescription
    product.description = parsed.data.description
    product.status = parsed.data.status
    product.featured = parsed.data.featured
    if (parsed.data.images !== undefined) {
      product.set('images', parsed.data.images)
    } else if (parsed.data.image) {
      product.set('images', [{ url: parsed.data.image, alt: parsed.data.name, order: 0 }])
    } else {
      product.set('images', [])
    }
    if (parsed.data.variants) {
      const variants = parsed.data.price === previousPrice
        ? parsed.data.variants
        : parsed.data.variants.map(variant => ({ ...variant, price: parsed.data.price }))
      product.set('variants', variants)
    } else if (parsed.data.price !== previousPrice) {
      product.variants.forEach(variant => { variant.price = parsed.data.price })
    }
    await product.save()
    response.json({ data: product })
  } catch (error) {
    next(error)
  }
})

router.delete('/products/:id', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_PRODUCT_ID', message: 'Product identifier is invalid.' } })
      return
    }
    const product = await Product.findById(request.params.id).select('_id').lean()
    if (!product) {
      response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } })
      return
    }
    const pendingOrder = await Order.exists({ paymentStatus: 'unpaid', fulfillmentStatus: { $in: ['confirmation', 'processing', 'in_delivery'] }, 'items.productId': product._id })
    if (pendingOrder) {
      response.status(409).json({ error: { code: 'PRODUCT_HAS_PENDING_ORDER', message: 'This product is in a pending checkout and cannot be deleted yet.' } })
      return
    }
    await Promise.all([
      Product.deleteOne({ _id: product._id }),
      Collection.updateMany({ productIds: product._id }, { $pull: { productIds: product._id } }),
    ])
    response.json({ data: { deleted: true } })
  } catch (error) {
    next(error)
  }
})

router.get('/inventory', async (_request, response, next) => {
  try {
    const products = await Product.find().select('name slug category status variants').sort({ name: 1 }).lean()
    response.json({ data: products })
  } catch (error) {
    next(error)
  }
})

router.patch('/products/:id/inventory', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_PRODUCT_ID', message: 'Product identifier is invalid.' } })
      return
    }
    const parsed = inventorySchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_INVENTORY', message: 'Inventory quantities must be non-negative whole numbers.' } })
      return
    }
    const product = await Product.findById(request.params.id)
    if (!product) {
      response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } })
      return
    }
    const variantMap = new Map(product.variants.map(variant => [variant.sku, variant]))
    if (parsed.data.variants.some(variant => !variantMap.has(variant.sku))) {
      response.status(400).json({ error: { code: 'VARIANT_NOT_FOUND', message: 'One or more product variants no longer exist.' } })
      return
    }
    parsed.data.variants.forEach(({ sku, stock }) => { variantMap.get(sku)!.stock = stock })
    await product.save()
    response.json({ data: product })
  } catch (error) {
    next(error)
  }
})

router.post('/orders', async (request, response, next) => {
  const parsed = manualOrderSchema.safeParse(request.body)
  if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_MANUAL_ORDER', message: 'Check the customer, shipping address, and order items.' } })
    return
  }
  const input: ManualOrderRequest = parsed.data
  const requestedItems = new Map<string, { productId: string; sku: string; quantity: number }>()
  for (const item of input.items) {
    const key = `${item.productId}:${item.sku.toUpperCase()}`
    const current = requestedItems.get(key)
    const quantity = (current?.quantity ?? 0) + item.quantity
    if (quantity > 100) {
      response.status(400).json({ error: { code: 'INVALID_QUANTITY', message: 'The combined quantity for a variant cannot exceed 100.' } })
      return
    }
    requestedItems.set(key, { ...item, quantity })
  }

  const reserved: { productId: mongoose.Types.ObjectId; sku: string; quantity: number }[] = []
  let orderId: mongoose.Types.ObjectId | undefined
  let customerId: mongoose.Types.ObjectId | undefined
  try {
    const items = []
    for (const item of requestedItems.values()) {
      const productId = new mongoose.Types.ObjectId(item.productId)
      const sku = item.sku.toUpperCase()
      const product = await Product.findOne({
        _id: productId,
        status: 'active',
        variants: { $elemMatch: { sku, active: true, stock: { $gte: item.quantity } } },
      }).lean()
      const variant = product?.variants.find(entry => entry.sku === sku && entry.active && entry.stock >= item.quantity)
      if (!product || !variant) {
        throw new ManualOrderError(409, 'ITEM_UNAVAILABLE', 'A selected product variant is inactive or does not have enough stock.')
      }
      const reservation = await Product.updateOne(
        { _id: productId, status: 'active', variants: { $elemMatch: { sku, active: true, stock: { $gte: item.quantity } } } },
        { $inc: { 'variants.$.stock': -item.quantity } },
      )
      if (reservation.modifiedCount !== 1) {
        throw new ManualOrderError(409, 'ITEM_UNAVAILABLE', 'Stock changed while creating the order. Reload the products and try again.')
      }
      reserved.push({ productId, sku, quantity: item.quantity })
      items.push({
        productId,
        name: product.name,
        image: product.images?.[0]?.url ?? '',
        sku,
        color: variant.color,
        size: variant.size,
        unitPrice: Math.round(variant.price * 100) / 100,
        quantity: item.quantity,
      })
    }

    const normalizedEmail = input.customer.email?.toLowerCase()
    const customer = normalizedEmail
      ? await Customer.findOneAndUpdate(
        { email: normalizedEmail },
        { $set: { name: input.customer.name, status: 'active' }, $setOnInsert: { orderCount: 0, totalSpent: 0 } },
        { upsert: true, new: true, runValidators: true },
      )
      : await Customer.create({
        name: input.customer.name,
        email: `manual-${randomBytes(12).toString('hex')}@no-email.invalid`,
        status: 'active',
      })
    customerId = customer._id
    const total = items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity, 0) / 100
    const suffix = randomBytes(3).toString('hex').toUpperCase()
    const placedAt = new Date()
    const initialFulfillmentStatus = 'confirmation' as const
    const createdOrderId = new mongoose.Types.ObjectId()
    const order = await Order.create({
      _id: createdOrderId,
      qrTokenHash: orderQrTokenHashForId(String(createdOrderId)),
      orderNumber: `OFF${Date.now()}${suffix}`,
      customerId: customer._id,
      customerName: input.customer.name,
      customerEmail: normalizedEmail ?? customer.email,
      items,
      orderNote: input.orderNote ?? '',
      shippingAddress: { ...input.shippingAddress, fullName: input.customer.name },
      subtotal: total,
      total,
      currency: 'TND',
      paymentStatus: 'unpaid',
      fulfillmentStatus: initialFulfillmentStatus,
      statusHistory: [{ status: initialFulfillmentStatus, changedAt: placedAt, changedBy: request.adminEmail ?? '' }],
      source: 'manual',
      placedAt,
    })
    orderId = order._id
    response.status(201).json({ data: order })
  } catch (error) {
    try {
      if (orderId) await Order.deleteOne({ _id: orderId })
      await Promise.all(reserved.map(({ productId, sku, quantity }) =>
        Product.updateOne({ _id: productId, 'variants.sku': sku }, { $inc: { 'variants.$.stock': quantity } }),
      ))
    } catch (rollbackError) {
      console.error('Unable to fully roll back manually created order:', rollbackError instanceof Error ? rollbackError.name : 'Unknown error')
    }
    if (error instanceof ManualOrderError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    next(error)
  }
})

router.patch('/orders/:id/payment', (_request, response) => {
  response.status(409).json({ error: { code: 'PAYMENT_FOLLOWS_DELIVERY', message: 'Payment is marked paid when fulfillment is delivered. Cancelled and returned orders remain unpaid.' } })
})

router.get('/orders/qr/:token', async (request, response, next) => {
  try {
    const token = request.params.token
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      response.status(404).json({ error: { code: 'QR_ORDER_NOT_FOUND', message: 'This QR code is invalid or no longer available.' } })
      return
    }
    const order = await Order.findOne({ qrTokenHash: orderQrTokenHash(token) }).select('-qrTokenHash').lean()
    if (!order) {
      response.status(404).json({ error: { code: 'QR_ORDER_NOT_FOUND', message: 'This QR code is invalid or no longer available.' } })
      return
    }
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: { order, qrToken: token } })
  } catch (error) { next(error) }
})

router.get('/orders/lookup/:orderNumber', async (request, response, next) => {
  try {
    const orderNumber = String(request.params.orderNumber ?? '').trim().toUpperCase()
    if (!/^OFF[A-Z0-9-]{4,48}$/.test(orderNumber)) {
      response.status(400).json({ error: { code: 'INVALID_ORDER_NUMBER', message: 'Enter a valid OFF order number.' } })
      return
    }
    const order = await Order.findOne({ orderNumber }).select('-qrTokenHash').lean()
    if (!order) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches this reference.' } })
      return
    }
    response.setHeader('Cache-Control', 'private, no-store')
    const qrToken = orderQrToken(String(order._id))
    await Order.updateOne({ _id: order._id, qrTokenHash: { $ne: orderQrTokenHash(qrToken) } }, { $set: { qrTokenHash: orderQrTokenHash(qrToken) } })
    response.json({ data: { order, qrToken } })
  } catch (error) { next(error) }
})

router.patch('/orders/qr/:token/status', async (request, response, next) => {
  try {
    const token = request.params.token
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      response.status(404).json({ error: { code: 'QR_ORDER_NOT_FOUND', message: 'This QR code is invalid or no longer available.' } })
      return
    }
    const parsed = z.object({ fulfillmentStatus: z.enum(fulfillmentStatuses), expectedStatus: z.enum(fulfillmentStatuses) }).safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_ORDER_STATUS', message: 'Choose a valid order status.' } })
      return
    }
    const { fulfillmentStatus, expectedStatus } = parsed.data
    if (!canChangeOrderFulfillment(expectedStatus, fulfillmentStatus) || expectedStatus === fulfillmentStatus) {
      response.status(409).json({ error: { code: 'INVALID_STATUS_TRANSITION', message: `The order cannot move from ${expectedStatus} to ${fulfillmentStatus}.` } })
      return
    }
    const current = await Order.findOne({ qrTokenHash: orderQrTokenHash(token), fulfillmentStatus: expectedStatus }).select('paymentStatus customerId total').lean()
    if (!current) {
      response.status(409).json({ error: { code: 'ORDER_STATUS_CHANGED', message: 'The order status changed or the QR code is invalid. Rescan the order and try again.' } })
      return
    }
    const changedAt = new Date()
    const order = await Order.findOneAndUpdate(
      { qrTokenHash: orderQrTokenHash(token), fulfillmentStatus: expectedStatus },
      { $set: { fulfillmentStatus, paymentStatus: paymentStatusForFulfillment(current.paymentStatus, fulfillmentStatus) }, $push: { statusHistory: { status: fulfillmentStatus, previousStatus: expectedStatus, changedAt, changedBy: request.adminEmail ?? '' } } },
      { new: true, runValidators: true },
    ).select('-qrTokenHash').lean()
    if (!order) {
      response.status(409).json({ error: { code: 'ORDER_STATUS_CHANGED', message: 'The order status changed or the QR code is invalid. Rescan the order and try again.' } })
      return
    }
    if (fulfillmentStatus === 'delivered' && current.paymentStatus !== 'paid') await Customer.updateOne({ _id: current.customerId }, { $inc: { orderCount: 1, totalSpent: current.total } })
    if (['cancelled', 'returned'].includes(fulfillmentStatus) && current.paymentStatus === 'paid') await Customer.updateOne({ _id: current.customerId }, { $inc: { orderCount: -1, totalSpent: -current.total } })
    if (['cancelled', 'returned'].includes(fulfillmentStatus)) await Promise.all(order.items.map(item => Product.updateOne({ _id: item.productId, 'variants.sku': item.sku }, { $inc: { 'variants.$.stock': item.quantity } })))
    response.json({ data: order })
  } catch (error) { next(error) }
})

router.get('/orders/:id/shipping-label', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_ORDER_ID', message: 'Order identifier is invalid.' } })
      return
    }
    const [order, config] = await Promise.all([
      Order.findById(request.params.id).select('-qrTokenHash').lean(),
      StoreConfig.findOne({ key: 'store' }).select('shippingSenderName shippingSenderPhone shippingSenderAddress').lean(),
    ])
    if (!order) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } })
      return
    }
    const qrToken = orderQrToken(String(order._id))
    const qrTokenHash = orderQrTokenHash(qrToken)
    await Order.updateOne({ _id: order._id, qrTokenHash: { $ne: qrTokenHash } }, { $set: { qrTokenHash } })
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: { order, qrToken, sender: { name: config?.shippingSenderName ?? '', phone: config?.shippingSenderPhone ?? '', address: config?.shippingSenderAddress ?? '' } } })
  } catch (error) {
    next(error)
  }
})

router.get('/orders', async (_request, response, next) => {
  try {
    const orders = await Order.find().select('-qrTokenHash').sort({ placedAt: -1 }).limit(100).lean()
    response.json({ data: orders })
  } catch (error) {
    next(error)
  }
})

router.post('/orders/:id/relaunch', async (request, response, next) => {
  const reserved: { productId: mongoose.Types.ObjectId; sku: string; quantity: number }[] = []
  const releaseReservations = async () => Promise.all(reserved.map(item => Product.updateOne(
    { _id: item.productId, 'variants.sku': item.sku },
    { $inc: { 'variants.$.stock': item.quantity } },
  )))
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_ORDER_ID', message: 'Order identifier is invalid.' } })
      return
    }
    const current = await Order.findById(request.params.id).lean()
    if (!current) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } })
      return
    }
    if (current.fulfillmentStatus !== 'returned') {
      response.status(409).json({ error: { code: 'ORDER_NOT_RETURNED', message: 'Only returned orders can be relaunched.' } })
      return
    }
    for (const item of current.items) {
      const stockChange = await Product.updateOne(
        { _id: item.productId, status: 'active', variants: { $elemMatch: { sku: item.sku, active: true, stock: { $gte: item.quantity } } } },
        { $inc: { 'variants.$.stock': -item.quantity } },
      )
      if (stockChange.modifiedCount !== 1) {
        await releaseReservations()
        response.status(409).json({ error: { code: 'ORDER_ITEM_UNAVAILABLE', message: `Not enough active stock is available to relaunch ${item.name}.` } })
        return
      }
      reserved.push({ productId: item.productId, sku: item.sku, quantity: item.quantity })
    }
    const changedAt = new Date()
    const order = await Order.findOneAndUpdate(
      { _id: current._id, fulfillmentStatus: 'returned' },
      { $set: { fulfillmentStatus: 'confirmation', paymentStatus: 'unpaid', trackingNumber: '' }, $push: { statusHistory: { status: 'confirmation', previousStatus: 'returned', changedAt, changedBy: request.adminEmail ?? '' } } },
      { new: true, runValidators: true },
    ).select('-qrTokenHash').lean()
    if (!order) {
      await releaseReservations()
      response.status(409).json({ error: { code: 'ORDER_STATUS_CHANGED', message: 'The order status changed while it was being relaunched. Reload and try again.' } })
      return
    }
    response.json({ data: order })
  } catch (error) {
    try { await releaseReservations() } catch (rollbackError) { console.error('Unable to release stock after order relaunch failed:', rollbackError instanceof Error ? rollbackError.name : 'Unknown error') }
    next(error)
  }
})

router.delete('/orders/:id', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_ORDER_ID', message: 'Order identifier is invalid.' } })
      return
    }
    const order = await Order.findById(request.params.id).lean()
    if (!order) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } })
      return
    }
    const deleted = await Order.deleteOne({ _id: order._id, fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus })
    if (deleted.deletedCount !== 1) {
      response.status(409).json({ error: { code: 'ORDER_CHANGED', message: 'The order changed while it was being deleted. Reload and try again.' } })
      return
    }
    if (!['delivered', 'returned', 'cancelled'].includes(order.fulfillmentStatus)) {
      await Promise.all(order.items.map(item => Product.updateOne({ _id: item.productId, 'variants.sku': item.sku }, { $inc: { 'variants.$.stock': item.quantity } })))
    }
    if (order.paymentStatus === 'paid') await Customer.updateOne({ _id: order.customerId }, { $inc: { orderCount: -1, totalSpent: -order.total } })
    response.json({ data: { id: String(order._id), deleted: true } })
  } catch (error) {
    next(error)
  }
})

router.patch('/orders/:id/fulfillment', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_ORDER_ID', message: 'Order identifier is invalid.' } })
      return
    }
    const parsed = orderStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_ORDER_STATUS', message: 'Choose a valid fulfillment status.' } })
      return
    }
    const current = await Order.findById(request.params.id).select('fulfillmentStatus paymentStatus customerId total').lean()
    if (!current) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } })
      return
    }
    if (!canChangeOrderFulfillment(current.fulfillmentStatus, parsed.data.fulfillmentStatus)) {
      response.status(409).json({ error: { code: 'INVALID_STATUS_TRANSITION', message: `The order cannot move from ${current.fulfillmentStatus} to ${parsed.data.fulfillmentStatus}.` } })
      return
    }
    if (current.fulfillmentStatus === parsed.data.fulfillmentStatus) {
      response.json({ data: await Order.findById(request.params.id).select('-qrTokenHash').lean() })
      return
    }
    const changedAt = new Date()
    const order = await Order.findOneAndUpdate(
      { _id: request.params.id, fulfillmentStatus: current.fulfillmentStatus, paymentStatus: current.paymentStatus },
      { $set: { fulfillmentStatus: parsed.data.fulfillmentStatus, paymentStatus: paymentStatusForFulfillment(current.paymentStatus, parsed.data.fulfillmentStatus) }, $push: { statusHistory: { status: parsed.data.fulfillmentStatus, previousStatus: current.fulfillmentStatus, changedAt, changedBy: request.adminEmail ?? '' } } },
      { new: true, runValidators: true },
    ).select('-qrTokenHash').lean()
    if (!order) {
      response.status(409).json({ error: { code: 'ORDER_STATUS_CHANGED', message: 'The order changed while you were updating it. Reload and try again.' } })
      return
    }
    if (parsed.data.fulfillmentStatus === 'delivered' && current.paymentStatus !== 'paid') await Customer.updateOne({ _id: current.customerId }, { $inc: { orderCount: 1, totalSpent: current.total } })
    if (['cancelled', 'returned'].includes(parsed.data.fulfillmentStatus) && current.paymentStatus === 'paid') await Customer.updateOne({ _id: current.customerId }, { $inc: { orderCount: -1, totalSpent: -current.total } })
    if (['cancelled', 'returned'].includes(parsed.data.fulfillmentStatus)) await Promise.all(order.items.map(item => Product.updateOne({ _id: item.productId, 'variants.sku': item.sku }, { $inc: { 'variants.$.stock': item.quantity } })))
    response.json({ data: order })
  } catch (error) {
    next(error)
  }
})

router.get('/customers', async (_request, response, next) => {
  try {
    const customers = await Customer.find().select('_id name email orderCount totalSpent status createdAt updatedAt').sort({ name: 1 }).limit(100).lean()
    response.json({ data: customers })
  } catch (error) {
    next(error)
  }
})

router.get('/dashboard', async (_request, response, next) => {
  try {
    const [products, customers, orders, revenue, recentOrders, dailySales, orderBreakdown] = await Promise.all([
      Product.countDocuments(),
      Customer.countDocuments({ status: 'active' }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', fulfillmentStatus: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.find().select('-qrTokenHash').sort({ placedAt: -1 }).limit(5).lean(),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', fulfillmentStatus: 'delivered' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } }, total: { $sum: '$total' } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $group: { _id: '$fulfillmentStatus', count: { $sum: 1 } } },
      ]),
    ])
    response.json({ data: { products, customers, orders, totalSales: revenue[0]?.total ?? 0, recentOrders, dailySales, orderBreakdown } })
  } catch (error) {
    next(error)
  }
})

router.get('/content', async (_request, response, next) => {
  try {
    const config = await StoreConfig.findOne({ key: 'store' }).lean()
    response.json({ data: config ?? await StoreConfig.create({ key: 'store' }) })
  } catch (error) {
    next(error)
  }
})

router.patch('/content', async (request, response, next) => {
  try {
    const parsed = contentSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_CONTENT', message: 'Review the storefront content fields.' } })
      return
    }
    const config = await StoreConfig.findOneAndUpdate(
      { key: 'store' },
      { $set: parsed.data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
    response.json({ data: config })
  } catch (error) {
    next(error)
  }
})

router.get('/settings', async (_request, response, next) => {
  try {
    const config = await StoreConfig.findOne({ key: 'store' }).lean()
    response.json({ data: config ?? await StoreConfig.create({ key: 'store' }) })
  } catch (error) {
    next(error)
  }
})

router.patch('/settings', async (request, response, next) => {
  try {
    const parsed = settingsSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_SETTINGS', message: 'Review the store settings fields.' } })
      return
    }
    const config = await StoreConfig.findOneAndUpdate(
      { key: 'store' },
      { $set: parsed.data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
    response.json({ data: config })
  } catch (error) {
    next(error)
  }
})
router.post('/categories', async (request, response, next) => {
  try {
    const parsed = categorySchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Category name is invalid.', details: parsed.error.flatten() } })
      return
    }
    const name = parsed.data.name
    const slug = slugify(name)
    if (!slug) {
      response.status(400).json({ error: { code: 'INVALID_CATEGORY_NAME', message: 'Category name must contain letters or numbers.' } })
      return
    }
    if (await Category.exists({ slug })) {
      response.status(409).json({ error: { code: 'CATEGORY_SLUG_EXISTS', message: 'A category with that name already exists.' } })
      return
    }
    const category = await Category.create({ ...parsed.data, slug })
    response.status(201).json({ data: category })
  } catch (error) {
    next(error)
  }
})

router.patch('/categories/:id', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_CATEGORY_ID', message: 'Category identifier is invalid.' } })
      return
    }
    const parsed = categorySchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Category details are invalid.' } })
      return
    }
    const category = await Category.findById(request.params.id)
    if (!category) {
      response.status(404).json({ error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' } })
      return
    }
    const previousName = category.name
    const nextSlug = slugify(parsed.data.name)
    if (!nextSlug) {
      response.status(400).json({ error: { code: 'INVALID_CATEGORY_NAME', message: 'Category name must contain letters or numbers.' } })
      return
    }
    if (nextSlug !== category.slug && await Category.exists({ slug: nextSlug, _id: { $ne: category._id } })) {
      response.status(409).json({ error: { code: 'CATEGORY_SLUG_EXISTS', message: 'A category with that name already exists.' } })
      return
    }
    category.name = parsed.data.name
    category.slug = previousName === parsed.data.name || nextSlug === category.slug ? category.slug : nextSlug
    category.description = parsed.data.description
    category.image = parsed.data.image
    category.displayOrder = parsed.data.displayOrder
    category.status = parsed.data.status
    await category.save()
    if (previousName !== category.name) {
      await Product.updateMany({ categoryId: category._id }, { $set: { category: category.name } })
    }
    response.json({ data: category })
  } catch (error) {
    next(error)
  }
})

router.get('/collections', async (_request, response, next) => {
  try {
    const collections = await Collection.aggregate([
      { $lookup: { from: 'products', localField: 'productIds', foreignField: '_id', as: 'products' } },
      { $addFields: { productCount: { $size: '$products' } } },
      { $project: { products: 0 } },
      { $sort: { displayOrder: 1, name: 1 } },
    ])
    response.json({ data: collections })
  } catch (error) {
    next(error)
  }
})

router.post('/collections', async (request, response, next) => {
  try {
    const parsed = collectionSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_COLLECTION', message: 'Collection details are invalid.' } })
      return
    }
    const productIds = parsed.data.productIds.map(id => new mongoose.Types.ObjectId(id))
    if (productIds.length && await Product.countDocuments({ _id: { $in: productIds } }) !== productIds.length) {
      response.status(400).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'One or more selected products no longer exist.' } })
      return
    }
    const slug = slugify(parsed.data.name)
    if (!slug) {
      response.status(400).json({ error: { code: 'INVALID_COLLECTION_NAME', message: 'Collection name must contain letters or numbers.' } })
      return
    }
    if (await Collection.exists({ slug })) {
      response.status(409).json({ error: { code: 'COLLECTION_SLUG_EXISTS', message: 'A collection with that name already exists.' } })
      return
    }
    const collection = await Collection.create({
      ...parsed.data,
      slug,
      productIds,
    })
    response.status(201).json({ data: collection })
  } catch (error) {
    next(error)
  }
})

router.patch('/collections/:id', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_COLLECTION_ID', message: 'Collection identifier is invalid.' } })
      return
    }
    const parsed = collectionSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_COLLECTION', message: 'Collection details are invalid.' } })
      return
    }
    const productIds = parsed.data.productIds.map(id => new mongoose.Types.ObjectId(id))
    if (productIds.length && await Product.countDocuments({ _id: { $in: productIds } }) !== productIds.length) {
      response.status(400).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'One or more selected products no longer exist.' } })
      return
    }
    const collection = await Collection.findById(request.params.id)
    if (!collection) {
      response.status(404).json({ error: { code: 'COLLECTION_NOT_FOUND', message: 'Collection not found.' } })
      return
    }
    const nextSlug = slugify(parsed.data.name)
    if (!nextSlug) {
      response.status(400).json({ error: { code: 'INVALID_COLLECTION_NAME', message: 'Collection name must contain letters or numbers.' } })
      return
    }
    if (nextSlug !== collection.slug && await Collection.exists({ slug: nextSlug, _id: { $ne: collection._id } })) {
      response.status(409).json({ error: { code: 'COLLECTION_SLUG_EXISTS', message: 'A collection with that name already exists.' } })
      return
    }
    collection.name = parsed.data.name
    collection.slug = nextSlug
    collection.description = parsed.data.description
    collection.image = parsed.data.image
    collection.productIds = productIds
    collection.displayOrder = parsed.data.displayOrder
    collection.status = parsed.data.status
    await collection.save()
    response.json({ data: collection })
  } catch (error) {
    next(error)
  }
})

router.delete('/collections/:id', async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_COLLECTION_ID', message: 'Collection identifier is invalid.' } })
      return
    }
    const collection = await Collection.findByIdAndDelete(request.params.id)
    if (!collection) {
      response.status(404).json({ error: { code: 'COLLECTION_NOT_FOUND', message: 'Collection not found.' } })
      return
    }
    response.json({ data: { deleted: true } })
  } catch (error) {
    next(error)
  }
})

router.post('/products', async (request, response, next) => {
  try {
    const parsed = productSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_PRODUCT', message: 'Product details are invalid.', details: parsed.error.flatten() } })
      return
    }
    const { name, category: categoryName, price } = parsed.data
    const category = await Category.findOne({ name: categoryName, status: 'active' })
    if (!category) {
      response.status(400).json({ error: { code: 'CATEGORY_NOT_FOUND', message: 'Choose an existing active category.' } })
      return
    }
    const product = await Product.create({
      name,
      slug: `${slugify(name)}-${Date.now().toString(36)}`,
      categoryId: category._id,
      category: category.name,
      shortDescription: parsed.data.shortDescription || 'A considered OFF essential, made for everyday movement.',
      description: parsed.data.description,
      price,
      status: parsed.data.status,
      featured: parsed.data.featured,
      images: parsed.data.images ?? (parsed.data.image ? [{ url: parsed.data.image, alt: name, order: 0 }] : []),
      variants: parsed.data.variants ?? [{ sku: `OFF-${Date.now().toString(36).toUpperCase()}-M`, color: 'Black', size: 'M', price, stock: 0, active: true }],
    })
    response.status(201).json({ data: product })
  } catch (error) {
    next(error)
  }
})

router.get('/image-generation/status', (_request, response) => {
  response.json({ data: { enabled: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_IMAGE_MODEL === 'gpt-image-2.5-flare' ? 'gpt-image-2.5-flare' : 'gpt-image-2.5-sunburst' } })
})

router.post('/products/:id/generate-gallery', imageGenerationLimit, async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: { code: 'INVALID_PRODUCT_ID', message: 'Product identifier is invalid.' } })
      return
    }
    const parsed = z.object({ count: z.number().int().min(1).max(4).default(3) }).safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_IMAGE_COUNT', message: 'Choose between 1 and 4 generated gallery images.' } })
      return
    }
    const product = await Product.findById(request.params.id).select('name category description images').lean()
    if (!product) {
      response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } })
      return
    }
    const generated = await generateProductGallery({ productName: product.name, category: product.category, description: product.description, images: product.images, count: parsed.data.count })
    response.status(201).json({ data: generated })
  } catch (error) {
    if (error instanceof ImageGenerationError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    next(error)
  }
})

export const adminPreviewRouter = router
