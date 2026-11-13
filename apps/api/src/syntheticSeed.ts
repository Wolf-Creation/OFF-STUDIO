import mongoose from 'mongoose'
import { assertVerifiedStagingSeed, getDatabaseVerification, loadRuntimeEnv, normalizeMongoUri } from './runtimeConfig.js'
import { Category } from './models/Category.js'
import { Collection } from './models/Collection.js'
import { Customer } from './models/Customer.js'
import { Order } from './models/Order.js'
import { Product } from './models/Product.js'
import { AnalyticsEvent } from './models/AnalyticsEvent.js'

export const syntheticSeedMetadataFields = ['isSynthetic', 'seedRunId', 'seedScenario', 'createdBySeed'] as const

export const syntheticSeedScenarios = [
  {
    id: 'best_sellers',
    title: 'Best Sellers',
    description: 'Top performing products and variants ranked by revenue and order count.',
    targetModels: ['Order', 'Product', 'AnalyticsEvent'],
    metrics: ['revenue', 'units', 'conversionRate'],
  },
  {
    id: 'high_interest_low_conversion',
    title: 'High Interest / Low Conversion',
    description: 'Products with strong views and wishlist activity but weak purchase conversion.',
    targetModels: ['Product', 'AnalyticsEvent', 'Customer'],
    metrics: ['views', 'wishlistAdds', 'purchaseRate'],
  },
  {
    id: 'abandoned_checkout',
    title: 'Abandoned Checkout',
    description: 'Sessions that reached checkout but did not complete an order.',
    targetModels: ['AnalyticsEvent', 'Order'],
    metrics: ['checkoutStart', 'shippingComplete', 'dropOffRate'],
  },
  {
    id: 'wishlist_intelligence',
    title: 'Wishlist Intelligence',
    description: 'Wishlist additions, removals, and conversion into cart or purchase.',
    targetModels: ['Customer', 'AnalyticsEvent', 'Product'],
    metrics: ['additions', 'cartConversion', 'purchaseConversion'],
  },
  {
    id: 'variant_demand',
    title: 'Variant Demand',
    description: 'Size and color demand aligned to product inventory and variant sales.',
    targetModels: ['Product', 'Order', 'AnalyticsEvent'],
    metrics: ['sizeDemand', 'colorDemand', 'stockAlert'],
  },
  {
    id: 'campaign_performance',
    title: 'Campaign Performance',
    description: 'UTM campaign traffic, orders, and conversion by visitor cohort.',
    targetModels: ['AnalyticsEvent', 'Order', 'Customer'],
    metrics: ['campaignVisitors', 'orders', 'revenue', 'attribution'],
  },
  {
    id: 'customer_retention',
    title: 'Customer Retention',
    description: 'Repeat purchase cohorts, average purchase intervals and lifetime value.',
    targetModels: ['Customer', 'Order'],
    metrics: ['retention', 'repeatPurchaseRate', 'lifetimeValue'],
  },
  {
    id: 'collection_performance',
    title: 'Collection Performance',
    description: 'Collection-level product views, click-through and revenue contribution.',
    targetModels: ['Collection', 'Product', 'AnalyticsEvent'],
    metrics: ['collectionRevenue', 'productViews', 'clickThroughRate'],
  },
  {
    id: 'cta_performance',
    title: 'CTA Performance',
    description: 'CTA impressions and click-through rate for marketing and homepage actions.',
    targetModels: ['AnalyticsEvent'],
    metrics: ['impressions', 'clicks', 'ctr'],
  },
  {
    id: 'traffic_sources',
    title: 'Traffic Sources & UTM Attribution',
    description: 'Source, medium and campaign attribution using first-touch and last-touch reporting.',
    targetModels: ['AnalyticsEvent', 'Order'],
    metrics: ['trafficSource', 'utmSource', 'revenueShare'],
  },
] as const

export type SyntheticSeedConfig = {
  products: number
  categories: number
  collections: number
  customers: number
  orders: number
  wishlistEntries: number
  analyticsEvents: number
  ctaEvents: number
  campaigns: number
  visitorSessions: number
  runId?: string
}

export const defaultSyntheticSeedConfig: SyntheticSeedConfig = {
  products: 100,
  categories: 10,
  collections: 15,
  customers: 500,
  orders: 1500,
  wishlistEntries: 1000,
  analyticsEvents: 100000,
  ctaEvents: 10000,
  campaigns: 20,
  visitorSessions: 10000,
}

export function createSyntheticSeedRunId(prefix = 'synthetic-staging') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`
}

export function buildSyntheticSeedPlan(overrides: Partial<SyntheticSeedConfig> = {}) {
  const config: SyntheticSeedConfig = {
    ...defaultSyntheticSeedConfig,
    ...overrides,
    runId: overrides.runId ?? createSyntheticSeedRunId(),
  }

  const modelTargets = {
    Category: config.categories,
    Collection: config.collections,
    Product: config.products,
    Customer: config.customers,
    Order: config.orders,
    Wishlist: config.wishlistEntries,
    AnalyticsEvent: config.analyticsEvents,
    CTAEvent: config.ctaEvents,
    Campaign: config.campaigns,
    VisitorSession: config.visitorSessions,
  }

  const totalSyntheticDocumentTarget = Object.values(modelTargets).reduce((sum, value) => sum + value, 0)

  return {
    seedRunId: config.runId,
    generatedAt: new Date().toISOString(),
    environment: (process.env.NODE_ENV ?? 'staging').toLowerCase(),
    volumes: config,
    totalSyntheticDocumentTarget,
    modelTargets,
    metadataFields: [...syntheticSeedMetadataFields],
    scenarios: syntheticSeedScenarios.map((scenario) => ({
      ...scenario,
      requiredModels: scenario.targetModels,
      expectedOutput: `Synthetic ${scenario.title.toLowerCase()} data aligned to live analytics and confirmed order sources.`,
    })),
    businessRules: [
      'Revenue and completed purchases must use confirmed paid-and-delivered orders only.',
      'Analytics events must remain consent-gated and anonymous.',
      'Campaign attribution must avoid double-counting same-session conversions.',
      'Wishlist, cart and purchase flows must be linked using the same visitor and session identifiers.',
      'Synthetic documents must be traceable via isSynthetic, seedRunId, seedScenario and createdBySeed.',
    ],
  }
}

export function validateSyntheticSeedEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const resolvedEnv = env === process.env ? (() => {
    loadRuntimeEnv()
    return process.env
  })() : env
  const verification = getDatabaseVerification(resolvedEnv)
  const issues: string[] = []

  if (verification.environmentName !== 'staging') {
    issues.push('NODE_ENV must be staging before synthetic analytics data may be generated.')
  }
  if (verification.databaseName !== 'off_studio_staging') {
    issues.push('The connected database must be exactly off_studio_staging.')
  }
  if (!verification.clusterHost || !verification.clusterHost.toLowerCase().includes('off-studio-staging')) {
    issues.push('The cluster hostname must match the verified OFF Studio staging Atlas cluster.')
  }
  if (!verification.syntheticDataPermission) {
    issues.push('ALLOW_SYNTHETIC_DATA must be true and the target must match the verified staging database.')
  }

  try {
    assertVerifiedStagingSeed(env)
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Synthetic seed validation failed.')
  }

  return {
    ok: issues.length === 0,
    verification,
    issues,
  }
}

export function syntheticDocumentMetadata(seedScenario: string, seedRunId: string) {
  return {
    isSynthetic: true,
    seedRunId,
    seedScenario,
    createdBySeed: true,
  }
}

export function syntheticCheckoutStep(index: number): 'shipping_information_completed' | 'order_confirmed' {
  return index % 2 === 0 ? 'shipping_information_completed' : 'order_confirmed'
}

export type SyntheticOrderTouch = {
  source: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

export type SyntheticOrderAttribution = {
  analyticsVisitorId: string | null
  analyticsSessionId: string | null
  analyticsFirstTouch?: SyntheticOrderTouch
  analyticsLastTouch?: SyntheticOrderTouch
}

export function synthesizeOrderTouch(event: {
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  trafficSource?: string | null
  referrerHost?: string | null
}) : SyntheticOrderTouch {
  const source = event.utmSource ?? event.trafficSource ?? event.referrerHost ?? 'Direct'
  return {
    source,
    ...(event.utmMedium ? { medium: event.utmMedium } : {}),
    ...(event.utmCampaign ? { campaign: event.utmCampaign } : {}),
    ...(event.utmContent ? { content: event.utmContent } : {}),
    ...(event.utmTerm ? { term: event.utmTerm } : {}),
  }
}

export function deriveSyntheticOrderAttribution(
  placedAt: Date | string,
  events: Array<{
    visitorId: string
    sessionId: string
    occurredAt: Date | string
    type?: string
    utmSource?: string | null
    utmMedium?: string | null
    utmCampaign?: string | null
    utmContent?: string | null
    utmTerm?: string | null
    trafficSource?: string | null
    referrerHost?: string | null
  }>,
): SyntheticOrderAttribution | null {
  const orderTime = new Date(placedAt).getTime()
  const priorEvents = events
    .filter((event) => new Date(event.occurredAt).getTime() < orderTime)
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())

  if (!priorEvents.length) return null

  const latest = priorEvents[priorEvents.length - 1]
  const sameVisitorEvents = priorEvents.filter((event) => event.visitorId === latest.visitorId)
  const relevantTouchEvents = sameVisitorEvents.filter((event) => ['campaign_visit', 'session_start', 'begin_checkout'].includes(event.type ?? ''))
  const firstTouchEvent = relevantTouchEvents.length ? relevantTouchEvents.reduce((earliest, current) =>
    new Date(current.occurredAt).getTime() < new Date(earliest.occurredAt).getTime() ? current : earliest,
  ) : latest
  const lastTouchEvent = relevantTouchEvents.length ? relevantTouchEvents.reduce((latestTouch, current) =>
    new Date(current.occurredAt).getTime() > new Date(latestTouch.occurredAt).getTime() ? current : latestTouch,
  ) : latest

  return {
    analyticsVisitorId: latest.visitorId,
    analyticsSessionId: latest.sessionId,
    analyticsFirstTouch: synthesizeOrderTouch(firstTouchEvent),
    analyticsLastTouch: synthesizeOrderTouch(lastTouchEvent),
  }
}

export function syntheticDeleteGuard(document: { isSynthetic?: unknown; seedRunId?: unknown }) {
  return document?.isSynthetic === true && typeof document.seedRunId === 'string' && document.seedRunId.trim().length > 0
}

export async function generateSyntheticSeedData(overrides: Partial<SyntheticSeedConfig> = {}) {
  loadRuntimeEnv()

  const validation = validateSyntheticSeedEnvironment(process.env)
  if (!validation.ok) {
    throw new Error(`Synthetic seed validation failed: ${validation.issues.join(' ')}`)
  }

  const config: SyntheticSeedConfig = {
    ...defaultSyntheticSeedConfig,
    ...overrides,
    runId: overrides.runId ?? createSyntheticSeedRunId(),
  }

  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required to generate synthetic staging data.')
  }

  await mongoose.connect(normalizeMongoUri(mongoUri), { serverSelectionTimeoutMS: 10000 })

  try {
    const existingRunId = config.runId
    const [categoryCount, collectionCount, productCount, customerCount, orderCount, analyticsCount] = await Promise.all([
      Category.countDocuments({ isSynthetic: true, seedRunId: existingRunId }),
      Collection.countDocuments({ isSynthetic: true, seedRunId: existingRunId }),
      Product.countDocuments({ isSynthetic: true, seedRunId: existingRunId }),
      Customer.countDocuments({ isSynthetic: true, seedRunId: existingRunId }),
      Order.countDocuments({ isSynthetic: true, seedRunId: existingRunId }),
      AnalyticsEvent.countDocuments({ isSynthetic: true, seedRunId: existingRunId }),
    ])

    const completeTargetReached = categoryCount >= config.categories
      && collectionCount >= config.collections
      && productCount >= config.products
      && customerCount >= config.customers
      && orderCount >= config.orders
      && analyticsCount >= config.analyticsEvents + config.ctaEvents

    if (completeTargetReached) {
      return {
        seedRunId: existingRunId,
        skipped: true,
        totals: {
          categoryCount,
          collectionCount,
          productCount,
          customerCount,
          orderCount,
          analyticsCount,
        },
      }
    }

    const categoryNames = Array.from({ length: config.categories }, (_, index) => ({
      name: `Synthetic Category ${index + 1}`,
      slug: `synthetic-category-${index + 1}`,
      description: 'Synthetic category created for staging analytics validation.',
      image: `https://images.unsplash.com/photo-${(index % 10) + 1}0?auto=format&fit=crop&w=900&q=85`,
      displayOrder: index,
      status: 'active',
      isSynthetic: true,
      seedRunId: existingRunId,
      seedScenario: 'dataset_prep',
      createdBySeed: true,
    }))

    let categoryDocs: any[] = await Category.find({ isSynthetic: true, seedRunId: existingRunId }).sort({ displayOrder: 1 }).lean()
    if (categoryDocs.length < categoryNames.length) {
      const existingSlugs = new Set(categoryDocs.map((category) => category.slug))
      const missingCategoryDocs = categoryNames.filter((category) => !existingSlugs.has(category.slug))
      if (missingCategoryDocs.length > 0) {
        const insertedCategories = await Category.insertMany(missingCategoryDocs)
        categoryDocs = [...categoryDocs, ...insertedCategories]
      }
    }

    const productDocs: any[] = Array.from({ length: config.products }, (_, index) => {
      const category = categoryDocs[index % categoryDocs.length]
      const variantSizes = ['XS', 'S', 'M', 'L', 'XL']
      const variantColors = ['Black', 'White', 'Navy', 'Cream', 'Stone', 'Sand']
      const basePrice = 300 + ((index * 37) % 1800)
      const productName = `Synthetic Product ${index + 1}`
      return {
        name: productName,
        slug: `synthetic-product-${index + 1}`,
        description: 'Synthetic product used to validate OFF Studio analytics and opportunity scoring.',
        shortDescription: 'Synthetic product stage dataset.',
        categoryId: category._id,
        category: category.name,
        images: [{ url: `https://images.unsplash.com/photo-${(index % 12) + 1}0?auto=format&fit=crop&w=900&q=85`, alt: productName, order: 0 }],
        price: basePrice,
        status: 'active',
        featured: index < 10,
        isSynthetic: true,
        seedRunId: existingRunId,
        seedScenario: 'product_catalog',
        createdBySeed: true,
        variants: variantSizes.map((size, sizeIndex) => ({
          sku: `SYN-${String(index + 1).padStart(3, '0')}-${size}`,
          color: variantColors[(index + sizeIndex) % variantColors.length],
          size,
          price: basePrice,
          stock: 2 + ((index + sizeIndex) % 12),
          image: `https://images.unsplash.com/photo-${(index % 12) + 1}0?auto=format&fit=crop&w=900&q=85`,
          active: true,
        })),
      }
    })

    let createdProducts: any[] = await Product.find({ isSynthetic: true, seedRunId: existingRunId }).sort({ name: 1 }).lean()
    if (createdProducts.length < config.products) {
      const existingProductSlugs = new Set(createdProducts.map((product) => String(product.slug)))
      const missingProducts = productDocs.filter((product) => !existingProductSlugs.has(product.slug))
      if (missingProducts.length > 0) {
        const insertedProducts = await Product.insertMany(missingProducts)
        createdProducts = [...createdProducts, ...insertedProducts]
      }
    }

    const collectionDocs: any[] = Array.from({ length: config.collections }, (_, index) => {
      const productIds = createdProducts.slice(index * 7, (index * 7) + 7).map((product) => product._id)
      return {
        name: `Synthetic Collection ${index + 1}`,
        slug: `synthetic-collection-${index + 1}`,
        description: 'Synthetic collection used for analytics reporting validation.',
        image: `https://images.unsplash.com/photo-${(index % 9) + 1}0?auto=format&fit=crop&w=900&q=85`,
        productIds,
        displayOrder: index,
        status: 'active',
        isSynthetic: true,
        seedRunId: existingRunId,
        seedScenario: 'collection_performance',
        createdBySeed: true,
      }
    })

    let insertedCollections: any[] = await Collection.find({ isSynthetic: true, seedRunId: existingRunId }).sort({ displayOrder: 1 }).lean()
    if (insertedCollections.length < config.collections) {
      const existingCollectionSlugs = new Set(insertedCollections.map((collection) => collection.slug))
      const missingCollections = collectionDocs.filter((collection) => !existingCollectionSlugs.has(collection.slug))
      if (missingCollections.length > 0) {
        const inserted = await Collection.insertMany(missingCollections)
        insertedCollections = [...insertedCollections, ...inserted]
      }
    }

    const customerDocs: any[] = Array.from({ length: config.customers }, (_, index) => ({
      name: `Synthetic Customer ${index + 1}`,
      email: `synthetic.customer.${index + 1}@example.com`,
      phoneNumber: `+216${String(10000000 + index).slice(0, 8)}`,
      orderCount: 0,
      totalSpent: 0,
      addresses: [{
        label: 'Home',
        fullName: `Synthetic Customer ${index + 1}`,
        phoneNumber: `+216${String(10000000 + index).slice(0, 8)}`,
        addressLine1: `${index + 10} Avenue de la Synthèse`,
        addressLine2: '',
        city: 'Tunis',
        postalCode: '1000',
        country: 'TN',
        governorate: 'Tunis',
        delegation: 'Tunis',
        isDefault: true,
      }],
      communicationPreferences: { newsletter: index % 2 === 0, marketingEmails: index % 3 === 0 },
      status: 'active',
      isSynthetic: true,
      seedRunId: existingRunId,
      seedScenario: 'customer_cohorts',
      createdBySeed: true,
    }))

    let insertedCustomers: any[] = await Customer.find({ isSynthetic: true, seedRunId: existingRunId }).sort({ email: 1 }).lean()
    if (insertedCustomers.length < config.customers) {
      const existingCustomerEmails = new Set(insertedCustomers.map((customer) => customer.email))
      const missingCustomers = customerDocs.filter((customer) => !existingCustomerEmails.has(customer.email))
      if (missingCustomers.length > 0) {
        const inserted = await Customer.insertMany(missingCustomers)
        insertedCustomers = [...insertedCustomers, ...inserted]
      }
    }

    const wishlistProductIdsByCustomer = new Map<string, mongoose.Types.ObjectId[]>()
    const wishlistEntriesTarget = config.wishlistEntries
    const wishlistProductIds = createdProducts.map((product) => product._id)
    let remainingWishlist = wishlistEntriesTarget
    for (const customer of insertedCustomers) {
      const take = remainingWishlist > 0 ? Math.min(2, remainingWishlist) : 0
      const selected = [...wishlistProductIds].sort(() => Math.random() - 0.5).slice(0, take)
      wishlistProductIdsByCustomer.set(String(customer._id), selected)
      remainingWishlist -= take
    }

    if (wishlistEntriesTarget > 0) {
      const customerWishlistBulk = insertedCustomers.map((customer) => ({
        updateOne: {
          filter: { _id: customer._id },
          update: { $set: { wishlistProductIds: wishlistProductIdsByCustomer.get(String(customer._id)) ?? [] } },
        },
      }))
      await Customer.bulkWrite(customerWishlistBulk)
    }

    const paymentMethods = ['cash_on_delivery']
    const orderDocuments = [] as any[]
    const orderNumberStart = 800000 + Math.floor(Math.random() * 100000)
    const orderStatusDistribution = ['delivered', 'in_delivery', 'processing', 'confirmation', 'cancelled', 'returned']

    for (let index = 0; index < config.orders; index += 1) {
      const customer = insertedCustomers[index % insertedCustomers.length]
      const itemCount = 1 + (index % 3)
      const items = Array.from({ length: itemCount }, (_, itemIndex) => {
        const product = createdProducts[(index + itemIndex) % createdProducts.length]
        const variant = product.variants[(index + itemIndex) % product.variants.length]
        const quantity = 1 + ((index + itemIndex) % 2)
        return {
          productId: product._id,
          name: product.name,
          image: product.images[0]?.url ?? '',
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          unitPrice: variant.price,
          quantity,
        }
      })

      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      const status = orderStatusDistribution[index % orderStatusDistribution.length]
      const isPaid = ['delivered', 'in_delivery', 'processing'].includes(status)
      const paymentStatus = isPaid ? 'paid' : 'unpaid'
      const shippingAmount = 35 + ((index * 13) % 90)
      const discountAmount = index % 7 === 0 ? 50 + ((index * 7) % 120) : 0
      const taxAmount = Math.round((subtotal * 0.07) * 100) / 100
      const total = subtotal + shippingAmount + taxAmount - discountAmount
      const placedAt = new Date(Date.now() - (index * 2_000_000) - (index % 15) * 86_400_000)
      const orderNumber = `OFF-SYN-${orderNumberStart + index}`
      orderDocuments.push({
        orderNumber,
        customerId: customer._id,
        customerName: customer.name,
        customerEmail: customer.email,
        items,
        shippingAddress: {
          fullName: customer.name,
          phoneNumber: customer.phoneNumber,
          line1: `${index + 12} Rue de la Synthèse`,
          line2: '',
          city: 'Tunis',
          postalCode: '1000',
          country: 'TN',
          governorate: 'Tunis',
          delegation: 'Tunis',
        },
        subtotal,
        shippingAmount,
        discountAmount,
        taxAmount,
        total,
        currency: 'TND',
        paymentMethod: paymentMethods[0],
        paymentStatus,
        gatewayPaymentStatus: isPaid ? 'paid' : 'pending',
        fulfillmentStatus: status,
        source: 'online',
        placedAt,
        isSynthetic: true,
        seedRunId: existingRunId,
        seedScenario: 'order_funnel',
        createdBySeed: true,
      })
    }

    const existingOrderNumbers = new Set((await Order.find({ isSynthetic: true, seedRunId: existingRunId }).select('orderNumber').lean()).map((order) => order.orderNumber))
    const missingOrders = orderDocuments.filter((order) => !existingOrderNumbers.has(order.orderNumber))
    const insertedOrders = missingOrders.length > 0 ? await Order.insertMany(missingOrders) : []

    const campaignNames = Array.from({ length: config.campaigns }, (_, index) => `campaign-${index + 1}`)
    const visitorSessions = config.visitorSessions
    const analyticsEventDocs: any[] = []
    const ctaEvents: any[] = []
    const eventTypePool = ['page_view', 'session_start', 'product_view', 'wishlist_add', 'add_to_cart', 'begin_checkout', 'checkout_step', 'cta_impression', 'cta_click', 'campaign_visit']

    for (let index = 0; index < config.analyticsEvents; index += 1) {
      const product = createdProducts[index % createdProducts.length]
      const sessionId = `session-${(index % visitorSessions) + 1}`
      const visitorId = `visitor-${(index % (config.customers * 2)) + 1}`
      const type = eventTypePool[index % eventTypePool.length]
      const utmCampaign = campaignNames[index % campaignNames.length]
      analyticsEventDocs.push({
        eventId: `analytics-${String(index).padStart(5, '0')}`,
        type,
        ...(type === 'checkout_step' ? { checkoutStep: syntheticCheckoutStep(index) } : {}),
        visitorId,
        sessionId,
        occurredAt: new Date(Date.now() - (index % 180) * 86_400_000),
        page: ['/shop', '/product', '/cart', '/checkout', '/collections', '/account/wishlist'][index % 6],
        trafficSource: ['google', 'instagram', 'email', 'direct', 'social'][index % 5],
        referrerHost: 'example.com',
        deviceCategory: ['desktop', 'mobile', 'tablet'][index % 3],
        productId: type.includes('product') || type === 'add_to_cart' ? product._id : undefined,
        variantSize: type.includes('product') || type === 'add_to_cart' ? product.variants[0].size : undefined,
        variantColor: type.includes('product') || type === 'add_to_cart' ? product.variants[0].color : undefined,
        collectionId: index % 3 === 0 ? insertedCollections[index % insertedCollections.length]._id : undefined,
        utmSource: ['google', 'newsletter', 'instagram', 'facebook'][index % 4],
        utmMedium: ['cpc', 'email', 'social', 'organic'][index % 4],
        utmCampaign,
        isSynthetic: true,
        seedRunId: existingRunId,
        seedScenario: 'analytics_events',
        createdBySeed: true,
      })

      if (index < config.ctaEvents) {
        ctaEvents.push({
          eventId: `cta-${String(index).padStart(5, '0')}`,
          type: index % 3 === 0 ? 'cta_click' : 'cta_impression',
          visitorId: `visitor-${(index % (config.customers * 2)) + 1}`,
          sessionId: `session-${(index % visitorSessions) + 1}`,
          occurredAt: new Date(Date.now() - (index % 120) * 43_200_000),
          page: '/collections',
          ctaId: `cta-${index % 20}`,
          ctaLabel: `Hero CTA ${index % 20}`,
          ctaLocation: ['homepage', 'collection', 'product', 'checkout'][index % 4],
          utmCampaign: campaignNames[index % campaignNames.length],
          trafficSource: ['google', 'newsletter', 'social'][index % 3],
          isSynthetic: true,
          seedRunId: existingRunId,
          seedScenario: 'cta_engagement',
          createdBySeed: true,
        })
      }
    }

    const analyticsBatches = [] as any[]
    const existingAnalyticsEvents = await AnalyticsEvent.countDocuments({ isSynthetic: true, seedRunId: existingRunId })
    const pendingAnalyticsEvents = analyticsEventDocs.slice(existingAnalyticsEvents, analyticsEventDocs.length)
    const pendingCtaEvents = ctaEvents.slice(existingAnalyticsEvents, ctaEvents.length)

    for (let batchStart = 0; batchStart < pendingAnalyticsEvents.length; batchStart += 5000) {
      analyticsBatches.push(pendingAnalyticsEvents.slice(batchStart, batchStart + 5000))
    }
    for (const batch of analyticsBatches) {
      await AnalyticsEvent.insertMany(batch)
    }
    if (pendingCtaEvents.length > 0) {
      await AnalyticsEvent.insertMany(pendingCtaEvents)
    }

    return {
      seedRunId: existingRunId,
      totals: {
        categoryCount: categoryDocs.length,
        collectionCount: insertedCollections.length,
        productCount: createdProducts.length,
        customerCount: insertedCustomers.length,
        orderCount: insertedOrders.length,
        analyticsCount: analyticsEventDocs.length + ctaEvents.length,
        wishlistCount: wishlistEntriesTarget,
        campaignCount: campaignNames.length,
        sessionCount: visitorSessions,
      },
      validation: {
        environment: process.env.NODE_ENV,
        database: process.env.MONGODB_DB_NAME,
        syntheticDataPermission: validation.verification.syntheticDataPermission,
      },
    }
  } finally {
    await mongoose.disconnect().catch(() => undefined)
  }
}
