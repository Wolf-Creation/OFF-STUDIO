import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MediaAsset } from './models/MediaAsset.js'

const uploadRoot = fileURLToPath(new URL('../uploads/', import.meta.url))
const supportedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxSourceBytes = 20 * 1024 * 1024
const maxGeneratedBytes = 8 * 1024 * 1024

export class ImageGenerationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

type ProductImageInput = { url: string; alt?: string }

async function loadReferenceImage(url: string) {
  const storedAsset = await MediaAsset.findOne({ url }).select('storageKey mimeType fileName').lean()
  if (storedAsset) {
    if (!supportedMimeTypes.has(storedAsset.mimeType)) throw new ImageGenerationError(400, 'UNSUPPORTED_REFERENCE', 'Use JPEG, PNG, or WebP product images for AI generation.')
    const bytes = await readFile(path.join(uploadRoot, storedAsset.storageKey))
    if (bytes.length > maxSourceBytes) throw new ImageGenerationError(413, 'REFERENCE_TOO_LARGE', 'Each product reference image must be under 20 MB.')
    return { bytes, mimeType: storedAsset.mimeType, fileName: storedAsset.fileName }
  }

  let source: URL
  try { source = new URL(url) } catch { throw new ImageGenerationError(400, 'REFERENCE_NOT_FOUND', 'Upload the product image to the Media Library before generating a gallery.') }
  // Seed catalog photos use Unsplash. Requiring this exact public host for remote
  // references prevents the authenticated image endpoint from becoming an SSRF proxy.
  if (source.protocol !== 'https:' || source.hostname !== 'images.unsplash.com' || source.username || source.password) {
    throw new ImageGenerationError(400, 'REFERENCE_NOT_ALLOWED', 'Upload this product photo to the Media Library before using it as an AI reference.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(source, { redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new ImageGenerationError(400, 'REFERENCE_UNAVAILABLE', 'A product reference photo could not be loaded.')
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!supportedMimeTypes.has(mimeType)) throw new ImageGenerationError(400, 'UNSUPPORTED_REFERENCE', 'Product references must be JPEG, PNG, or WebP images.')
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > maxSourceBytes) throw new ImageGenerationError(413, 'REFERENCE_TOO_LARGE', 'Each product reference image must be under 20 MB.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > maxSourceBytes) throw new ImageGenerationError(413, 'REFERENCE_TOO_LARGE', 'Each product reference image must be under 20 MB.')
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length)
    return { bytes, mimeType, fileName: `product-reference.${ext}` }
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error
    throw new ImageGenerationError(400, 'REFERENCE_UNAVAILABLE', 'A product reference photo could not be loaded. Upload it to the Media Library and try again.')
  } finally {
    clearTimeout(timer)
  }
}

function pngDimensions(bytes: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  return width > 0 && height > 0 && width <= 20_000 && height <= 20_000 ? { width, height } : null
}

export async function generateProductGallery(input: { productName: string; category: string; description: string; images: ProductImageInput[]; count: number }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new ImageGenerationError(503, 'IMAGE_GENERATION_NOT_CONFIGURED', 'Configure OPENAI_API_KEY in the API environment to enable image generation.')
  if (!input.images.length) throw new ImageGenerationError(400, 'PRODUCT_IMAGE_REQUIRED', 'Add at least one real product photo before generating a gallery.')

  const references = await Promise.all(input.images.slice(0, 4).map(image => loadReferenceImage(image.url)))
  const model = process.env.OPENAI_IMAGE_MODEL === 'gpt-image-2.5-flare' ? 'gpt-image-2.5-flare' : 'gpt-image-2.5-sunburst'
  const form = new FormData()
  form.set('model', model)
  form.set('prompt', [
    `Create a polished, photorealistic ecommerce studio photograph for the exact existing product: ${input.productName} (${input.category}).`,
    'Use the supplied product photographs as strict visual references. Preserve the same item, silhouette, proportions, color, material, construction, seams, pattern, hardware, and any real branding already visible. Do not redesign or replace the product. Do not invent, add, or alter logos, labels, text, accessories, or extra objects.',
    'Show one complete product, clearly visible, centered with natural proportions and crisp material detail. Use elegant soft studio lighting, subtle realistic contact shadow, and a seamless warm ivory / pale stone background that matches a premium contemporary fashion storefront. No collage, no frames, no watermark, no text.',
    `Product description for context: ${input.description.slice(0, 1000) || 'Use only details visible in the reference photos.'}`,
    'Create a distinct camera angle or close product composition for each requested gallery image while keeping the product itself identical.',
  ].join('\n\n'))
  form.set('n', String(Math.max(1, Math.min(input.count, 4))))
  form.set('size', '1024x1024')
  form.set('quality', 'high')
  form.set('output_format', 'png')
  form.set('background', 'opaque')
  form.set('moderation', 'auto')
  references.forEach((image, index) => form.append('image[]', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), `reference-${index + 1}-${image.fileName}`))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)
  let result: Response
  try {
    result = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    })
  } catch {
    throw new ImageGenerationError(502, 'IMAGE_PROVIDER_UNAVAILABLE', 'The image service could not be reached. Try again in a moment.')
  } finally {
    clearTimeout(timer)
  }
  const payload = await result.json().catch(() => null) as { data?: { b64_json?: string }[]; error?: { code?: string; type?: string; message?: string } } | null
  if (!result.ok) {
    console.error('OpenAI image generation request failed:', {
      status: result.status,
      errorType: payload?.error?.type ?? 'unknown',
      errorCode: payload?.error?.code ?? 'unknown',
      errorMessage: payload?.error?.message?.slice(0, 300) ?? 'No provider error details returned.',
    })
    if (result.status === 429 && (payload?.error?.type === 'insufficient_quota' || payload?.error?.code === 'insufficient_quota')) {
      throw new ImageGenerationError(503, 'IMAGE_GENERATION_QUOTA_EXCEEDED', 'OpenAI image generation has no available credits. Add API credits in your OpenAI billing settings, then try again.')
    }
    if (result.status === 401 || result.status === 403) {
      throw new ImageGenerationError(503, 'IMAGE_GENERATION_FAILED', 'The configured OpenAI image key is not accepted for this request.')
    }
    if (result.status === 429) {
      throw new ImageGenerationError(429, 'IMAGE_PROVIDER_RATE_LIMITED', 'The image service is temporarily rate limited. Wait a moment and try again.')
    }
    throw new ImageGenerationError(502, 'IMAGE_GENERATION_FAILED', 'The image service could not generate these product photos. Review the source images and try again.')
  }
  const generated = (payload?.data ?? []).map(item => item.b64_json).filter((value): value is string => Boolean(value))
  if (!generated.length) throw new ImageGenerationError(502, 'EMPTY_IMAGE_RESPONSE', 'The image service returned no product photos. Try again.')

  await mkdir(uploadRoot, { recursive: true })
  const saved = []
  for (const [index, encoded] of generated.entries()) {
    const bytes = Buffer.from(encoded, 'base64')
    const dimensions = pngDimensions(bytes)
    if (!dimensions || bytes.length > maxGeneratedBytes) continue
    const storageKey = `${randomUUID()}.png`
    await writeFile(path.join(uploadRoot, storageKey), bytes, { flag: 'wx' })
    try {
      const asset = await MediaAsset.create({
        url: `/media/${storageKey}`,
        storageKey,
        fileName: `${input.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ai-${index + 1}.png`.slice(0, 180),
        mimeType: 'image/png',
        fileSize: bytes.length,
        width: dimensions.width,
        height: dimensions.height,
        altText: `${input.productName}, AI-generated studio product photo ${index + 1}`,
        usageReferences: [],
      })
      saved.push(asset)
    } catch (error) {
      await import('node:fs/promises').then(({ unlink }) => unlink(path.join(uploadRoot, storageKey)).catch(() => undefined))
      throw error
    }
  }
  if (!saved.length) throw new ImageGenerationError(502, 'INVALID_IMAGE_RESPONSE', 'The image service returned files the Media Library could not accept.')
  return { images: saved, model }
}
