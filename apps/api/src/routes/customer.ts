import { Router } from 'express'
import { CustomerAuthError, authenticateCustomer, resolveClerkCustomer } from '../customerAuth.js'
import { Order } from '../models/Order.js'

const router = Router()

router.get('/me', authenticateCustomer, async (request, response, next) => {
  try {
    const customer = await resolveClerkCustomer(request.clerkUserId!)
    const orders = await Order.find({ customerId: customer._id })
      .select('orderNumber items orderNote shippingAddress total currency paymentStatus paymentMethod fulfillmentStatus placedAt')
      .sort({ placedAt: -1 })
      .limit(50)
      .lean()
    response.json({
      data: {
        customer: {
          name: customer.name,
          email: customer.email,
          orderCount: customer.orderCount,
          totalSpent: customer.totalSpent,
        },
        orders,
      },
    })
  } catch (error) {
    if (error instanceof CustomerAuthError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    next(error)
  }
})

export const customerRouter = router
