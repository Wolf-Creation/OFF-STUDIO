import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { Category } from '../models/Category.js'
import { Collection } from '../models/Collection.js'
import { Product } from '../models/Product.js'
import { WebsiteConfig } from '../models/WebsiteConfig.js'

const router = Router()
const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  collection: z.string().trim().max(100).optional(),
  size: z.string().trim().max(20).optional(),
  color: z.string().trim().max(60).optional(),
  price: z.coerce.number().min(0).optional(),
  sort: z.enum(['featured', 'newest', 'price-asc', 'price-desc', 'manual']).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
})
const slugify = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

router.get('/products', async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Product filters are invalid.', details: parsed.error.flatten() } })
      return
    }

    const { q, category, collection, size, color, price, sort, page, limit } = parsed.data
    const filter: Record<string, unknown> = {
      status: 'active',
      categoryId: { $in: await Category.distinct('_id', { status: 'active' }) },
    }
    let collectionScope = ''
    let collectionProductOrder: string[] = []
    if (collection) {
      const selectedCollection = await Collection.findOne({ slug: slugify(collection), status: 'active' }).select('_id productIds').lean()
      if (!selectedCollection) {
        response.status(404).json({ error: { code: 'COLLECTION_NOT_FOUND', message: 'Collection not found.' } })
        return
      }
      collectionScope = `collection:${String(selectedCollection._id)}`
      collectionProductOrder = selectedCollection.productIds.map(id => String(id))
      filter._id = { $in: selectedCollection.productIds }
    }
    if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i')
    if (q) filter.$or = ['name', 'shortDescription', 'description'].map((field) => ({ [field]: new RegExp(escapeRegex(q), 'i') }))
    if (size || color) {
      const variant: Record<string, unknown> = { active: true, stock: { $gt: 0 } }
      if (size) variant.size = new RegExp(`^${escapeRegex(size)}$`, 'i')
      if (color) variant.color = new RegExp(`^${escapeRegex(color)}$`, 'i')
      filter.variants = { $elemMatch: variant }
    }
    if (price !== undefined) filter.price = { $lte: price }

    const sortOptions = {
      featured: { featured: -1, createdAt: -1 },
      newest: { createdAt: -1 },
      'price-asc': { price: 1 },
      'price-desc': { price: -1 },
    } as const
    const useManualOrder = sort === 'manual' || Boolean(collectionScope && sort === 'featured')
    const [total, items] = await Promise.all([
      Product.countDocuments(filter),
      useManualOrder
        ? (async () => {
          const [allProducts, config, categoryRecord] = await Promise.all([
            Product.find(filter).lean(),
            WebsiteConfig.findOne({ key: 'website' }).select('published.merchandising').lean(),
            !collectionScope && category ? Category.findOne({ name: new RegExp(`^${escapeRegex(category)}$`, 'i') }).select('_id').lean() : null,
          ])
          const scopes = config?.published?.merchandising as Record<string, string[]> | undefined
          const scopedKey = collectionScope || (categoryRecord ? `category:${String(categoryRecord._id)}` : '')
          const order = (scopedKey && scopes?.[scopedKey]?.length ? scopes[scopedKey] : null) ?? (collectionScope ? collectionProductOrder : null) ?? scopes?.global ?? []
          const rank = new Map(order.map((id, index) => [id, index]))
          const sorted = allProducts.sort((a, b) => (rank.get(String(a._id)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(String(b._id)) ?? Number.MAX_SAFE_INTEGER) || String(a._id).localeCompare(String(b._id)))
          return sorted.slice((page - 1) * limit, page * limit)
        })()
        : Product.find(filter).sort(sortOptions[sort]).skip((page - 1) * limit).limit(limit).lean(),
    ])
    response.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  } catch (error) {
    next(error)
  }
})

router.get('/products/:identifier', async (request, response, next) => {
  try {
    const identifier = request.params.identifier
    const identity = mongoose.isValidObjectId(identifier) ? [{ _id: identifier }, { slug: identifier }] : [{ slug: identifier }]
    const product = await Product.findOne({ status: 'active', categoryId: { $in: await Category.distinct('_id', { status: 'active' }) }, $or: identity }).lean()
    if (!product) {
      response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } })
      return
    }
    response.json({ data: product })
  } catch (error) {
    next(error)
  }
})

router.get('/categories', async (_request, response, next) => {
  try {
    const categories = await Category.aggregate([
      { $match: { status: 'active' } },
      { $lookup: { from: 'products', let: { categoryId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$categoryId', '$$categoryId'] }, { $eq: ['$status', 'active'] }] } } }], as: 'products' } },
      { $addFields: { productCount: { $size: '$products' } } },
      { $project: { products: 0, productIds: 0 } },
      { $sort: { displayOrder: 1, name: 1 } },
    ])
    response.json({ data: categories })
  } catch (error) {
    next(error)
  }
})

router.get('/categories/:slug', async (request, response, next) => {
  try {
    const category = await Category.findOne({ slug: slugify(request.params.slug), status: 'active' }).lean()
    if (!category) {
      response.status(404).json({ error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' } })
      return
    }
    response.json({ data: category })
  } catch (error) {
    next(error)
  }
})

router.get('/collections', async (_request, response, next) => {
  try {
    const collections = await Collection.aggregate([
      { $match: { status: 'active' } },
      { $lookup: { from: 'products', let: { productIds: '$productIds' }, pipeline: [{ $match: { $expr: { $and: [{ $in: ['$_id', '$$productIds'] }, { $eq: ['$status', 'active'] }] } } }], as: 'products' } },
      { $addFields: { productCount: { $size: '$products' } } },
      { $addFields: { productIds: '$products._id' } },
      { $project: { products: 0 } },
      { $sort: { displayOrder: 1, name: 1 } },
    ])
    response.json({ data: collections })
  } catch (error) {
    next(error)
  }
})

router.get('/collections/:slug', async (request, response, next) => {
  try {
    const collection = await Collection.findOne({ slug: slugify(request.params.slug), status: 'active' }).lean()
    if (!collection) {
      response.status(404).json({ error: { code: 'COLLECTION_NOT_FOUND', message: 'Collection not found.' } })
      return
    }
    const productCount = await Product.countDocuments({ _id: { $in: collection.productIds }, status: 'active' })
    const publicCollection = {
      _id: collection._id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
      image: collection.image,
      productIds: (await Product.find({ _id: { $in: collection.productIds }, status: 'active' }).select('_id').lean()).map(product => String(product._id)),
      displayOrder: collection.displayOrder,
      status: collection.status,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    }
    response.json({ data: { ...publicCollection, productCount } })
  } catch (error) {
    next(error)
  }
})

export const catalogRouter = router
