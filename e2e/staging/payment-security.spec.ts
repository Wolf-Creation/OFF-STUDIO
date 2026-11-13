import { apiBaseUrl, expect, test } from './fixtures'

test.describe('online payment safety', () => {
  test('online checkout, Stripe session, and webhook remain disabled', async ({ request }) => {
    const checks = [
      await request.post(`${apiBaseUrl}/orders/checkout`, { data: {} }),
      await request.get(`${apiBaseUrl}/orders/checkout/session/cs_test_readonly`),
      await request.post(`${apiBaseUrl}/payments/webhook`, { data: {} }),
    ]
    for (const response of checks) {
      expect(response.status()).toBe(503)
      expect((await response.json()).error.code).toBe('ONLINE_PAYMENT_DISABLED')
    }
  })

  test('payment confirmation cannot be called without authentication', async ({ request }) => {
    const response = await request.patch(`${apiBaseUrl}/admin-preview/orders/000000000000000000000001/payment`)
    expect(response.status()).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED')
  })
})
