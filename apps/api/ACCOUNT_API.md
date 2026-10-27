# Customer account API

All routes use the existing `/api/v1` API and require a Clerk customer bearer token. The API derives the customer record from the verified Clerk subject; clients must not send a customer ID as an ownership claim. Customer responses use `Cache-Control: private, no-store` where they contain account data.

## Overview and profile

- `GET /api/v1/account/` returns the safe profile, order/wishlist counts, and latest order.
- `PATCH /api/v1/account/` accepts only `phoneNumber` and `dateOfBirth` (`YYYY-MM-DD` or empty). Name and verified email remain owned by Clerk and are edited through its authenticated profile UI.

The older `GET /api/v1/customers/me` endpoint remains available for existing storefront integrations.

## Orders

- `GET /api/v1/account/orders?page=1&limit=10&status=processing` returns paginated orders. `status` accepts `confirmation`, `processing`, `in_delivery`, `delivered`, `returned`, `cancelled`, or `exchange`. Orders begin in `confirmation`, then follow processing, delivery, and delivery completion. Payment is unpaid until delivery is confirmed.
- `GET /api/v1/account/orders/:orderId` returns a single order only when it belongs to the authenticated customer. Unknown, malformed, and other-customer order IDs return the same not-found response.

Order items and shipping information are returned from the order snapshot. New orders keep product image snapshots and fulfillment status timestamps. Older records remain readable; missing snapshot values stay empty instead of being reconstructed from a changed product.

## Addresses

- `GET /api/v1/account/addresses`
- `POST /api/v1/account/addresses`
- `PATCH /api/v1/account/addresses/:addressId`
- `DELETE /api/v1/account/addresses/:addressId`
- `PATCH /api/v1/account/addresses/:addressId/default`

Address writes are validated and scoped to the authenticated customer. Marking an address as default uses one atomic MongoDB update pipeline that clears the other defaults on that customer document. Saved-address edits never write to an existing order snapshot.

## Wishlist and communication preferences

- `GET /api/v1/account/wishlist` returns currently published products referenced by the customer's wishlist.
- `POST /api/v1/account/wishlist` accepts `{ "productId": "..." }`; duplicate references are prevented with `$addToSet`.
- `DELETE /api/v1/account/wishlist/:productId` removes only the current customer's reference.
- `PATCH /api/v1/account/preferences` accepts one or both boolean fields: `newsletter` and `marketingEmails`.

Password, verified email, session, and sign-out actions stay with the existing Clerk integration and its authenticated `UserProfile` UI. No second password/session system is introduced in the API.
