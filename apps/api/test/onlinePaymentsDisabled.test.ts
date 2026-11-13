import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { checkoutRouter } from '../src/routes/checkout.js'
import { paymentsRouter } from '../src/routes/payments.js'

test('online checkout session and Stripe webhook routes stay blocked when payments are disabled', async t => {
  const previousValue = process.env.ONLINE_PAYMENT_ENABLED
  process.env.ONLINE_PAYMENT_ENABLED = 'false'
  t.after(() => {
    if (previousValue === undefined) delete process.env.ONLINE_PAYMENT_ENABLED
    else process.env.ONLINE_PAYMENT_ENABLED = previousValue
  })

  const app = express()
  app.use('/checkout', checkoutRouter)
  app.use('/payments', paymentsRouter)
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
  const baseUrl = `http://127.0.0.1:${address.port}`

  const sessionResponse = await fetch(`${baseUrl}/checkout/session/cs_test_123`)
  assert.equal(sessionResponse.status, 503)
  assert.equal((await sessionResponse.json() as { error?: { code?: string } }).error?.code, 'ONLINE_PAYMENT_DISABLED')

  const webhookResponse = await fetch(`${baseUrl}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(webhookResponse.status, 503)
  assert.equal((await webhookResponse.json() as { error?: { code?: string } }).error?.code, 'ONLINE_PAYMENT_DISABLED')
})
