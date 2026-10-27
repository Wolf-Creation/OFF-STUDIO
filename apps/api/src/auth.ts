import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

declare global {
  namespace Express {
    interface Request { adminEmail?: string }
  }
}

type AdminTokenPayload = { sub: string; role: 'admin'; exp: number }

const encode = (value: string) => Buffer.from(value).toString('base64url')
const signature = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url')

export function signAdminToken(email: string, secret: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = encode(JSON.stringify({ sub: email, role: 'admin', iat: now, exp: now + 8 * 60 * 60 }))
  const content = `${header}.${payload}`
  return `${content}.${signature(content, secret)}`
}

export function verifyAdminToken(token: string, secret: string): AdminTokenPayload | null {
  const [header, payload, suppliedSignature, extra] = token.split('.')
  if (!header || !payload || !suppliedSignature || extra) return null
  const content = `${header}.${payload}`
  const expected = Buffer.from(signature(content, secret))
  const actual = Buffer.from(suppliedSignature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string }
    const parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<AdminTokenPayload>
    if (parsedHeader.alg !== 'HS256' || parsedPayload.role !== 'admin' || typeof parsedPayload.sub !== 'string' || typeof parsedPayload.exp !== 'number' || parsedPayload.exp <= Date.now() / 1000) return null
    return parsedPayload as AdminTokenPayload
  } catch {
    return null
  }
}

export function authenticateAdmin(request: Request, response: Response, next: NextFunction) {
  const secret = process.env.JWT_SECRET
  const authorization = request.get('authorization')
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)
  const token = match?.[1]
  const claims = secret && token ? verifyAdminToken(token, secret) : null
  if (!claims) {
    response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Administrator sign-in is required.' } })
    return
  }
  request.adminEmail = claims.sub
  next()
}
