import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { NewsletterSubscription } from '../src/models/NewsletterSubscription.js'
import { isDuplicateNewsletterEmailError, newsletterRouter, newsletterSignupSchema } from '../src/routes/newsletter.js'

test('newsletter signups require a valid email and explicit consent', () => {
  assert.deepEqual(newsletterSignupSchema.parse({ email: '  OFF@example.com ', consent: true }), { email: 'off@example.com', consent: true })
  assert.equal(newsletterSignupSchema.safeParse({ email: 'not-an-email', consent: true }).success, false)
  assert.equal(newsletterSignupSchema.safeParse({ email: 'off@example.com', consent: false }).success, false)
  assert.equal(newsletterSignupSchema.safeParse({ email: 'off@example.com', consent: true, name: 'Unexpected field' }).success, false)
})

test('newsletter subscriptions are uniquely indexed and duplicate inserts are idempotent', () => {
  const uniqueEmailIndex = NewsletterSubscription.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique === true)
  assert.equal(uniqueEmailIndex, true)
  assert.equal(isDuplicateNewsletterEmailError({ code: 11000 }), true)
  assert.equal(isDuplicateNewsletterEmailError({ code: 121 }), false)
  assert.equal(isDuplicateNewsletterEmailError(null), false)
})

test('newsletter route rejects invalid signup without attempting a database write', async t => {
  const originalCreate = NewsletterSubscription.create
  let writeAttempted = false
  NewsletterSubscription.create = (async () => {
    writeAttempted = true
    throw new Error('Database write should not run for invalid input.')
  }) as typeof NewsletterSubscription.create
  t.after(() => { NewsletterSubscription.create = originalCreate })

  const app = express()
  app.use(express.json())
  app.use('/newsletter', newsletterRouter)
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  }))
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const response = await fetch(`http://127.0.0.1:${address.port}/newsletter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'invalid', consent: true }),
  })
  assert.equal(response.status, 400)
  assert.equal(writeAttempted, false)
})
