import { apiBaseUrl, expect, getAdminOrders, openAuthenticatedAdmin, signInAdmin, test } from './fixtures'

test.describe('admin orders read-only management', () => {
  test('orders list and order details are visible without changing historical records', async ({ page, request }) => {
    const token = await signInAdmin(request)
    const orders = await getAdminOrders(request, token)
    expect(orders.length).toBeGreaterThan(0)
    const first = orders[0]
    const before = { fulfillmentStatus: first.fulfillmentStatus, paymentStatus: first.paymentStatus }

    await openAuthenticatedAdmin(page, token, '/orders')
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Search orders...')).toBeVisible()
    const orderLink = page.locator('.order-detail-link').filter({ hasText: first.orderNumber }).first()
    await expect(orderLink).toBeVisible()
    await orderLink.click()

    const details = page.getByRole('dialog')
    await expect(details.getByRole('heading', { name: `#${first.orderNumber}` })).toBeVisible()
    await expect(details.getByText('PAYMENT')).toBeVisible()
    await expect(details.getByText('FULFILLMENT')).toBeVisible()

    const invalidTransition = await request.patch(`${apiBaseUrl}/admin-preview/orders/${first._id}/fulfillment`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { fulfillmentStatus: 'not-a-valid-status' },
    })
    expect(invalidTransition.status()).toBe(400)
    const after = await getAdminOrders(request, token)
    const unchanged = after.find(order => order._id === first._id)
    expect(unchanged).toMatchObject(before)
  })

  test('order status selector is available but left unchanged', async ({ page, request }) => {
    const token = await signInAdmin(request)
    const orders = await getAdminOrders(request, token)
    test.skip(orders.length === 0, 'No staging orders are available to inspect.')
    await openAuthenticatedAdmin(page, token, '/orders')

    const statusControl = page.getByLabel(`Fulfillment status for ${orders[0].orderNumber}`)
    await expect(statusControl).toBeVisible()
    expect(await statusControl.inputValue()).toBe(orders[0].fulfillmentStatus)
  })
})
