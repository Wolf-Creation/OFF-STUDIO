import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

const stagingEnvPath = path.resolve(__dirname, '../../apps/api/.env.staging')
const stagingEnv = fs.existsSync(stagingEnvPath)
  ? dotenv.parse(fs.readFileSync(stagingEnvPath))
  : {}

export const storefrontUrl = process.env.STAGING_FRONTEND_URL ?? 'http://localhost:5173'
export const adminUrl = process.env.STAGING_ADMIN_URL ?? 'http://localhost:5174'
export const apiBaseUrl = process.env.STAGING_API_BASE_URL ?? 'http://127.0.0.1:5000/api/v1'

type RuntimeProduct = {
  _id: string
  slug: string
  name: string
  price: number
  isSynthetic?: boolean
  createdBySeed?: boolean
  variants: Array<{
    sku: string
    color: string
    size: string
    price: number
    stock: number
    active: boolean
  }>
}

type RuntimeOrder = {
  _id: string
  orderNumber: string
  fulfillmentStatus: string
  paymentStatus: string
}

let cachedAdminToken: string | undefined
let adminLoginRateLimitReason: string | undefined
let nextScenarioAt = 0

function isLocalHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

function configuredForStaging() {
  let uri: URL
  try {
    uri = new URL(process.env.MONGODB_URI ?? '')
  } catch {
    return false
  }

  const parsedStagingUri = new URL(stagingEnv.MONGODB_URI ?? 'http://invalid.local')
  return process.env.NODE_ENV === 'staging'
    && process.env.MONGODB_DB_NAME === 'off_studio_staging'
    && process.env.ALLOW_SYNTHETIC_DATA === 'false'
    && process.env.ONLINE_PAYMENT_ENABLED === 'false'
    && Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.JWT_SECRET)
    && uri.protocol === 'mongodb+srv:'
    && uri.hostname === 'off-studio-staging-clus.dxcqee5.mongodb.net'
    && uri.pathname === '/off_studio_staging'
    && uri.searchParams.get('authSource') === 'admin'
    && uri.hostname === parsedStagingUri.hostname
    && decodeURIComponent(uri.username) === 'off_studio_staging_app'
    && isLocalHttpUrl(apiBaseUrl)
    && isLocalHttpUrl(storefrontUrl)
    && isLocalHttpUrl(adminUrl)
}

export async function assertStagingTarget(request: APIRequestContext) {
  expect(configuredForStaging(), 'E2E refuses non-staging or non-local targets').toBe(true)

  const response = await request.get(`${apiBaseUrl}/health`)
  expect(response.status(), 'Staging health must be ready before each test').toBe(200)
  const health = await response.json()
  expect(health).toMatchObject({
    status: 'ready',
    database: 'connected',
    mode: 'staging',
    databaseName: 'off_studio_staging',
    targetVerified: true,
    onlinePaymentEnabled: false,
    syntheticDataPermission: false,
  })
}

export async function getProducts(request: APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/products?limit=100`)
  expect(response.status(), 'Staging product catalog should be readable').toBe(200)
  const payload = await response.json()
  expect(Array.isArray(payload.data)).toBe(true)
  return payload.data as RuntimeProduct[]
}

export async function getAvailableProduct(request: APIRequestContext, minStock = 1) {
  const products = await getProducts(request)
  const product = products.find(item => item.variants?.some(variant =>
    variant.active && variant.stock >= minStock,
  ))
  base.skip(!product, `No active catalog variant has at least ${minStock} unit(s) in stock.`)
  if (!product) throw new Error('No eligible active product was available after the staging stock check.')
  const variant = product.variants.find(item => item.active && item.stock >= minStock)
  if (!variant) throw new Error('The selected product no longer has the required variant stock.')
  return { product, variant }
}

export async function selectProductVariant(page: Page, product: RuntimeProduct, variant: RuntimeProduct['variants'][number]) {
  await page.goto(`${storefrontUrl}/product/${encodeURIComponent(product.slug)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Select color ${variant.color}`, exact: true }).click()
  await page.getByRole('button', { name: `Size ${variant.size}`, exact: true }).click()
  await expect(page.getByRole('button', { name: 'ADD TO BAG' })).toBeEnabled()
}

export async function signInAdmin(request: APIRequestContext) {
  if (adminLoginRateLimitReason) base.skip(true, adminLoginRateLimitReason)

  if (cachedAdminToken) {
    const response = await request.get(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${cachedAdminToken}` },
    })
    if (response.status() === 200) return cachedAdminToken
    cachedAdminToken = undefined
  }

  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    },
  })
  if (response.status() === 429) {
    adminLoginRateLimitReason = 'Staging admin login is rate-limited (HTTP 429); retry admin scenarios after the API limiter window resets.'
    base.skip(true, adminLoginRateLimitReason)
  }
  expect(response.status(), 'Staging admin sign-in should succeed').toBe(200)
  const payload = await response.json()
  const token = payload.data?.token
  expect(typeof token).toBe('string')
  expect(token.length).toBeGreaterThan(0)
  cachedAdminToken = token as string
  return cachedAdminToken
}

export async function openAuthenticatedAdmin(page: Page, token: string, route: string) {
  await page.addInitScript(value => {
    sessionStorage.setItem('off-admin-token', value)
  }, token)
  const response = await page.goto(`${adminUrl}${route}`, { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
}

export async function getAdminOrders(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseUrl}/admin-preview/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  const payload = await response.json()
  expect(Array.isArray(payload.data)).toBe(true)
  return payload.data as RuntimeOrder[]
}

export const test = base.extend<{ stagingGuard: void }>({
  stagingGuard: [async ({ request }, use) => {
    const scenarioDelay = Math.max(0, nextScenarioAt - Date.now())
    if (scenarioDelay > 0) await new Promise(resolve => setTimeout(resolve, scenarioDelay))
    await assertStagingTarget(request)
    // Keep browser traffic below the API's observed global 120-requests/minute limit.
    nextScenarioAt = Date.now() + 20_000
    await use()
    await assertStagingTarget(request)
  }, { auto: true }],
})

export { expect }
