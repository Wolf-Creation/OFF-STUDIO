import { Router, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { Category } from '../models/Category.js'
import { Customer } from '../models/Customer.js'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { CustomerAuthError, authenticateCustomer, resolveClerkCustomer } from '../customerAuth.js'

const router = Router()
const fulfillmentStatuses = ['confirmation', 'processing', 'in_delivery', 'delivered', 'returned', 'cancelled', 'exchange'] as const
export const customerAddressInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(2).max(120),
  phoneNumber: z.string().trim().min(7).max(32),
  addressLine1: z.string().trim().min(3).max(160),
  addressLine2: z.string().trim().max(160).default(''),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(24).default(''),
  country: z.string().trim().length(2).transform(value => value.toUpperCase()).default('TN'),
  governorate: z.string().trim().max(80).default(''),
  delegation: z.string().trim().max(100).default(''),
  isDefault: z.boolean().default(false),
})
export const customerProfileInputSchema = z.object({
  phoneNumber: z.string().trim().max(32).refine(value => !value || value.length >= 7).optional(),
  dateOfBirth: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
}).strict()
export const customerPreferencesInputSchema = z.object({
  newsletter: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0)

export function customerOrderFilter(customerId: mongoose.Types.ObjectId, status?: 'confirmation' | 'processing' | 'in_delivery' | 'delivered' | 'returned' | 'cancelled' | 'exchange') {
  const filter: Record<string, unknown> = { customerId }
  if (status === 'processing') filter.fulfillmentStatus = { $in: ['confirmation', 'processing'] }
  else if (status) filter.fulfillmentStatus = status
  return filter
}

export function ownedCustomerOrderFilter(customerId: mongoose.Types.ObjectId, orderId: string) {
  return { _id: orderId, customerId }
}

const safeCustomer = (customer: Awaited<ReturnType<typeof resolveClerkCustomer>>) => ({
  id: String(customer._id),
  name: customer.name,
  email: customer.email,
  phoneNumber: customer.phoneNumber ?? '',
  dateOfBirth: customer.dateOfBirth ? new Date(customer.dateOfBirth).toISOString().slice(0, 10) : '',
  orderCount: customer.orderCount,
  totalSpent: customer.totalSpent,
  addresses: customer.addresses ?? [],
  wishlistProductIds: (customer.wishlistProductIds ?? []).map(id => String(id)),
  wishlistCount: customer.wishlistProductIds?.length ?? 0,
  communicationPreferences: customer.communicationPreferences ?? { newsletter: false, marketingEmails: false },
})

function respondError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof CustomerAuthError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }
  next(error)
}

async function customerFor(request: Request) {
  return resolveClerkCustomer(request.clerkUserId!)
}

router.use(authenticateCustomer)

router.get('/', async (request, response, next) => {
  try {
    const customer = await customerFor(request)
    const [totalOrders, ordersInProgress, latestOrder] = await Promise.all([
      Order.countDocuments({ customerId: customer._id }),
      Order.countDocuments({ customerId: customer._id, fulfillmentStatus: { $in: ['confirmation', 'processing', 'in_delivery'] } }),
      Order.findOne({ customerId: customer._id }).select('orderNumber items total currency paymentStatus fulfillmentStatus placedAt').sort({ placedAt: -1 }).lean(),
    ])
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: {
      customer: safeCustomer(customer),
      stats: { totalOrders, ordersInProgress, wishlistItems: customer.wishlistProductIds?.length ?? 0 },
      latestOrder: latestOrder ?? null,
    } })
  } catch (error) { respondError(error, response, next) }
})

router.patch('/', async (request, response, next) => {
  const parsed = customerProfileInputSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'INVALID_PROFILE', message: 'Review the profile fields and try again.', details: parsed.error.flatten().fieldErrors } })
    return
  }
  try {
    const customer = await customerFor(request)
    if (parsed.data.phoneNumber !== undefined) customer.phoneNumber = parsed.data.phoneNumber
    if (parsed.data.dateOfBirth !== undefined) {
      const value = parsed.data.dateOfBirth
      const parsedDate = value ? new Date(`${value}T00:00:00.000Z`) : null
      if (parsedDate && (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value)) {
        response.status(400).json({ error: { code: 'INVALID_DATE_OF_BIRTH', message: 'Enter a valid date of birth.' } })
        return
      }
      customer.dateOfBirth = parsedDate
    }
    await customer.save()
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: { customer: safeCustomer(customer) } })
  } catch (error) { respondError(error, response, next) }
})

router.get('/orders', async (request, response, next) => {
  const query = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    status: z.enum(['confirmation', 'processing', 'in_delivery', 'delivered', 'returned', 'cancelled', 'exchange']).optional(),
  }).safeParse(request.query)
  if (!query.success) {
    response.status(400).json({ error: { code: 'INVALID_ORDER_QUERY', message: 'Order filters are invalid.' } })
    return
  }
  try {
    const customer = await customerFor(request)
    const filter = customerOrderFilter(customer._id, query.data.status)
    const [total, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter).select('orderNumber items total currency paymentStatus paymentMethod fulfillmentStatus statusHistory placedAt').sort({ placedAt: -1 }).skip((query.data.page - 1) * query.data.limit).limit(query.data.limit).lean(),
    ])
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: { orders, pagination: { page: query.data.page, limit: query.data.limit, total, pages: Math.ceil(total / query.data.limit) } } })
  } catch (error) { respondError(error, response, next) }
})

router.get('/orders/:orderId', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.orderId)) {
    response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } })
    return
  }
  try {
    const customer = await customerFor(request)
    const order = await Order.findOne(ownedCustomerOrderFilter(customer._id, request.params.orderId))
      .select('orderNumber items orderNote shippingAddress subtotal shippingAmount discountAmount taxAmount total currency paymentStatus paymentMethod fulfillmentStatus statusHistory trackingNumber placedAt')
      .lean()
    if (!order) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } })
      return
    }
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: { order } })
  } catch (error) { respondError(error, response, next) }
})

router.get('/addresses', async (request, response, next) => {
  try {
    const customer = await customerFor(request)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: { addresses: customer.addresses ?? [] } })
  } catch (error) { respondError(error, response, next) }
})

router.post('/addresses', async (request, response, next) => {
  const parsed = customerAddressInputSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'INVALID_ADDRESS', message: 'Review the address fields and try again.', details: parsed.error.flatten().fieldErrors } })
    return
  }
  try {
    const customer = await customerFor(request)
    const addressId = new mongoose.Types.ObjectId()
    const shouldBeDefault = parsed.data.isDefault || !customer.addresses?.length
    const address = { ...parsed.data, isDefault: shouldBeDefault, _id: addressId, createdAt: new Date(), updatedAt: new Date() }
    if (shouldBeDefault) {
      await Customer.updateOne({ _id: customer._id }, [{ $set: { addresses: { $concatArrays: [
        { $map: { input: { $ifNull: ['$addresses', []] }, as: 'address', in: { $mergeObjects: ['$$address', { isDefault: false }] } } },
        { $literal: [address] },
      ] } } }])
    } else {
      await Customer.updateOne({ _id: customer._id }, { $push: { addresses: address } })
    }
    const updated = await Customer.findById(customer._id).select('addresses').lean()
    const created = updated?.addresses.find(item => String(item._id) === String(addressId))
    response.status(201).json({ data: { address: created, addresses: updated?.addresses ?? [] } })
  } catch (error) { respondError(error, response, next) }
})

router.patch('/addresses/:addressId', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.addressId)) {
    response.status(404).json({ error: { code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' } })
    return
  }
  const parsed = customerAddressInputSchema.partial().strict().safeParse(request.body)
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
    response.status(400).json({ error: { code: 'INVALID_ADDRESS', message: 'Review the address fields and try again.', details: parsed.success ? undefined : parsed.error.flatten().fieldErrors } })
    return
  }
  try {
    const customer = await customerFor(request)
    const addressId = new mongoose.Types.ObjectId(request.params.addressId)
    if (!customer.addresses?.some(item => String(item._id) === String(addressId))) {
      response.status(404).json({ error: { code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' } })
      return
    }
    const now = new Date()
    const makeDefault = parsed.data.isDefault === true
    const update = { ...parsed.data, updatedAt: now }
    await Customer.updateOne({ _id: customer._id }, [{ $set: { addresses: { $map: {
      input: { $ifNull: ['$addresses', []] }, as: 'address',
      in: { $mergeObjects: ['$$address',
        { $cond: [{ $eq: ['$$address._id', addressId] }, { $literal: update }, {}] },
        ...(makeDefault ? [{ isDefault: { $eq: ['$$address._id', addressId] } }] : []),
      ] },
    } } } }])
    const updated = await Customer.findById(customer._id).select('addresses').lean()
    const saved = updated?.addresses.find(item => String(item._id) === String(addressId))
    response.json({ data: { address: saved, addresses: updated?.addresses ?? [] } })
  } catch (error) { respondError(error, response, next) }
})

router.patch('/addresses/:addressId/default', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.addressId)) {
    response.status(404).json({ error: { code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' } })
    return
  }
  try {
    const customer = await customerFor(request)
    const addressId = new mongoose.Types.ObjectId(request.params.addressId)
    if (!customer.addresses?.some(item => String(item._id) === String(addressId))) {
      response.status(404).json({ error: { code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' } })
      return
    }
    await Customer.updateOne({ _id: customer._id }, [{ $set: { addresses: { $map: {
      input: { $ifNull: ['$addresses', []] }, as: 'address',
      in: { $mergeObjects: ['$$address', { isDefault: { $eq: ['$$address._id', addressId] } }] },
    } } } }])
    const updated = await Customer.findById(customer._id).select('addresses').lean()
    response.json({ data: { addresses: updated?.addresses ?? [] } })
  } catch (error) { respondError(error, response, next) }
})

router.delete('/addresses/:addressId', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.addressId)) {
    response.status(404).json({ error: { code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' } })
    return
  }
  try {
    const customer = await customerFor(request)
    const addressId = new mongoose.Types.ObjectId(request.params.addressId)
    const result = await Customer.updateOne({ _id: customer._id, 'addresses._id': addressId }, { $pull: { addresses: { _id: addressId } } })
    if (!result.modifiedCount) {
      response.status(404).json({ error: { code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' } })
      return
    }
    const updated = await Customer.findById(customer._id).select('addresses').lean()
    response.json({ data: { addresses: updated?.addresses ?? [] } })
  } catch (error) { respondError(error, response, next) }
})

router.get('/wishlist', async (request, response, next) => {
  try {
    const customer = await customerFor(request)
    const categoryIds = await Category.distinct('_id', { status: 'active' })
    const products = await Product.find({ _id: { $in: customer.wishlistProductIds ?? [] }, status: 'active', categoryId: { $in: categoryIds } }).lean()
    const order = new Map((customer.wishlistProductIds ?? []).map((id, index) => [String(id), index]))
    products.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0))
    response.setHeader('Cache-Control', 'private, no-store')
    response.json({ data: { products, count: customer.wishlistProductIds?.length ?? 0 } })
  } catch (error) { respondError(error, response, next) }
})

router.post('/wishlist', async (request, response, next) => {
  const parsed = z.object({ productId: z.string().refine(mongoose.isValidObjectId) }).safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'INVALID_PRODUCT', message: 'Choose a valid product.' } })
    return
  }
  try {
    const customer = await customerFor(request)
    const categoryIds = await Category.distinct('_id', { status: 'active' })
    const product = await Product.findOne({ _id: parsed.data.productId, status: 'active', categoryId: { $in: categoryIds } }).select('_id').lean()
    if (!product) {
      response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'This product is not available.' } })
      return
    }
    await Customer.updateOne({ _id: customer._id }, { $addToSet: { wishlistProductIds: product._id } })
    const updated = await Customer.findById(customer._id).select('wishlistProductIds').lean()
    response.status(201).json({ data: { count: updated?.wishlistProductIds.length ?? 0 } })
  } catch (error) { respondError(error, response, next) }
})

router.delete('/wishlist/:productId', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.productId)) {
    response.status(400).json({ error: { code: 'INVALID_PRODUCT', message: 'Choose a valid product.' } })
    return
  }
  try {
    const customer = await customerFor(request)
    await Customer.updateOne({ _id: customer._id }, { $pull: { wishlistProductIds: new mongoose.Types.ObjectId(request.params.productId) } })
    const updated = await Customer.findById(customer._id).select('wishlistProductIds').lean()
    response.json({ data: { count: updated?.wishlistProductIds.length ?? 0 } })
  } catch (error) { respondError(error, response, next) }
})

router.patch('/preferences', async (request, response, next) => {
  const parsed = customerPreferencesInputSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'INVALID_PREFERENCES', message: 'Communication preferences are invalid.' } })
    return
  }
  try {
    const customer = await customerFor(request)
    for (const [key, value] of Object.entries(parsed.data)) customer.set(`communicationPreferences.${key}`, value)
    await customer.save()
    response.json({ data: { communicationPreferences: customer.communicationPreferences } })
  } catch (error) { respondError(error, response, next) }
})

export const accountRouter = router
