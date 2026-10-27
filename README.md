# OFF

An independent premium fashion storefront and admin workspace inspired by the supplied editorial design reference.

## Applications

- Storefront: `http://localhost:5173`
- Admin: `http://localhost:5174`
- API: `http://127.0.0.1:5000/api/v1`

## Development

Install dependencies at the repository root with `pnpm install`, then start the storefront, admin, and API together:

```powershell
pnpm dev:all
```

To run an application on its own, use `pnpm dev:storefront`, `pnpm dev:admin`, or `pnpm dev:api`.

The storefront and admin share API contracts from `packages/shared-types`. Storefront browsing, category and collection filters, homepage copy, and the admin Products, Categories, Collections, Orders, Customers, Dashboard, Inventory, Content, and Settings screens use MongoDB. Customers can browse curated collections; administrators can create, edit, duplicate, and delete products (including variant SKU, price, image, availability, and stock), manage categories and collections, and update order fulfillment with CSV export. Storefront orders use cash on delivery by default, accept Tunisian governorate/delegation addresses and optional email, reserve stock, and appear in admin Orders; administrators can mark them paid or cancel them and restore stock. Orders can also be entered manually with customer/shipping details and stocked product variants. Product deletion also removes its collection links while preserving historical orders, and is blocked while a checkout is pending. The API inserts demonstration categories, products, customers, orders, and collections only when each corresponding collection is empty; it does not replace existing records. Product names, prices, and images are sample content.

All product, variant, order, and storefront prices are displayed in TND, retaining the existing numeric amounts without conversion. The API updates existing USD order currency labels to TND on startup without changing their totals. Manual orders use Tunisia by default, with governorate/delegation selection and an optional customer email.

The admin is protected by an email/password sign-in. Admin credentials and the JWT signing secret are loaded only from the API environment. Admin API requests require a short-lived bearer token; do not expose these credentials or secrets in frontend environment files.

Online card checkout is temporarily disabled because Stripe does not support TND payments for this integration. Cash on delivery is available instead; the API validates order addresses and product stock before creating the TND order. Stripe secrets are not required to start the API while card checkout is disabled. The admin can update inventory, homepage text, store contact preferences, and paid-order fulfillment status.

## API configuration

Create `apps/api/.env` and set `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), and a random `JWT_SECRET` of at least 32 characters. Set the Clerk backend secret as `CLERK_SECRET_KEY` (`sk_test_…` or `sk_live_…`) in this API-only environment file. The API uses it to verify Clerk session tokens and read the signed-in user's verified profile; never expose it in the storefront or any `VITE_` variable. Stripe credentials (`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`) are only needed if TND-compatible online payments are re-enabled.

To enable AI product-gallery generation in Admin > Products, set `OPENAI_API_KEY` in `apps/api/.env` and restart the API. The key stays on the API server and is never sent to the browser. The OpenAI account/project associated with the key must also have image-generation API credits available; the feature reports a clear billing message when the provider returns an insufficient-quota error. `OPENAI_IMAGE_MODEL` can be `gpt-image-2.5-sunburst` (default, precise edits) or `gpt-image-2.5-flare` (faster generation). Each explicit generation request may incur OpenAI API charges. The Admin generates up to four previews from the product's existing photos; generated files enter the Media Library, and only images manually added to the product draft appear in its storefront gallery after saving. Original photos remain in place unless removed explicitly. Remote reference images are currently supported from the project's Unsplash seed source; upload other product photos to the Media Library first.

Set `VITE_API_BASE_URL` in the storefront or admin environment only when the API is not using its local default (`http://127.0.0.1:5000/api/v1`).

Customer sign-in and account creation use Clerk on the storefront. Set `VITE_CLERK_PUBLISHABLE_KEY` to the publishable key from your Clerk application in `apps/storefront/.env.local`, then restart the storefront. Configure Clerk's sign-in and sign-up methods in the Clerk Dashboard. The account page calls the protected `/api/v1/customers/me` endpoint to link the verified Clerk account to its customer record and show order history. Signed-in checkout sends a Clerk session token for server-side verification and links the order to that account; guest checkout remains available. Customer account access requires a verified primary email address.

## Website Builder

The Admin Website area is available at `/website` and includes Overview, Pages, Homepage Builder, Navigation & Footer, Website Settings, Media Library, Scheduled Publications, and product merchandising. Page and homepage edits use versioned MongoDB drafts; the public storefront reads only published section snapshots. Admin routes are protected under `/api/v1/admin/website`; public content is exposed under `/api/v1/store/content/*`. Scheduled page drafts are published by the API scheduler when their publication time arrives. A stale editor receives a conflict response instead of overwriting a newer draft.

Product order is stored in `WebsiteConfig.draft.merchandising` and `WebsiteConfig.published.merchandising`. Each scope has its own ordered product ID list: `global`, `homepage`, `category:<id>`, or `collection:<id>`. Publish an individual scope through `/api/v1/admin/website/merchandising/:scope/publish`. Storefront manual sorting reads only the published list; collection pages also retain each collection's existing membership order by default.

Media metadata and usage references are stored in MongoDB, while image files are stored in `apps/api/uploads` and served from `/media`. Uploads accept JPEG, PNG, WebP, and AVIF up to 8 MB with signature and dimension checks. The project has no cloud image-storage provider configured, so connect one before deploying multiple API instances or requiring shared cloud persistence.
