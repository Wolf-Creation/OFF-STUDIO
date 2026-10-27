import 'dotenv/config'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { Category } from './models/Category.js'
import { Collection } from './models/Collection.js'
import { Customer } from './models/Customer.js'
import { Order } from './models/Order.js'
import { Product } from './models/Product.js'
import { StoreConfig } from './models/StoreConfig.js'
import { WebsitePage } from './models/WebsitePage.js'
import { ContentRevision } from './models/ContentRevision.js'
import { WebsiteConfig } from './models/WebsiteConfig.js'
import { MediaAsset } from './models/MediaAsset.js'
import { adminPreviewRouter } from './routes/adminPreview.js'
import { accountRouter } from './routes/account.js'
import { authRouter } from './routes/auth.js'
import { catalogRouter } from './routes/catalog.js'
import { checkoutRouter } from './routes/checkout.js'
import { customerRouter } from './routes/customer.js'
import { paymentsRouter } from './routes/payments.js'
import { seedDemoData } from './seed.js'
import { storefrontRouter } from './routes/storefront.js'
import { websiteAdminRouter } from './routes/websiteAdmin.js'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().url().optional().or(z.literal('')),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ADMIN_URL: z.string().url().default('http://localhost:5174'),
  ADMIN_EMAIL: z.preprocess(value => value === '' ? undefined : value, z.string().email().optional()),
  ADMIN_PASSWORD: z.preprocess(value => value === '' ? undefined : value, z.string().min(12).optional()),
  JWT_SECRET: z.preprocess(value => value === '' ? undefined : value, z.string().min(32).optional()),
  QR_TOKEN_SECRET: z.preprocess(value => value === '' ? undefined : value, z.string().min(32).optional()),
  CLERK_SECRET_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().regex(/^sk_(test|live)_/).optional()),
  STRIPE_SECRET_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().regex(/^sk_(test|live)_[A-Za-z0-9]+$/).optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess(value => value === '' ? undefined : value, z.string().regex(/^whsec_[A-Za-z0-9]+$/).optional()),
  OPENAI_API_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().min(20).optional()),
  OPENAI_IMAGE_MODEL: z.enum(['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']).default('gpt-image-2.5-sunburst'),
})
const environment = envSchema.safeParse(process.env)
if (!environment.success) {
  console.error('Invalid API environment configuration:', environment.error.flatten().fieldErrors)
  process.exit(1)
}
const config = environment.data
const app = express()
app.disable('x-powered-by')
app.use(helmet())
const allowedOrigins = new Set([config.FRONTEND_URL, config.ADMIN_URL])
app.use(cors({
  origin(origin, callback) {
    const localDevelopmentOrigin = config.NODE_ENV === 'development'
      && /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin ?? '')
    callback(null, !origin || allowedOrigins.has(origin) || localDevelopmentOrigin)
  },
  credentials: true,
}))
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }))
app.use('/api/v1/payments', paymentsRouter)
app.use(express.json({ limit: '1mb' }))
app.use('/api/v1', catalogRouter)
app.use('/api/v1/store', storefrontRouter)
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/account', accountRouter)
app.use('/api/v1/customers', customerRouter)
app.use('/api/v1/orders/checkout', checkoutRouter)
app.use('/api/v1/admin-preview', adminPreviewRouter)
app.use('/api/v1/admin/website', websiteAdminRouter)
// Product cutouts and CMS media are public storefront assets. Helmet's global
// same-origin policy otherwise blocks them when loaded from localhost:5173/5175.
app.use('/media', (_request, response, next) => {
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
})
app.use('/media', express.static(fileURLToPath(new URL('../uploads/', import.meta.url)), { fallthrough: false, immutable: true, maxAge: '1y' }))

app.get('/api/v1/health', (_request, response) => {
  const databaseReady = mongoose.connection.readyState === 1
  response.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ready' : 'database-not-connected',
    database: databaseReady ? 'connected' : 'not-connected',
    mode: config.NODE_ENV,
  })
})

app.get('/api/v1', (_request, response) => {
  response.json({ name: 'OFF API', version: 'v1', databaseConfigured: Boolean(config.MONGODB_URI) })
})

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } })
      return
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body exceeds the allowed size.' } })
      return
    }
  }
  if (error instanceof mongoose.Error.ValidationError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The submitted data is invalid.' } })
    return
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    response.status(409).json({ error: { code: 'DUPLICATE_RESOURCE', message: 'A resource with that name already exists.' } })
    return
  }
  console.error('Unhandled API error:', error instanceof Error ? error.name : 'Unknown error')
  response.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } })
}
app.use(errorHandler)

async function start() {
  if (config.NODE_ENV === 'production') {
    const missing = [
      !config.MONGODB_URI && 'MONGODB_URI',
      !config.ADMIN_EMAIL && 'ADMIN_EMAIL',
      !config.ADMIN_PASSWORD && 'ADMIN_PASSWORD',
      !config.JWT_SECRET && 'JWT_SECRET',
    ].filter(Boolean)
    if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`)
  }
  if (config.MONGODB_URI) {
    await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    await Promise.all([Category.init(), Collection.init(), Product.init(), Customer.init(), Order.init(), StoreConfig.init(), WebsitePage.init(), WebsiteConfig.init(), ContentRevision.init(), MediaAsset.init()])
    await Order.collection.updateMany({ paymentMethod: 'stripe', gatewayPaymentStatus: { $exists: false } }, [{ $set: { gatewayPaymentStatus: { $switch: { branches: [{ case: { $eq: ['$paymentStatus', 'paid'] }, then: 'paid' }, { case: { $in: ['$paymentStatus', ['failed', 'refunded']] }, then: 'failed' }], default: 'pending' } } } }])
    const remapLegacyStatus = (value: string) => ({ $switch: { branches: [{ case: { $eq: [value, 'pending'] }, then: 'confirmation' }, { case: { $eq: [value, 'shipped'] }, then: 'in_delivery' }, { case: { $eq: [value, 'completed'] }, then: 'delivered' }], default: value } })
    await Order.collection.updateMany({ $or: [{ fulfillmentStatus: { $in: ['pending', 'shipped', 'completed'] } }, { 'statusHistory.status': { $in: ['pending', 'shipped', 'completed'] } }] }, [{ $set: { fulfillmentStatus: remapLegacyStatus('$fulfillmentStatus'), statusHistory: { $map: { input: { $ifNull: ['$statusHistory', []] }, as: 'entry', in: { $mergeObjects: ['$$entry', { status: remapLegacyStatus('$$entry.status'), previousStatus: { $cond: [{ $in: ['$$entry.previousStatus', ['pending', 'processing', 'shipped', 'completed', 'cancelled']] }, remapLegacyStatus('$$entry.previousStatus'), '$$REMOVE'] } }] } } } } }])
    await Order.collection.updateMany({}, [{ $set: { paymentStatus: { $cond: [{ $eq: ['$fulfillmentStatus', 'delivered'] }, 'paid', 'unpaid'] } } }])
    const [currencyMigration] = await Promise.all([
      Order.updateMany({ currency: 'USD' }, { $set: { currency: 'TND' } }),
      StoreConfig.updateOne(
        { key: 'store', announcement: 'Complimentary shipping on orders over $500' },
        { $set: { announcement: 'Complimentary shipping on orders over 500 TND' } },
      ),
    ])
    if (currencyMigration.modifiedCount > 0) {
      console.info(`Updated ${currencyMigration.modifiedCount} existing order currency labels to TND without changing amounts.`)
    }
    if (config.NODE_ENV === 'development') {
      const seeded = await seedDemoData()
      console.info('OFF demo data check complete:', seeded)
    }
    const publishScheduled = async () => {
      const duePages = await WebsitePage.find({ status: 'scheduled', scheduledAt: { $lte: new Date() } })
      for (const page of duePages) {
        page.publishedSections = page.draftSections
        page.publishedVersion = page.draftVersion
        page.publishedAt = new Date()
        page.scheduledAt = null
        page.status = 'published'
        await page.save()
        await ContentRevision.create({ resourceType: page.slug === 'home' ? 'homepage' : 'page', resourceId: String(page._id), version: page.publishedVersion, snapshot: page.publishedSections, status: 'published', publishedAt: page.publishedAt })
      }
    }
    setInterval(() => { void publishScheduled().catch(error => console.error('Scheduled website publication failed:', error instanceof Error ? error.name : 'Unknown error')) }, 15_000)
  } else if (config.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI is required in production.')
  } else {
    console.warn('MONGODB_URI is not configured. Database-backed API routes are unavailable.')
  }
  const host = config.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0'
  app.listen(config.PORT, host, () => console.info(`OFF API listening on port ${config.PORT}`))
}

start().catch((error: unknown) => {
  console.error('Unable to start OFF API:', error instanceof Error ? error.name : 'Unknown error')
  process.exit(1)
})
