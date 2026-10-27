export type ProductStatus = 'active' | 'draft' | 'archived'
export type CategoryStatus = 'active' | 'hidden'
export type CollectionStatus = 'active' | 'hidden'
export type PaymentStatus = 'unpaid' | 'paid'
export type FulfillmentStatus = 'confirmation' | 'processing' | 'in_delivery' | 'delivered' | 'returned' | 'cancelled' | 'exchange'

export interface ApiResponse<T> {
  data: T
}

export interface ApiPagination {
  page: number
  limit: number
  total: number
  pages: number
}

export interface ProductImage {
  url: string
  alt: string
  order: number
}

export interface ProductVariant {
  sku: string
  color: string
  size: string
  price: number
  stock: number
  image: string
  active: boolean
}

export interface ApiProduct {
  _id: string
  name: string
  slug: string
  description: string
  shortDescription: string
  categoryId: string
  category: string
  images: ProductImage[]
  variants: ProductVariant[]
  price: number
  status: ProductStatus
  featured: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ProductWriteInput {
  name: string
  category: string
  price: number
  shortDescription: string
  description: string
  status: ProductStatus
  image: string
  images?: ProductImage[]
  featured: boolean
  variants: ProductVariantWriteInput[]
}

export interface ProductVariantWriteInput {
  sku: string
  color: string
  size: string
  price: number
  stock: number
  image: string
  active: boolean
}

export interface ApiCategory {
  _id: string
  name: string
  slug: string
  description: string
  image: string
  displayOrder: number
  productCount?: number
  status: CategoryStatus
}

export interface CategoryWriteInput {
  name: string
  description: string
  image: string
  displayOrder: number
  status: CategoryStatus
}

export interface ApiCollection {
  _id: string
  name: string
  slug: string
  description: string
  image: string
  productIds: string[]
  productCount?: number
  displayOrder: number
  status: CollectionStatus
}

export type StoreCollection = Pick<ApiCollection, '_id' | 'name' | 'slug' | 'description' | 'image' | 'productIds' | 'productCount' | 'displayOrder' | 'status'>

export interface CollectionWriteInput {
  name: string
  description: string
  image: string
  productIds: string[]
  displayOrder: number
  status: CollectionStatus
}

export interface ApiOrderItem {
  productId: string
  name: string
  image?: string
  sku: string
  color: string
  size: string
  unitPrice: number
  quantity: number
}

export interface ApiShippingAddress {
  fullName?: string
  line1: string
  line2: string
  phoneNumber?: string
  city: string
  postalCode?: string
  country: string
  governorate?: string
  delegation?: string
}

export interface ApiOrder {
  _id: string
  orderNumber: string
  customerId: string
  customerName: string
  customerEmail: string
  items: ApiOrderItem[]
  shippingAddress?: ApiShippingAddress
  orderNote?: string
  total: number
  currency: string
  paymentStatus: PaymentStatus
  gatewayPaymentStatus?: 'pending' | 'paid' | 'failed'
  fulfillmentStatus: FulfillmentStatus
  statusHistory?: { status: FulfillmentStatus; previousStatus?: FulfillmentStatus; changedAt: string; changedBy?: string }[]
  trackingNumber?: string
  source?: 'online' | 'manual'
  paymentMethod?: 'stripe' | 'cash_on_delivery'
  placedAt: string
}

export interface ManualOrderRequest {
  customer: { name: string; email?: string }
  shippingAddress: ApiShippingAddress
  items: { productId: string; sku: string; quantity: number }[]
  orderNote?: string
}

export interface ApiCustomer {
  name: string
  email: string
  orderCount: number
  totalSpent: number
}

export interface StoreContent {
  announcement: string
  advertisementMessages?: string[]
  heroEyebrow: string
  heroTitle: string
  heroSubtitle: string
  campaignEyebrow: string
  campaignTitle: string
  freeShippingThreshold: number
  supportEmail: string
}

export interface StoreSettings extends StoreContent {
  shippingSenderName?: string
  shippingSenderPhone?: string
  shippingSenderAddress?: string
}

export interface CheckoutRequest {
  customer: { name: string; email: string }
  shippingAddress: ApiShippingAddress
  items: { productId: string; sku: string; quantity: number }[]
}

export interface CheckoutResponse {
  checkoutUrl: string
  orderNumber: string
}

export interface CashOnDeliveryOrderRequest {
  customer: { name: string; email?: string }
  shippingAddress: ApiShippingAddress & { country: 'TN'; governorate: string; delegation: string }
  items: { productId: string; sku: string; quantity: number }[]
  orderNote?: string
}

export interface CashOnDeliveryOrderResponse {
  orderNumber: string
  total: number
  currency: 'TND'
}

export interface DashboardData {
  products: number
  customers: number
  orders: number
  totalSales: number
  recentOrders: ApiOrder[]
  dailySales: { _id: string; total: number }[]
  orderBreakdown: { _id: string; count: number }[]
}
