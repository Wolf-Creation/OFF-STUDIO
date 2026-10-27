import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { authenticateAdmin, signAdminToken } from '../auth.js'

const router = Router()
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
})
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.' } },
})
const matchesSecret = (provided: string, expected: string, caseInsensitive = false) => {
  const providedDigest = createHash('sha256').update(caseInsensitive ? provided.toLowerCase() : provided).digest()
  const expectedDigest = createHash('sha256').update(caseInsensitive ? expected.toLowerCase() : expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

router.post('/login', loginLimit, (request, response) => {
  const parsed = loginSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Enter a valid email address and password.' } })
    return
  }
  const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET || JWT_SECRET.length < 32) {
    response.status(503).json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Administrator sign-in is not configured on the API.' } })
    return
  }
  const emailMatches = matchesSecret(parsed.data.email, ADMIN_EMAIL, true)
  const passwordMatches = matchesSecret(parsed.data.password, ADMIN_PASSWORD)
  if (!emailMatches || !passwordMatches) {
    response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } })
    return
  }
  response.json({ data: { token: signAdminToken(ADMIN_EMAIL, JWT_SECRET), email: ADMIN_EMAIL } })
})

router.get('/me', authenticateAdmin, (request, response) => {
  const email = process.env.ADMIN_EMAIL
  if (!email) {
    response.status(503).json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Administrator sign-in is not configured on the API.' } })
    return
  }
  response.json({ data: { email, role: 'admin' } })
})

export const authRouter = router
