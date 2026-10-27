import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { SignIn, SignOutButton, SignUp, UserProfile, useAuth, useUser } from '@clerk/react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Heart, MapPin, Package, Plus, Settings, ShieldCheck, UserRound, X } from 'lucide-react'
import type { Product } from './App'
import type { ProductVariant } from '@off/shared-types'
import './CustomerAccountExperience.css'

type AccountCustomer = {
  id: string
  name: string
  email: string
  phoneNumber: string
  dateOfBirth: string
  orderCount: number
  totalSpent: number
  wishlistCount: number
  wishlistProductIds: string[]
  communicationPreferences: { newsletter: boolean; marketingEmails: boolean }
}
type OrderSummary = {
  _id: string
  orderNumber: string
  items: { productId: string; name: string; image?: string; sku: string; color: string; size: string; unitPrice: number; quantity: number }[]
  total: number
  currency: string
  paymentStatus: string
  paymentMethod?: string
  fulfillmentStatus: 'confirmation' | 'processing' | 'in_delivery' | 'delivered' | 'returned' | 'cancelled' | 'exchange'
  statusHistory?: { status: string; changedAt: string }[]
  placedAt: string
}
type OrderDetail = OrderSummary & {
  shippingAddress?: { fullName?: string; phoneNumber?: string; line1: string; line2?: string; city: string; postalCode?: string; country: string; governorate?: string; delegation?: string }
  subtotal?: number
  shippingAmount?: number
  discountAmount?: number
  taxAmount?: number
  trackingNumber?: string
}
type Address = {
  _id: string
  label: string
  fullName: string
  phoneNumber: string
  addressLine1: string
  addressLine2: string
  city: string
  postalCode: string
  country: string
  governorate: string
  delegation: string
  isDefault: boolean
}
type AddressDraft = Omit<Address, '_id'>
type AccountContextValue = {
  apiBaseUrl: string
  customer: AccountCustomer
  refreshCustomer: () => Promise<void>
  request: <T>(path: string, init?: RequestInit) => Promise<T>
  products: Product[]
  addToBag: (productId: string, size: string, color: string, sku: string, quantity?: number) => boolean
  formatPrice: (value: number) => string
  renderProductCard: (product: Product, liked: boolean, onWishlistToggle: () => void) => ReactNode
}
type AccountProps = {
  apiBaseUrl: string
  products: Product[]
  addToBag: AccountContextValue['addToBag']
  formatPrice: AccountContextValue['formatPrice']
  renderProductCard: AccountContextValue['renderProductCard']
  footer: ReactNode
}
const AccountContext = createContext<AccountContextValue | null>(null)
const navItems = [
  { to: '/account', label: 'Overview', icon: UserRound, end: true },
  { to: '/account/orders', label: 'My Orders', icon: Package },
  { to: '/account/addresses', label: 'My Addresses', icon: MapPin },
  { to: '/account/wishlist', label: 'My Wishlist', icon: Heart },
  { to: '/account/profile', label: 'Personal Information', icon: UserRound },
  { to: '/account/settings', label: 'Settings & Security', icon: Settings },
]
const emptyAddress: AddressDraft = { label: 'Home', fullName: '', phoneNumber: '', addressLine1: '', addressLine2: '', city: '', postalCode: '', country: 'TN', governorate: '', delegation: '', isDefault: false }
const statusLabel: Record<OrderSummary['fulfillmentStatus'], string> = { confirmation: 'Confirmation', processing: 'En cours de traitement', in_delivery: 'En cours de livraison', delivered: 'Livrée', returned: 'Retour', cancelled: 'Annulée', exchange: 'Échange' }
const statusTone: Record<OrderSummary['fulfillmentStatus'], string> = { confirmation: 'processing', processing: 'processing', in_delivery: 'shipped', delivered: 'delivered', returned: 'cancelled', cancelled: 'cancelled', exchange: 'shipped' }
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))

function useAccount() {
  const value = useContext(AccountContext)
  if (!value) throw new Error('Customer account context is unavailable.')
  return value
}

function mapProduct(raw: Record<string, unknown>, apiBaseUrl: string): Product {
  const variants = Array.isArray(raw.variants) ? raw.variants as ProductVariant[] : []
  const images = Array.isArray(raw.images) ? raw.images as { url: string }[] : []
  const mediaBaseUrl = apiBaseUrl.replace(/\/api\/v1$/, '')
  const publicUrl = (url: string) => url.startsWith('/') ? `${mediaBaseUrl}${url}` : url
  return {
    id: String(raw._id), slug: String(raw.slug ?? raw._id), name: String(raw.name ?? 'OFF piece'), price: Number(raw.price ?? 0),
    category: String(raw.category ?? ''), color: variants.find(item => item.active)?.color ?? '', image: publicUrl(images[0]?.url ?? ''),
    gallery: images.map(image => publicUrl(image.url)), secondary: publicUrl(variants.find(item => item.active && item.image)?.image ?? images[0]?.url ?? ''),
    sizes: [...new Set(variants.filter(item => item.active && item.stock > 0).map(item => item.size))], variants, createdAt: String(raw.createdAt ?? ''),
  }
}

function AccountLogin({ mode, returnTo }: { mode: 'sign-in' | 'sign-up'; returnTo: string }) {
  const navigate = useNavigate()
  return <main className="page-shell account-login-page">
    <section className="account-login-intro">
      <p className="eyebrow">WELCOME TO OFF</p>
      <h1>Welcome<br />to your<br />next chapter.</h1>
      <p>Sign in to discover your orders, manage your details, and keep your OFF pieces close.</p>
    </section>
    <section className="account-login-panel"><div className="account-auth-tabs" role="tablist" aria-label="Account access">
      <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => navigate(`/account?mode=sign-in&returnTo=${encodeURIComponent(returnTo)}`)}>SIGN IN</button>
      <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'active' : ''} onClick={() => navigate(`/account?mode=sign-up&returnTo=${encodeURIComponent(returnTo)}`)}>CREATE ACCOUNT</button>
    </div>{mode === 'sign-in'
      ? <SignIn signUpUrl={`/account?mode=sign-up&returnTo=${encodeURIComponent(returnTo)}`} fallbackRedirectUrl={returnTo} appearance={accountClerkAppearance} />
      : <SignUp signInUrl={`/account?mode=sign-in&returnTo=${encodeURIComponent(returnTo)}`} fallbackRedirectUrl={returnTo} appearance={accountClerkAppearance} />}</section>
  </main>
}

const accountClerkAppearance = {
  variables: { colorPrimary: '#171918', colorText: '#171918', colorTextSecondary: '#777872', colorBackground: '#ffffff', colorInputBackground: '#ffffff', colorInputText: '#171918', borderRadius: '0px', fontFamily: 'DM Sans, sans-serif' },
  elements: { rootBox: { width: '100%' }, cardBox: { width: '100%', boxShadow: 'none' }, card: { width: '100%', padding: '0', boxShadow: 'none', border: '0', background: 'transparent' }, headerTitle: { fontFamily: 'Cormorant Garamond, serif', fontSize: '28px', fontWeight: '400' }, headerSubtitle: { fontSize: '13px', color: '#777872' }, formFieldLabel: { fontSize: '12px', color: '#454741' }, formFieldInput: { width: '100%', minHeight: '44px', border: '1px solid #d6d5d1', boxShadow: 'none' }, formButtonPrimary: { minHeight: '44px', borderRadius: '0', background: '#171918', textTransform: 'uppercase', letterSpacing: '.08em', fontSize: '11px', boxShadow: 'none' }, socialButtonsBlockButton: { minHeight: '44px', borderRadius: '0', border: '1px solid #dedfdb', boxShadow: 'none' }, footerActionLink: { color: '#171918' } },
}
export function CustomerAccountExperience({ apiBaseUrl, products, addToBag, formatPrice, renderProductCard, footer }: AccountProps) {
  const { user, isLoaded, isSignedIn } = useUser()
  const { getToken } = useAuth()
  const location = useLocation()
  const [customer, setCustomer] = useState<AccountCustomer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getToken()
    if (!token) throw new Error('Your customer session could not be verified. Please sign in again.')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${apiBaseUrl}/account${path}`, { ...init, headers, cache: 'no-store' })
    const payload = await response.json() as { data?: unknown; error?: { message?: string } }
    if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? 'Unable to complete your request. Please try again.')
    return payload.data as T
  }, [apiBaseUrl, getToken])

  const refreshCustomer = useCallback(async () => {
    const payload = await request<{ customer: AccountCustomer }>('/')
    setCustomer(payload.customer)
  }, [request])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError('')
    void request<{ customer: AccountCustomer }>('/').then(payload => { if (!cancelled) setCustomer(payload.customer) })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load your OFF account.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, request, retry, user?.id])

  const context = useMemo<AccountContextValue>(() => ({ apiBaseUrl, customer: customer!, refreshCustomer, request, products, addToBag, formatPrice, renderProductCard }), [apiBaseUrl, customer, refreshCustomer, request, products, addToBag, formatPrice, renderProductCard])
  const returnTo = `${location.pathname}${location.search}`
  if (!isLoaded || (isSignedIn && loading)) return <><main className="page-shell account-loading"><p className="eyebrow">YOUR OFF ACCOUNT</p><div className="account-skeleton" /><div className="account-skeleton" /></main>{footer}</>
  if (!isSignedIn) {
    const mode = new URLSearchParams(location.search).get('mode') === 'sign-up' ? 'sign-up' : 'sign-in'
    const requestedReturn = new URLSearchParams(location.search).get('returnTo')
    return <><AccountLogin mode={mode} returnTo={requestedReturn?.startsWith('/account') ? requestedReturn : returnTo} />{footer}</>
  }
  if (error || !customer) return <><main className="page-shell account-page"><p className="eyebrow">YOUR OFF ACCOUNT</p><h1>We couldn't load your account.</h1><p className="account-error" role="alert">{error || 'Your account details are unavailable right now.'}</p><button className="button button-dark" onClick={() => setRetry(value => value + 1)}>TRY AGAIN <ArrowRight size={14} /></button></main>{footer}</>
  const accountPath = location.pathname.replace(/\/+$/, '') || '/account'
  const orderDetailMatch = accountPath.match(/^\/account\/orders\/([^/]+)$/)
  const accountPage = accountPath === '/account' ? <AccountOverviewPage />
    : accountPath === '/account/orders' ? <OrdersPage />
      : orderDetailMatch ? <OrderDetailsPage orderId={decodeURIComponent(orderDetailMatch[1])} />
        : accountPath === '/account/addresses' ? <AddressesPage />
          : accountPath === '/account/wishlist' ? <WishlistPage />
            : accountPath === '/account/profile' ? <ProfilePage />
              : accountPath === '/account/settings' ? <SettingsPage />
                : <Navigate to="/account" replace />
  return <AccountContext.Provider value={context}><AccountLayout>{accountPage}</AccountLayout>{footer}</AccountContext.Provider>
}

function AccountLayout({ children }: { children: ReactNode }) {
  const { customer } = useAccount()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const initial = customer.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'OFF'
  return <main className="account-shell page-shell">
    <div className="account-mobile-heading"><div><p className="eyebrow">MY ACCOUNT</p><span>{customer.name}</span></div><button aria-expanded={mobileNavOpen} aria-label="Toggle account navigation" onClick={() => setMobileNavOpen(value => !value)}><ChevronDown size={17} /></button></div>
    <aside className={`account-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
      <div className="account-customer-card"><span className="account-avatar">{initial}</span><div><strong>{customer.name}</strong><small>{customer.email}</small></div></div>
      <nav aria-label="Customer account navigation">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} end={end} to={to} onClick={() => setMobileNavOpen(false)}><Icon size={16} strokeWidth={1.5} /><span>{label}</span></NavLink>)}</nav>
      <SignOutButton signOutOptions={{ redirectUrl: '/account' }}><button className="account-signout"><ArrowLeft size={15} /> Sign Out</button></SignOutButton>
    </aside>
    <section className="account-content">{children}</section>
  </main>
}

function AccountPageTitle({ eyebrow = 'YOUR OFF ACCOUNT', title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <header className="account-page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header>
}

function AccountOverviewPage() {
  const { customer, request, products, renderProductCard } = useAccount()
  const [summary, setSummary] = useState<{ stats: { totalOrders: number; ordersInProgress: number; wishlistItems: number }; latestOrder: OrderSummary | null } | null>(null)
  const [wishlistIds, setWishlistIds] = useState<string[]>(customer.wishlistProductIds ?? [])
  const [error, setError] = useState('')
  useEffect(() => { let cancelled = false; request<{ stats: NonNullable<typeof summary>['stats']; latestOrder: OrderSummary | null }>('/').then(data => { if (!cancelled) setSummary(data) }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load your overview.') }); return () => { cancelled = true } }, [request])
  const toggleWishlist = async (product: Product) => {
    const liked = wishlistIds.includes(product.id)
    try {
      const payload = await request<{ count: number }>(liked ? `/wishlist/${product.id}` : '/wishlist', liked ? { method: 'DELETE' } : { method: 'POST', body: JSON.stringify({ productId: product.id }) })
      setWishlistIds(current => liked ? current.filter(id => id !== product.id) : [...current, product.id])
      setSummary(current => current ? { ...current, stats: { ...current.stats, wishlistItems: payload.count } } : current)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your wishlist.') }
  }
  const recommended = [...products].sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')).slice(0, 4)
  return <div className="account-page-view">
    <AccountPageTitle eyebrow={`WELCOME BACK, ${customer.name.split(' ')[0]?.toUpperCase() || 'OFF CUSTOMER'}`} title="Your OFF experience, all in one place." subtitle="A considered place for your orders, details, and favourite pieces." action={<Link to="/account/profile" className="account-outline-button">EDIT PROFILE <ArrowRight size={13} /></Link>} />
    {error && <p className="account-error" role="alert">{error}</p>}
    <div className="account-stat-grid">{[['Total Orders', summary?.stats.totalOrders], ['In Progress', summary?.stats.ordersInProgress], ['Wishlist Items', summary?.stats.wishlistItems]].map(([label, value]) => <article className="account-stat" key={label}><small>{label}</small><strong>{value ?? '—'}</strong></article>)}</div>
    <section className="account-section-block"><div className="account-section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Latest order</h2></div><Link to="/account/orders">View all orders <ArrowRight size={13} /></Link></div>
      {summary ? summary.latestOrder ? <OrderCard order={summary.latestOrder} /> : <div className="account-empty-state"><Package size={24} /><h3>Your OFF journey starts here.</h3><p>Your orders will appear here once you place one.</p><Link className="account-dark-button" to="/shop">DISCOVER THE COLLECTION <ArrowRight size={13} /></Link></div> : error ? null : <AccountLoadingRows />}
    </section>
    <section className="account-section-block"><div className="account-section-heading"><div><p className="eyebrow">THE LATEST EDIT</p><h2>Discover something new</h2></div><Link to="/shop">Shop all <ArrowRight size={13} /></Link></div>
      {recommended.length ? <div className="account-recommend-grid">{recommended.map(product => <div key={product.id}>{renderProductCard(product, wishlistIds.includes(product.id), () => void toggleWishlist(product))}</div>)}</div> : <p className="account-muted">New pieces are on their way.</p>}
    </section>
  </div>
}

function OrderCard({ order }: { order: OrderSummary }) {
  const { formatPrice, apiBaseUrl } = useAccount()
  const mediaBaseUrl = apiBaseUrl.replace(/\/api\/v1$/, '')
  const images = [...new Set(order.items.map(item => item.image).filter((image): image is string => Boolean(image)))].slice(0, 3)
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  return <article className="account-order-card"><div className="account-order-main"><div><p className="eyebrow">ORDER {order.orderNumber}</p><span>Placed {dateLabel(order.placedAt)} · {itemCount} {itemCount === 1 ? 'piece' : 'pieces'}</span></div><span className={`account-status status-${statusTone[order.fulfillmentStatus]}`}>{statusLabel[order.fulfillmentStatus]}</span></div><div className="account-order-bottom"><div className="account-order-thumbs">{images.length ? images.map((image, index) => <img src={image.startsWith('/') ? `${mediaBaseUrl}${image}` : image} alt="" key={`${image}-${index}`} />) : <span className="account-order-placeholder"><Package size={15} /></span>}</div><strong>{formatPrice(order.total)}</strong><Link to={`/account/orders/${order._id}`} className="account-text-button">VIEW DETAILS <ArrowRight size={13} /></Link></div></article>
}

function OrdersPage() {
  const { request } = useAccount()
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ orders: OrderSummary[]; pagination: { page: number; pages: number; total: number } } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => { let cancelled = false; setLoading(true); setError(''); const params = new URLSearchParams({ page: String(page), limit: '10' }); if (filter) params.set('status', filter); request<typeof result>(`/orders?${params}`).then(data => { if (!cancelled) setResult(data) }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load orders.') }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } }, [filter, page, request, retry])
  const filters = [['', 'All'], ['confirmation', 'Confirmation'], ['processing', 'En cours de traitement'], ['in_delivery', 'En cours de livraison'], ['delivered', 'Livrée'], ['returned', 'Retour'], ['cancelled', 'Annulée'], ['exchange', 'Échange']]
  return <div className="account-page-view"><AccountPageTitle title="My Orders" subtitle="View and track your OFF orders." />
    <div className="account-filter-tabs" role="tablist" aria-label="Filter orders">{filters.map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => { setFilter(value); setPage(1) }}>{label}</button>)}</div>
    {loading ? <AccountLoadingRows /> : error ? <AccountError message={error} onRetry={() => setRetry(value => value + 1)} /> : result?.orders.length ? <><div className="account-orders-list">{result.orders.map(order => <OrderCard order={order} key={order._id} />)}</div>{result.pagination.pages > 1 && <div className="account-pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>PREVIOUS</button><span>PAGE {page} OF {result.pagination.pages}</span><button disabled={page >= result.pagination.pages} onClick={() => setPage(value => value + 1)}>NEXT</button></div>}</> : <AccountEmpty icon={<Package size={23} />} title="No orders in this view." copy="Discover pieces made to move with you." action={<Link className="account-dark-button" to="/shop">DISCOVER COLLECTION <ArrowRight size={13} /></Link>} />}
  </div>
}

function OrderDetailsPage({ orderId }: { orderId: string }) {
  const { request, formatPrice, apiBaseUrl } = useAccount()
  const mediaBaseUrl = apiBaseUrl.replace(/\/api\/v1$/, '')
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => { let cancelled = false; setLoading(true); request<{ order: OrderDetail }>(`/orders/${encodeURIComponent(orderId)}`).then(data => { if (!cancelled) setOrder(data.order) }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load this order.') }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } }, [orderId, request, retry])
  if (loading) return <div className="account-page-view"><AccountLoadingRows /></div>
  if (error || !order) return <div className="account-page-view"><AccountPageTitle title="Order details" /><AccountError message={error || 'Order not found.'} onRetry={() => setRetry(value => value + 1)} /><Link className="account-text-button" to="/account/orders"><ArrowLeft size={13} /> BACK TO ORDERS</Link></div>
  const timeline = ['confirmation', 'processing', 'in_delivery', 'delivered']
  const history = order.statusHistory ?? []
  const activeProgressIndex = timeline.indexOf(order.fulfillmentStatus)
  const currentIndex = activeProgressIndex >= 0 ? activeProgressIndex : history.reduce((last, entry) => Math.max(last, timeline.indexOf(entry.status)), 0)
  const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  return <div className="account-page-view"><Link to="/account/orders" className="account-back-link"><ArrowLeft size={14} /> Back to orders</Link><AccountPageTitle eyebrow={`ORDER ${order.orderNumber}`} title="Order details" subtitle={`Placed ${dateLabel(order.placedAt)}`} action={<span className={`account-status status-${statusTone[order.fulfillmentStatus]}`}>{statusLabel[order.fulfillmentStatus]}</span>} />
    <section className="account-detail-panel"><p className="eyebrow">ORDER PROGRESS</p><div className="account-timeline">{timeline.map((status, index) => { const entry = history.find(item => item.status === status); const complete = index <= currentIndex; return <div className={`account-timeline-step ${complete ? 'complete' : ''}`} key={status}><span className="timeline-dot">{complete ? <Check size={12} /> : null}</span><div><strong>{statusLabel[status as OrderSummary['fulfillmentStatus']]}</strong><small>{entry ? dateLabel(entry.changedAt) : complete && status === 'confirmation' ? dateLabel(order.placedAt) : 'Pending'}</small></div></div> })}</div>{(['cancelled', 'returned', 'exchange'] as string[]).includes(order.fulfillmentStatus) && <p className="account-error">Statut de commande : {statusLabel[order.fulfillmentStatus]}.</p>}{order.trackingNumber && <p className="account-tracking">Tracking number <strong>{order.trackingNumber}</strong></p>}</section>
    <div className="account-detail-grid"><section className="account-detail-panel"><p className="eyebrow">PURCHASED PIECES</p>{order.items.map((item, index) => <article className="account-purchased-item" key={`${item.sku}-${index}`}><div className="account-purchased-image">{item.image && <img src={item.image.startsWith('/') ? `${mediaBaseUrl}${item.image}` : item.image} alt={item.name} />}</div><div><strong>{item.name}</strong><small>{item.sku} · {item.color} / {item.size} · Qty {item.quantity}</small></div><strong>{formatPrice(item.unitPrice * item.quantity)}</strong></article>)}</section>
      <section className="account-detail-panel"><p className="eyebrow">ORDER SUMMARY</p><dl className="account-summary-list"><div><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div><div><dt>Shipping</dt><dd>{order.shippingAmount ? formatPrice(order.shippingAmount) : 'Complimentary'}</dd></div>{Boolean(order.discountAmount) && <div><dt>Discount</dt><dd>−{formatPrice(order.discountAmount!)}</dd></div>}{Boolean(order.taxAmount) && <div><dt>Tax</dt><dd>{formatPrice(order.taxAmount!)}</dd></div>}<div className="total"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div><div><dt>Payment</dt><dd>{order.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : order.paymentMethod ?? '—'}</dd></div><div><dt>Payment status</dt><dd>{order.paymentStatus === 'unpaid' ? 'Non payé' : 'Payé'}</dd></div></dl></section>
      <section className="account-detail-panel"><p className="eyebrow">DELIVERY ADDRESS</p>{order.shippingAddress ? <address>{order.shippingAddress.fullName || 'Customer'}<br />{order.shippingAddress.line1}{order.shippingAddress.line2 && <><br />{order.shippingAddress.line2}</>}<br />{order.shippingAddress.city}{order.shippingAddress.postalCode && `, ${order.shippingAddress.postalCode}`}<br />{order.shippingAddress.governorate && `${order.shippingAddress.governorate}, `}{order.shippingAddress.country}{order.shippingAddress.phoneNumber && <><br />{order.shippingAddress.phoneNumber}</>}</address> : <p className="account-muted">No delivery address is available for this order.</p>}</section>
      <section className="account-detail-panel"><p className="eyebrow">NEED A HAND?</p><p className="account-muted">For changes, returns, or delivery questions, our team is here to help.</p><Link to="/contact" className="account-text-button">CONTACT OFF <ArrowRight size={13} /></Link></section></div>
  </div>
}

function AccountEmpty({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action: ReactNode }) {
  return <div className="account-empty-state">{icon}<h3>{title}</h3><p>{copy}</p>{action}</div>
}

function AccountLoadingRows() {
  return <div className="account-loading-rows" aria-label="Loading"><div /><div /><div /></div>
}

function AccountError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="account-error-state"><p className="account-error" role="alert">{message}</p><button className="account-outline-button" onClick={onRetry}>TRY AGAIN <ArrowRight size={13} /></button></div>
}

function AddressesPage() {
  const { request, customer } = useAccount()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<AddressDraft | null>(null)
  const [editing, setEditing] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { const result = await request<{ addresses: Address[] }>('/addresses'); setAddresses(result.addresses) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load addresses.') } finally { setLoading(false) } }, [request])
  useEffect(() => { void load() }, [load])
  const openEdit = (address?: Address) => { setEditing(address?._id ?? ''); setDraft(address ? { label: address.label, fullName: address.fullName, phoneNumber: address.phoneNumber, addressLine1: address.addressLine1, addressLine2: address.addressLine2, city: address.city, postalCode: address.postalCode, country: address.country, governorate: address.governorate, delegation: address.delegation, isDefault: address.isDefault } : { ...emptyAddress, fullName: customer.name }) }
  const closeForm = () => { setDraft(null); setEditing('') }
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!draft) return; setSaving(true); setError(''); try { const result = await request<{ addresses: Address[] }>(editing ? `/addresses/${editing}` : '/addresses', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(draft) }); setAddresses(result.addresses); closeForm() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this address.') } finally { setSaving(false) } }
  const remove = async (id: string) => { if (confirmDelete !== id) { setConfirmDelete(id); return } try { const result = await request<{ addresses: Address[] }>(`/addresses/${id}`, { method: 'DELETE' }); setAddresses(result.addresses); setConfirmDelete('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to remove this address.') } }
  const setDefault = async (id: string) => { try { const result = await request<{ addresses: Address[] }>(`/addresses/${id}/default`, { method: 'PATCH' }); setAddresses(result.addresses) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update the default address.') } }
  return <div className="account-page-view"><AccountPageTitle title="My Addresses" subtitle="Keep your delivery details ready for the next OFF order." action={<button className="account-dark-button" onClick={() => openEdit()}>ADD ADDRESS <Plus size={13} /></button>} />
    {error && <AccountError message={error} onRetry={() => void load()} />}
    {loading ? <AccountLoadingRows /> : addresses.length ? <div className="account-address-grid">{addresses.map(address => <article className="account-address-card" key={address._id}><div className="account-address-heading"><span className="account-address-icon"><MapPin size={16} /></span><div><strong>{address.label}</strong>{address.isDefault && <small className="account-default-badge">DEFAULT</small>}</div></div><address>{address.fullName}<br />{address.addressLine1}{address.addressLine2 && <><br />{address.addressLine2}</>}<br />{address.city}{address.postalCode && `, ${address.postalCode}`}<br />{address.governorate && `${address.governorate}, `}{address.country}<br />{address.phoneNumber}</address><div className="account-address-actions"><button onClick={() => openEdit(address)}>EDIT</button>{!address.isDefault && <button onClick={() => void setDefault(address._id)}>SET AS DEFAULT</button>}<button className="remove" onClick={() => void remove(address._id)}>{confirmDelete === address._id ? 'CONFIRM DELETE' : 'DELETE'}</button></div>{confirmDelete === address._id && <p className="account-inline-note">Select DELETE again to confirm, or choose another action to keep this address.</p>}</article>)}</div> : <AccountEmpty icon={<MapPin size={23} />} title="No saved addresses yet." copy="Add a delivery address to make checkout a little easier." action={<button className="account-dark-button" onClick={() => openEdit()}>ADD YOUR FIRST ADDRESS <Plus size={13} /></button>} />}
    {draft && <div className="account-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeForm() }}><section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="address-modal-title"><button className="account-modal-close" aria-label="Close" onClick={closeForm}><X size={17} /></button><p className="eyebrow">DELIVERY DETAILS</p><h2 id="address-modal-title">{editing ? 'Edit address' : 'Add an address'}</h2><form className="account-form" onSubmit={submit}>
      <div className="account-form-grid"><label>Address label<input required maxLength={40} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label><label>Full name<input required autoComplete="name" value={draft.fullName} onChange={event => setDraft({ ...draft, fullName: event.target.value })} /></label><label>Phone number<input required type="tel" autoComplete="tel" value={draft.phoneNumber} onChange={event => setDraft({ ...draft, phoneNumber: event.target.value })} /></label><label>Address line 1<input required autoComplete="address-line1" value={draft.addressLine1} onChange={event => setDraft({ ...draft, addressLine1: event.target.value })} /></label><label>Address line 2<input autoComplete="address-line2" value={draft.addressLine2} onChange={event => setDraft({ ...draft, addressLine2: event.target.value })} /></label><label>City / delegation<input required autoComplete="address-level2" value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })} /></label><label>Postal code<input autoComplete="postal-code" value={draft.postalCode} onChange={event => setDraft({ ...draft, postalCode: event.target.value })} /></label><label>Country code<input required maxLength={2} value={draft.country} onChange={event => setDraft({ ...draft, country: event.target.value.toUpperCase() })} /></label></div>
      <label className="account-checkbox"><input type="checkbox" checked={draft.isDefault} onChange={event => setDraft({ ...draft, isDefault: event.target.checked })} /> Set as my default address</label>{error && <p className="account-error" role="alert">{error}</p>}<div className="account-form-actions"><button type="button" className="account-outline-button" onClick={closeForm}>CANCEL</button><button className="account-dark-button" disabled={saving}>{saving ? 'SAVING…' : 'SAVE ADDRESS'} <ArrowRight size={13} /></button></div>
    </form></section></div>}
  </div>
}

function WishlistPage() {
  const { request, apiBaseUrl } = useAccount()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { const result = await request<{ products: Record<string, unknown>[] }>('/wishlist'); setProducts(result.products.map(item => mapProduct(item, apiBaseUrl))) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load your wishlist.') } finally { setLoading(false) } }, [apiBaseUrl, request])
  useEffect(() => { void load() }, [load])
  const remove = async (id: string) => { try { await request(`/wishlist/${id}`, { method: 'DELETE' }); setProducts(current => current.filter(product => product.id !== id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to remove this item.') } }
  return <div className="account-page-view"><AccountPageTitle title="My Wishlist" subtitle="The pieces you have your eye on." />{error && <AccountError message={error} onRetry={() => void load()} />}{loading ? <AccountLoadingRows /> : products.length ? <div className="account-wishlist-grid">{products.map(product => <WishlistProduct key={product.id} product={product} onRemove={() => void remove(product.id)} />)}</div> : <AccountEmpty icon={<Heart size={23} />} title="Your wishlist is waiting for something special." copy="Save the pieces you love and find them here whenever you return." action={<Link className="account-dark-button" to="/shop">DISCOVER THE COLLECTION <ArrowRight size={13} /></Link>} />}</div>
}

function WishlistProduct({ product, onRemove }: { product: Product; onRemove: () => void }) {
  const { addToBag, formatPrice } = useAccount()
  const activeVariants = product.variants.filter(variant => variant.active && variant.stock > 0)
  const colors = [...new Set(activeVariants.map(variant => variant.color))]
  const [color, setColor] = useState(colors[0] ?? '')
  const sizes = [...new Set(activeVariants.filter(variant => variant.color === color).map(variant => variant.size))]
  const [size, setSize] = useState(sizes[0] ?? '')
  const [message, setMessage] = useState('')
  const variant = activeVariants.find(item => item.color === color && item.size === size)
  const canAdd = Boolean(variant)
  return <article className="account-wishlist-card"><div className="account-wishlist-image"><Link to={`/product/${product.slug}`}><img src={product.image} alt={product.name} loading="lazy" /></Link><button aria-label={`Remove ${product.name} from wishlist`} onClick={onRemove}><Heart size={16} fill="currentColor" /></button></div><div className="account-wishlist-info"><div><Link to={`/product/${product.slug}`}><strong>{product.name}</strong></Link><small>{product.category}</small></div><strong>{formatPrice(product.price)}</strong></div>
    {activeVariants.length ? <div className="account-wishlist-variants"><label>Color<select value={color} onChange={event => { setColor(event.target.value); const nextSize = activeVariants.find(item => item.color === event.target.value)?.size ?? ''; setSize(nextSize); setMessage('') }}>{colors.map(item => <option key={item}>{item}</option>)}</select></label><label>Size<select value={size} onChange={event => { setSize(event.target.value); setMessage('') }}>{sizes.map(item => <option key={item}>{item}</option>)}</select></label></div> : <p className="account-muted">Currently unavailable</p>}
    <button className="account-dark-button account-wishlist-add" disabled={!canAdd} onClick={() => { if (!variant) return; setMessage(addToBag(product.id, size, color, variant.sku) ? 'Added to your bag.' : 'This size is no longer available.'); }}>{canAdd ? 'ADD TO BAG' : 'UNAVAILABLE'} <Plus size={13} /></button>{message && <small className="account-success-note" role="status">{message}</small>}</article>
}

function ProfilePage() {
  const { user } = useUser()
  const { customer, request, refreshCustomer } = useAccount()
  const [form, setForm] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phoneNumber: customer.phoneNumber ?? '', dateOfBirth: customer.dateOfBirth ?? '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => setForm({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phoneNumber: customer.phoneNumber ?? '', dateOfBirth: customer.dateOfBirth ?? '' }), [customer.dateOfBirth, customer.phoneNumber, user?.firstName, user?.lastName])
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setMessage(''); setError(''); try { await user?.update({ firstName: form.firstName.trim(), lastName: form.lastName.trim() }); await request<{ customer: AccountCustomer }>('/', { method: 'PATCH', body: JSON.stringify({ phoneNumber: form.phoneNumber, dateOfBirth: form.dateOfBirth }) }); await refreshCustomer(); setMessage('Your profile has been updated.') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your profile.') } finally { setSaving(false) } }
  return <div className="account-page-view"><AccountPageTitle title="Personal Information" subtitle="Keep your details up to date." /><form className="account-form account-profile-form" onSubmit={submit}><div className="account-form-grid"><label>First name<input autoComplete="given-name" required value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} /></label><label>Last name<input autoComplete="family-name" required value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} /></label><label>Email address<input type="email" value={customer.email} readOnly /><small>Manage email addresses and verification in Settings & Security.</small></label><label>Phone number<input type="tel" autoComplete="tel" value={form.phoneNumber} onChange={event => setForm({ ...form, phoneNumber: event.target.value })} /></label><label>Date of birth <span className="account-optional">OPTIONAL</span><input type="date" value={form.dateOfBirth} onChange={event => setForm({ ...form, dateOfBirth: event.target.value })} /></label></div>{error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}<div className="account-form-actions"><button type="button" className="account-outline-button" onClick={() => setForm({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phoneNumber: customer.phoneNumber ?? '', dateOfBirth: customer.dateOfBirth ?? '' })}>RESET</button><button className="account-dark-button" disabled={saving}>{saving ? 'SAVING…' : 'SAVE CHANGES'} <ArrowRight size={13} /></button></div></form></div>
}

function SettingsPage() {
  const { customer, request } = useAccount()
  const [preferences, setPreferences] = useState(customer.communicationPreferences ?? { newsletter: false, marketingEmails: false })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const savePreferences = async (key: 'newsletter' | 'marketingEmails', value: boolean) => { const next = { ...preferences, [key]: value }; setPreferences(next); setSaving(true); setMessage(''); setError(''); try { await request('/preferences', { method: 'PATCH', body: JSON.stringify({ [key]: value }) }); setMessage('Your preferences are saved.') } catch (cause) { setPreferences(preferences); setError(cause instanceof Error ? cause.message : 'Unable to save your preferences.') } finally { setSaving(false) } }
  return <div className="account-page-view"><AccountPageTitle title="Settings & Security" subtitle="Control your communication and account security." />
    <section className="account-settings-section"><div className="account-settings-heading"><span><ShieldCheck size={18} /></span><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>Sign-in details & devices</h2></div></div><p className="account-muted">Manage your verified email addresses, password, and active sessions through OFF’s secure sign-in provider.</p><div className="account-clerk-profile"><UserProfile routing="hash" appearance={accountClerkAppearance} /></div></section>
    <section className="account-settings-section"><div className="account-settings-heading"><span><Heart size={18} /></span><div><p className="eyebrow">YOUR PREFERENCES</p><h2>Communication</h2></div></div><p className="account-muted">Choose which OFF updates you would like to receive. These choices are separate from essential account messages.</p><label className="account-preference-row"><span><strong>Newsletter</strong><small>Collection notes, launches, and stories from OFF.</small></span><input type="checkbox" checked={preferences.newsletter} disabled={saving} onChange={event => void savePreferences('newsletter', event.target.checked)} /></label><label className="account-preference-row"><span><strong>Marketing emails</strong><small>Occasional offers and updates about the OFF collection.</small></span><input type="checkbox" checked={preferences.marketingEmails} disabled={saving} onChange={event => void savePreferences('marketingEmails', event.target.checked)} /></label>{message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}{error && <p className="account-error" role="alert">{error}</p>}</section>
  </div>
}
