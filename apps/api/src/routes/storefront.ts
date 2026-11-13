import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { CookieConsentLog } from '../models/CookieConsentLog.js'
import { StoreConfig } from '../models/StoreConfig.js'
import { WebsiteConfig } from '../models/WebsiteConfig.js'
import { WebsitePage } from '../models/WebsitePage.js'
import { isOnlinePaymentEnabled } from '../runtimeConfig.js'

const router = Router()
const consentLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false })
const consentSchema = z.object({
  visitorId: z.string().uuid(),
  preferences: z.object({
    necessary: z.literal(true),
    functional: z.boolean(),
    analytics: z.boolean(),
    marketing: z.boolean(),
  }).strict(),
  action: z.enum(['accept_all', 'reject_all', 'custom']),
  policyVersion: z.literal('2026-11-v1'),
}).strict().superRefine(({ action, preferences }, context) => {
  const allOptionalEnabled = preferences.functional && preferences.analytics && preferences.marketing
  const allOptionalDisabled = !preferences.functional && !preferences.analytics && !preferences.marketing
  if ((action === 'accept_all' && !allOptionalEnabled) || (action === 'reject_all' && !allOptionalDisabled)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['action'], message: 'Consent action does not match the saved preferences.' })
  }
})

router.get('/content/home', async (_request, response, next) => {
  try {
    const page = await WebsitePage.findOne({ slug: 'home', publishedVersion: { $gt: 0 }, status: { $ne: 'archived' } }).select('publishedSections publishedVersion publishedAt').lean()
    response.json({ data: page ? { sections: page.publishedSections, version: page.publishedVersion, publishedAt: page.publishedAt } : null })
  } catch (error) { next(error) }
})

router.get('/content/pages/:slug', async (request, response, next) => {
  try {
    const page = await WebsitePage.findOne({ slug: request.params.slug, publishedVersion: { $gt: 0 }, status: { $ne: 'archived' } }).select('name slug pageType publishedSections publishedVersion publishedAt').lean()
    if (!page) { response.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    response.json({ data: page })
  } catch (error) { next(error) }
})

router.get('/content/navigation', async (_request, response, next) => {
  try {
    const config = await WebsiteConfig.findOne({ key: 'website' }).select('published').lean()
    response.json({ data: config?.published?.navigation ?? null })
  } catch (error) { next(error) }
})

router.get('/content/settings', async (_request, response, next) => {
  try {
    const config = await WebsiteConfig.findOne({ key: 'website' }).select('published').lean()
    response.json({ data: config?.published?.settings ?? null })
  } catch (error) { next(error) }
})

router.get('/content', async (_request, response, next) => {
  try {
    const config = await StoreConfig.findOne({ key: 'store' }).lean()
    response.json({
      data: {
        announcement: config?.announcement ?? 'Complimentary shipping on orders over 500 TND',
        advertisementMessages: config?.advertisementMessages ?? [],
        heroEyebrow: config?.heroEyebrow ?? 'OFF — SPRING / SUMMER 25',
        heroTitle: config?.heroTitle ?? 'ARTS DISTRICT LOS ANGELES',
        heroSubtitle: config?.heroSubtitle ?? 'A modern expression of luxury.',
        campaignEyebrow: config?.campaignEyebrow ?? 'THE OFF UNIFORM',
        campaignTitle: config?.campaignTitle ?? 'Made for the everyday.',
        freeShippingThreshold: config?.freeShippingThreshold ?? 500,
        supportEmail: config?.supportEmail ?? '',
        onlinePaymentEnabled: isOnlinePaymentEnabled(),
      },
    })
  } catch (error) {
    next(error)
  }
})

router.post('/consents', consentLimit, async (request, response, next) => {
  try {
    const parsed = consentSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_COOKIE_CONSENT', message: 'Cookie consent preferences are invalid.' } })
      return
    }
    const log = await CookieConsentLog.create(parsed.data)
    response.status(201).json({ data: { id: String(log._id), createdAt: log.createdAt } })
  } catch (error) {
    next(error)
  }
})

export const storefrontRouter = router
