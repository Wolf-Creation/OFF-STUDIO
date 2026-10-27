import mongoose from 'mongoose'
import { Category } from './models/Category.js'
import { Collection } from './models/Collection.js'
import { Customer } from './models/Customer.js'
import { Order } from './models/Order.js'
import { orderQrTokenHashForId } from './orderQr.js'
import { Product } from './models/Product.js'

const image = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`

const demoCategories = [
  ['Ready-to-Wear', 'photo-1529139574466-a303027c1d8b'],
  ['Denim', 'photo-1542272604-787c3835535d'],
  ['Outerwear', 'photo-1551028719-00167b16eac5'],
  ['T-Shirts', 'photo-1521572163474-6864f9cf17ab'],
  ['Shirts', 'photo-1503342217505-b0a15ec3261c'],
  ['Sweaters', 'photo-1556821840-3a63f95609a7'],
  ['Pants', 'photo-1515886657613-9f3515b0c78f'],
  ['Shorts', 'photo-1539109136881-3be0616acf4b'],
  ['Accessories', 'photo-1521369909029-2afed882baee'],
  ['Footwear', 'photo-1542291026-7eec264c27ff'],
] as const

const demoProducts = [
  { name: 'MA QUAAD JACKET', category: 'Ready-to-Wear', color: 'Black', price: 3490, image: 'photo-1551028719-00167b16eac5', sizes: ['XS', 'S', 'M', 'L', 'XL'] },
  { name: 'DISTRESSED DENIM JEANS', category: 'Denim', color: 'Vintage Blue', price: 1280, image: 'photo-1542272604-787c3835535d', sizes: ['XS', 'S', 'M', 'L'] },
  { name: 'LOGO T-SHIRT', category: 'T-Shirts', color: 'White', price: 690, image: 'photo-1521572163474-6864f9cf17ab', sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'SKELETON SNEAKERS', category: 'Footwear', color: 'Black / White', price: 980, image: 'photo-1542291026-7eec264c27ff', sizes: ['S', 'M', 'L'] },
  { name: 'MA CAP', category: 'Accessories', color: 'Black', price: 450, image: 'photo-1588850561407-ed78c282e89b', sizes: ['M', 'L', 'XL'] },
  { name: 'LEATHER JACKET', category: 'Outerwear', color: 'Dark Brown', price: 4200, image: 'photo-1551028719-00167b16eac5', sizes: ['XS', 'S', 'M', 'L'] },
  { name: 'CARGO TROUSER', category: 'Pants', color: 'Stone', price: 1120, image: 'photo-1515886657613-9f3515b0c78f', sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'OVERSIZED HOODIE', category: 'Sweaters', color: 'Charcoal', price: 890, image: 'photo-1556821840-3a63f95609a7', sizes: ['XS', 'S', 'M', 'L'] },
] as const
const demoCustomers = [
  { name: 'John Doe', email: 'john.doe@example.com', orderCount: 5, totalSpent: 7230 },
  { name: 'Sarah L.', email: 'sarah.l@example.com', orderCount: 3, totalSpent: 2450 },
  { name: 'Michael T.', email: 'michael@example.com', orderCount: 2, totalSpent: 4900 },
  { name: 'Emma R.', email: 'emma@example.com', orderCount: 4, totalSpent: 1380 },
  { name: 'David K.', email: 'david@example.com', orderCount: 2, totalSpent: 8200 },
  { name: 'Olivia M.', email: 'olivia@example.com', orderCount: 1, totalSpent: 450 },
  { name: 'James P.', email: 'james@example.com', orderCount: 6, totalSpent: 3210 },
  { name: 'Sophia K.', email: 'sophia@example.com', orderCount: 3, totalSpent: 1960 },
] as const
const demoOrders = [
  { orderNumber: 'OFF1024', customerEmail: 'john.doe@example.com', total: 3490, fulfillmentStatus: 'processing', day: 30 },
  { orderNumber: 'OFF1023', customerEmail: 'sarah.l@example.com', total: 1280, fulfillmentStatus: 'delivered', day: 29 },
  { orderNumber: 'OFF1022', customerEmail: 'michael@example.com', total: 980, fulfillmentStatus: 'in_delivery', day: 28 },
  { orderNumber: 'OFF1021', customerEmail: 'emma@example.com', total: 690, fulfillmentStatus: 'delivered', day: 27 },
  { orderNumber: 'OFF1020', customerEmail: 'david@example.com', total: 4200, fulfillmentStatus: 'processing', day: 26 },
  { orderNumber: 'OFF1019', customerEmail: 'olivia@example.com', total: 450, fulfillmentStatus: 'cancelled', day: 25 },
  { orderNumber: 'OFF1018', customerEmail: 'james@example.com', total: 1120, fulfillmentStatus: 'delivered', day: 24 },
  { orderNumber: 'OFF1017', customerEmail: 'sophia@example.com', total: 890, fulfillmentStatus: 'in_delivery', day: 23 },
] as const

export async function seedDemoData() {
  let seededCategories = 0
  let seededCollections = 0
  let seededProducts = 0
  let seededCustomers = 0
  let seededOrders = 0

  if (await Category.countDocuments() === 0) {
    await Category.insertMany(demoCategories.map(([name, imageId], displayOrder) => ({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      image: image(imageId),
      displayOrder,
      status: 'active',
    })))
    seededCategories = demoCategories.length
  }

  if (await Product.countDocuments() === 0) {
    const categories = await Category.find().select('_id name slug').lean()
    const categoryMap = new Map(categories.map((category) => [category.name, category]))
    const documents = demoProducts.map((product, productIndex) => {
      const category = categoryMap.get(product.category)
      if (!category) throw new Error(`Cannot seed product: category "${product.category}" is missing.`)
      const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      return {
        name: product.name,
        slug,
        categoryId: category._id,
        category: category.name,
        shortDescription: 'A considered OFF essential, made for everyday movement.',
        description: 'A modern essential with considered materials and elevated details.',
        images: [{ url: image(product.image), alt: product.name, order: 0 }],
        price: product.price,
        status: 'active',
        featured: productIndex < 3,
        variants: product.sizes.map((size, sizeIndex) => ({
          sku: `OFF-${String(productIndex + 1).padStart(3, '0')}-${size}`,
          color: product.color,
          size,
          price: product.price,
          stock: sizeIndex === 4 ? 0 : 8,
          image: image(product.image),
          active: true,
        })),
      }
    })
    await Product.insertMany(documents)
    seededProducts = documents.length
  }

  if (await Collection.countDocuments() === 0) {
    const products = await Product.find({ status: 'active' }).select('_id category featured').lean()
    const featured = products.filter(product => product.featured)
    const collectionDefinitions = [
      { name: 'The OFF Edit', description: 'Considered pieces for the everyday.', productIds: products.map(product => product._id) },
      { name: 'Ready-to-Wear', description: 'Essential forms. Unexpected details.', productIds: products.filter(product => product.category === 'Ready-to-Wear' || product.category === 'Outerwear').map(product => product._id) },
      { name: 'Accessories', description: 'The details that complete the look.', productIds: products.filter(product => product.category === 'Accessories' || product.category === 'Footwear').map(product => product._id) },
      { name: 'New Arrivals', description: 'The latest pieces from OFF.', productIds: featured.map(product => product._id) },
    ]
    const populatedCollections = collectionDefinitions.filter(collection => collection.productIds.length > 0)
    if (populatedCollections.length) {
      await Collection.insertMany(populatedCollections.map((collection, displayOrder) => ({
        ...collection,
        slug: collection.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        image: image(collection.name === 'Accessories' ? 'photo-1521369909029-2afed882baee' : 'photo-1529139574466-a303027c1d8b'),
        displayOrder,
        status: 'active',
      })))
      seededCollections = populatedCollections.length
    }
  }

  if (await Customer.countDocuments() === 0) {
    await Customer.insertMany(demoCustomers.map((customer) => ({ ...customer, status: 'active' })))
    seededCustomers = demoCustomers.length
  }

  if (await Order.countDocuments() === 0 && await Customer.countDocuments() > 0) {
    const customers = await Customer.find({ email: { $in: demoOrders.map((order) => order.customerEmail) } }).select('_id name email').lean()
    const customerMap = new Map(customers.map((customer) => [customer.email, customer]))
    const orders = demoOrders.flatMap((order) => {
      const customer = customerMap.get(order.customerEmail)
      if (!customer) return []
      const orderId = new mongoose.Types.ObjectId()
      return [{
        _id: orderId,
        qrTokenHash: orderQrTokenHashForId(String(orderId)),
        orderNumber: order.orderNumber,
        customerId: customer._id,
        customerName: customer.name,
        customerEmail: customer.email,
        total: order.total,
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.fulfillmentStatus === 'delivered' ? 'paid' : 'unpaid',
        placedAt: new Date(Date.UTC(2025, 3, order.day, 12)),
      }]
    })
    await Order.insertMany(orders)
    seededOrders = orders.length
  }

  return { seededCategories, seededCollections, seededProducts, seededCustomers, seededOrders }
}
