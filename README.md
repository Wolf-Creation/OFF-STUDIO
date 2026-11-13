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

In development, the API now stays available for sign-in if MongoDB is temporarily unreachable; the health endpoint reports `503` and database-backed features remain unavailable until MongoDB is restored and the API is restarted. Check that the MongoDB service/URI is reachable and start the API with `pnpm dev:api` (or all apps with `pnpm dev:all`). Production still fails fast when MongoDB cannot be reached.

The storefront cookie banner defaults Google Consent Mode v2 analytics and advertising storage to denied, and does not request a Google tag until Analytics or Marketing consent is granted. To enable Google Analytics or Google Ads measurement, set `VITE_GOOGLE_TAG_ID` in `apps/storefront/.env.local` to a `G-…` or `AW-…` tag ID. Cookie choices are stored in the visitor's browser and every change is recorded in MongoDB; administrators can review the logs and aggregate counts under Settings → Privacy & Cookies. The `Privacy Policy` links to the existing `/legal` page.

## Analytics & Intelligence

The Admin sidebar includes Analytics & Intelligence. The tracker records page/session activity, product views and variant selections, wishlist changes, cart additions/removals, search submissions, checkout starts/steps, order-placement (`purchase`), scroll checkpoints, CTA impressions/clicks, and distinct UTM campaign visits within a session. Collection of these events is disabled unless the visitor has granted Analytics consent; the API independently checks the latest stored consent before accepting each event. Event IDs are unique, event payloads reject query strings and contact details in free-text fields, and raw analytics events expire after 395 days.

Cookie consent records are separate from analytics events. Each record retains a pseudonymous visitor ID, the Necessary/Functional/Analytics/Marketing preferences, the action (`accept_all`, `reject_all`, or `custom`), policy version, timestamps, and optional synthetic-seed metadata. These records support enforcing the latest choice and tracing which policy version was presented; the model does not store an IP address or contact details. Consent records currently have no TTL index, and no retention period has been formally approved. A provisional recommendation for business/legal review is to retain each record for 24 months after that choice, then delete or anonymize it unless counsel confirms a longer applicable claims or regulatory period. **The 24-month recommendation is not an approved policy. Business and legal approval, including jurisdiction-specific requirements, is required before any production retention or expiry behavior is activated.** Do not apply the 395-day AnalyticsEvent TTL to consent evidence; that TTL applies only to raw analytics events.

Realized revenue comes from MongoDB orders where `paymentStatus = paid` and `fulfillmentStatus = delivered`, never from browser purchase events. COD placement is recorded as an order conversion, not as paid revenue; delivery alone does not set the payment status, which requires a separate cash-collection confirmation. Cancelled, returned, unpaid, and not-yet-delivered orders are excluded from realized-revenue metrics. The headline, daily, first/last-touch, product, collection, and customer reports use this same current paid-and-delivered eligibility rule. Revenue uses `Order.total` and reports are grouped by `placedAt`, not delivery date. The conversion-rate numerator is the distinct set of analytics-attributed visitors with an online order placed in the period, divided by unique analytics visitors in that period; multiple orders by one visitor count once, and the order need not yet be paid or delivered. The Average Order Value uses realized revenue divided by the count of paid-and-delivered orders in the period. Product revenue sums `unitPrice × quantity` for qualifying order lines and collection revenue attributes qualifying item lines to a preceding consented collection click. Product/collection line revenue is merchandise value, not an allocation of order shipping, tax, or discounts, and collection subtotals are not expected to sum to headline revenue. A purchase is attributed to a visitor only when an analytics-consented session can be matched to the order; first-touch combines the earliest retained session entry with its campaign event, and last-touch uses the latest retained session/campaign touch. Attribution is saved only after checking current consent. Product reports include visitor-level view-to-wishlist, wishlist-to-cart, view-to-cart, and consent-attributed view-to-purchase rates, plus first-view-to-order time. Product event timestamps are assigned by the API when received; clients cannot submit or backdate timestamps. Variant selection events are joined to qualifying order line items for size/color demand and conversion; stock uses current active variants.

Checkout analytics use the live cash-on-delivery flow: checkout start, submitted shipping information, and order placement. Abandonment only counts sessions at least 30 minutes old, deduplicates by session, and excludes any matching online order placed after checkout began, including one created just after the selected reporting interval. The event-cohort filters use inclusive starts and exclusive ends; the later-order exception is applied only to abandonment conversion matching. This checkout has no active online payment provider, so payment-attempt/failure/success stages are absent. The overview visitor funnel intersects the same visitor IDs at each stage and counts attributed order placement at its purchase stage. Collection performance attributes consented product clicks to the most recent clicked collection before a matching qualifying order. Campaign reports distinguish source, medium, and campaign for consented UTM visits, and use paid-and-delivered orders for first-/last-touch attributed revenue; ROI is not shown because campaign-cost data is not configured.

Customer cohorts use only customer records linked to a verified Clerk account and paid-and-delivered orders. The dashboard exposes aggregate first-time versus returning customer counts, monthly first-purchase cohorts, retention, repeat-purchase rate, purchase frequency, inter-purchase time, and average lifetime revenue; it does not return customer identifiers or contact details. Rule-based business insights include their evidence, comparison period, severity, and suggested action, and only appear when minimum data thresholds are met. Checkout and campaign reports are consent-limited; customer cohort reports use authenticated account/order records.

Reports contain aggregate metrics and do not expose customer names or contact information. Traffic history starts when this tracking is deployed, and raw analytics events expire after 395 days, so product behavior and visitor-based attribution are not backfilled. Cohort lifetime values and customer purchase history come from retained order records and can outlast the event-retention window. Traffic/channel revenue is attribution, not campaign ROI; no spend or return-on-ad-spend is inferred without actual campaign cost records. Historical availability, consent rates, and minimum insight thresholds may leave reports empty or sparse.

Event IDs are unique in MongoDB; duplicate submissions are acknowledged as duplicates rather than counted twice. Anonymous visitor IDs are first-party UUIDs stored only after cookie consent is recorded, and session IDs expire after 30 minutes of inactivity. CTA IDs include the page path; impressions are recorded only after at least 50% visibility, while CTA click-through rate counts unique clicked visitors with a measured impression. Active-visitor totals use the current five-minute window and exclude visitors whose latest consent record has withdrawn Analytics consent.

The Product Opportunity Score is a 0–100 relative prioritization index: relative views, unique visitors, wishlist additions, and add-to-cart events contribute 10 points each; visitor-level wishlist and cart conversion contribute 10 each; attributed purchase conversion and confirmed units contribute 15 each; and trailing-90-day confirmed sales pressure against active stock contributes 10. The score is not a probability or sales forecast. Products with fewer than five views or unique visitors receive no score; only products with at least 20 unique viewers are eligible for the supported high-opportunity ranking. Inventory velocity and demand trends use paid-and-delivered line items from the trailing 90 days; stock-cover estimates are withheld unless there are at least three sold units spanning at least two calendar months. Demand alerts compare recent confirmed sales with current active variant stock and should be checked against supplier lead times before replenishment decisions.

Reports & Insights supports calendar-month reporting and CSV export for traffic/revenue, products, collections, campaigns, cohorts, checkout funnel, inventory history, and rule-based business opportunities. Completed calendar months compare with the prior complete month; the current month is month-to-date and compares with the same elapsed number of days in the prior month. API report responses are cached in-process for at most 15 seconds; every mutating API request invalidates that process's overview cache before and after the write, and manual refresh bypasses the cache. A write handled by a different API instance or made directly in MongoDB cannot invalidate another instance's cache, so multi-instance deployments have a maximum 15-second cross-instance staleness window unless cache invalidation is distributed. Compound indexes support event type/date/product and order status/date report filters.

### Analytics Production-Readiness Audit (2026-11-04)

- COD order definitions: `confirmation` means placed, not realized; delivered orders are marked paid; cancelled and returned orders are excluded from realized revenue. All order-backed reports use the same paid-and-delivered filter, preventing cancelled/returned/unpaid orders from contributing or an order being counted more than once.
- Realized revenue uses delivered, paid `Order.total`. Product revenue is the gross merchandise value (`unitPrice × quantity`) for those same eligible orders; collection revenue is the attributed subset of qualifying item lines. Shipping, tax, and discounts are not allocated to product/collection lines. Reporting periods use the order's `placedAt`, not delivery/return transition timestamps; this is order-cohort reporting, not delivery-date accounting.
- Business insights are evidence-based dashboard cards, not notification dispatches. A high-interest/low-stock variant is not repeated as a second demand/stock insight; minimum visitor, purchase, and conversion-change thresholds remain in force.
- An earlier browser QA pass covered the six analytics routes (Overview, Website Performance, E-commerce Performance, Marketing Performance, Customer Intelligence, Reports & Insights) at 1440px, 1024px, and 390px widths. The dashboard rendered and no element extended beyond the viewport in that pass; additional interactions are recorded in the final staging validation below.
- Estimated local collection counts were 293 analytics events, 10 orders, 8 products, and 9 customers during this audit. Two browser analytics requests took approximately 731–732ms on that small dataset. MongoDB execution-statistics could not be collected because the API/database connection became unavailable. These observations are smoke measurements only; no 10,000-visitor/100,000-event/10,000-product-view/multi-thousand-order load test or representative production benchmark was run. Do not extrapolate these timings to production.
- Deployment status: conditional, not production-certified. Before launch, run the requested synthetic load test against an isolated staging MongoDB replica set with the production indexes, capture `executionStats`/latency and memory at target data sizes, and validate delivered-date accounting if financial reporting needs cash-receipt timing. Preserve analytics consent checks and admin authentication in staging.

### Final Staging Validation (2026-11-04)

No synthetic records were written. The running API reported MongoDB connected, but the configured Atlas target could not be verified as an isolated staging database. Using it for a load test would risk contaminating a non-staging environment.

| Area | Status | Evidence / limitation |
|---|---|---|
| Isolated staging database and requested synthetic datasets | NOT TESTED | No staging identity was verified; no fixture writes were made. |
| Target-scale API/database benchmarks | NOT TESTED | No 10,000-visitor, 100,000-event, 3,000-order, 500-product, or 2,000-customer benchmark was run. Response latency, MongoDB `executionStats`, documents examined/returned, index plans, pipeline time, and memory at target scale remain unknown. |
| MongoDB reliability under outage or multi-instance load | WARNING | The API health endpoint returned `200` with database `connected` in development. Connection setup specifies a 5-second server-selection timeout; outage recovery and cross-instance behavior were not fault-injected. The in-process report cache can remain stale across instances for up to 15 seconds, as described above. |
| Authenticated analytics routes and responsive rendering | PASS | All six analytics routes returned successfully and rendered at 1440px, 1024px, and 390px; no horizontal overflow was observed in the 18 route/viewport checks. |
| Filters, drill-downs, and rankings | PASS | Period and report-month controls, funnel-stage detail, marketing navigation, product-intelligence tabs, and size/color view-vs-purchase sorting were exercised. |
| CSV report export | PASS | The monthly export produced a CSV Blob containing the expected delivered-order and realized-revenue columns. |
| Empty and error states | PASS | Empty-period messaging rendered. A simulated `503` displayed the error and Retry action; a simulated `401` removed the admin session token and transitioned the app to its unauthenticated state. |
| Analytics pagination | WARNING | The analytics tables expose bounded top-result lists rather than pagination controls; pagination is not available to validate. |
| Workspace production builds | PASS | `npm run build` completed for storefront, admin, and API. The storefront CSS minifier emitted syntax warnings; they did not fail the build and were not changed as part of this audit. |
| API, consent, and revenue regression tests | PASS | `npm test --workspace @off/api`: all 34 tests passed, including analytics consent, event deduplication, and revenue-source coverage. |
| Admin authentication expiration | WARNING | The authenticated admin session accessed analytics; a simulated `401` removed its browser token and switched the app to its unauthenticated state. Real token expiry and login/logout against staging were not exercised. |
| `git diff --check` | PASS | Completed without whitespace errors. Git reported line-ending conversion warnings for existing modified files. |

Production deployment remains conditional. Before release, provision and explicitly identify a dedicated staging database or isolated clone, rerun the requested synthetic workload without using production, capture MongoDB explain execution statistics and API/memory measurements, and complete outage/recovery tests against that target. Do not treat the responsive smoke checks or successful build as a substitute for scale testing.

Customer sign-in and account creation use Clerk on the storefront. Set `VITE_CLERK_PUBLISHABLE_KEY` to the publishable key from your Clerk application in `apps/storefront/.env.local`, then restart the storefront. Configure Clerk's sign-in and sign-up methods in the Clerk Dashboard. The account page calls the protected `/api/v1/customers/me` endpoint to link the verified Clerk account to its customer record and show order history. Signed-in checkout sends a Clerk session token for server-side verification and links the order to that account; guest checkout remains available. Customer account access requires a verified primary email address.

## Synthetic staging data preparation

The API includes a staging-only synthetic data planning layer for OFF Studio Analytics & Intelligence. It is intentionally not executed automatically and does not write to MongoDB; it only validates the staging guardrails and prepares a deterministic data plan before a future, explicit seed run. The generator keeps the required metadata fields available in the existing Mongoose models (`isSynthetic`, `seedRunId`, `seedScenario`, `createdBySeed`) so synthetic records can be traced without altering existing behavior or data semantics.

The staged plan matches the requested volumes:

- 100 products
- 10 categories
- 15 collections
- 500 customers
- 1,500 orders
- 1,000 wishlist entries
- 100,000 analytics events
- 10,000 CTA events
- 20 campaigns
- 10,000 visitor sessions

The plan is guarded by the same explicit staging checks used by the verified database step: `NODE_ENV=staging`, `ALLOW_SYNTHETIC_DATA=true`, exact `off_studio_staging` database target, and the verified Atlas cluster hostname. The generator stops outside staging and refuses to fall back to a production or unrecognized database. No destructive reset command is enabled in this preparation phase.

## API MongoDB target safeguards

The API preserves variables supplied by the process environment and loads dotenv values in this order: `DOTENV_CONFIG_PATH`, `.env.<NODE_ENV>`, then `.env`. The database name in `MONGODB_URI` is authoritative; if `MONGODB_DB_NAME` is also set, it must match. Staging is pinned to the verified `off_studio_staging` database and its staging Atlas hostname. Test and production startup require explicit `MONGODB_EXPECTED_DB_NAME` and `MONGODB_EXPECTED_CLUSTER_HOST` values and compare them with both the URI and the connected MongoDB identity before serving requests. Development remains unpinned unless both expected target values are explicitly configured, and the health endpoint reports that target as unverified.

Available commands (not executed in this session):

```bash
npm run seed:plan
npm run seed:validate
npm run seed:stats
npm run seed:scenario
npm run seed:test
```

## Website Builder

The Admin Website area is available at `/website` and includes Overview, Pages, Homepage Builder, Navigation & Footer, Website Settings, Media Library, Scheduled Publications, and product merchandising. Page and homepage edits use versioned MongoDB drafts; the public storefront reads only published section snapshots. Admin routes are protected under `/api/v1/admin/website`; public content is exposed under `/api/v1/store/content/*`. Scheduled page drafts are published by the API scheduler when their publication time arrives. A stale editor receives a conflict response instead of overwriting a newer draft.

Product order is stored in `WebsiteConfig.draft.merchandising` and `WebsiteConfig.published.merchandising`. Each scope has its own ordered product ID list: `global`, `homepage`, `category:<id>`, or `collection:<id>`. Publish an individual scope through `/api/v1/admin/website/merchandising/:scope/publish`. Storefront manual sorting reads only the published list; collection pages also retain each collection's existing membership order by default.

Media metadata and usage references are stored in MongoDB, while image files are stored in `apps/api/uploads` and served from `/media`. Uploads accept JPEG, PNG, WebP, and AVIF up to 8 MB with signature and dimension checks. The project has no cloud image-storage provider configured, so connect one before deploying multiple API instances or requiring shared cloud persistence.
