import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { NewsletterSubscription } from '../models/NewsletterSubscription.js'

const router = Router()
const signupLimit = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false })

export const newsletterSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  consent: z.literal(true),
}).strict()

export function isDuplicateNewsletterEmailError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

router.post('/', signupLimit, async (request, response, next) => {
  const parsed = newsletterSignupSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'INVALID_NEWSLETTER_SIGNUP', message: 'Enter a valid email address and confirm your consent.' } })
    return
  }
  try {
    await NewsletterSubscription.create({ email: parsed.data.email, consentAt: new Date() })
    response.status(202).json({ data: { subscribed: true } })
  } catch (error) {
    if (isDuplicateNewsletterEmailError(error)) {
      response.status(202).json({ data: { subscribed: true } })
      return
    }
    next(error)
  }
})

export const newsletterRouter = router
