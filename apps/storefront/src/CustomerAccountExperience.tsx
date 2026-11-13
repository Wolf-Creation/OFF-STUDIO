import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { SignIn, SignOutButton, SignUp, useAuth, useReverification, useSession, useUser } from '@clerk/react'
import { ArrowLeft, ArrowRight, Check, Heart, MapPin, Package, Plus, Settings, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
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
  variables: { colorPrimary: '#171918', colorText: '#171918', colorTextSecondary: '#777872', colorBackground: '#E5E2DC', colorInputBackground: '#F7F6F2', colorInputText: '#171918', borderRadius: '0px', fontFamily: 'DM Sans, sans-serif' },
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
  if (!isLoaded || (isSignedIn && loading)) return <><AccountPageSkeleton page={location.pathname} />{footer}</>
  if (!isSignedIn) {
    const mode = new URLSearchParams(location.search).get('mode') === 'sign-up' ? 'sign-up' : 'sign-in'
    const requestedReturn = new URLSearchParams(location.search).get('returnTo')
    return <AccountLogin mode={mode} returnTo={requestedReturn?.startsWith('/account') ? requestedReturn : returnTo} />
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
  const nameParts = customer.name.trim().split(/\s+/).filter(Boolean)
  const lastName = nameParts.pop() ?? ''
  const firstNames = nameParts.join(' ')
  return <main className="account-shell page-shell">
    <nav className="account-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">My account</span></nav>
    <div className="account-layout">
    <aside className="account-sidebar">
      <div className="account-customer-card"><span className="eyebrow">MY ACCOUNT</span><strong>{firstNames}{firstNames ? ' ' : ''}<em>{lastName ? `${lastName[0]}.` : 'OFF'}</em></strong><small>{customer.email}</small></div>
      <nav aria-label="Customer account navigation">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} end={end} to={to}><Icon size={18} strokeWidth={1.5} /><span>{label}</span></NavLink>)}</nav>
      <SignOutButton signOutOptions={{ redirectUrl: '/account' }}><button className="account-signout"><ArrowLeft size={15} /> Sign Out</button></SignOutButton>
    </aside>
    <section className="account-content">{children}</section>
    </div>
  </main>
}

function AccountPageTitle({ eyebrow = 'YOUR OFF ACCOUNT', title, subtitle, action }: { eyebrow?: string; title: ReactNode; subtitle?: string; action?: ReactNode }) {
  return <header className="account-page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header>
}

function AccountPageSkeleton({ page }: { page: string }) {
  const isOrders = page.startsWith('/account/orders')
  const isOrderDetail = /^\/account\/orders\/[^/]+/.test(page)
  const isAddresses = page.startsWith('/account/addresses')
  const isWishlist = page.startsWith('/account/wishlist')
  const isSettings = page.startsWith('/account/settings')
  return <main className="account-shell page-shell account-loading-shell" aria-busy="true" aria-label="Loading account">
    <div className="account-loading-breadcrumb"><span /><i /><span /></div>
    <div className="account-layout">
      <aside className="account-sidebar account-loading-sidebar" aria-hidden="true">
        <div className="account-loading-profile"><i /><b /><span /></div>
        <div className="account-loading-nav">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
        <i className="account-loading-signout" />
      </aside>
      <section className="account-content" aria-hidden="true">
        <div className="account-page-view account-page-skeleton">
          <div className="account-skeleton-title"><i /><b /><span /></div>
          {isSettings ? <><div className="account-skeleton-profile"><i /><span /><b /></div><div className="account-skeleton-panel"><i /><i /><i /><i /></div><div className="account-skeleton-panel"><i /><i /><i /></div></>
            : isAddresses ? <AccountLoadingRows variant="address" />
              : isWishlist ? <AccountLoadingRows variant="wishlist" />
                : isOrderDetail ? <AccountPageSkeletonContent variant="order-detail" />
                  : isOrders ? <AccountPageSkeletonContent variant="orders" />
                    : <AccountPageSkeletonContent variant="overview" />}
        </div>
      </section>
    </div>
  </main>
}

function AccountOverviewPage() {
  const { customer, request, products, renderProductCard } = useAccount()
  const [summary, setSummary] = useState<{ stats: { totalOrders: number; ordersInProgress: number; wishlistItems: number }; latestOrder: OrderSummary | null } | null>(null)
  const [wishlistIds, setWishlistIds] = useState<string[]>(customer.wishlistProductIds ?? [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { let cancelled = false; setLoading(true); request<{ stats: NonNullable<typeof summary>['stats']; latestOrder: OrderSummary | null }>('/').then(data => { if (!cancelled) setSummary(data) }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load your overview.') }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } }, [request])
  const toggleWishlist = async (product: Product) => {
    const liked = wishlistIds.includes(product.id)
    try {
      const payload = await request<{ count: number }>(liked ? `/wishlist/${product.id}` : '/wishlist', liked ? { method: 'DELETE' } : { method: 'POST', body: JSON.stringify({ productId: product.id }) })
      setWishlistIds(current => liked ? current.filter(id => id !== product.id) : [...current, product.id])
      setSummary(current => current ? { ...current, stats: { ...current.stats, wishlistItems: payload.count } } : current)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your wishlist.') }
  }
  const recommended = [...products].sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')).slice(0, 3)
  return <div className="account-page-view">
    <AccountPageTitle eyebrow={`WELCOME BACK, ${customer.name.split(' ')[0]?.toUpperCase() || 'OFF CUSTOMER'}`} title={<>Your OFF experience, <em>all in one place.</em></>} subtitle="A considered place for your orders, details, and favourite pieces." action={<Link to="/account/profile" className="account-outline-button">EDIT PROFILE <ArrowRight size={13} /></Link>} />
    {error && <p className="account-error" role="alert">{error}</p>}
    {loading ? <AccountPageSkeletonContent variant="overview" /> : <><div className="account-stat-grid">{[['Total Orders', summary?.stats.totalOrders], ['In Progress', summary?.stats.ordersInProgress], ['Wishlist Items', summary?.stats.wishlistItems]].map(([label, value]) => <article className="account-stat" key={label}><small>{label}</small><strong>{value ?? '—'}</strong></article>)}</div>
    <section className="account-section-block"><div className="account-section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Latest order</h2></div><Link to="/account/orders">View all orders <ArrowRight size={13} /></Link></div>
      {summary ? summary.latestOrder ? <OrderCard order={summary.latestOrder} /> : <div className="account-empty-state"><Package size={24} /><h3>Your OFF journey starts here.</h3><p>Your orders will appear here once you place one.</p><Link className="account-dark-button" to="/shop">DISCOVER THE COLLECTION <ArrowRight size={13} /></Link></div> : error ? null : <AccountLoadingRows />}
    </section>
    <section className="account-section-block"><div className="account-section-heading"><div><p className="eyebrow">THE LATEST EDIT</p><h2>Discover something new</h2></div><Link to="/shop">Shop all <ArrowRight size={13} /></Link></div>
      {recommended.length ? <div className="account-recommend-grid">{recommended.map(product => <div key={product.id}>{renderProductCard(product, wishlistIds.includes(product.id), () => void toggleWishlist(product))}</div>)}</div> : <p className="account-muted">New pieces are on their way.</p>}
    </section>
    </>}
  </div>
}

function AccountPageSkeletonContent({ variant }: { variant: 'overview' | 'orders' | 'order-detail' }) {
  if (variant === 'overview') return <div className="account-page-skeleton account-content-skeleton" role="status" aria-label="Loading overview">
    <div className="account-skeleton-stats">{Array.from({ length: 3 }, (_, index) => <i key={index} />)}</div>
    <div className="account-skeleton-panel"><i /><i /></div>
    <div className="account-skeleton-product-grid">{Array.from({ length: 3 }, (_, index) => <i key={index} />)}</div>
  </div>
  if (variant === 'orders') return <div className="account-page-skeleton account-content-skeleton" role="status" aria-label="Loading orders">
    <div className="account-skeleton-tabs">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>
    <AccountLoadingRows variant="order" />
  </div>
  return <div className="account-page-skeleton account-content-skeleton" role="status" aria-label="Loading order details">
    <div className="account-skeleton-progress" />
    <div className="account-skeleton-panel"><i /><i /><i /></div>
    <div className="account-skeleton-panel"><i /><i /></div>
  </div>
}

function OrderCard({ order }: { order: OrderSummary }) {
  const { formatPrice, apiBaseUrl } = useAccount()
  const mediaBaseUrl = apiBaseUrl.replace(/\/api\/v1$/, '')
  const images = [...new Set(order.items.map(item => item.image).filter((image): image is string => Boolean(image)))].slice(0, 3)
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  return <article className="account-order-card"><div className="account-order-main"><div><p className="eyebrow">ORDER {order.orderNumber}</p><span>Placed {dateLabel(order.placedAt)} · {itemCount} {itemCount === 1 ? 'piece' : 'pieces'}</span></div><span className={`account-status status-${statusTone[order.fulfillmentStatus]}${order.fulfillmentStatus === 'in_delivery' ? ' status-live' : ''}`}>{statusLabel[order.fulfillmentStatus]}</span></div><div className="account-order-bottom"><div className="account-order-thumbs">{images.length ? images.map((image, index) => <img src={image.startsWith('/') ? `${mediaBaseUrl}${image}` : image} alt="" key={`${image}-${index}`} />) : <span className="account-order-placeholder"><Package size={15} /></span>}</div><strong>{formatPrice(order.total)}</strong><Link to={`/account/orders/${order._id}`} className="account-text-button">VIEW DETAILS <ArrowRight size={13} /></Link></div></article>
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
  return <div className="account-page-view"><AccountPageTitle title={<>My <em>Orders</em></>} subtitle="View and track your OFF orders." />
    {!loading && <div className="account-filter-tabs" role="tablist" aria-label="Filter orders">{filters.map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => { setFilter(value); setPage(1) }}>{label}</button>)}</div>}
    {loading ? <AccountPageSkeletonContent variant="orders" /> : error ? <AccountError message={error} onRetry={() => setRetry(value => value + 1)} /> : result?.orders.length ? <><div className="account-orders-list">{result.orders.map(order => <OrderCard order={order} key={order._id} />)}</div>{result.pagination.pages > 1 && <div className="account-pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>PREVIOUS</button><span>PAGE {page} OF {result.pagination.pages}</span><button disabled={page >= result.pagination.pages} onClick={() => setPage(value => value + 1)}>NEXT</button></div>}</> : <AccountEmpty icon={<Package size={23} />} title="No orders in this view." copy="Discover pieces made to move with you." action={<Link className="account-dark-button" to="/shop">DISCOVER COLLECTION <ArrowRight size={13} /></Link>} />}
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
  if (loading) return <div className="account-page-view"><AccountPageTitle title={<>Order <em>details</em></>} /><AccountPageSkeletonContent variant="order-detail" /></div>
  if (error || !order) return <div className="account-page-view"><AccountPageTitle title="Order details" /><AccountError message={error || 'Order not found.'} onRetry={() => setRetry(value => value + 1)} /><Link className="account-text-button" to="/account/orders"><ArrowLeft size={13} /> BACK TO ORDERS</Link></div>
  const timeline = ['confirmation', 'processing', 'in_delivery', 'delivered']
  const history = order.statusHistory ?? []
  const activeProgressIndex = timeline.indexOf(order.fulfillmentStatus)
  const currentIndex = activeProgressIndex >= 0 ? activeProgressIndex : history.reduce((last, entry) => Math.max(last, timeline.indexOf(entry.status)), 0)
  const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  return <div className="account-page-view account-order-detail"><Link to="/account/orders" className="account-back-link"><ArrowLeft size={14} /> Back to orders</Link><AccountPageTitle eyebrow={`ORDER ${order.orderNumber}`} title={<>Order <em>details</em></>} subtitle={`Placed ${dateLabel(order.placedAt)}`} action={<span className={`account-status status-${statusTone[order.fulfillmentStatus]}`}>{statusLabel[order.fulfillmentStatus]}</span>} />
    <section className="account-detail-panel"><p className="eyebrow">ORDER PROGRESS</p><div className="account-timeline">{timeline.map((status, index) => { const entry = history.find(item => item.status === status); const complete = index < currentIndex || (index === currentIndex && order.fulfillmentStatus === 'delivered'); const current = index === currentIndex && order.fulfillmentStatus !== 'delivered'; return <div className={`account-timeline-step${complete ? ' complete' : ''}${current ? ' current' : ''}`} key={status}><div><strong>{statusLabel[status as OrderSummary['fulfillmentStatus']]}</strong><small>{entry ? dateLabel(entry.changedAt) : complete && status === 'confirmation' ? dateLabel(order.placedAt) : 'Pending'}</small></div></div> })}</div>{(['cancelled', 'returned', 'exchange'] as string[]).includes(order.fulfillmentStatus) && <p className="account-error">Statut de commande : {statusLabel[order.fulfillmentStatus]}.</p>}{order.trackingNumber && <p className="account-tracking">Tracking number <strong>{order.trackingNumber}</strong></p>}</section>
    <div className="account-detail-grid"><section className="account-detail-panel account-purchased-panel"><p className="eyebrow">PURCHASED PIECES</p>{order.items.map((item, index) => <article className="account-purchased-item" key={`${item.sku}-${index}`}><div className="account-purchased-image">{item.image && <img src={item.image.startsWith('/') ? `${mediaBaseUrl}${item.image}` : item.image} alt={item.name} />}</div><div><strong>{item.name}</strong><small>{item.sku} · {item.color} / {item.size} · Qty {item.quantity}</small></div><strong>{formatPrice(item.unitPrice * item.quantity)}</strong></article>)}</section>
      <section className="account-detail-panel"><p className="eyebrow">ORDER SUMMARY</p><dl className="account-summary-list"><div><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div><div><dt>Shipping</dt><dd>{order.shippingAmount ? formatPrice(order.shippingAmount) : 'Complimentary'}</dd></div>{Boolean(order.discountAmount) && <div><dt>Discount</dt><dd>−{formatPrice(order.discountAmount!)}</dd></div>}{Boolean(order.taxAmount) && <div><dt>Tax</dt><dd>{formatPrice(order.taxAmount!)}</dd></div>}<div className="total"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div><div><dt>Payment</dt><dd>{order.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : order.paymentMethod ?? '—'}</dd></div><div><dt>Payment status</dt><dd>{order.paymentStatus === 'unpaid' ? 'Non payé' : 'Payé'}</dd></div></dl></section>
      <section className="account-detail-panel"><p className="eyebrow">DELIVERY ADDRESS</p>{order.shippingAddress ? <address>{order.shippingAddress.fullName || 'Customer'}<br />{order.shippingAddress.line1}{order.shippingAddress.line2 && <><br />{order.shippingAddress.line2}</>}<br />{order.shippingAddress.city}{order.shippingAddress.postalCode && `, ${order.shippingAddress.postalCode}`}<br />{order.shippingAddress.governorate && `${order.shippingAddress.governorate}, `}{order.shippingAddress.country}{order.shippingAddress.phoneNumber && <><br />{order.shippingAddress.phoneNumber}</>}</address> : <p className="account-muted">No delivery address is available for this order.</p>}</section>
      <section className="account-detail-panel account-help-panel"><p className="eyebrow">NEED A HAND?</p><p className="account-muted">For changes, returns, or delivery questions, our team is here to help.</p><Link to="/contact" className="account-text-button">CONTACT OFF <ArrowRight size={13} /></Link></section></div>
  </div>
}

function AccountEmpty({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action: ReactNode }) {
  return <div className="account-empty-state">{icon}<h3>{title}</h3><p>{copy}</p>{action}</div>
}

function AccountLoadingRows({ variant = 'order' }: { variant?: 'order' | 'address' | 'wishlist' }) {
  return <div className={`account-loading-rows is-${variant}`} role="status" aria-label={`Loading ${variant} content`}>{Array.from({ length: variant === 'wishlist' ? 4 : 3 }, (_, index) => <div key={index}><i /><span /><b /><em /></div>)}</div>
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
  return <div className="account-page-view"><AccountPageTitle title={<>My <em>Addresses</em></>} subtitle="Keep your delivery details ready for the next OFF order." action={<button className="account-dark-button" onClick={() => openEdit()}>ADD ADDRESS <Plus size={13} /></button>} />
    {error && <AccountError message={error} onRetry={() => void load()} />}
    {loading ? <AccountLoadingRows variant="address" /> : addresses.length ? <div className="account-address-grid">{addresses.map(address => <article className={`account-address-card${address.isDefault ? ' is-default' : ''}`} key={address._id}><div className="account-address-heading"><span className="account-address-icon"><MapPin size={18} /></span><div><strong>{address.label}</strong>{address.isDefault && <small className="account-default-badge">DEFAULT</small>}</div></div><address>{address.fullName}<br />{address.addressLine1}{address.addressLine2 && <><br />{address.addressLine2}</>}<br />{address.city}{address.postalCode && `, ${address.postalCode}`}<br />{address.governorate && `${address.governorate}, `}{address.country}<br />{address.phoneNumber}</address><div className="account-address-actions"><button onClick={() => openEdit(address)}>EDIT</button>{!address.isDefault && <button onClick={() => void setDefault(address._id)}>SET AS DEFAULT</button>}<button className="remove" onClick={() => void remove(address._id)}>{confirmDelete === address._id ? 'CONFIRM DELETE' : 'DELETE'}</button></div>{confirmDelete === address._id && <p className="account-inline-note">Select DELETE again to confirm, or choose another action to keep this address.</p>}</article>)}<button type="button" className="account-add-address-tile" onClick={() => openEdit()}><Plus size={20} /><span>Add an address</span></button></div> : <AccountEmpty icon={<MapPin size={23} />} title="No saved addresses yet." copy="Add a delivery address to make checkout a little easier." action={<button className="account-dark-button" onClick={() => openEdit()}>ADD YOUR FIRST ADDRESS <Plus size={13} /></button>} />}
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
  return <div className="account-page-view"><AccountPageTitle title={<>My <em>Wishlist</em></>} subtitle="The pieces you have your eye on." />{error && <AccountError message={error} onRetry={() => void load()} />}{loading ? <AccountLoadingRows variant="wishlist" /> : products.length ? <div className="account-wishlist-grid">{products.map(product => <WishlistProduct key={product.id} product={product} onRemove={() => void remove(product.id)} />)}</div> : <AccountEmpty icon={<Heart size={23} />} title="Your wishlist is waiting for something special." copy="Save the pieces you love and find them here whenever you return." action={<Link className="account-dark-button" to="/shop">DISCOVER THE COLLECTION <ArrowRight size={13} /></Link>} />}</div>
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
  return <article className="account-wishlist-card"><div className="account-wishlist-image"><Link to={`/product/${product.slug}`}><img src={product.image} alt={product.name} loading="lazy" /></Link><button aria-label={`Remove ${product.name} from wishlist`} onClick={onRemove}><Heart size={17} fill="currentColor" /></button></div><div className="account-wishlist-info"><div><Link to={`/product/${product.slug}`}><strong>{product.name}</strong></Link><small>{product.category}</small></div><strong>{formatPrice(product.price)}</strong></div>
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
  return <div className="account-page-view"><AccountPageTitle title={<>Personal <em>Information</em></>} subtitle="Keep your details up to date." /><form className="account-form account-profile-form" onSubmit={submit}><div className="account-form-grid"><label>First name<input autoComplete="given-name" required value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} /></label><label>Last name<input autoComplete="family-name" required value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} /></label><label>Email address<input type="email" value={customer.email} readOnly /><small>Manage email addresses and verification in Settings & Security.</small></label><label>Phone number<input type="tel" autoComplete="tel" value={form.phoneNumber} onChange={event => setForm({ ...form, phoneNumber: event.target.value })} /></label><label>Date of birth <span className="account-optional">OPTIONAL</span><input type="date" value={form.dateOfBirth} onChange={event => setForm({ ...form, dateOfBirth: event.target.value })} /></label></div>{error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}<div className="account-form-actions"><button type="button" className="account-outline-button" onClick={() => setForm({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phoneNumber: customer.phoneNumber ?? '', dateOfBirth: customer.dateOfBirth ?? '' })}>RESET</button><button className="account-dark-button" disabled={saving}>{saving ? 'SAVING…' : 'SAVE CHANGES'} <ArrowRight size={13} /></button></div></form></div>
}

function SettingsPage() {
  const { customer, request } = useAccount()
  const { user } = useUser()
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [emailManagerOpen, setEmailManagerOpen] = useState(false)
  const [passwordManagerOpen, setPasswordManagerOpen] = useState(false)
  const [twoStepOpen, setTwoStepOpen] = useState(false)
  const [activeDevicesOpen, setActiveDevicesOpen] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [preferences, setPreferences] = useState(customer.communicationPreferences ?? { newsletter: false, marketingEmails: false })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const savePreferences = async (key: 'newsletter' | 'marketingEmails', value: boolean) => { const next = { ...preferences, [key]: value }; setPreferences(next); setSaving(true); setMessage(''); setError(''); try { await request('/preferences', { method: 'PATCH', body: JSON.stringify({ [key]: value }) }); setMessage('Your preferences are saved.') } catch (cause) { setPreferences(preferences); setError(cause instanceof Error ? cause.message : 'Unable to save your preferences.') } finally { setSaving(false) } }
  return <div className="account-page-view"><AccountPageTitle title={<>Settings &amp; <em>Security</em></>} subtitle="Control your communication and account security." />
    <section className="account-settings-profile">
      {user?.imageUrl ? <img src={user.imageUrl} alt="" /> : <span className="account-settings-profile-placeholder"><UserRound size={26} /></span>}
      <div><p className="eyebrow">YOUR PROFILE</p><h2>{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Your account'}</h2></div>
      <button className="account-outline-button" type="button" onClick={() => setProfileEditorOpen(true)}>EDIT PROFILE</button>
    </section>
    <section className="account-settings-section"><div className="account-settings-heading"><span><ShieldCheck size={18} /></span><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>Sign-in details & devices</h2></div></div><p className="account-muted">Manage your verified email addresses, password, and active sessions through OFF’s secure sign-in provider.</p><div className="account-security-rows"><div><span><strong>Email addresses</strong><small>{customer.email} · Verified</small></span><button type="button" onClick={() => setEmailManagerOpen(true)}>Manage</button></div><div><span><strong>Password</strong><small>Change the password you use to sign in.</small></span><button type="button" onClick={() => setPasswordManagerOpen(true)}>Change</button></div><div hidden><span><strong>Two-step verification</strong><small>Use an authenticator app or a code sent to your phone.</small></span><button type="button" onClick={() => setTwoStepOpen(true)}>Manage</button></div><div><span><strong>Active devices</strong><small>Review and manage where you are signed in.</small></span><button type="button" onClick={() => setActiveDevicesOpen(true)}>Review</button></div></div><div className="account-delete-section"><div><strong>Delete account</strong><p>This permanently deletes your account and cannot be undone.</p></div><button className="account-delete-button" type="button" onClick={() => setDeleteAccountOpen(true)}><Trash2 size={14} /> DELETE ACCOUNT</button></div></section>
    <section className="account-settings-section"><div className="account-settings-heading"><span><Heart size={18} /></span><div><p className="eyebrow">YOUR PREFERENCES</p><h2>Communication</h2></div></div><p className="account-muted">Choose which OFF updates you would like to receive. These choices are separate from essential account messages.</p><label className="account-preference-row"><span><strong>Newsletter</strong><small>Collection notes, launches, and stories from OFF.</small></span><input type="checkbox" checked={preferences.newsletter} disabled={saving} onChange={event => void savePreferences('newsletter', event.target.checked)} /></label><label className="account-preference-row"><span><strong>Marketing emails</strong><small>Occasional offers and updates about the OFF collection.</small></span><input type="checkbox" checked={preferences.marketingEmails} disabled={saving} onChange={event => void savePreferences('marketingEmails', event.target.checked)} /></label>{message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}{error && <p className="account-error" role="alert">{error}</p>}</section>
    <EmailAddressesModal open={emailManagerOpen} onClose={() => setEmailManagerOpen(false)} />
    <ProfileEditModal open={profileEditorOpen} onClose={() => setProfileEditorOpen(false)} />
    <PasswordChangeModal open={passwordManagerOpen} onClose={() => setPasswordManagerOpen(false)} />
    <TwoStepVerificationModal open={twoStepOpen} onClose={() => setTwoStepOpen(false)} />
    <ActiveDevicesModal open={activeDevicesOpen} onClose={() => setActiveDevicesOpen(false)} />
    <DeleteAccountModal open={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} />
  </div>
}

function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser()
  const { session } = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const deleteAccount = useReverification(async () => {
    if (!user) throw new Error('Your account is unavailable. Please sign in again.')
    await user.delete()
  })

  useEffect(() => {
    if (!open) {
      setPassword('')
      setConfirmation('')
      setError('')
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose, open])

  if (!open) return null

  const submitDeletion = async (event: FormEvent) => {
    event.preventDefault()
    if (!user || !session) {
      setError('Your account session is unavailable. Please sign in again.')
      return
    }
    if (!user.passwordEnabled) {
      setError('Password confirmation is unavailable for this account. Set a password before deleting your account.')
      return
    }
    if (confirmation !== 'DELETE') {
      setError('Type DELETE exactly to confirm account deletion.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await session.startVerification({ level: 'first_factor' })
      const verification = await session.attemptFirstFactorVerification({ strategy: 'password', password })
      if (verification.status !== 'complete') {
        throw new Error('Password verification was not completed. Please try again.')
      }
      await deleteAccount()
      navigate('/account?mode=sign-in', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete your account.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="account-email-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="account-email-modal account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="account-delete-title">
      <button className="account-email-modal-close" type="button" aria-label="Close delete account dialog" onClick={onClose} disabled={busy}><X size={19} /></button>
      <p className="eyebrow">IRREVERSIBLE ACTION</p>
      <h2 id="account-delete-title">Delete account</h2>
      <p className="account-email-modal-intro">This permanently deletes your OFF account. Enter your current password and type DELETE to confirm.</p>
      <form className="account-email-add-form" onSubmit={submitDeletion}>
        <label htmlFor="account-delete-password">Current password</label>
        <div className="account-email-add-controls"><input id="account-delete-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></div>
        <label htmlFor="account-delete-confirmation">Type DELETE to confirm</label>
        <div className="account-email-add-controls"><input id="account-delete-confirmation" type="text" autoComplete="off" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
        <button className="account-delete-button account-delete-submit" type="submit" disabled={busy || !user?.passwordEnabled}>{busy ? 'DELETING ACCOUNT…' : 'DELETE MY ACCOUNT'} <Trash2 size={14} /></button>
      </form>
      {error && <p className="account-error" role="alert">{error}</p>}
    </section>
  </div>
}

function ProfileEditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isLoaded } = useUser()
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) {
      setFirstName(user?.firstName ?? '')
      setLastName(user?.lastName ?? '')
      setImageFile(null)
      setError('')
      setMessage('')
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose, open, user?.firstName, user?.lastName])

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(imageFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  if (!open) return null

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) {
      setError('Your account is unavailable. Please sign in again.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (imageFile) await user.setProfileImage({ file: imageFile })
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() })
      await user.reload()
      setImageFile(null)
      setMessage('Your profile has been updated.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your profile.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="account-email-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="account-email-modal" role="dialog" aria-modal="true" aria-labelledby="account-profile-edit-title">
      <button className="account-email-modal-close" type="button" aria-label="Close profile editor" onClick={onClose} disabled={busy}><X size={19} /></button>
      <p className="eyebrow">YOUR PROFILE</p>
      <h2 id="account-profile-edit-title">Edit profile</h2>
      <p className="account-email-modal-intro">Update your profile photo and full name.</p>
      {!isLoaded ? <p className="account-muted" role="status">Loading your profile…</p> : <form className="account-email-add-form account-profile-edit-form" onSubmit={saveProfile}>
        <div className="account-profile-edit-avatar">{previewUrl || user?.imageUrl ? <img src={previewUrl || user?.imageUrl} alt="Profile preview" /> : <UserRound size={28} />}</div>
        <label htmlFor="account-profile-image">Profile photo</label>
        <input id="account-profile-image" className="account-profile-file" type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] ?? null)} />
        <label htmlFor="account-profile-first-name">First name</label>
        <div className="account-email-add-controls"><input id="account-profile-first-name" type="text" autoComplete="given-name" required value={firstName} onChange={event => setFirstName(event.target.value)} /></div>
        <label htmlFor="account-profile-last-name">Last name</label>
        <div className="account-email-add-controls"><input id="account-profile-last-name" type="text" autoComplete="family-name" required value={lastName} onChange={event => setLastName(event.target.value)} /></div>
        <button className="account-dark-button" type="submit" disabled={busy}>{busy ? 'SAVING…' : 'SAVE PROFILE'} <ArrowRight size={13} /></button>
      </form>}
      {message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
    </section>
  </div>
}

function TwoStepVerificationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isLoaded } = useUser()
  const [setupMethod, setSetupMethod] = useState<'choose' | 'authenticator' | 'sms'>('choose')
  const [totpUri, setTotpUri] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [selectedPhoneId, setSelectedPhoneId] = useState('')
  const [pendingSmsPhoneId, setPendingSmsPhoneId] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const disableTOTP = useReverification(async () => {
    if (!user) throw new Error('Your account is unavailable. Please sign in again.')
    return user.disableTOTP()
  })
  const createPhoneNumber = useReverification(async (phoneNumber: string) => {
    if (!user) throw new Error('Your account is unavailable. Please sign in again.')
    return user.createPhoneNumber({ phoneNumber })
  })
  const updateSmsFactor = useReverification(async (phoneNumberId: string, reserved: boolean) => {
    const phone = user?.phoneNumbers.find(item => item.id === phoneNumberId)
    if (!phone) throw new Error('This phone number is no longer available. Refresh and try again.')
    const updatedPhone = await phone.setReservedForSecondFactor({ reserved })
    if (reserved) await updatedPhone.makeDefaultSecondFactor()
    return updatedPhone
  })

  useEffect(() => {
    if (!open) {
      setSetupMethod('choose')
      setTotpUri('')
      setVerificationCode('')
      setPhoneInput('')
      setSelectedPhoneId('')
      setPendingSmsPhoneId('')
      setBackupCodes([])
      setError('')
      setMessage('')
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose, open])

  if (!open) return null

  const beginSetup = async () => {
    if (!user) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const totp = await user.createTOTP()
      if (!totp.uri) throw new Error('Clerk did not return an authenticator setup URI. Please try again.')
      setSetupMethod('authenticator')
      setTotpUri(totp.uri)
      setVerificationCode('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start two-step verification.')
    } finally {
      setBusy(false)
    }
  }

  const verifySetup = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await user.verifyTOTP({ code: verificationCode.trim() })
      await user.reload()
      const codes = await user.createBackupCode()
      setBackupCodes(codes.codes ?? [])
      setTotpUri('')
      setVerificationCode('')
      setMessage('Two-step verification is enabled. Save your recovery codes somewhere safe.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify this authenticator code.')
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await disableTOTP()
      await user?.reload()
      setBackupCodes([])
      setMessage('Two-step verification has been turned off.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to turn off two-step verification.')
    } finally {
      setBusy(false)
    }
  }

  const sendSmsCode = async () => {
    if (!user) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const selectedPhone = user.phoneNumbers.find(item => item.id === selectedPhoneId)
      const phone = selectedPhone ?? await createPhoneNumber(phoneInput.trim())
      if (!phone) throw new Error('Clerk did not add this phone number. Please try again.')
      await phone.prepareVerification()
      await user.reload()
      setPendingSmsPhoneId(phone.id)
      setMessage(`A verification code was sent to ${phone.phoneNumber}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send an SMS verification code.')
    } finally {
      setBusy(false)
    }
  }

  const verifySmsCode = async (event: FormEvent) => {
    event.preventDefault()
    const phone = user?.phoneNumbers.find(item => item.id === pendingSmsPhoneId)
    if (!phone) {
      setError('The phone verification has expired. Start again to request a new code.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await phone.attemptVerification({ code: verificationCode.trim() })
      await updateSmsFactor(phone.id, true)
      await user?.reload()
      setPendingSmsPhoneId('')
      setVerificationCode('')
      setPhoneInput('')
      setSelectedPhoneId('')
      setMessage(`SMS two-step verification is enabled for ${phone.phoneNumber}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify this phone number.')
    } finally {
      setBusy(false)
    }
  }

  const turnOffSms = async (phoneNumberId: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await updateSmsFactor(phoneNumberId, false)
      await user?.reload()
      setMessage('SMS two-step verification has been turned off. The phone number remains on your account.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to turn off SMS two-step verification.')
    } finally {
      setBusy(false)
    }
  }

  const verifiedPhones = user?.phoneNumbers.filter(phone => phone.verification.status === 'verified') ?? []
  const smsFactors = user?.phoneNumbers.filter(phone => phone.reservedForSecondFactor) ?? []

  return <div className="account-email-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="account-email-modal" role="dialog" aria-modal="true" aria-labelledby="account-two-step-title">
      <button className="account-email-modal-close" type="button" aria-label="Close two-step verification" onClick={onClose} disabled={busy}><X size={19} /></button>
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h2 id="account-two-step-title">Two-step verification</h2>
      <p className="account-email-modal-intro">Choose an authenticator app or SMS code as a second layer of security when signing in.</p>
      {!isLoaded ? <p className="account-muted" role="status">Loading security settings…</p> : <div className="account-email-add-form">
        {user?.totpEnabled && <div className="account-factor-row"><p className="account-security-status"><Check size={15} /> Authenticator app is enabled.</p><button className="account-password-resend" type="button" onClick={() => void turnOff()} disabled={busy}>Turn off</button></div>}
        {smsFactors.map(phone => <div className="account-factor-row" key={phone.id}><p className="account-security-status"><Check size={15} /> SMS codes are enabled for {phone.phoneNumber}.</p><button className="account-password-resend" type="button" onClick={() => void turnOffSms(phone.id)} disabled={busy}>Turn off</button></div>)}
        {backupCodes.length > 0 && <div className="account-backup-codes"><strong>Save these recovery codes</strong><p>Each code can be used once if you lose access to your authenticator.</p><code>{backupCodes.join('  ·  ')}</code></div>}
        {setupMethod === 'choose' && <div className="account-two-step-methods">
          {!user?.totpEnabled && <button className="account-outline-button" type="button" onClick={() => { setSetupMethod('authenticator'); void beginSetup() }} disabled={busy}>SET UP AUTHENTICATOR APP</button>}
          {smsFactors.length < 1 && <button className="account-outline-button" type="button" onClick={() => { setSetupMethod('sms'); setError(''); setMessage('') }} disabled={busy}>ADD SMS CODE</button>}
        </div>}
        {setupMethod === 'authenticator' && !totpUri && !user?.totpEnabled && <p>Use an authenticator app such as Google Authenticator, Microsoft Authenticator, or 1Password. You will scan or enter its setup key, then verify with a code from the app.</p>}
      </div>}
      {isLoaded && setupMethod === 'authenticator' && totpUri && <form className="account-email-add-form" onSubmit={verifySetup}>
        <label htmlFor="account-totp-setup-uri">Authenticator setup key</label>
        <div className="account-totp-key" id="account-totp-setup-uri">{totpUri}</div>
        <p>Enter this key manually in your authenticator app, then enter the current six-digit code below.</p>
        <label htmlFor="account-totp-code">Authenticator code</label>
        <div className="account-email-add-controls"><input id="account-totp-code" type="text" inputMode="numeric" autoComplete="one-time-code" required value={verificationCode} onChange={event => setVerificationCode(event.target.value)} /></div>
        <button className="account-dark-button" type="submit" disabled={busy}>{busy ? 'VERIFYING…' : 'VERIFY & ENABLE'} <Check size={14} /></button>
      </form>}
      {isLoaded && setupMethod === 'sms' && !pendingSmsPhoneId && <div className="account-email-add-form">
        {verifiedPhones.length > 0 && <label htmlFor="account-sms-existing-phone">Verified phone number</label>}
        {verifiedPhones.length > 0 && <select id="account-sms-existing-phone" className="account-sms-phone-select" value={selectedPhoneId} onChange={event => setSelectedPhoneId(event.target.value)}><option value="">Add a different phone number</option>{verifiedPhones.map(phone => <option key={phone.id} value={phone.id}>{phone.phoneNumber}</option>)}</select>}
        {!selectedPhoneId && <><label htmlFor="account-sms-phone">Mobile number</label><div className="account-email-add-controls"><input id="account-sms-phone" type="tel" autoComplete="tel" required value={phoneInput} onChange={event => setPhoneInput(event.target.value)} placeholder="+1 555 123 4567" /></div></>}
        <p>We will text a verification code to this number. Enter it to enable SMS sign-in verification.</p>
        <button className="account-dark-button" type="button" onClick={() => void sendSmsCode()} disabled={busy || (!selectedPhoneId && !phoneInput.trim())}>{busy ? 'SENDING CODE…' : 'SEND SMS CODE'} <ArrowRight size={13} /></button>
      </div>}
      {isLoaded && setupMethod === 'sms' && pendingSmsPhoneId && <form className="account-email-add-form" onSubmit={verifySmsCode}>
        <label htmlFor="account-sms-verification-code">SMS verification code</label>
        <div className="account-email-add-controls"><input id="account-sms-verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" required value={verificationCode} onChange={event => setVerificationCode(event.target.value)} /></div>
        <button className="account-dark-button" type="submit" disabled={busy}>{busy ? 'VERIFYING…' : 'VERIFY & ENABLE SMS'} <Check size={14} /></button>
        <button className="account-password-resend" type="button" onClick={() => { setPendingSmsPhoneId(''); setVerificationCode(''); setMessage('') }} disabled={busy}>Use another number</button>
      </form>}
      {message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
    </section>
  </div>
}

function ActiveDevicesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isLoaded } = useUser()
  const { session: currentSession } = useSession()
  const [sessions, setSessions] = useState<Awaited<ReturnType<NonNullable<typeof user>['getSessions']>>>([])
  const [busySessionId, setBusySessionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    setBusy(true)
    setError('')
    user.getSessions().then(result => {
      if (!cancelled) setSessions(result)
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load active devices.')
    }).finally(() => {
      if (!cancelled) setBusy(false)
    })
    return () => { cancelled = true }
  }, [open, user])

  useEffect(() => {
    if (!open) {
      setError('')
      setMessage('')
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !busySessionId) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, busySessionId, onClose, open])

  if (!open) return null

  const revokeSession = async (sessionId: string) => {
    const targetSession = sessions.find(item => item.id === sessionId)
    if (!targetSession) return
    setBusySessionId(sessionId)
    setError('')
    setMessage('')
    try {
      await targetSession.revoke()
      setSessions(current => current.filter(item => item.id !== sessionId))
      setMessage('The selected device has been signed out.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out this device.')
    } finally {
      setBusySessionId('')
    }
  }

  return <div className="account-email-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy && !busySessionId) onClose() }}>
    <section className="account-email-modal account-devices-modal" role="dialog" aria-modal="true" aria-labelledby="account-devices-title">
      <button className="account-email-modal-close" type="button" aria-label="Close active devices" onClick={onClose} disabled={busy || Boolean(busySessionId)}><X size={19} /></button>
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h2 id="account-devices-title">Active devices</h2>
      <p className="account-email-modal-intro">Review the sessions signed in to your account. You can sign out other devices remotely.</p>
      {!isLoaded || busy ? <p className="account-muted" role="status">Loading active devices…</p> : error && sessions.length === 0 ? <p className="account-error" role="alert">{error}</p> : sessions.length === 0 ? <p className="account-muted">No active devices were found.</p> : <div className="account-email-list">
        {sessions.map(item => {
          const activity = item.latestActivity
          const isCurrent = item.id === currentSession?.id
          const device = [activity?.browserName, activity?.deviceType].filter(Boolean).join(' · ') || 'Unknown device'
          const location = [activity?.city, activity?.country].filter(Boolean).join(', ')
          return <article className="account-email-row" key={item.id}>
            <div className="account-email-address">
              <strong>{device}{isCurrent ? ' · This device' : ''}</strong>
              <span>{location ? `${location} · ` : ''}Last active {item.lastActiveAt.toLocaleString()}</span>
            </div>
            {isCurrent ? <span className="account-email-primary">Current session</span> : <div className="account-email-actions">
              <button className="is-danger" type="button" onClick={() => void revokeSession(item.id)} disabled={Boolean(busySessionId)}>{busySessionId === item.id ? 'SIGNING OUT…' : 'SIGN OUT'}</button>
            </div>}
          </article>
        })}
      </div>}
      {message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}
      {error && sessions.length > 0 && <p className="account-error" role="alert">{error}</p>}
    </section>
  </div>
}

function PasswordChangeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, isLoaded: isSessionLoaded, isSignedIn } = useSession()
  const { user, isLoaded: isUserLoaded } = useUser()
  const [method, setMethod] = useState<'current-password' | 'email-code'>('current-password')
  const [codeSent, setCodeSent] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) {
      setMethod('current-password')
      setCodeSent(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setVerificationCode('')
      setError('')
      setMessage('')
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose, open])

  if (!open) return null

  const validateNewPassword = () => {
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return false
    }
    return true
  }

  const startEmailReset = async () => {
    const primaryEmail = user?.primaryEmailAddress
    if (!isSessionLoaded || !isSignedIn || !session || !primaryEmail || primaryEmail.verification?.status !== 'verified') {
      setError('A verified primary email address is required to reset your password.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await session.startVerification({ level: 'first_factor' })
      await session.prepareFirstFactorVerification({ strategy: 'email_code', emailAddressId: primaryEmail.id })
      setCodeSent(true)
      setMessage(`A verification code was sent to ${primaryEmail.emailAddress}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send a password reset code.')
    } finally {
      setBusy(false)
    }
  }

  const submitPasswordChange = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateNewPassword()) return
    if (!user) {
      setError('Your account is unavailable. Please sign in again.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await user.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions: true })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Your password has been changed. Other active sessions have been signed out.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change your password.')
    } finally {
      setBusy(false)
    }
  }

  const submitEmailReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateNewPassword()) return
    if (!isSessionLoaded || !isSignedIn || !session || !user) {
      setError('Your account session is unavailable. Please sign in again.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const verification = await session.attemptFirstFactorVerification({
        strategy: 'email_code',
        code: verificationCode.trim(),
      })
      if (verification.status !== 'complete') {
        throw new Error('Email verification is not complete. Check the code and try again.')
      }
      await user.updatePassword({ newPassword, signOutOfOtherSessions: true })
      await user.reload()
      setCodeSent(false)
      setVerificationCode('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Your password has been changed. Other active sessions have been signed out.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset your password.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="account-email-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="account-email-modal account-password-modal" role="dialog" aria-modal="true" aria-labelledby="account-password-modal-title">
      <button className="account-email-modal-close" type="button" aria-label="Close password change" onClick={onClose} disabled={busy}><X size={19} /></button>
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h2 id="account-password-modal-title">Change password</h2>
      <p className="account-email-modal-intro">Choose a new password. You can verify with your current password or receive a one-time reset code at your primary email.</p>
      <div className="account-password-methods" aria-label="Password verification method">
        <button type="button" className={method === 'current-password' ? 'is-active' : ''} onClick={() => { setMethod('current-password'); setError(''); setMessage('') }} disabled={busy}>CURRENT PASSWORD</button>
        <button type="button" className={method === 'email-code' ? 'is-active' : ''} onClick={() => { setMethod('email-code'); setError(''); setMessage('') }} disabled={busy}>EMAIL RESET</button>
      </div>
      {method === 'current-password' ? <form className="account-email-add-form" onSubmit={submitPasswordChange}>
        <label htmlFor="account-current-password">Current password</label>
        <div className="account-email-add-controls"><input id="account-current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></div>
        <label htmlFor="account-new-password">New password</label>
        <div className="account-email-add-controls"><input id="account-new-password" type="password" autoComplete="new-password" required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></div>
        <label htmlFor="account-confirm-password">Confirm new password</label>
        <div className="account-email-add-controls"><input id="account-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>
        <button className="account-dark-button" type="submit" disabled={busy || !isUserLoaded}>{busy ? 'UPDATING…' : 'CHANGE PASSWORD'} <ArrowRight size={13} /></button>
      </form> : !codeSent ? <div className="account-email-add-form">
        <p>A one-time code will be sent to <strong>{user?.primaryEmailAddress?.emailAddress ?? 'your verified primary email'}</strong>. You will not need to enter your current password.</p>
        <button className="account-dark-button" type="button" onClick={() => void startEmailReset()} disabled={busy || !isSessionLoaded || !isUserLoaded}>{busy ? 'SENDING CODE…' : 'SEND VERIFICATION CODE'} <ArrowRight size={13} /></button>
      </div> : <form className="account-email-add-form" onSubmit={submitEmailReset}>
        <label htmlFor="account-password-reset-code">Email verification code</label>
        <div className="account-email-add-controls"><input id="account-password-reset-code" type="text" inputMode="numeric" autoComplete="one-time-code" required value={verificationCode} onChange={event => setVerificationCode(event.target.value)} /></div>
        <label htmlFor="account-email-new-password">New password</label>
        <div className="account-email-add-controls"><input id="account-email-new-password" type="password" autoComplete="new-password" required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></div>
        <label htmlFor="account-email-confirm-password">Confirm new password</label>
        <div className="account-email-add-controls"><input id="account-email-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>
        <button className="account-dark-button" type="submit" disabled={busy}>{busy ? 'RESETTING…' : 'RESET PASSWORD'} <ArrowRight size={13} /></button>
        <button className="account-password-resend" type="button" onClick={() => void startEmailReset()} disabled={busy}>Send a new code</button>
      </form>}
      {message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
    </section>
  </div>
}

function EmailAddressesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isLoaded } = useUser()
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [pendingEmailId, setPendingEmailId] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const createEmailAddress = useReverification(async (value: string) => {
    if (!user) throw new Error('Your account is unavailable. Please sign in again.')
    return user.createEmailAddress({ email: value })
  })
  const changePrimaryEmail = useReverification(async (emailAddressId: string) => {
    if (!user) throw new Error('Your account is unavailable. Please sign in again.')
    return user.update({ primaryEmailAddressId: emailAddressId })
  })
  const deleteEmailAddress = useReverification(async (emailAddressId: string) => {
    if (!user) throw new Error('Your account is unavailable. Please sign in again.')
    const address = user.emailAddresses.find(item => item.id === emailAddressId)
    if (!address) throw new Error('This email address is no longer available. Refresh and try again.')
    return address.destroy()
  })

  useEffect(() => {
    if (!open) {
      setEmail('')
      setVerificationCode('')
      setPendingEmailId('')
      setConfirmRemoveId('')
      setError('')
      setMessage('')
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose, open])

  if (!open) return null

  const runSensitiveChange = async (operation: () => Promise<unknown>, successMessage: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await operation()
      await user?.reload()
      setMessage(successMessage)
      setConfirmRemoveId('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update email addresses.')
    } finally {
      setBusy(false)
    }
  }

  const startAddingEmail = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const created = await createEmailAddress(email.trim())
      if (!created) throw new Error('Clerk did not create an email address. Please try again.')
      await user?.reload()
      const addedAddress = user?.emailAddresses.find(address => address.id === created.id)
      if (!addedAddress) throw new Error('The new email address could not be loaded. Please refresh and try again.')
      await addedAddress.prepareVerification({ strategy: 'email_code' })
      setPendingEmailId(addedAddress.id)
      setVerificationCode('')
      setMessage(`A verification code was sent to ${addedAddress.emailAddress}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this email address.')
    } finally {
      setBusy(false)
    }
  }

  const verifyAddedEmail = async (event: FormEvent) => {
    event.preventDefault()
    const address = user?.emailAddresses.find(item => item.id === pendingEmailId)
    if (!address) {
      setError('The email verification has expired. Start again to request a new code.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await address.attemptVerification({ code: verificationCode.trim() })
      if (result.verification.status !== 'verified') {
        setError('The email address is not verified yet. Check the code and try again.')
        return
      }
      await user?.reload()
      setPendingEmailId('')
      setEmail('')
      setVerificationCode('')
      setMessage(`${address.emailAddress} has been verified.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify this email address.')
    } finally {
      setBusy(false)
    }
  }

  const emailAddresses = user?.emailAddresses ?? []
  const primaryId = user?.primaryEmailAddressId

  return <div className="account-email-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="account-email-modal" role="dialog" aria-modal="true" aria-labelledby="account-email-modal-title">
      <button className="account-email-modal-close" type="button" aria-label="Close email addresses" onClick={onClose} disabled={busy}><X size={19} /></button>
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h2 id="account-email-modal-title">Email addresses</h2>
      <p className="account-email-modal-intro">Changes require you to verify your account. New addresses must also be confirmed from the email we send.</p>
      {!isLoaded ? <p className="account-muted" role="status">Loading email addresses…</p> : <div className="account-email-list">
        {emailAddresses.map(address => {
          const isPrimary = address.id === primaryId
          const isVerified = address.verification?.status === 'verified'
          return <article className="account-email-row" key={address.id}>
            <div className="account-email-address">
              <strong>{address.emailAddress}</strong>
              <span className={isVerified ? 'is-verified' : 'is-pending'}>{isVerified ? 'Verified' : 'Verification pending'}</span>
            </div>
            <div className="account-email-actions">
              {isPrimary ? <span className="account-email-primary">Primary</span> : <>
                {isVerified && <button type="button" onClick={() => void runSensitiveChange(() => changePrimaryEmail(address.id), 'Primary email address updated.')} disabled={busy}>Make primary</button>}
                <button className="is-danger" type="button" onClick={() => confirmRemoveId === address.id
                  ? void runSensitiveChange(() => deleteEmailAddress(address.id), 'Email address removed.')
                  : setConfirmRemoveId(address.id)} disabled={busy}>
                  {confirmRemoveId === address.id ? 'Confirm remove' : 'Remove'}
                </button>
                {confirmRemoveId === address.id && <button type="button" onClick={() => setConfirmRemoveId('')} disabled={busy}>Cancel</button>}
              </>}
            </div>
          </article>
        })}
      </div>}
      {!pendingEmailId ? <form className="account-email-add-form" onSubmit={startAddingEmail}>
        <label htmlFor="account-add-email">Add email address</label>
        <div className="account-email-add-controls"><input id="account-add-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /><button className="account-dark-button" type="submit" disabled={busy}>{busy ? 'PLEASE WAIT…' : 'ADD ADDRESS'} <Plus size={14} /></button></div>
      </form> : <form className="account-email-add-form" onSubmit={verifyAddedEmail}>
        <label htmlFor="account-email-verification-code">Verification code</label>
        <p>Enter the code sent to <strong>{email}</strong>.</p>
        <div className="account-email-add-controls"><input id="account-email-verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" required value={verificationCode} onChange={event => setVerificationCode(event.target.value)} /><button className="account-dark-button" type="submit" disabled={busy}>{busy ? 'VERIFYING…' : 'VERIFY EMAIL'} <Check size={14} /></button></div>
      </form>}
      {message && <p className="account-success-note" role="status"><Check size={14} /> {message}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
    </section>
  </div>
}
