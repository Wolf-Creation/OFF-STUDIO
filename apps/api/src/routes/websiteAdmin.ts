import { Router } from 'express'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { z } from 'zod'
import { authenticateAdmin } from '../auth.js'
import { ContentRevision } from '../models/ContentRevision.js'
import { MediaAsset } from '../models/MediaAsset.js'
import { WebsiteConfig } from '../models/WebsiteConfig.js'
import { WebsitePage } from '../models/WebsitePage.js'
import { Product } from '../models/Product.js'
import { Collection } from '../models/Collection.js'
import { Category } from '../models/Category.js'

const router = Router()
const uploadRoot = fileURLToPath(new URL('../../uploads/', import.meta.url))
const sectionTypes = ['hero', 'featured-products', 'new-arrivals', 'collection', 'categories', 'editorial', 'brand', 'featured-release', 'newsletter', 'footer-announcement', 'rich-text'] as const
const safeUrl = z.string().trim().max(2048).refine(value => {
  if (value === '') return true
  if (/^[\u0000-\u0020]/.test(value) || /["'<>\\]/.test(value)) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}, 'Use a local path or a secure https URL.')
const sectionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(sectionTypes),
  title: z.string().trim().max(160).default(''),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(100),
  settings: z.record(z.unknown()).default({}),
}).superRefine((section, context) => {
  for (const key of ['heading', 'subtitle', 'description', 'eyebrow', 'buttonLabel', 'destination', 'image', 'mobileImage', 'imageAlt']) {
    const value = section.settings[key]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.length > (key === 'description' ? 3000 : 2048)) { context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', key], message: 'This text field is invalid or too long.' }); continue }
    if (['destination', 'image', 'mobileImage'].includes(key) && !safeUrl.safeParse(value).success) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', key], message: 'Use a local path or secure HTTPS URL.' })
  }
  const productIds = section.settings.productIds
  if (productIds !== undefined && (!Array.isArray(productIds) || productIds.length > 100 || productIds.some(id => typeof id !== 'string' || !mongoose.isValidObjectId(id)) || new Set(productIds).size !== productIds.length)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'productIds'], message: 'Choose valid, unique product identifiers.' })
  const productImages = section.settings.productImages
  if (productImages !== undefined && (!productImages || typeof productImages !== 'object' || Array.isArray(productImages) || Object.entries(productImages as Record<string, unknown>).length > 100 || Object.entries(productImages as Record<string, unknown>).some(([id, url]) => !mongoose.isValidObjectId(id) || typeof url !== 'string' || !safeUrl.safeParse(url).success))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'productImages'], message: 'Product cutout references must use valid product identifiers and image URLs.' })
  const collectionId = section.settings.collectionId
  if (collectionId !== undefined && (typeof collectionId !== 'string' || !mongoose.isValidObjectId(collectionId))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'collectionId'], message: 'Choose a valid collection.' })
  const categoryItems = section.settings.categoryItems
  if (categoryItems !== undefined && (!Array.isArray(categoryItems) || categoryItems.length > 100 || categoryItems.some(item => !item || typeof item !== 'object' || typeof (item as any).categoryId !== 'string' || !mongoose.isValidObjectId((item as any).categoryId) || ['title', 'description', 'image', 'destination'].some(key => (item as any)[key] !== undefined && (typeof (item as any)[key] !== 'string' || String((item as any)[key]).length > 2048)) || ['image', 'destination'].some(key => (item as any)[key] !== undefined && !safeUrl.safeParse((item as any)[key]).success)) || new Set(categoryItems.map((item: any) => item?.categoryId)).size !== categoryItems.length)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'categoryItems'], message: 'Category display overrides are invalid.' })
  if (section.settings.mode !== undefined && !['automatic', 'manual', 'collection'].includes(String(section.settings.mode))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'mode'], message: 'Product selection mode is not supported.' })
  if (section.settings.mode === 'manual' && (!Array.isArray(productIds) || productIds.length === 0) && ['hero', 'featured-products', 'new-arrivals'].includes(section.type)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'productIds'], message: 'Select at least one product for manual display.' })
  if (section.settings.limit !== undefined && (typeof section.settings.limit !== 'number' || !Number.isInteger(section.settings.limit) || section.settings.limit < 1 || section.settings.limit > 24)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'limit'], message: 'Product count must be between 1 and 24.' })
  if (section.settings.overlay !== undefined && (typeof section.settings.overlay !== 'number' || section.settings.overlay < 0 || section.settings.overlay > 80)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'overlay'], message: 'Overlay intensity must be between 0 and 80.' })
})
const sectionsSchema = z.array(sectionSchema).max(30).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Section identifiers must be unique.')
async function productReferencesExist(sections: z.infer<typeof sectionsSchema>) {
  const ids = [...new Set(sections.flatMap(section => [...(Array.isArray(section.settings.productIds) ? section.settings.productIds.filter((id): id is string => typeof id === 'string') : []), ...(section.settings.productImages && typeof section.settings.productImages === 'object' && !Array.isArray(section.settings.productImages) ? Object.keys(section.settings.productImages) : [])]))]
  if (ids.length && await Product.countDocuments({ _id: { $in: ids }, status: 'active' }) !== ids.length) return false
  const collectionIds = [...new Set(sections.map(section => section.settings.collectionId).filter((id): id is string => typeof id === 'string'))]
  if (collectionIds.length && await Collection.countDocuments({ _id: { $in: collectionIds }, status: 'active' }) !== collectionIds.length) return false
  const categoryIds = [...new Set(sections.flatMap(section => Array.isArray(section.settings.categoryItems) ? section.settings.categoryItems.map((item: any) => item.categoryId).filter((id: unknown): id is string => typeof id === 'string') : []))]
  if (categoryIds.length && await Category.countDocuments({ _id: { $in: categoryIds }, status: 'active' }) !== categoryIds.length) return false
  return true
}
const pageNames = [
  ['home', 'Home', 'home', true], ['shop', 'Shop', 'listing', true], ['collections', 'Collections', 'listing', true],
  ['collection-detail', 'Collection Details', 'template', true], ['product-detail', 'Product Details', 'template', true],
  ['releases', 'Releases', 'listing', false], ['release-detail', 'Release Details', 'template', false],
  ['about', 'About', 'content', false], ['contact', 'Contact', 'content', false], ['faq', 'FAQ', 'content', false],
  ['legal', 'Legal pages', 'content', false], ['cart', 'Cart', 'system', true], ['checkout', 'Checkout', 'system', true],
  ['account', 'Account', 'system', true],
] as const
const defaultSections = (slug: string) => slug === 'home' ? [
  // The homepage hero is the circular product showcase. Keep editorial campaign copy optional.
  { id: 'hero', type: 'hero', title: 'Circular product showcase', enabled: true, order: 0, settings: { heading: '', subtitle: '', eyebrow: '', image: '', mobileImage: '', buttonLabel: '', destination: '/shop', alignment: 'center', overlay: 20, mode: 'automatic', productIds: [], limit: 3, showPrices: true } },
  { id: 'arrivals', type: 'new-arrivals', title: 'New arrivals', enabled: true, order: 1, settings: { heading: 'New arrivals', subtitle: 'THE LATEST EDIT', mode: 'automatic', productIds: [], limit: 3, showPrices: true } },
  { id: 'editorial', type: 'editorial', title: 'OFF / STUDIO', enabled: true, order: 2, settings: { eyebrow: 'DRESS WITH INTENTION', image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1300&q=85', heading: 'Uniform for the unordinary.', description: 'Essential forms. Unexpected details. A wardrobe designed to move with you.', buttonLabel: 'Explore ready-to-wear', destination: '/shop' } },
  { id: 'featured', type: 'featured-products', title: 'Featured products', enabled: true, order: 3, settings: { heading: 'The OFF selection', productIds: [], limit: 3, showPrices: true } },
  { id: 'newsletter', type: 'newsletter', title: 'Newsletter', enabled: true, order: 4, settings: { heading: 'Join the OFF list', description: 'Notes from the studio and new arrivals.' } },
] : []

router.use(authenticateAdmin)

async function ensurePages() {
  await Promise.all(pageNames.map(([slug, name, pageType, protectedPage]) => WebsitePage.updateOne(
    { slug },
    { $setOnInsert: { slug, name, pageType, protected: protectedPage, draftSections: defaultSections(slug), publishedSections: defaultSections(slug), draftVersion: 1, publishedVersion: 1, status: 'published', publishedAt: new Date() } },
    { upsert: true },
  )))
}
const safePage = (page: any) => ({ ...page, _id: String(page._id), draftSections: page.draftSections ?? [], publishedSections: page.publishedSections ?? [] })
function uploadInfo(mimeType: string, bytes: Buffer) {
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' } as Record<string, string>)[mimeType]
  const valid = mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8
      : mimeType === 'image/webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        : mimeType === 'image/avif' && (bytes.toString('ascii', 4, 12).includes('ftypavif') || bytes.toString('ascii', 4, 12).includes('ftypavis'))
  if (!ext || !valid) return null
  let width = 0; let height = 0
  if (mimeType === 'image/png' && bytes.length >= 24) { width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20) }
  if (mimeType === 'image/webp' && bytes.length >= 30 && bytes.toString('ascii', 12, 16) === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3) }
  if (mimeType === 'image/webp' && bytes.length >= 30 && bytes.toString('ascii', 12, 16) === 'VP8 ') { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff }
  if (mimeType === 'image/webp' && bytes.length >= 25 && bytes.toString('ascii', 12, 16) === 'VP8L' && bytes[20] === 0x2f) { const b1 = bytes[21]; const b2 = bytes[22]; const b3 = bytes[23]; const b4 = bytes[24]; width = 1 + (((b2 & 0x3f) << 8) | b1); height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) }
  if (mimeType === 'image/avif') { const marker = bytes.indexOf(Buffer.from('ispe')); if (marker >= 0 && marker + 16 <= bytes.length) { width = bytes.readUInt32BE(marker + 8); height = bytes.readUInt32BE(marker + 12) } }
  if (mimeType === 'image/jpeg') {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]; const size = bytes.readUInt16BE(offset + 2)
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) { height = bytes.readUInt16BE(offset + 5); width = bytes.readUInt16BE(offset + 7); break }
      if (size < 2) break
      offset += size + 2
    }
  }
  if (!width || !height || width > 20_000 || height > 20_000) return null
  return { ext, width, height }
}
async function syncMediaUsage() {
  const [pages, media] = await Promise.all([WebsitePage.find().select('slug draftSections publishedSections').lean(), MediaAsset.find().select('_id storageKey url').lean()])
  const references = new Map(media.map(asset => [asset.url, [] as string[]]))
  for (const page of pages) for (const section of [...(page.draftSections ?? []), ...(page.publishedSections ?? [])]) {
    const settings = (section as any).settings ?? {}
    for (const url of [settings.image, settings.mobileImage, ...Object.values(settings.productImages ?? {})]) {
      const refs = typeof url === 'string' ? references.get(url) : undefined
      if (refs) refs.push(`${page.slug}:${section.id}`)
    }
  }
  await Promise.all(media.map(asset => MediaAsset.updateOne({ _id: asset._id }, { $set: { usageReferences: [...new Set(references.get(asset.url) ?? [])] } })))
}

router.get('/', async (_req, res, next) => {
  try {
    await ensurePages()
    const [pages, scheduled, recent, config, draftCount] = await Promise.all([
      WebsitePage.find().sort({ updatedAt: -1 }).lean(),
      WebsitePage.countDocuments({ status: 'scheduled' }),
      WebsitePage.find().sort({ updatedAt: -1 }).limit(5).select('name slug status updatedAt publishedAt').lean(),
      WebsiteConfig.findOne({ key: 'website' }).lean(),
      WebsitePage.countDocuments({ $expr: { $gt: ['$draftVersion', '$publishedVersion'] } }),
    ])
    res.json({ data: { pages: pages.length, scheduled, draftCount, lastPublishedAt: config?.publishedAt ?? pages.find(page => page.publishedAt)?.publishedAt ?? null, lastUpdatedAt: pages[0]?.updatedAt ?? null, recent: recent.map(page => ({ ...page, _id: String(page._id) })) } })
  } catch (error) { next(error) }
})

router.get('/pages', async (_req, res, next) => {
  try { await ensurePages(); res.json({ data: (await WebsitePage.find().sort({ pageType: 1, name: 1 }).lean()).map(safePage) }) }
  catch (error) { next(error) }
})

router.post('/pages', async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(2).max(100), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), pageType: z.enum(['content', 'listing']) }).safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: { code: 'INVALID_PAGE', message: 'Check the page name and URL.' } }); return }
    const page = await WebsitePage.create({ ...parsed.data, draftSections: [], publishedSections: [], createdBy: req.adminEmail ?? '', updatedBy: req.adminEmail ?? '' })
    res.status(201).json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})

router.get('/pages/:id', async (req, res, next) => {
  try {
    await ensurePages()
    const page = mongoose.isValidObjectId(req.params.id) ? await WebsitePage.findById(req.params.id).lean() : await WebsitePage.findOne({ slug: req.params.id }).lean()
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    res.json({ data: safePage(page) })
  } catch (error) { next(error) }
})

router.patch('/pages/:id', async (req, res, next) => {
  try {
    const parsed = z.object({ sections: sectionsSchema, expectedVersion: z.number().int().positive() }).safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: { code: 'INVALID_PAGE_CONTENT', message: 'Review the page sections and try again.' } }); return }
    if (!await productReferencesExist(parsed.data.sections)) { res.status(400).json({ error: { code: 'INVALID_PRODUCT_REFERENCE', message: 'Choose only products that are currently published.' } }); return }
    const page = await WebsitePage.findOneAndUpdate({ _id: req.params.id, draftVersion: parsed.data.expectedVersion }, { $set: { draftSections: parsed.data.sections, status: 'draft', updatedBy: req.adminEmail ?? '' }, $inc: { draftVersion: 1 } }, { new: true, runValidators: true })
    if (!page) { res.status(409).json({ error: { code: 'CONTENT_CONFLICT', message: 'This page changed in another session. Reload it before saving.' } }); return }
    await ContentRevision.create({ resourceType: 'page', resourceId: String(page._id), version: page.draftVersion, snapshot: page.draftSections, status: 'draft', createdBy: req.adminEmail ?? '' })
    await syncMediaUsage()
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})

router.delete('/pages/:id', async (req, res, next) => {
  try {
    const page = await WebsitePage.findById(req.params.id)
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    if (page.protected || ['home', 'shop', 'product-detail', 'collection-detail', 'cart', 'checkout', 'account'].includes(page.slug)) { res.status(409).json({ error: { code: 'PROTECTED_PAGE', message: 'This system page cannot be deleted.' } }); return }
    await page.deleteOne(); res.json({ data: { deleted: true } })
  } catch (error) { next(error) }
})

router.post('/pages/:id/duplicate', async (req, res, next) => {
  try {
    const source = await WebsitePage.findById(req.params.id).lean()
    if (!source || source.pageType === 'template' || source.pageType === 'system') { res.status(409).json({ error: { code: 'PAGE_CANNOT_DUPLICATE', message: 'Only content or listing pages can be duplicated.' } }); return }
    const slug = `${source.slug}-copy-${randomUUID().slice(0, 6)}`
    const copy = await WebsitePage.create({ name: `${source.name} copy`, slug, pageType: source.pageType, draftSections: source.draftSections, publishedSections: [], draftVersion: 1, publishedVersion: 0, status: 'draft' })
    res.status(201).json({ data: safePage(copy.toObject()) })
  } catch (error) { next(error) }
})

router.post('/pages/:id/preview', async (req, res, next) => {
  try {
    const page = await WebsitePage.findById(req.params.id).lean()
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    res.json({ data: { _id: String(page._id), slug: page.slug, name: page.name, sections: page.draftSections, version: page.draftVersion, previewOnly: true } })
  } catch (error) { next(error) }
})

router.post('/pages/:id/publish', async (req, res, next) => {
  try {
    const page = await WebsitePage.findById(req.params.id)
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    const now = new Date()
    page.publishedSections = page.draftSections
    page.publishedVersion = page.draftVersion
    page.publishedAt = now
    page.scheduledAt = null
    page.status = 'published'
    page.updatedBy = req.adminEmail ?? ''
    await page.save()
    await ContentRevision.create({ resourceType: 'page', resourceId: String(page._id), version: page.publishedVersion, snapshot: page.publishedSections, status: 'published', publishedAt: now, createdBy: req.adminEmail ?? '' })
    await syncMediaUsage()
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})

router.post('/pages/:id/unpublish', async (req, res, next) => {
  try {
    const page = await WebsitePage.findByIdAndUpdate(req.params.id, { $set: { status: 'archived', scheduledAt: null } }, { new: true })
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})

router.post('/pages/:id/schedule', async (req, res, next) => {
  try {
    const parsed = z.object({ publishAt: z.string().datetime() }).safeParse(req.body)
    const publishAt = parsed.success ? new Date(parsed.data.publishAt) : new Date(0)
    if (!parsed.success || publishAt <= new Date()) { res.status(400).json({ error: { code: 'INVALID_SCHEDULE', message: 'Choose a future publication date.' } }); return }
    const page = await WebsitePage.findByIdAndUpdate(req.params.id, { $set: { status: 'scheduled', scheduledAt: publishAt, updatedBy: req.adminEmail ?? '' } }, { new: true })
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})
router.post('/pages/:id/schedule/cancel', async (req, res, next) => {
  try {
    const page = await WebsitePage.findById(req.params.id)
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Page not found.' } }); return }
    page.scheduledAt = null
    page.status = page.draftVersion > page.publishedVersion ? 'draft' : 'published'
    page.updatedBy = req.adminEmail ?? ''
    await page.save()
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})

router.get('/pages/:id/revisions', async (req, res, next) => {
  try { const page = await WebsitePage.findById(req.params.id).select('slug').lean(); const resourceType = page?.slug === 'home' ? 'homepage' : 'page'; res.json({ data: await ContentRevision.find({ resourceType, resourceId: req.params.id }).sort({ version: -1 }).limit(50).lean() }) }
  catch (error) { next(error) }
})

router.post('/pages/:id/revisions/:revisionId/restore', async (req, res, next) => {
  try {
    const page = await WebsitePage.findById(req.params.id)
    const resourceType = page?.slug === 'home' ? 'homepage' : 'page'
    const revision = await ContentRevision.findOne({ _id: req.params.revisionId, resourceType, resourceId: req.params.id })
    if (!page || !revision) { res.status(404).json({ error: { code: 'REVISION_NOT_FOUND', message: 'The page revision could not be found.' } }); return }
    const sections = sectionsSchema.safeParse(revision.snapshot)
    if (!sections.success) { res.status(409).json({ error: { code: 'INVALID_REVISION', message: 'This revision cannot be restored.' } }); return }
    page.draftSections = sections.data as any
    page.draftVersion += 1
    page.status = 'draft'
    page.updatedBy = req.adminEmail ?? ''
    await page.save()
    await ContentRevision.create({ resourceType: 'page', resourceId: String(page._id), version: page.draftVersion, snapshot: page.draftSections, status: 'restored', createdBy: req.adminEmail ?? '' })
    await syncMediaUsage()
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})

router.get('/homepage', async (_req, res, next) => {
  try {
    await ensurePages()
    const page = await WebsitePage.findOne({ slug: 'home' }).lean()
    res.json({ data: safePage(page) })
  } catch (error) { next(error) }
})
router.patch('/homepage', async (req, res, next) => {
  try {
    const parsed = z.object({ sections: sectionsSchema, expectedVersion: z.number().int().positive() }).safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: { code: 'INVALID_HOMEPAGE', message: 'Review the homepage sections and try again.' } }); return }
    if (!await productReferencesExist(parsed.data.sections)) { res.status(400).json({ error: { code: 'INVALID_PRODUCT_REFERENCE', message: 'Choose only products that are currently published.' } }); return }
    const page = await WebsitePage.findOneAndUpdate({ slug: 'home', draftVersion: parsed.data.expectedVersion }, { $set: { draftSections: parsed.data.sections, status: 'draft', updatedBy: req.adminEmail ?? '' }, $inc: { draftVersion: 1 } }, { new: true, runValidators: true })
    if (!page) { res.status(409).json({ error: { code: 'CONTENT_CONFLICT', message: 'Homepage content changed in another session. Reload before saving.' } }); return }
    await ContentRevision.create({ resourceType: 'homepage', resourceId: String(page._id), version: page.draftVersion, snapshot: page.draftSections, status: 'draft', createdBy: req.adminEmail ?? '' })
    await syncMediaUsage()
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})
router.post('/homepage/publish', async (req, res, next) => {
  try {
    const page = await WebsitePage.findOne({ slug: 'home' })
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Homepage is not configured.' } }); return }
    const now = new Date(); page.publishedSections = page.draftSections; page.publishedVersion = page.draftVersion; page.publishedAt = now; page.status = 'published'; page.updatedBy = req.adminEmail ?? ''; await page.save()
    await ContentRevision.create({ resourceType: 'homepage', resourceId: String(page._id), version: page.publishedVersion, snapshot: page.publishedSections, status: 'published', publishedAt: now, createdBy: req.adminEmail ?? '' })
    await syncMediaUsage()
    res.json({ data: safePage(page.toObject()) })
  } catch (error) { next(error) }
})
router.post('/homepage/preview', async (_req, res, next) => {
  try {
    const page = await WebsitePage.findOne({ slug: 'home' }).lean()
    if (!page) { res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'Homepage is not configured.' } }); return }
    res.json({ data: { sections: page.draftSections, version: page.draftVersion, previewOnly: true } })
  } catch (error) { next(error) }
})

const configSchema = z.object({
  announcementEnabled: z.boolean().optional(),
  announcement: z.string().trim().max(160).optional(),
  announcementDestination: safeUrl.optional(),
  announcementBackground: z.enum(['dark', 'sage', 'sand', 'white']).optional(),
  showSearch: z.boolean().optional(), showAccount: z.boolean().optional(), showCart: z.boolean().optional(),
  logoSize: z.number().int().min(18).max(32).optional(),
  newsletterHeading: z.string().trim().max(120).optional(),
  contactEmail: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
  whatsappNumber: z.string().trim().max(32).regex(/^[+()\d\s.-]*$/).optional(),
  instagramUrl: safeUrl.optional(),
  instagramPosts: z.array(z.object({ imageUrl: safeUrl.refine(Boolean), postUrl: safeUrl.optional() }).strict()).max(12).optional(),
  facebookUrl: safeUrl.optional(),
  tiktokUrl: safeUrl.optional(),
  copyright: z.string().trim().max(180).optional(),
}).strict()
router.get('/settings', async (_req, res, next) => {
  try { const doc = await WebsiteConfig.findOne({ key: 'website' }).lean(); res.json({ data: doc ?? { draft: {}, published: {}, draftVersion: 1, publishedVersion: 0 } }) }
  catch (error) { next(error) }
})
router.patch('/settings', async (req, res, next) => {
  try {
    const parsed = configSchema.safeParse(req.body?.settings)
    if (!parsed.success) { res.status(400).json({ error: { code: 'INVALID_SETTINGS', message: 'Website settings are invalid or too large.' } }); return }
    const doc = await WebsiteConfig.findOneAndUpdate({ key: 'website', draftVersion: req.body?.expectedVersion ?? 1 }, { $set: { 'draft.settings': parsed.data }, $inc: { draftVersion: 1 } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true })
    res.json({ data: doc })
  } catch (error) { next(error) }
})
router.post('/settings/publish', async (_req, res, next) => {
  try {
    const doc = await WebsiteConfig.findOne({ key: 'website' })
    if (!doc) { res.status(404).json({ error: { code: 'SETTINGS_NOT_FOUND', message: 'Save website settings before publishing.' } }); return }
    doc.published = doc.draft; doc.publishedVersion = doc.draftVersion; doc.publishedAt = new Date(); await doc.save()
    res.json({ data: doc })
  } catch (error) { next(error) }
})
router.get('/navigation', async (_req, res, next) => {
  try { const doc = await WebsiteConfig.findOne({ key: 'website' }).lean(); res.json({ data: { navigation: doc?.draft?.navigation ?? { headerItems: [], footerGroups: [] }, version: doc?.draftVersion ?? 1 } }) }
  catch (error) { next(error) }
})
router.patch('/navigation', async (req, res, next) => {
  try {
    const schema = z.object({ headerItems: z.array(z.object({ label: z.string().trim().min(1).max(60), destination: safeUrl, enabled: z.boolean().default(true) })).max(20), footerGroups: z.array(z.object({ title: z.string().trim().max(80), links: z.array(z.object({ label: z.string().trim().min(1).max(60), destination: safeUrl })).max(20) })).max(10) })
    const parsed = z.object({ navigation: schema, expectedVersion: z.number().int().positive() }).safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: { code: 'INVALID_NAVIGATION', message: 'Review navigation labels and destinations.' } }); return }
    const existing = await WebsiteConfig.findOne({ key: 'website' }) ?? new WebsiteConfig({ key: 'website' })
    if (existing.draftVersion !== parsed.data.expectedVersion) { res.status(409).json({ error: { code: 'CONTENT_CONFLICT', message: 'Navigation changed in another session. Reload before saving.' } }); return }
    existing.draft = { ...(existing.draft ?? {}), navigation: parsed.data.navigation }; existing.draftVersion += 1; await existing.save()
    res.json({ data: { navigation: parsed.data.navigation, version: existing.draftVersion } })
  } catch (error) { next(error) }
})

router.get('/media', async (_req, res, next) => {
  try { res.json({ data: await MediaAsset.find().sort({ createdAt: -1 }).limit(300).lean() }) }
  catch (error) { next(error) }
})
router.post('/media', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], limit: '8mb' }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length < 16) { res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'Choose a supported image under 8 MB.' } }); return }
    const mimeType = req.get('content-type') as string
    const bytes = req.body as Buffer
    const info = uploadInfo(mimeType, bytes)
    if (!info) { res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'Image content does not match its file type or dimensions exceed the limit.' } }); return }
    const storageKey = `${randomUUID()}.${info.ext}`
    const fileName = (req.get('x-file-name') ?? `image.${info.ext}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
    await mkdir(uploadRoot, { recursive: true }); await writeFile(path.join(uploadRoot, storageKey), bytes, { flag: 'wx' })
    const asset = await MediaAsset.create({ url: `/media/${storageKey}`, storageKey, fileName, mimeType, fileSize: bytes.length, width: info.width, height: info.height, altText: (req.get('x-alt-text') ?? '').slice(0, 300) })
    res.status(201).json({ data: asset })
  } catch (error) { next(error) }
})
router.post('/media/:id/replace', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], limit: '8mb' }), async (req, res, next) => {
  try {
    const asset = await MediaAsset.findById(req.params.id)
    if (!asset) { res.status(404).json({ error: { code: 'MEDIA_NOT_FOUND', message: 'Image not found.' } }); return }
    if (!Buffer.isBuffer(req.body) || req.body.length < 16) { res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'Choose a supported image under 8 MB.' } }); return }
    const mimeType = req.get('content-type') as string
    const bytes = req.body as Buffer
    const info = uploadInfo(mimeType, bytes)
    if (!info) { res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'Image content does not match its file type or dimensions exceed the limit.' } }); return }
    const oldKey = asset.storageKey
    const storageKey = `${randomUUID()}.${info.ext}`
    await writeFile(path.join(uploadRoot, storageKey), bytes, { flag: 'wx' })
    const oldUrl = asset.url
    const newUrl = `/media/${storageKey}`
    const pages = await WebsitePage.find()
    for (const page of pages) {
      for (const section of [...page.draftSections, ...page.publishedSections]) {
        for (const field of ['image', 'mobileImage']) if ((section.settings as any)?.[field] === oldUrl) (section.settings as any)[field] = newUrl
        const productImages = (section.settings as any)?.productImages
        if (productImages && typeof productImages === 'object') for (const [id, url] of Object.entries(productImages)) if (url === oldUrl) productImages[id] = newUrl
      }
      page.markModified('draftSections')
      page.markModified('publishedSections')
      await page.save()
    }
    const revisions = await ContentRevision.find({ resourceType: { $in: ['page', 'homepage'] } })
    for (const revision of revisions) {
      if (Array.isArray(revision.snapshot)) {
        for (const section of revision.snapshot as any[]) {
          for (const field of ['image', 'mobileImage']) if (section.settings?.[field] === oldUrl) section.settings[field] = newUrl
          const productImages = section.settings?.productImages
          if (productImages && typeof productImages === 'object') for (const [id, url] of Object.entries(productImages)) if (url === oldUrl) productImages[id] = newUrl
        }
        revision.markModified('snapshot')
        await revision.save()
      }
    }
    asset.storageKey = storageKey; asset.url = newUrl; asset.fileName = (req.get('x-file-name') ?? asset.fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180); asset.mimeType = mimeType as any; asset.fileSize = bytes.length; asset.width = info.width; asset.height = info.height
    await asset.save()
    await unlink(path.join(uploadRoot, oldKey)).catch(() => undefined)
    await syncMediaUsage()
    res.json({ data: asset })
  } catch (error) { next(error) }
})
router.patch('/media/:id', async (req, res, next) => {
  try {
    const parsed = z.object({ altText: z.string().trim().max(300) }).safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: { code: 'INVALID_MEDIA', message: 'Alternative text is too long.' } }); return }
    const asset = await MediaAsset.findByIdAndUpdate(req.params.id, { $set: parsed.data }, { new: true, runValidators: true })
    if (!asset) { res.status(404).json({ error: { code: 'MEDIA_NOT_FOUND', message: 'Image not found.' } }); return }
    res.json({ data: asset })
  } catch (error) { next(error) }
})
router.delete('/media/:id', async (req, res, next) => {
  try {
    const asset = await MediaAsset.findById(req.params.id)
    if (!asset) { res.status(404).json({ error: { code: 'MEDIA_NOT_FOUND', message: 'Image not found.' } }); return }
    if (asset.usageReferences.length) { res.status(409).json({ error: { code: 'MEDIA_IN_USE', message: `This image is referenced by ${asset.usageReferences.length} content item(s).` } }); return }
    await Promise.all([unlink(path.join(uploadRoot, asset.storageKey)).catch(() => undefined), asset.deleteOne()])
    res.json({ data: { deleted: true } })
  } catch (error) { next(error) }
})

router.get('/merchandising/:scope', async (req, res, next) => {
  try {
    const scope = z.string().regex(/^(global|homepage|category:[a-f0-9]{24}|collection:[a-f0-9]{24})$/).safeParse(req.params.scope)
    if (!scope.success) { res.status(400).json({ error: { code: 'INVALID_SCOPE', message: 'Choose a supported product-ordering scope.' } }); return }
    const doc = await WebsiteConfig.findOne({ key: 'website' }).lean()
    res.json({ data: { scope: scope.data, productIds: doc?.draft?.merchandising?.[scope.data] ?? [], version: doc?.draftVersion ?? 1 } })
  } catch (error) { next(error) }
})

router.put('/merchandising/:scope', async (req, res, next) => {
  try {
    const scope = z.string().regex(/^(global|homepage|category:[a-f0-9]{24}|collection:[a-f0-9]{24})$/).safeParse(req.params.scope)
    const parsed = z.object({ productIds: z.array(z.string().refine(mongoose.isValidObjectId)).max(500), expectedVersion: z.number().int().positive().optional() }).safeParse(req.body)
    if (!scope.success || !parsed.success || new Set(parsed.data.productIds).size !== parsed.data.productIds.length) { res.status(400).json({ error: { code: 'INVALID_ORDER', message: 'Product order contains invalid or duplicate identifiers.' } }); return }
    const found = await Product.countDocuments({ _id: { $in: parsed.data.productIds } })
    if (found !== parsed.data.productIds.length) { res.status(400).json({ error: { code: 'UNKNOWN_PRODUCTS', message: 'Some selected products no longer exist.' } }); return }
    const doc = await WebsiteConfig.findOne({ key: 'website' }) ?? new WebsiteConfig({ key: 'website' })
    if (parsed.data.expectedVersion && doc.draftVersion !== parsed.data.expectedVersion) { res.status(409).json({ error: { code: 'CONTENT_CONFLICT', message: 'Product ordering changed in another session. Reload before saving.' } }); return }
    const merchandising = (doc.draft?.merchandising ?? {}) as Record<string, string[]>
    merchandising[scope.data] = parsed.data.productIds
    doc.draft = { ...(doc.draft ?? {}), merchandising }; doc.draftVersion += 1; await doc.save()
    res.json({ data: { scope: scope.data, productIds: parsed.data.productIds, version: doc.draftVersion } })
  } catch (error) { next(error) }
})

router.post('/merchandising/:scope/publish', async (req, res, next) => {
  try {
    const scope = z.string().regex(/^(global|homepage|category:[a-f0-9]{24}|collection:[a-f0-9]{24})$/).safeParse(req.params.scope)
    if (!scope.success) { res.status(400).json({ error: { code: 'INVALID_SCOPE', message: 'Choose a supported product-ordering scope.' } }); return }
    const doc = await WebsiteConfig.findOne({ key: 'website' })
    if (!doc) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Save a product order first.' } }); return }
    const draftOrder = (doc.draft?.merchandising ?? {}) as Record<string, string[]>
    const publishedOrder = (doc.published?.merchandising ?? {}) as Record<string, string[]>
    publishedOrder[scope.data] = draftOrder[scope.data] ?? []
    doc.published = { ...(doc.published ?? {}), merchandising: publishedOrder }
    doc.publishedAt = new Date()
    await doc.save()
    res.json({ data: { scope: scope.data, productIds: publishedOrder[scope.data], publishedAt: doc.publishedAt } })
  } catch (error) { next(error) }
})

export const websiteAdminRouter = router
