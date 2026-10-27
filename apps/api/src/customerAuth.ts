import { createClerkClient, verifyToken } from '@clerk/backend'
import type { NextFunction, Request, Response } from 'express'
import { Customer } from './models/Customer.js'

declare global {
  namespace Express {
    interface Request { clerkUserId?: string }
  }
}

let clerkClient: ReturnType<typeof createClerkClient> | undefined

export class CustomerAuthError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new Error('Clerk is not configured.')
  clerkClient ??= createClerkClient({ secretKey })
  return clerkClient
}

function authorizedParties() {
  const parties = new Set([process.env.FRONTEND_URL ?? 'http://localhost:5173'])
  if (process.env.NODE_ENV !== 'production') {
    for (let port = 5173; port <= 5199; port += 1) {
      parties.add(`http://localhost:${port}`)
      parties.add(`http://127.0.0.1:${port}`)
    }
  }
  return [...parties]
}

async function authenticate(request: Request, response: Response, next: NextFunction, required: boolean) {
  const authorization = request.get('authorization')
  if (!authorization) {
    if (!required) { next(); return }
    response.status(401).json({ error: { code: 'CUSTOMER_UNAUTHENTICATED', message: 'Sign in to access your customer account.' } })
    return
  }
  const match = authorization.match(/^Bearer ([^\s]+)$/)
  if (!match) {
    response.status(401).json({ error: { code: 'CUSTOMER_UNAUTHENTICATED', message: 'The customer session is invalid.' } })
    return
  }
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    response.status(503).json({ error: { code: 'CUSTOMER_AUTH_NOT_CONFIGURED', message: 'Customer authentication is not configured on the API.' } })
    return
  }
  try {
    const claims = await verifyToken(match[1], { secretKey, authorizedParties: authorizedParties() })
    if (typeof claims.sub !== 'string' || !claims.sub.startsWith('user_')) {
      response.status(401).json({ error: { code: 'CUSTOMER_UNAUTHENTICATED', message: 'The customer session is invalid.' } })
      return
    }
    request.clerkUserId = claims.sub
    next()
  } catch {
    response.status(401).json({ error: { code: 'CUSTOMER_UNAUTHENTICATED', message: 'The customer session is invalid or expired.' } })
  }
}

export function authenticateCustomer(request: Request, response: Response, next: NextFunction) {
  void authenticate(request, response, next, true)
}

export function authenticateOptionalCustomer(request: Request, response: Response, next: NextFunction) {
  void authenticate(request, response, next, false)
}

export async function resolveClerkCustomer(clerkUserId: string) {
  const clerkUser = await getClerkClient().users.getUser(clerkUserId)
  const primaryEmail = clerkUser.emailAddresses.find(email => email.id === clerkUser.primaryEmailAddressId)
  if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
    throw new CustomerAuthError(403, 'CUSTOMER_EMAIL_NOT_VERIFIED', 'Verify an email address with Clerk before accessing customer account features.')
  }

  const email = primaryEmail.emailAddress.toLowerCase()
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
    || clerkUser.username
    || email
  const linkedCustomer = await Customer.findOne({ clerkId: clerkUserId })
  if (linkedCustomer) {
    if (linkedCustomer.status !== 'active') {
      throw new CustomerAuthError(403, 'CUSTOMER_ACCOUNT_DISABLED', 'This customer account is disabled.')
    }
    const emailOwner = await Customer.findOne({ email }).select('_id clerkId').lean()
    if (emailOwner && String(emailOwner._id) !== String(linkedCustomer._id)) {
      throw new CustomerAuthError(409, 'CUSTOMER_EMAIL_CONFLICT', 'This email address is already linked to another customer account.')
    }
    linkedCustomer.name = name
    linkedCustomer.email = email
    await linkedCustomer.save()
    return linkedCustomer
  }

  const existingCustomer = await Customer.findOne({ email })
  if (existingCustomer) {
    if (existingCustomer.status !== 'active') {
      throw new CustomerAuthError(403, 'CUSTOMER_ACCOUNT_DISABLED', 'This customer account is disabled.')
    }
    if (existingCustomer.clerkId && existingCustomer.clerkId !== clerkUserId) {
      throw new CustomerAuthError(409, 'CUSTOMER_ACCOUNT_CONFLICT', 'This customer record is already linked to another account.')
    }
    existingCustomer.clerkId = clerkUserId
    existingCustomer.name = name
    await existingCustomer.save()
    return existingCustomer
  }

  try {
    return await Customer.create({ clerkId: clerkUserId, name, email, status: 'active' })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const concurrentlyLinked = await Customer.findOne({ clerkId: clerkUserId })
      if (concurrentlyLinked) return concurrentlyLinked
      throw new CustomerAuthError(409, 'CUSTOMER_EMAIL_CONFLICT', 'This email address is already linked to another customer account.')
    }
    throw error
  }
}
