import { Router } from 'express'
import { StoreConfig } from '../models/StoreConfig.js'
import { WebsiteConfig } from '../models/WebsiteConfig.js'
import { WebsitePage } from '../models/WebsitePage.js'

const router = Router()

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
      },
    })
  } catch (error) {
    next(error)
  }
})

export const storefrontRouter = router
