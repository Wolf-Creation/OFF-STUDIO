import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Boxes, CalendarClock, Camera, CameraOff, Check, ChevronLeft, ChevronRight, ClipboardList, Cookie, Eye, FileText, Heart, Image, LayoutDashboard, Layers3, LogOut, Menu, MoreHorizontal, Package, PanelsTopLeft, Plus, Printer, QrCode, RotateCcw, Save, Search, Settings, SlidersHorizontal, Tag, Trash2, UserRound, Users, X, BarChart3, ShoppingCart, Megaphone, UserRoundSearch, FileDown, type LucideIcon } from 'lucide-react'
import type { ApiCategory, ApiCollection, ApiCustomer, ApiOrder, ApiProduct, ApiResponse, ApiShippingAddress, CategoryWriteInput, CollectionWriteInput, DashboardData, ManualOrderRequest, ProductVariantWriteInput, ProductWriteInput, StoreSettings } from '@off/shared-types'
import { TUNISIA_LOCATIONS } from '@off/shared-types/tunisia-locations'
import { removePlainBackground } from './backgroundRemoval'
import './website.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api/v1'
type RowProduct = { id: string; name: string; category: string; price: number; status: string; image: string }
type CategoryItem = { id: string; name: string; slug: string; image: string; productCount: number; status: string }
type InventoryProduct = Pick<ApiProduct, '_id' | 'name' | 'slug' | 'category' | 'status' | 'variants'>
type ManualOrderItemInput = { productId: string; sku: string; quantity: number }
type ManualOrderForm = { name: string; email: string; shippingAddress: ApiShippingAddress; items: ManualOrderItemInput[] }
type WebsiteSectionType = 'hero' | 'featured-products' | 'new-arrivals' | 'collection' | 'categories' | 'editorial' | 'brand' | 'featured-release' | 'newsletter' | 'instagram-feed' | 'footer-announcement' | 'rich-text'
type WebsiteSection = { id: string; type: WebsiteSectionType; title: string; enabled: boolean; order: number; settings: Record<string, unknown> }
type WebsiteInstagramPost = { imageUrl: string; postUrl?: string }
type HomepageSelectionCard = { title: string; description: string; productId: string; collectionId?: string; background: string; destination: string }
type WebsitePageRecord = { _id: string; name: string; slug: string; pageType: string; protected: boolean; status: string; draftVersion: number; publishedVersion: number; draftSections: WebsiteSection[]; publishedSections: WebsiteSection[]; updatedAt: string; publishedAt?: string | null; scheduledAt?: string | null }
type MediaRecord = { _id: string; url: string; fileName: string; mimeType: string; fileSize: number; width: number; height: number; altText: string; usageReferences: string[]; createdAt: string }
const emptyProductInput = (category = ''): ProductWriteInput => ({
  name: '',
  category,
  price: 990,
  shortDescription: '',
  description: '',
  status: 'draft',
  image: '',
  featured: false,
  variants: [{ sku: `OFF-${Date.now().toString(36).toUpperCase()}-M`, color: 'Black', size: 'M', price: 990, stock: 0, image: '', active: true }],
})
const adminTokenKey = 'off-admin-token'
const navGroups: { label: string; links: [string, string, LucideIcon][] }[] = [
  { label: 'OVERVIEW', links: [['Dashboard', '/dashboard', LayoutDashboard]] },
  { label: 'ANALYTICS & INTELLIGENCE', links: [['Overview', '/analytics/overview', BarChart3], ['Website', '/analytics/website', Eye], ['E-commerce', '/analytics/ecommerce', ShoppingCart], ['Products', '/analytics/products', Package], ['Wishlist', '/analytics/wishlist', Heart], ['Collections', '/analytics/collections', Layers3], ['Marketing', '/analytics/marketing', Megaphone], ['Customers', '/analytics/customers', UserRoundSearch], ['Reports & Intelligence', '/analytics/reports', FileDown]] },
  { label: 'COMMERCE', links: [['Orders', '/orders', ClipboardList], ['QR Orders', '/qr-orders', QrCode], ['Products', '/products', Package], ['Customers', '/customers', Users], ['Categories', '/categories', Tag], ['Collections', '/collections', Layers3]] },
  { label: 'MANAGE', links: [['Inventory', '/inventory', Boxes], ['Content', '/content', FileText], ['Settings', '/settings', Settings], ['Privacy & Cookies', '/settings/privacy-cookies', Cookie]] },
  { label: 'WEBSITE', links: [['Website', '/website', PanelsTopLeft], ['Pages', '/website/pages', FileText], ['Homepage Builder', '/website/homepage', PanelsTopLeft], ['Navigation & Footer', '/website/navigation', Settings], ['Website Settings', '/website/settings', Settings], ['Media Library', '/website/media', Image], ['Scheduled Publications', '/website/scheduled', CalendarClock]] },
] as const
const formatTnd = (amount: number) => `${new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 3 }).format(amount)} TND`
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem(adminTokenKey)
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  })
  const payload = await response.json() as Partial<ApiResponse<T>> & { error?: { message?: string } }
  if (response.status === 401 && path !== '/auth/login') {
    sessionStorage.removeItem(adminTokenKey)
    window.dispatchEvent(new Event('off-admin-unauthorized'))
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `API request failed (${response.status}).`)
  if (payload.data === undefined) throw new Error('API returned an invalid response.')
  return payload.data
}
const toRowProduct = (product: ApiProduct): RowProduct => ({
  id: product._id,
  name: product.name,
  category: product.category,
  price: product.price,
  status: product.status === 'active' ? 'Active' : product.status === 'draft' ? 'Draft' : 'Archived',
  image: product.images?.[0]?.url ?? '',
})
const toOrderRow = (order: ApiOrder): string[] => [
  `#${order.orderNumber}`,
  order.customerName,
  formatTnd(order.total),
  fulfillmentStatusLabels[order.fulfillmentStatus],
  new Date(order.placedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' }),
]

function Brand() { return <Link to="/dashboard" className="admin-brand" aria-label="OFF Admin"><img src="/off-logo.svg" alt="OFF" /></Link> }

function Sidebar({ onSignOut }: { onSignOut: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  return <>
    <button className="mobile-menu" aria-label="Open admin navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
    {mobileOpen && <button className="mobile-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`admin-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="sidebar-mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={16} /></button><span>STUDIO / LOS ANGELES</span></div>
      <nav>{navGroups.map(group => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.links.map(([label, path, Icon]) => <NavLink key={label} to={path} end={path === '/settings'} className={({ isActive }) => `${isActive ? 'active' : ''} ${location.pathname === '/' && path === '/dashboard' ? 'active' : ''}`}><Icon size={15} strokeWidth={1.6} /><span>{label}</span></NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><span className="admin-avatar">O</span><div><b>OFF Studio</b><small>Administrator</small></div><button aria-label="Sign out" onClick={onSignOut}><LogOut size={14} /></button></div>
    </aside>
  </>
}

function AdminLayout({ onSignOut }: { onSignOut: () => void }) {
  return <div className="admin-app"><Sidebar onSignOut={onSignOut} /><main className="admin-main"><Routes><Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<Dashboard />} /><Route path="/analytics/overview" element={<AnalyticsDashboard section="overview" />} /><Route path="/analytics/website" element={<AnalyticsDashboard section="website" />} /><Route path="/analytics/ecommerce" element={<AnalyticsDashboard section="ecommerce" />} /><Route path="/analytics/products" element={<AnalyticsDashboard section="products" />} /><Route path="/analytics/wishlist" element={<AnalyticsDashboard section="wishlist" />} /><Route path="/analytics/collections" element={<AnalyticsDashboard section="collections" />} /><Route path="/analytics/marketing" element={<AnalyticsDashboard section="marketing" />} /><Route path="/analytics/customers" element={<AnalyticsDashboard section="customers" />} /><Route path="/analytics/reports" element={<AnalyticsDashboard section="reports" />} /><Route path="/products" element={<Products />} /><Route path="/orders" element={<Orders />} /><Route path="/qr-orders" element={<QrOrders />} /><Route path="/qr-orders/:token" element={<QrOrders />} /><Route path="/customers" element={<Customers />} /><Route path="/categories" element={<Categories />} /><Route path="/collections" element={<Collections />} /><Route path="/inventory" element={<Inventory />} /><Route path="/content" element={<StoreManagement section="content" />} /><Route path="/settings" element={<StoreManagement section="settings" />} /><Route path="/settings/privacy-cookies" element={<CookieConsentDashboard />} /><Route path="/website" element={<WebsiteOverview />} /><Route path="/website/pages" element={<WebsitePages />} /><Route path="/website/pages/:pageId/editor" element={<WebsiteEditor />} /><Route path="/website/homepage" element={<WebsiteEditor homepage />} /><Route path="/website/navigation" element={<WebsiteNavigation />} /><Route path="/website/settings" element={<WebsiteGlobalSettings />} /><Route path="/website/media" element={<WebsiteMedia />} /><Route path="/website/merchandising" element={<WebsiteMerchandising />} /><Route path="/website/scheduled" element={<WebsiteScheduled />} /><Route path="*" element={<Dashboard />} /></Routes></main></div>
}

function AdminSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await apiRequest<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      sessionStorage.setItem(adminTokenKey, result.token)
      onSignedIn()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }
  return <main className="admin-signin"><form className="admin-signin-card" onSubmit={submit}><Brand /><p className="admin-eyebrow">SECURE ADMINISTRATION</p><h1>Sign in to OFF Studio</h1><label>Email address<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <div className="admin-alert" role="alert">{error}</div>}<button className="admin-button primary" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button></form></main>
}

function PageHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return <div className="admin-page-header"><div>{eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}<h1>{title}</h1></div><div className="page-header-actions">{action}</div></div>
}

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    apiRequest<DashboardData>('/admin-preview/dashboard').then((result) => {
      if (!cancelled) { setData(result); setError('') }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load dashboard data.')
    })
    return () => { cancelled = true }
  }, [])
  const sales = data?.dailySales ?? []
  const peak = Math.max(1, ...sales.map((entry) => entry.total))
  const chartPoints = sales.map((entry, index) => {
    const x = sales.length < 2 ? 205 : 4 + index * (403 / (sales.length - 1))
    const y = 79 - (entry.total / peak) * 65
    return `${x.toFixed(0)},${y.toFixed(0)}`
  }).join(' ') || '4,79 407,79'
  const countFor = (status: string) => data?.orderBreakdown.find(entry => entry._id === status)?.count ?? 0
  const completed = countFor('delivered')
  const processing = countFor('processing') + countFor('in_delivery')
  const other = Math.max(0, (data?.orders ?? 0) - completed - processing)
  const completedPercent = data?.orders ? (completed / data.orders) * 100 : 0
  const processingPercent = data?.orders ? ((completed + processing) / data.orders) * 100 : 0
  const breakdownGradient = data?.orders
    ? `conic-gradient(#222 0 ${completedPercent}%, #96ad9a ${completedPercent}% ${processingPercent}%, #e2d8c7 ${processingPercent}% 100%)`
    : 'conic-gradient(#eee 0 100%)'
  const metrics: { label: string; value: string; delta: string; Icon: LucideIcon }[] = [
    { label: 'Total Sales', value: formatTnd(data?.totalSales ?? 0), delta: 'Demo', Icon: ArrowUp },
    { label: 'Orders', value: String(data?.orders ?? 0), delta: 'Demo', Icon: ArrowUp },
    { label: 'Customers', value: String(data?.customers ?? 0), delta: 'Demo', Icon: ArrowUp },
    { label: 'Products', value: String(data?.products ?? 0), delta: 'Demo', Icon: Package },
  ]
  return <div className="admin-content">
    <PageHeader eyebrow="SAMPLE DATA / APRIL 2025" title="Dashboard" action={<span className="date-select">Imported demo records</span>} />
    {error && <div className="admin-alert" role="alert">{error}</div>}
    <div className="metric-grid">{metrics.map(({ label, value, delta, Icon }) => <article className="metric-card" key={label}><p>{label}</p><strong>{data ? value : '—'}</strong><small className={delta === 'Demo' ? '' : 'positive'}><Icon size={11} /> {data ? delta : 'Loading'}</small><span>sample database</span></article>)}</div>
    <div className="dashboard-grid"><section className="panel sales-panel"><div className="panel-heading"><div><h2>Sales overview</h2><p>Paid sample orders by day</p></div><span className="subtle-select">Demo data</span></div><div className="chart-summary"><strong>{formatTnd(data?.totalSales ?? 0)}</strong><span>excluding cancelled orders</span></div><div className="chart"><div className="chart-y-labels"><span>{formatTnd(peak)}</span><span>{formatTnd(Math.round(peak * .66))}</span><span>{formatTnd(Math.round(peak * .33))}</span><span>{formatTnd(0)}</span></div><div className="chart-area"><div className="chart-gridlines"><i /><i /><i /><i /></div><svg viewBox="0 0 410 92" preserveAspectRatio="none" role="img" aria-label="Sales from sample orders"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8a9a8b" stopOpacity=".2" /><stop offset="1" stopColor="#8a9a8b" stopOpacity="0" /></linearGradient></defs><polygon points={`4,92 ${chartPoints} 407,92`} fill="url(#area)" /><polyline points={chartPoints} fill="none" stroke="#343a35" strokeWidth="1.7" vectorEffect="non-scaling-stroke" /></svg><div className="chart-x-labels">{sales.length ? <><span>{sales[0]._id.slice(5)}</span><span>{sales[Math.floor(sales.length / 2)]._id.slice(5)}</span><span>{sales[sales.length - 1]._id.slice(5)}</span></> : <span>No paid orders</span>}</div></div></div></section>
      <section className="panel breakdown"><div className="panel-heading"><div><h2>Order breakdown</h2><p>By fulfillment status</p></div><MoreHorizontal size={18} /></div><div className="breakdown-ring" style={{ background: breakdownGradient }}><div><strong>{data?.orders ?? '—'}</strong><small>orders</small></div></div><div className="breakdown-legend"><span><i className="dot dot-dark" />Delivered <b>{completed}</b></span><span><i className="dot dot-sage" />Processing <b>{processing}</b></span><span><i className="dot dot-sand" />Other <b>{other}</b></span></div></section></div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>Loaded from the OFF development database</p></div><Link to="/orders" className="view-all">View all <ArrowUp size={12} /></Link></div><OrderTable rows={data?.recentOrders.map(toOrderRow) ?? []} /></section>
    <p className="demo-disclaimer">Development database · imported sample records, not real customer orders</p>
  </div>
}

const fulfillmentStatusLabels: Record<string, string> = { confirmation: 'Confirmation', processing: 'En cours de traitement', in_delivery: 'En cours de livraison', delivered: 'Livrée', returned: 'Retour', cancelled: 'Annulée', exchange: 'Échange', unpaid: 'Non payé', paid: 'Payé', pending: 'En attente' }
const nextOrderStatuses: Record<string, string[]> = { confirmation: ['processing', 'cancelled'], processing: ['in_delivery', 'cancelled', 'exchange'], in_delivery: ['delivered', 'returned', 'cancelled', 'exchange'], delivered: ['returned', 'exchange'], returned: ['exchange'], exchange: ['processing'], cancelled: [] }
function Status({ value }: { value: string }) { return <span className={`status status-${value.toLowerCase()}`}>{fulfillmentStatusLabels[value] ?? value}</span> }

type QrOrderResult = { order: ApiOrder; qrToken: string }

function QrOrders() {
  const { token: routeToken } = useParams()
  const [searchParams] = useSearchParams()
  const [orderResult, setOrderResult] = useState<QrOrderResult | null>(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const lastScanRef = useRef('')
  const currentToken = routeToken || searchParams.get('token') || ''

  useEffect(() => {
    let cancelled = false
    void import('@zxing/browser')
      .then(({ BrowserQRCodeReader }) => BrowserQRCodeReader.listVideoInputDevices())
      .then(devices => { if (!cancelled) setCameras(devices) })
      .catch(() => { if (!cancelled) setCameras([]) })
    return () => { cancelled = true }
  }, [])
  const loadToken = async (value: string) => {
    setLoading(true); setError(''); setNotice('')
    try {
      const result = await apiRequest<QrOrderResult>(`/admin-preview/orders/qr/${encodeURIComponent(value)}`)
      setOrderResult(result)
    } catch (cause) { setOrderResult(null); setError(cause instanceof Error ? cause.message : 'Unable to find this order.') }
    finally { setLoading(false) }
  }
  useEffect(() => { if (currentToken) void loadToken(currentToken); else setOrderResult(null) }, [currentToken])
  useEffect(() => () => controlsRef.current?.stop(), [])

  const lookupOrder = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setNotice('')
    try {
      const result = await apiRequest<QrOrderResult>(`/admin-preview/orders/lookup/${encodeURIComponent(orderNumber.trim())}`)
      setOrderResult(result)
    } catch (cause) { setOrderResult(null); setError(cause instanceof Error ? cause.message : 'Unable to find this order.') }
    finally { setLoading(false) }
  }
  const stopScanner = () => { controlsRef.current?.stop(); controlsRef.current = null; setScanning(false) }
  const readQrValue = (raw: string) => {
    try {
      const parsed = new URL(raw)
      const segments = parsed.pathname.split('/').filter(Boolean)
      const qrIndex = segments.lastIndexOf('qr-orders')
      if (qrIndex >= 0 && segments[qrIndex + 1]) return segments[qrIndex + 1]
      const queryToken = parsed.searchParams.get('token')
      if (queryToken) return queryToken
    } catch { /* QR can contain the raw opaque token. */ }
    return /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : ''
  }
  const startScanner = async () => {
    setError(''); setNotice(''); lastScanRef.current = ''; setScanning(true)
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const devices = await BrowserQRCodeReader.listVideoInputDevices()
      setCameras(devices)
      if (!devices.length) throw new Error('No camera was found. Use the order number field below.')
      const chosenId = cameraId || devices.find(device => /back|rear|environment/i.test(device.label))?.deviceId || devices[0]?.deviceId
      if (!videoRef.current) throw new Error('The camera preview is not ready. Try again.')
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoDevice(chosenId, videoRef.current, (result, _decodeError, scannerControls) => {
        if (!result || lastScanRef.current) return
        const scanned = readQrValue(result.getText())
        if (!scanned) { setError('This QR code is not an OFF order label.'); return }
        lastScanRef.current = scanned
        scannerControls.stop(); controlsRef.current = null; setScanning(false); void loadToken(scanned)
      })
      if (lastScanRef.current) controls.stop()
      else controlsRef.current = controls
    } catch (cause) {
      setScanning(false)
      const name = cause instanceof Error ? cause.name : ''
      setError(name === 'NotAllowedError' ? 'Camera access was denied. Allow camera access or enter the order number manually.' : name === 'NotFoundError' ? 'No camera is available. Enter the order number manually.' : cause instanceof Error ? cause.message : 'Unable to start the camera.')
    }
  }
  const updateStatus = async (nextStatus: string) => {
    if (!orderResult) return
    const { order, qrToken } = orderResult
    if (!window.confirm(`Confirmer le passage de ${order.orderNumber} de « ${fulfillmentStatusLabels[order.fulfillmentStatus]} » à « ${fulfillmentStatusLabels[nextStatus]} » ?`)) return
    setUpdating(true); setError(''); setNotice('')
    try {
      const updated = await apiRequest<ApiOrder>(`/admin-preview/orders/qr/${encodeURIComponent(qrToken)}/status`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: nextStatus, expectedStatus: order.fulfillmentStatus }) })
      setOrderResult({ ...orderResult, order: updated }); setNotice(`Order updated to ${updated.fulfillmentStatus}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update order status.') }
    finally { setUpdating(false) }
  }
  const order = orderResult?.order
  const address = order?.shippingAddress
  const confirmCodPayment = async () => {
    if (!orderResult || !order || !window.confirm(`Confirm that cash was collected for ${order.orderNumber}?`)) return
    setUpdating(true); setError(''); setNotice('')
    try {
      const updated = await apiRequest<ApiOrder>(`/admin-preview/orders/${order._id}/payment`, { method: 'PATCH' })
      setOrderResult({ ...orderResult, order: updated })
      setNotice(`Payment confirmed for ${updated.orderNumber}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to confirm cash-on-delivery payment.') }
    finally { setUpdating(false) }
  }
  return <div className="admin-content qr-orders-content">
    <PageHeader eyebrow="COMMERCE / ORDER OPERATIONS" title="QR Orders" action={order && <Status value={order.fulfillmentStatus} />} />
    {error && <div className="admin-alert" role="alert">{error}</div>}{notice && <div className="admin-success" role="status">{notice}</div>}
    <div className="qr-orders-layout">
      <section className="panel qr-scanner-panel"><div className="qr-panel-heading"><span className="qr-heading-icon"><QrCode size={18} /></span><div><h2>Scan an order</h2><p>Scan the QR code on the OFF shipping label.</p></div></div>
        <div className={`qr-camera-frame ${scanning ? 'is-scanning' : ''}`}><video ref={videoRef} muted playsInline aria-label="Order QR scanner camera" />{!scanning && <div className="qr-camera-placeholder"><CameraOff size={26} /><span>Camera preview</span></div>}<span className="qr-scan-bracket" />{scanning && <span className="qr-camera-hint">Place the order QR inside the frame</span>}</div>
        {cameras.length > 1 && <label className="qr-camera-select">Camera<select value={cameraId} onChange={event => setCameraId(event.target.value)} disabled={scanning}>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select></label>}
        <div className="qr-camera-actions">{scanning ? <button className="admin-button" onClick={stopScanner}><CameraOff size={14} /> Stop camera</button> : <button className="admin-button primary" onClick={() => void startScanner()}><Camera size={14} /> Start camera</button>}</div>
        <div className="qr-divider"><span>OR LOOK UP MANUALLY</span></div>
        <form className="qr-lookup-form" onSubmit={lookupOrder}><label>Order number<input value={orderNumber} onChange={event => setOrderNumber(event.target.value.toUpperCase())} placeholder="OFF…" autoComplete="off" required /></label><button className="admin-button" type="submit" disabled={loading || !orderNumber.trim()}><Search size={14} /> Find order</button></form>
        <p className="qr-security-note">Order details are only available to signed-in Admin users.</p>
      </section>
      <section className="panel qr-order-panel" aria-live="polite">{loading ? <div className="qr-empty-state"><span className="qr-loading-dot" />Loading order…</div> : order ? <>
        <header className="qr-order-header"><div><p className="admin-eyebrow">ORDER FOUND</p><h2>#{order.orderNumber}</h2><span>{new Date(order.placedAt).toLocaleString()}</span></div><Status value={order.fulfillmentStatus} /></header>
        <div className="qr-order-summary"><section><h3>Customer</h3><b>{order.customerName}</b><a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a><a href={address?.phoneNumber ? `tel:${address.phoneNumber}` : undefined}>{address?.phoneNumber || 'Phone not provided'}</a></section><section><h3>Shipping address</h3><p>{address ? <>{address.fullName && <>{address.fullName}<br /></>}{address.line1}{address.line2 && `, ${address.line2}`}<br />{address.delegation || address.city}{address.governorate && `, ${address.governorate}`}<br />{address.postalCode && `${address.postalCode} · `}{address.country === 'TN' ? 'Tunisia' : address.country}</> : 'No address on this order.'}</p></section></div>
        <div className="qr-detail-block"><div className="qr-detail-block-title"><h3>Items</h3><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} total</span></div>{order.items.map((item, index) => <article className="qr-order-item" key={`${item.sku}-${index}`}><img src={item.image || undefined} alt="" /><div><b>{item.name}</b><span>{item.color} / {item.size} · SKU {item.sku}</span></div><span>× {item.quantity}</span><strong>{formatTnd(item.unitPrice * item.quantity)}</strong></article>)}</div>
        <div className="qr-order-facts"><div><span>PAYMENT</span><b>{(order.paymentMethod ?? 'stripe').replace('_', ' ')} · {fulfillmentStatusLabels[order.paymentStatus] ?? order.paymentStatus}</b></div><div><span>TRACKING</span><b>{order.trackingNumber || 'Not provided'}</b></div><div><span>ORDER TOTAL</span><b>{formatTnd(order.total)}</b></div></div>
        <section className="qr-status-section"><div><h3>Changer le statut</h3><p>Chaque changement est confirmé et ajouté à l’historique. Delivery does not confirm payment.</p></div><div className="qr-status-actions">{(nextOrderStatuses[order.fulfillmentStatus] ?? []).map(status => <button key={status} className="admin-button primary" disabled={updating} onClick={() => void updateStatus(status)}>{updating ? 'Saving…' : <><Check size={14} /> {fulfillmentStatusLabels[status]}</>}</button>)}{order.paymentMethod === 'cash_on_delivery' && order.fulfillmentStatus === 'delivered' && order.paymentStatus === 'unpaid' && <button className="admin-button primary" disabled={updating} onClick={() => void confirmCodPayment()}>{updating ? 'Saving…' : 'Confirm COD payment collected'}</button>}</div></section>
        <section className="qr-history"><h3>Status history</h3>{order.statusHistory?.length ? <ol>{[...order.statusHistory].reverse().map((entry, index) => <li key={`${entry.changedAt}-${index}`}><span className="qr-history-dot" /><div><b>{entry.previousStatus ? `${entry.previousStatus} → ${entry.status}` : entry.status}</b><span>{new Date(entry.changedAt).toLocaleString()}{entry.changedBy ? ` · ${entry.changedBy}` : ''}</span></div></li>)}</ol> : <p>No status changes recorded yet.</p>}</section>
      </> : <div className="qr-empty-state"><QrCode size={28} /><h2>Ready to scan</h2><p>Start the camera or enter an order number to view its details and manage fulfillment.</p></div>}</section>
    </div>
  </div>
}

function OrderTable({ rows, records, onFulfillmentChange, onSelectOrder, onPrintOrder, onDeleteOrder, onRelaunchOrder, busyOrderId }: { rows: string[][]; records?: ApiOrder[]; onFulfillmentChange?: (orderId: string, status: string) => void; onSelectOrder?: (order: ApiOrder) => void; onPrintOrder?: (order: ApiOrder) => void; onDeleteOrder?: (order: ApiOrder) => void; onRelaunchOrder?: (order: ApiOrder) => void; busyOrderId?: string }) {
  return <div className="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TOTAL</th><th>STATUS</th><th>DATE</th>{records && <><th>PAYMENT</th><th>FULFILLMENT</th><th>ACTIONS</th></>}</tr></thead><tbody>{rows.map((row, index) => { const record = records?.[index]; return <tr key={row[0]}>{row.map((cell, cellIndex) => <td key={`${row[0]}-${cellIndex}`}>{cellIndex === 0 && record && onSelectOrder ? <button className="order-detail-link" onClick={() => onSelectOrder(record)}>{cell}</button> : cellIndex === 0 ? <b>{cell}</b> : cellIndex === 3 ? <Status value={record?.fulfillmentStatus ?? cell} /> : cell}</td>)}{record && <><td><Status value={record.paymentStatus} /></td><td><select className="inline-status-select" aria-label={`Fulfillment status for ${record.orderNumber}`} value={record.fulfillmentStatus} onChange={event => onFulfillmentChange?.(record._id, event.target.value)}>{[record.fulfillmentStatus, ...(nextOrderStatuses[record.fulfillmentStatus] ?? [])].map(status => <option key={status} value={status}>{fulfillmentStatusLabels[status]}</option>)}</select></td><td><div className="order-row-actions"><button type="button" className="toolbar-icon order-print-trigger" aria-label={`Print shipping label for ${record.orderNumber}`} title="Print shipping label" onClick={() => onPrintOrder?.(record)}><Printer size={15} /></button>{record.fulfillmentStatus === 'returned' && <button type="button" className="toolbar-icon order-relaunch-trigger" aria-label={`Relaunch returned order ${record.orderNumber}`} title="Relaunch order" disabled={busyOrderId === record._id} onClick={() => onRelaunchOrder?.(record)}><RotateCcw size={15} /></button>}<button type="button" className="toolbar-icon order-delete-trigger" aria-label={`Delete order ${record.orderNumber}`} title="Delete order" disabled={busyOrderId === record._id} onClick={() => onDeleteOrder?.(record)}><Trash2 size={15} /></button></div></td></>}</tr> })}</tbody></table></div>
}

function TunisianAddressFields({ address, onAddressChange }: { address: ApiShippingAddress; onAddressChange: (field: keyof ApiShippingAddress, value: string) => void }) {
  const governorates = Object.keys(TUNISIA_LOCATIONS)
  const delegations = TUNISIA_LOCATIONS[address.governorate ?? ''] ?? []
  return <>
    <label>Country<input value="Tunisia" readOnly /></label>
    <label>Governorate<select value={address.governorate ?? ''} onChange={event => onAddressChange('governorate', event.target.value)} required><option value="" disabled>Select governorate</option>{governorates.map(governorate => <option key={governorate}>{governorate}</option>)}</select></label>
    <label>Delegation<select value={address.delegation ?? ''} onChange={event => onAddressChange('delegation', event.target.value)} required disabled={!delegations.length}><option value="" disabled>Select delegation</option>{delegations.map(delegation => <option key={delegation}>{delegation}</option>)}</select></label>
  </>
}

function Products() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<RowProduct[]>([])
  const [records, setRecords] = useState<ApiProduct[]>([])
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [category, setCategory] = useState('All categories')
  const [status, setStatus] = useState('All status')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<ApiProduct | null>(null)
  const [form, setForm] = useState<ProductWriteInput>(emptyProductInput())
  const [gallery, setGallery] = useState<ApiProduct['images']>([])
  const [generatedGallery, setGeneratedGallery] = useState<MediaRecord[]>([])
  const [generationAvailable, setGenerationAvailable] = useState<boolean | null>(null)
  const [galleryCount, setGalleryCount] = useState(3)
  const [generatingGallery, setGeneratingGallery] = useState(false)
  const [galleryMessage, setGalleryMessage] = useState('')
  const [galleryError, setGalleryError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiRequest<ApiProduct[]>('/admin-preview/products'),
      apiRequest<ApiCategory[]>('/admin-preview/categories'),
    ]).then(([productItems, categoryItems]) => {
      if (cancelled) return
      setRecords(productItems)
      setData(productItems.map(toRowProduct))
      setCategories(categoryItems)
      setError('')
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load products.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])
  useEffect(() => {
    apiRequest<{ enabled: boolean }>('/admin-preview/image-generation/status')
      .then(status => setGenerationAvailable(status.enabled))
      .catch(() => setGenerationAvailable(false))
  }, [])
  const filtered = data.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) && (category === 'All categories' || item.category === category) && (status === 'All status' || item.status === status))
  const openCreate = () => {
    setEditing(null)
    setForm(emptyProductInput(categories.find(item => item.status === 'active')?.name ?? ''))
    setGallery([])
    setGeneratedGallery([])
    setGalleryMessage('')
    setGalleryError('')
    setError('')
    setModal(true)
  }
  const openEdit = (id: string) => {
    const product = records.find(item => item._id === id)
    if (!product) return
    setEditing(product)
    setForm({
      name: product.name,
      category: product.category,
      price: product.price,
      shortDescription: product.shortDescription,
      description: product.description,
      status: product.status,
      image: product.images[0]?.url ?? '',
      featured: product.featured,
      variants: product.variants.map(variant => ({
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        price: variant.price,
        stock: variant.stock,
        image: variant.image ?? '',
        active: variant.active,
      })),
    })
    setGallery(product.images ?? [])
    setGeneratedGallery([])
    setGalleryMessage('')
    setGalleryError('')
    setError('')
    setModal(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const originalCover = editing?.images?.[0]?.url ?? ''
      const images = editing
        ? (form.image !== originalCover
          ? [{ url: form.image, alt: form.name, order: 0 }, ...gallery.filter(image => image.url !== originalCover && image.url !== form.image)]
          : gallery).map((image, order) => ({ ...image, order }))
        : form.image ? [{ url: form.image, alt: form.name, order: 0 }] : []
      await apiRequest<ApiProduct>(editing ? `/admin-preview/products/${editing._id}` : '/admin-preview/products', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, images }),
      })
      setModal(false)
      setEditing(null)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the product.')
    } finally {
      setSaving(false)
    }
  }
  const generateGallery = async () => {
    if (!editing) return
    setGeneratingGallery(true)
    setGalleryMessage('')
    setGalleryError('')
    try {
      const result = await apiRequest<{ images: MediaRecord[] }>(`/admin-preview/products/${editing._id}/generate-gallery`, { method: 'POST', body: JSON.stringify({ count: galleryCount }) })
      setGeneratedGallery(result.images)
      setGalleryMessage(`${result.images.length} new studio image${result.images.length > 1 ? 's' : ''} ready. Choose which ones to add to the gallery.`)
    } catch (cause) {
      setGalleryError(cause instanceof Error ? cause.message : 'Image generation failed.')
    } finally {
      setGeneratingGallery(false)
    }
  }
  const addGeneratedImage = (image: MediaRecord) => {
    if (gallery.some(item => item.url === image.url)) return
    setGallery(current => [...current, { url: image.url, alt: image.altText || form.name, order: current.length }])
    setGalleryMessage('Image added to the draft gallery. Save changes to attach it to this product.')
  }
  const deleteProduct = async (product: ApiProduct) => {
    if (!window.confirm(`Supprimer définitivement « ${product.name} » ? Les commandes existantes seront conservées.`)) return
    setDeleting(product._id)
    setError('')
    try {
      await apiRequest<{ deleted: boolean }>(`/admin-preview/products/${product._id}`, { method: 'DELETE' })
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de supprimer le produit.')
    } finally {
      setDeleting('')
    }
  }
  const duplicateProduct = async (product: ApiProduct) => {
    setSaving(true)
    setError('')
    try {
      const suffix = Date.now().toString(36).toUpperCase()
      await apiRequest<ApiProduct>('/admin-preview/products', {
        method: 'POST',
        body: JSON.stringify({
          name: `Copy of ${product.name}`.slice(0, 160),
          category: product.category,
          price: product.price,
          shortDescription: product.shortDescription,
          description: product.description,
          status: 'draft',
          image: product.images[0]?.url ?? '',
          featured: false,
          variants: product.variants.map((variant, index) => ({
            sku: `${variant.sku}-COPY-${suffix}-${index + 1}`.slice(0, 80),
            color: variant.color,
            size: variant.size,
            price: variant.price,
            stock: 0,
            image: variant.image ?? '',
            active: variant.active,
          })),
        }),
      })
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de dupliquer le produit.')
    } finally {
      setSaving(false)
    }
  }
  const updateVariant = (index: number, field: keyof ProductVariantWriteInput, value: string | number | boolean) => {
    setForm(current => ({ ...current, variants: current.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, [field]: value } : variant) }))
  }
  const addVariant = () => {
    setForm(current => ({ ...current, variants: [...current.variants, { sku: `OFF-${Date.now().toString(36).toUpperCase()}-${current.variants.length + 1}`, color: 'Black', size: '', price: current.price, stock: 0, image: '', active: true }] }))
  }
  const removeVariant = (index: number) => {
    setForm(current => current.variants.length <= 1 ? current : { ...current, variants: current.variants.filter((_, variantIndex) => variantIndex !== index) })
  }
  return <div className="admin-content"><PageHeader eyebrow={`CATALOGUE / ${data.length} ITEMS`} title="Products" action={<button className="admin-button primary" onClick={openCreate}><Plus size={14} /> Add Product</button>} />{error && <div className="admin-alert" role="alert">{error}<button onClick={() => setReload(value => value + 1)}>Retry</button></div>}<div className="list-panel panel"><div className="list-toolbar"><label className="admin-search"><Search size={14} /><input placeholder="Search products..." value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Filter category" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(item => <option key={item._id}>{item.name}</option>)}</select><select aria-label="Filter status" value={status} onChange={event => setStatus(event.target.value)}><option>All status</option><option>Active</option><option>Draft</option><option>Archived</option></select><button className="toolbar-icon" aria-label="More filters"><SlidersHorizontal size={14} /></button></div><div className="table-scroll"><table className="products-table"><thead><tr><th>IMAGE</th><th>NAME</th><th>CATEGORY</th><th>PRICE</th><th>STATUS</th><th></th></tr></thead><tbody>{!loading && filtered.map(product => { const record = records.find(item => item._id === product.id); return <tr key={product.id}><td>{product.image && <img className="table-product-image" src={product.image} alt="" />}</td><td><b>{product.name}</b><small>{product.id.slice(-8).toUpperCase()}</small></td><td>{product.category}</td><td>{formatTnd(product.price)}</td><td><Status value={product.status} /></td><td><details className="product-action-menu"><summary className="row-menu" aria-label={`Actions for ${product.name}`}><MoreHorizontal size={17} /></summary><div role="menu"><button type="button" role="menuitem" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); openEdit(product.id) }}>Modifier</button><button type="button" role="menuitem" disabled={!record || deleting === product.id} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); if (record) void deleteProduct(record) }}>{deleting === product.id ? 'Suppression…' : 'Supprimer'}</button><button type="button" role="menuitem" disabled={!record || saving} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); if (record) void duplicateProduct(record) }}>Dupliquer</button></div></details></td></tr> })}</tbody></table>{loading && <div className="table-empty">Loading products…</div>}{!loading && !error && filtered.length === 0 && <div className="table-empty">No products match those filters.</div>}</div><div className="table-footer"><span>Showing <b>{filtered.length}</b> of <b>{data.length}</b> products</span><Pagination /></div></div>{modal && <div className="modal-backdrop" onClick={() => setModal(false)}><form className="admin-modal editor-modal" onSubmit={save} onClick={event => event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(false)}><X size={17} /></button><p className="admin-eyebrow">CATALOGUE</p><h2>{editing ? 'Edit product' : 'Add product'}</h2><label>Product name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required autoFocus maxLength={160} /></label><label>Category<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} required>{categories.filter(item => item.status === 'active').map(item => <option key={item._id} value={item.name}>{item.name}</option>)}</select></label><label>Price (TND)<input type="number" min="0" step="0.01" value={form.price} onChange={event => { const price = Number(event.target.value); setForm(current => ({ ...current, price, variants: current.variants.map(variant => ({ ...variant, price })) })) }} required /></label><p className="modal-note">Changing the product price also updates every variant price.</p><label>Short description<input value={form.shortDescription} onChange={event => setForm({ ...form, shortDescription: event.target.value })} maxLength={500} /></label><label>Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} maxLength={5000} rows={3} /></label><label>Image URL<input type="text" value={form.image} onChange={event => setForm({ ...form, image: event.target.value })} /></label>{editing && <section className="product-ai-gallery"><div className="product-ai-gallery-heading"><div><b>Product image gallery</b><small>The first image is the storefront cover.</small></div><label>Variants<select aria-label="Generated image count" value={galleryCount} onChange={event => setGalleryCount(Number(event.target.value))}><option value={1}>1 image</option><option value={2}>2 images</option><option value={3}>3 images</option><option value={4}>4 images</option></select></label></div><p className="admin-note">Generate new studio photos from up to four source photos. Generation may incur OpenAI API charges. Originals remain unchanged; add only the results you approve, then save the product.</p>{generationAvailable === false && <p className="admin-note">To enable generation, set OPENAI_API_KEY in the API environment and restart the API.</p>}<button className="admin-button" type="button" onClick={() => void generateGallery()} disabled={!generationAvailable || !editing.images?.length || generatingGallery}>{generatingGallery ? 'Generating product photos…' : 'Generate studio gallery'}</button><div className="product-ai-gallery-grid">{gallery.map((image, index) => <article key={`${image.url}-${index}`}><img src={mediaUrl(image.url)} alt={image.alt || form.name} /><small>{index === 0 ? 'Cover image' : `Gallery image ${index + 1}`}</small>{index > 0 && <button className="admin-button compact" type="button" onClick={() => setGallery(current => { const next = [...current]; const [cover] = next.splice(index, 1); if (cover) next.unshift(cover); return next })}>Make cover</button>}<button className="admin-button compact" type="button" onClick={() => setGallery(current => current.filter((_, imageIndex) => imageIndex !== index))}>Remove</button></article>)}</div>{generatedGallery.length > 0 && <><b className="product-ai-results-title">Generated previews</b><div className="product-ai-gallery-grid">{generatedGallery.map(image => { const added = gallery.some(item => item.url === image.url); return <article key={image._id}><img src={mediaUrl(image.url)} alt={image.altText} /><button className="admin-button compact" type="button" disabled={added || gallery.length >= 24} onClick={() => addGeneratedImage(image)}>{added ? 'Added to gallery' : 'Add to gallery'}</button></article> })}</div></>}{galleryMessage && <p className="admin-success" role="status">{galleryMessage}</p>}{galleryError && <p className="admin-alert" role="alert">{galleryError}</p>}</section>}<label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as ProductWriteInput['status'] })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label><label className="checkbox-label"><input type="checkbox" checked={form.featured} onChange={event => setForm({ ...form, featured: event.target.checked })} /> Featured product</label><fieldset className="product-variant-editor"><legend>Variants</legend>{form.variants.map((variant, index) => <div className="product-variant-row" key={`${variant.sku}-${index}`}><label>SKU<input value={variant.sku} onChange={event => updateVariant(index, 'sku', event.target.value)} required maxLength={80} /></label><label>Color<input value={variant.color} onChange={event => updateVariant(index, 'color', event.target.value)} required maxLength={60} /></label><label>Size<input value={variant.size} onChange={event => updateVariant(index, 'size', event.target.value)} required maxLength={30} /></label><label>Price (TND)<input type="number" min="0" step="0.01" value={variant.price} onChange={event => updateVariant(index, 'price', Number(event.target.value))} required /></label><label>Stock<input type="number" min="0" max="100000" step="1" value={variant.stock} onChange={event => updateVariant(index, 'stock', Number(event.target.value))} required /></label><label>Variant image<input type="url" value={variant.image} onChange={event => updateVariant(index, 'image', event.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={variant.active} onChange={event => updateVariant(index, 'active', event.target.checked)} /> Available</label><button type="button" className="admin-button collection-delete" onClick={() => removeVariant(index)} disabled={form.variants.length <= 1}>Remove</button></div>)}<button type="button" className="admin-button" onClick={addVariant}>Add variant</button></fieldset><p className="modal-note">{editing ? 'Changes are saved to the shared product catalogue.' : 'Configure size variants and stock before activating this product.'}</p><button className="admin-button primary" type="submit" disabled={saving || !form.category}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}</button></form></div>}</div>
}

function Pagination() { return <div className="admin-pagination"><button aria-label="Previous page" disabled><ChevronLeft size={14} /></button><button className="current">1</button><button>2</button><button>3</button><span>...</span><button>8</button><button aria-label="Next page"><ChevronRight size={14} /></button></div> }

function Orders() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All status')
  const [rows, setRows] = useState<ApiOrder[]>([])
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [selectedOrder, setSelectedOrder] = useState<ApiOrder | null>(null)
  const [shippingLabel, setShippingLabel] = useState<{ order: ApiOrder; sender: { name: string; phone: string; address: string }; qrToken: string } | null>(null)
  const [shippingLabelQr, setShippingLabelQr] = useState('')
  const [shippingLabelLoading, setShippingLabelLoading] = useState(false)
  const [shippingLabelError, setShippingLabelError] = useState('')
  const [shippingLabelAction, setShippingLabelAction] = useState<'print' | 'pdf' | null>(null)
  const [labelFormat, setLabelFormat] = useState<'portrait' | 'landscape'>('portrait')
  const [createModal, setCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [orderActionId, setOrderActionId] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => { let cancelled = false; setShippingLabelQr(''); if (!shippingLabel?.qrToken) return; const labelUrl = `${window.location.origin}/qr-orders/${shippingLabel.qrToken}`; void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(labelUrl, { errorCorrectionLevel: 'M', margin: 1, width: 256 })).then(dataUrl => { if (!cancelled) setShippingLabelQr(dataUrl) }).catch(() => { if (!cancelled) setShippingLabelError('Unable to generate the order QR code.') }); return () => { cancelled = true } }, [shippingLabel?.qrToken])
  const emptyForm = (): ManualOrderForm => ({
    name: '',
    email: '',
    shippingAddress: { line1: '', line2: '', city: 'Bab Bhar', postalCode: '', country: 'TN', governorate: 'Tunis', delegation: 'Bab Bhar' },
    items: [],
  })
  const [form, setForm] = useState<ManualOrderForm>(emptyForm)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiRequest<ApiOrder[]>('/admin-preview/orders'),
      apiRequest<ApiProduct[]>('/admin-preview/products'),
    ]).then(([orderData, productData]) => {
      if (!cancelled) { setRows(orderData); setProducts(productData); setError('') }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load orders.')
    })
    return () => { cancelled = true }
  }, [reload])
  const filtered = rows.filter(row => `${row.orderNumber} ${row.customerName}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All status' || row.fulfillmentStatus === filter))
  const availableVariants = products.flatMap(product => product.status === 'active'
    ? product.variants.filter(variant => variant.active && variant.stock > 0).map(variant => ({ product, variant }))
    : [])
  const openCreate = () => {
    const first = availableVariants[0]
    setForm({ ...emptyForm(), items: first ? [{ productId: first.product._id, sku: first.variant.sku, quantity: 1 }] : [] })
    setError('')
    setCreateModal(true)
  }
  const updateAddress = (field: keyof ApiShippingAddress, value: string) => {
    setForm(current => ({
      ...current,
      shippingAddress: {
        ...current.shippingAddress,
        [field]: value,
        ...(field === 'governorate' ? { delegation: '', city: '' } : {}),
        ...(field === 'delegation' ? { city: value } : {}),
      },
    }))
  }
  const updateOrderItem = (index: number, changes: Partial<ManualOrderItemInput>) => {
    setForm(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }))
  }
  const orderTotal = form.items.reduce((sum, item) => {
    const selected = availableVariants.find(entry => entry.product._id === item.productId && entry.variant.sku === item.sku)
    return sum + (selected?.variant.price ?? 0) * item.quantity
  }, 0)
  const createOrder = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload: ManualOrderRequest = {
      customer: { name: form.name, email: form.email },
      shippingAddress: form.shippingAddress,
      items: form.items,
    }
    try {
      const order = await apiRequest<ApiOrder>('/admin-preview/orders', { method: 'POST', body: JSON.stringify(payload) })
      setRows(current => [order, ...current])
      setCreateModal(false)
      setForm(emptyForm())
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the manual order.')
    } finally {
      setSaving(false)
    }
  }
  const openShippingLabel = async (order: ApiOrder) => {
    setShippingLabel(null); setShippingLabelError(''); setShippingLabelLoading(true); setLabelFormat('portrait')
    try { setShippingLabel(await apiRequest<{ order: ApiOrder; sender: { name: string; phone: string; address: string }; qrToken: string }>(`/admin-preview/orders/${order._id}/shipping-label`)) }
    catch (cause) { setShippingLabelError(cause instanceof Error ? cause.message : 'Unable to load the shipping label.') }
    finally { setShippingLabelLoading(false) }
  }
  const changeFulfillment = async (orderId: string, fulfillmentStatus: string) => {
    const current = rows.find(order => order._id === orderId)
    if (!current || !window.confirm(`Confirmer le passage de ${current.orderNumber} de « ${fulfillmentStatusLabels[current.fulfillmentStatus]} » à « ${fulfillmentStatusLabels[fulfillmentStatus]} » ?`)) { setReload(value => value + 1); return }
    try {
      const updated = await apiRequest<ApiOrder>(`/admin-preview/orders/${orderId}/fulfillment`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus }) })
      setRows(current => current.map(order => order._id === orderId ? updated : order))
      setSelectedOrder(current => current?._id === orderId ? updated : current)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update order fulfillment.')
    }
  }
  const confirmCodPayment = async (order: ApiOrder) => {
    if (!window.confirm(`Confirm that cash was collected for ${order.orderNumber}?`)) return
    setOrderActionId(order._id); setError(''); setNotice('')
    try {
      const updated = await apiRequest<ApiOrder>(`/admin-preview/orders/${order._id}/payment`, { method: 'PATCH' })
      setRows(current => current.map(item => item._id === order._id ? updated : item))
      setSelectedOrder(current => current?._id === order._id ? updated : current)
      setNotice(`Payment confirmed for ${order.orderNumber}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm cash-on-delivery payment.')
    } finally { setOrderActionId('') }
  }
  const deleteOrder = async (order: ApiOrder) => {
    if (!window.confirm(`Supprimer définitivement la commande ${order.orderNumber} ? Cette action ne peut pas être annulée.`)) return
    setOrderActionId(order._id); setError(''); setNotice('')
    try {
      await apiRequest(`/admin-preview/orders/${order._id}`, { method: 'DELETE' })
      setRows(current => current.filter(item => item._id !== order._id))
      setSelectedOrder(current => current?._id === order._id ? null : current)
      setNotice(`Commande ${order.orderNumber} supprimée.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete order.')
    } finally { setOrderActionId('') }
  }
  const relaunchOrder = async (order: ApiOrder) => {
    if (!window.confirm(`Relancer ${order.orderNumber} ? Les articles seront réservés de nouveau, si le stock est disponible, et la commande repassera en confirmation avec le paiement non payé.`)) return
    setOrderActionId(order._id); setError(''); setNotice('')
    try {
      const updated = await apiRequest<ApiOrder>(`/admin-preview/orders/${order._id}/relaunch`, { method: 'POST' })
      setRows(current => current.map(item => item._id === order._id ? updated : item))
      setSelectedOrder(current => current?._id === order._id ? updated : current)
      setNotice(`Commande ${order.orderNumber} relancée en confirmation.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to relaunch order.')
    } finally { setOrderActionId('') }
  }
  const exportOrders = () => {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const csv = [
      ['Order', 'Customer', 'Email', 'Total', 'Currency', 'Payment', 'Fulfillment', 'Placed at'].map(escape).join(','),
      ...filtered.map(order => [order.orderNumber, order.customerName, order.customerEmail.endsWith('@no-email.invalid') ? '' : order.customerEmail, order.total, 'TND', order.paymentStatus, order.fulfillmentStatus, order.placedAt].map(escape).join(',')),
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'off-orders.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  return <div className="admin-content">
    <PageHeader eyebrow="COMMERCE / ORDER MANAGEMENT" title="Orders" action={<><button className="admin-button primary" onClick={openCreate}><Plus size={14} /> Add order</button><button className="admin-button" onClick={exportOrders}><ArrowDown size={14} /> Export</button></>} />
    {error && <div className="admin-alert" role="alert">{error}</div>}{notice && <div className="admin-success" role="status">{notice}</div>}
    <div className="panel list-panel">
      <div className="list-toolbar">
        <label className="admin-search"><Search size={14} /><input placeholder="Search orders..." value={query} onChange={event => setQuery(event.target.value)} /></label>
        <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filter order status"><option value="All status">Tous les statuts</option>{['confirmation', 'processing', 'in_delivery', 'delivered', 'returned', 'cancelled', 'exchange'].map(value => <option key={value} value={value}>{fulfillmentStatusLabels[value]}</option>)}</select>
        <button className="admin-button filter-button" onClick={() => setFilter('All status')}><SlidersHorizontal size={13} /> Clear filter</button>
      </div>
      {shippingLabelLoading && <div className="modal-backdrop shipping-label-loading"><div className="admin-modal">Loading shipping label…</div></div>}
      {shippingLabelError && <div className="admin-alert" role="alert">{shippingLabelError}<button onClick={() => setShippingLabelError('')}>Close</button></div>}
      <OrderTable rows={filtered.map(toOrderRow)} records={filtered} onFulfillmentChange={changeFulfillment} onSelectOrder={setSelectedOrder} onPrintOrder={order => void openShippingLabel(order)} onDeleteOrder={order => void deleteOrder(order)} onRelaunchOrder={order => void relaunchOrder(order)} busyOrderId={orderActionId} />
      <div className="table-footer"><span>Showing <b>{filtered.length}</b> of <b>{rows.length}</b> orders</span><Pagination /></div>
    </div>
    {createModal && <div className="modal-backdrop" onClick={() => setCreateModal(false)}>
      <form className="admin-modal editor-modal manual-order-modal" onSubmit={createOrder} onClick={event => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={() => setCreateModal(false)}><X size={17} /></button>
        <p className="admin-eyebrow">ORDER MANAGEMENT</p><h2>New manual order</h2>
        <div className="manual-order-grid">
          <label>Customer name<input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={120} /></label>
          <label>Customer email (optional)<input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} maxLength={254} /></label>
          <label>Address<input value={form.shippingAddress.line1} onChange={event => updateAddress('line1', event.target.value)} required minLength={3} maxLength={160} /></label>
          <label>Address line 2<input value={form.shippingAddress.line2} onChange={event => updateAddress('line2', event.target.value)} maxLength={160} /></label>
          <TunisianAddressFields address={form.shippingAddress} onAddressChange={updateAddress} />
        </div>
        <fieldset className="manual-order-items"><legend>Products</legend>
          {form.items.map((item, index) => {
            const selected = availableVariants.find(entry => entry.product._id === item.productId && entry.variant.sku === item.sku)
            return <div className="manual-order-item" key={`${item.productId}-${item.sku}-${index}`}>
              <label>Product and variant<select value={selected ? `${selected.product._id}|${selected.variant.sku}` : ''} onChange={event => {
                const [productId, sku] = event.target.value.split('|')
                const variant = availableVariants.find(entry => entry.product._id === productId && entry.variant.sku === sku)?.variant
                updateOrderItem(index, { productId, sku, quantity: Math.min(item.quantity, variant?.stock ?? 1) })
              }} required><option value="" disabled>Select available item</option>{availableVariants.map(({ product, variant }) => <option key={`${product._id}-${variant.sku}`} value={`${product._id}|${variant.sku}`}>{product.name} — {variant.color} / {variant.size} · {formatTnd(variant.price)} · stock {variant.stock}</option>)}</select></label>
              <label>Qty<input type="number" min="1" max={selected?.variant.stock ?? 1} value={item.quantity} onChange={event => updateOrderItem(index, { quantity: Number(event.target.value) })} required /></label>
              <button type="button" className="admin-button collection-delete" aria-label="Remove order item" onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button>
            </div>
          })}
          {availableVariants.length === 0 && <p className="modal-note">No active variants have stock available.</p>}
          <button type="button" className="admin-button" disabled={!availableVariants.length} onClick={() => {
            const first = availableVariants[0]
            if (first) setForm(current => ({ ...current, items: [...current.items, { productId: first.product._id, sku: first.variant.sku, quantity: 1 }] }))
          }}><Plus size={13} /> Add item</button>
        </fieldset>
        <p className="manual-order-summary">Order total <strong>{formatTnd(orderTotal)}</strong></p>
        <p className="modal-note">A new order starts in confirmation with payment marked unpaid. Delivery does not confirm payment; record collected cash after delivery.</p>
        <button className="admin-button primary" type="submit" disabled={saving || !form.items.length || !form.shippingAddress.governorate || !form.shippingAddress.delegation || form.items.some(item => !availableVariants.some(entry => entry.product._id === item.productId && entry.variant.sku === item.sku && entry.variant.stock >= item.quantity))}>{saving ? 'Creating order…' : 'Create order'}</button>
      </form>
    </div>}
    {shippingLabel && <div className="modal-backdrop shipping-label-backdrop" onClick={() => setShippingLabel(null)}><section className="admin-modal shipping-label-dialog" role="dialog" aria-modal="true" aria-labelledby="shipping-label-title" onClick={event => event.stopPropagation()}><header className="shipping-label-dialog-header"><div><p className="admin-eyebrow">ORDER FULFILLMENT</p><h2 id="shipping-label-title">Shipping label</h2></div><button className="modal-close" aria-label="Close shipping label" onClick={() => setShippingLabel(null)}><X size={17} /></button></header><div className="shipping-label-workspace"><aside className="shipping-label-controls"><label>Label format<select value={labelFormat} onChange={event => setLabelFormat(event.target.value as 'portrait' | 'landscape')}><option value="portrait">Portrait · 100 × 150 mm</option><option value="landscape">Landscape · 150 × 100 mm</option></select></label><p>The label uses the saved recipient and sender details. Missing information stays blank.</p><div className="shipping-label-actions"><button type="button" className="admin-button primary" disabled={!shippingLabelQr} onClick={() => { setShippingLabelAction('print'); window.setTimeout(() => window.print(), 0) }}><Printer size={14} /> Print</button><button type="button" className="admin-button" disabled={!shippingLabelQr} onClick={() => { setShippingLabelAction('pdf'); window.setTimeout(() => window.print(), 0) }}><FileText size={14} /> Download PDF</button><button type="button" className="admin-button" onClick={() => setShippingLabel(null)}>Close</button></div><small>{shippingLabelAction === 'pdf' ? 'Choose “Save as PDF” in the print dialog and keep scale at 100%.' : 'For exact size, use actual size / 100% scale in print settings.'}</small></aside><div className="shipping-label-preview-wrap"><article className={`shipping-label-preview label-${labelFormat}`}><header><img className="shipping-label-logo" src="/off-logo.svg" alt="OFF" /><span>DELIVERY</span></header><section className="shipping-label-recipient"><small>SHIP TO</small>{(shippingLabel.order.shippingAddress?.fullName || shippingLabel.order.customerName) && <strong>{shippingLabel.order.shippingAddress?.fullName || shippingLabel.order.customerName}</strong>}{shippingLabel.order.shippingAddress?.phoneNumber && <span>{shippingLabel.order.shippingAddress.phoneNumber}</span>}{shippingLabel.order.shippingAddress?.line1 && <span>{shippingLabel.order.shippingAddress.line1}{shippingLabel.order.shippingAddress.line2 ? `, ${shippingLabel.order.shippingAddress.line2}` : ''}</span>}{(shippingLabel.order.shippingAddress?.delegation || shippingLabel.order.shippingAddress?.city || shippingLabel.order.shippingAddress?.governorate) && <span>{shippingLabel.order.shippingAddress?.delegation || shippingLabel.order.shippingAddress?.city || ''}{shippingLabel.order.shippingAddress?.governorate ? `, ${shippingLabel.order.shippingAddress.governorate}` : ''}</span>}{(shippingLabel.order.shippingAddress?.postalCode || shippingLabel.order.shippingAddress?.country) && <span>{shippingLabel.order.shippingAddress?.postalCode ?? ''}{shippingLabel.order.shippingAddress?.country ? ` ${shippingLabel.order.shippingAddress.country === 'TN' ? 'Tunisia' : shippingLabel.order.shippingAddress.country}` : ''}</span>}</section><section className="shipping-label-reference"><small>ORDER REFERENCE</small><strong>{shippingLabel.order.orderNumber}</strong></section><section className="shipping-label-qr"><img src={shippingLabelQr} alt={`Secure admin QR code for order ${shippingLabel.order.orderNumber}`} /><span>ADMIN ORDER SCAN</span></section><section className="shipping-label-sender"><small>FROM</small>{shippingLabel.sender.name && <strong>{shippingLabel.sender.name}</strong>}{shippingLabel.sender.phone && <span>{shippingLabel.sender.phone}</span>}{shippingLabel.sender.address && <span>{shippingLabel.sender.address}</span>}</section>{shippingLabel.order.paymentMethod === 'cash_on_delivery' && shippingLabel.order.paymentStatus !== 'paid' && <footer className="shipping-label-cod"><span>AMOUNT TO COLLECT · COD</span><strong>{formatTnd(shippingLabel.order.total)}</strong></footer>}</article></div></div></section></div>}
    {selectedOrder && <div className="modal-backdrop" onClick={() => setSelectedOrder(null)}>
      <section className="admin-modal order-details-modal" role="dialog" aria-modal="true" aria-labelledby="order-details-title" onClick={event => event.stopPropagation()}>
        <header className="order-details-header">
          <div><p className="admin-eyebrow">ORDER DETAILS{selectedOrder.source === 'manual' ? ' / MANUAL' : ''}</p><h2 id="order-details-title">#{selectedOrder.orderNumber}</h2></div>
          <button className="modal-close" aria-label="Close order details" onClick={() => setSelectedOrder(null)}><X size={18} /></button>
        </header>
        <section className="order-detail-customer"><span className="order-detail-icon"><UserRound size={17} /></span><div><b>{selectedOrder.customerName}</b><span>{selectedOrder.customerEmail && !selectedOrder.customerEmail.endsWith('@no-email.invalid') ? selectedOrder.customerEmail : 'Email not provided'}</span></div></section>
        <section className="order-detail-statuses"><div><span>PAYMENT</span><p><Status value={selectedOrder.paymentStatus} />{selectedOrder.paymentMethod === 'cash_on_delivery' && <small>Cash on delivery</small>}</p></div><div><span>FULFILLMENT</span><p><Status value={selectedOrder.fulfillmentStatus} /></p></div></section>
        {selectedOrder.paymentMethod === 'cash_on_delivery' && selectedOrder.fulfillmentStatus === 'delivered' && selectedOrder.paymentStatus === 'unpaid' && <section className="order-detail-section"><button className="admin-button primary" type="button" disabled={orderActionId === selectedOrder._id} onClick={() => void confirmCodPayment(selectedOrder)}>{orderActionId === selectedOrder._id ? 'Confirming…' : 'Confirm COD payment collected'}</button></section>}
        <section className="order-detail-section"><div className="order-detail-section-heading"><h3>Items</h3><span>{selectedOrder.items.reduce((sum, item) => sum + item.quantity, 0)} item{selectedOrder.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? '' : 's'}</span></div><div className="order-detail-items"><div className="order-detail-items-head"><span>IMAGE</span><span>PRODUCT</span><span>SKU</span><span>QTY</span><span>PRICE</span></div>{selectedOrder.items.map(item => <article className="order-detail-item" key={`${item.sku}-${item.size}`}><a className="order-detail-product-image" href={`${import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173'}${products.find(entry => entry._id === item.productId) ? `/product/${products.find(entry => entry._id === item.productId)?.slug}` : '/shop'}`} target="_blank" rel="noreferrer" aria-label={`Open ${item.name} in a new tab`}><img src={item.image || products.find(entry => entry._id === item.productId)?.images?.[0]?.url || ''} alt={item.name} /></a><div className="order-detail-product"><a className="order-detail-product-name" href={`${import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173'}${products.find(entry => entry._id === item.productId) ? `/product/${products.find(entry => entry._id === item.productId)?.slug}` : '/shop'}`} target="_blank" rel="noreferrer">{item.name}</a><span>{item.color} / {item.size}</span></div><span>{item.sku}</span><span>{item.quantity}</span><b>{formatTnd(item.unitPrice * item.quantity)}</b></article>)}</div></section>
        <section className="order-detail-section order-detail-note"><h3>Order note</h3>{selectedOrder.orderNote?.trim() ? <p>{selectedOrder.orderNote}</p> : <p className="order-detail-empty">No note was added to this order.</p>}</section>
        <section className="order-detail-section order-detail-shipping"><h3>Shipping address</h3>{selectedOrder.shippingAddress ? <address>{selectedOrder.shippingAddress.line1}{selectedOrder.shippingAddress.line2 && <>, {selectedOrder.shippingAddress.line2}</>}<br />{selectedOrder.shippingAddress.governorate ? <>{selectedOrder.shippingAddress.delegation}, {selectedOrder.shippingAddress.governorate}</> : selectedOrder.shippingAddress.city}<br />{selectedOrder.shippingAddress.postalCode && <>{selectedOrder.shippingAddress.postalCode}, </>}{selectedOrder.shippingAddress.country === 'TN' ? 'Tunisia' : selectedOrder.shippingAddress.country}{selectedOrder.shippingAddress.phoneNumber && <span>Phone: {selectedOrder.shippingAddress.phoneNumber}</span>}</address> : <p className="order-detail-empty">No shipping address provided.</p>}</section>
        <footer className="order-detail-total"><span>Order total</span><strong>{formatTnd(selectedOrder.total)}</strong></footer>
      </section>
    </div>}
  </div>
}

function Customers() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ApiCustomer[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    apiRequest<ApiCustomer[]>('/admin-preview/customers').then(data => {
      if (!cancelled) { setRows(data); setError('') }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load customers.')
    })
    return () => { cancelled = true }
  }, [])
  const filtered = rows.filter(row => `${row.name} ${row.email}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="admin-content"><PageHeader eyebrow="PEOPLE / CUSTOMER DIRECTORY" title="Customers" action={<button className="admin-button"><ArrowDown size={14} /> Export</button>} />{error && <div className="admin-alert" role="alert">{error}</div>}<div className="panel list-panel"><div className="list-toolbar"><label className="admin-search wide"><Search size={14} /><input placeholder="Search customers..." value={query} onChange={event => setQuery(event.target.value)} /></label><button className="admin-button filter-button"><SlidersHorizontal size={13} /> Filters</button></div><div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ORDERS</th><th>TOTAL SPENT</th><th></th></tr></thead><tbody>{filtered.map(row => <tr key={row.email}><td><b>{row.name}</b></td><td>{row.email.endsWith('@no-email.invalid') ? 'Not provided' : row.email}</td><td>{row.orderCount}</td><td>{formatTnd(row.totalSpent)}</td><td><button className="row-menu" aria-label={`Customer actions ${row.name}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="table-empty">No customers found.</div>}</div><div className="table-footer"><span>Showing <b>{filtered.length}</b> of <b>{rows.length}</b> customers</span><Pagination /></div></div></div>
}

function Categories() {
  const [items, setItems] = useState<CategoryItem[]>([])
  const [records, setRecords] = useState<ApiCategory[]>([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<ApiCategory | null>(null)
  const [form, setForm] = useState<CategoryWriteInput>({ name: '', description: '', image: '', displayOrder: 0, status: 'active' })
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiRequest<ApiCategory[]>('/admin-preview/categories').then((categories) => {
      if (cancelled) return
      setRecords(categories)
      setItems(categories.map((item) => ({ id: item._id, name: item.name, slug: item.slug, image: item.image ?? '', productCount: item.productCount ?? 0, status: item.status === 'active' ? 'Active' : 'Hidden' })))
      setError('')
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load categories.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])
  const filtered = items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', image: '', displayOrder: records.length, status: 'active' })
    setError('')
    setModal(true)
  }
  const openEdit = (id: string) => {
    const category = records.find(item => item._id === id)
    if (!category) return
    setEditing(category)
    setForm({ name: category.name, description: category.description, image: category.image, displayOrder: category.displayOrder, status: category.status })
    setError('')
    setModal(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiRequest<ApiCategory>(editing ? `/admin-preview/categories/${editing._id}` : '/admin-preview/categories', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form) })
      setModal(false)
      setEditing(null)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the category.')
    } finally {
      setSaving(false)
    }
  }
  return <div className="admin-content"><PageHeader eyebrow={`CATALOGUE / ${items.length} CATEGORIES`} title="Categories" action={<button className="admin-button primary" onClick={openCreate}><Plus size={14} /> Add Category</button>} />{error && <div className="admin-alert" role="alert">{error}<button onClick={() => setReload((value) => value + 1)}>Retry</button></div>}<div className="panel list-panel category-list"><div className="list-toolbar"><label className="admin-search wide"><Search size={14} /><input placeholder="Search categories..." value={query} onChange={event => setQuery(event.target.value)} /></label></div>{loading ? <div className="table-empty">Loading categories…</div> : <div className="category-rows">{filtered.map(item => <article className="category-row" key={item.id}>{item.image && <img src={item.image} alt="" />}<div><b>{item.name}</b><small>{item.productCount} products</small></div><Status value={item.status} /><button className="row-menu" aria-label={`Edit ${item.name} category`} onClick={() => openEdit(item.id)}><MoreHorizontal size={17} /></button></article>)}</div>}<div className="table-footer"><span><b>{filtered.length}</b> categories</span><Pagination /></div></div>{modal && <div className="modal-backdrop" onClick={() => setModal(false)}><form className="admin-modal editor-modal" onSubmit={save} onClick={event => event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(false)}><X size={17} /></button><p className="admin-eyebrow">CATALOGUE</p><h2>{editing ? 'Edit category' : 'Add category'}</h2><label>Category name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required autoFocus maxLength={80} /></label><label>Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} maxLength={1000} rows={3} /></label><label>Image URL<input type="text" value={form.image} onChange={event => setForm({ ...form, image: event.target.value })} /></label><label>Display order<input type="number" min="0" max="100000" value={form.displayOrder} onChange={event => setForm({ ...form, displayOrder: Number(event.target.value) })} /></label><label>Visibility<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as CategoryWriteInput['status'] })}><option value="active">Active</option><option value="hidden">Hidden</option></select></label><p className="modal-note">Hiding a category removes it from storefront browsing without deleting its products.</p><button type="submit" className="admin-button primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create category'}</button></form></div>}</div>
}

function Collections() {
  const [collections, setCollections] = useState<ApiCollection[]>([])
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [editing, setEditing] = useState<ApiCollection | null>(null)
  const [form, setForm] = useState<CollectionWriteInput>({ name: '', description: '', image: '', productIds: [], displayOrder: 0, status: 'active' })
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiRequest<ApiCollection[]>('/admin-preview/collections'),
      apiRequest<ApiProduct[]>('/admin-preview/products'),
    ]).then(([collectionItems, productItems]) => {
      if (cancelled) return
      setCollections(collectionItems)
      setProducts(productItems)
      setError('')
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load collections.')
    })
    return () => { cancelled = true }
  }, [reload])
  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', image: '', productIds: [], displayOrder: collections.length, status: 'active' })
    setError('')
    setModal(true)
  }
  const openEdit = (collection: ApiCollection) => {
    setEditing(collection)
    setForm({ name: collection.name, description: collection.description, image: collection.image, productIds: collection.productIds, displayOrder: collection.displayOrder, status: collection.status })
    setError('')
    setModal(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiRequest<ApiCollection>(editing ? `/admin-preview/collections/${editing._id}` : '/admin-preview/collections', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      })
      setModal(false)
      setEditing(null)
      setReload(value => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the collection.')
    } finally {
      setSaving(false)
    }
  }
  const toggleProduct = (productId: string) => {
    setForm(current => ({ ...current, productIds: current.productIds.includes(productId) ? current.productIds.filter(id => id !== productId) : [...current.productIds, productId] }))
  }
  const deleteCollection = async (collection: ApiCollection) => {
    if (!window.confirm(`Delete the “${collection.name}” collection? Its products will not be deleted.`)) return
    try {
      await apiRequest<{ deleted: boolean }>(`/admin-preview/collections/${collection._id}`, { method: 'DELETE' })
      setCollections(current => current.filter(item => item._id !== collection._id))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete the collection.')
    }
  }
  return <div className="admin-content"><PageHeader eyebrow={`MERCHANDISING / ${collections.length} COLLECTIONS`} title="Collections" action={<button className="admin-button primary" onClick={openCreate}><Plus size={14} /> Add collection</button>} />{error && <div className="admin-alert" role="alert">{error}</div>}<div className="panel list-panel category-list"><div className="category-rows">{collections.map(collection => <article className="category-row" key={collection._id}>{collection.image && <img src={collection.image} alt="" />}<div><b>{collection.name}</b><small>{collection.productCount ?? collection.productIds.length} products · /shop?collection={collection.slug}</small></div><Status value={collection.status} /><button className="row-menu" aria-label={`Edit ${collection.name}`} onClick={() => openEdit(collection)}><MoreHorizontal size={17} /></button><button className="admin-button collection-delete" onClick={() => deleteCollection(collection)}>Delete</button></article>)}{!collections.length && !error && <div className="table-empty">No collections yet. Create one to curate products on the storefront.</div>}</div></div>{modal && <div className="modal-backdrop" onClick={() => setModal(false)}><form className="admin-modal editor-modal" onSubmit={save} onClick={event => event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(false)}><X size={17} /></button><p className="admin-eyebrow">MERCHANDISING</p><h2>{editing ? 'Edit collection' : 'Add collection'}</h2><label>Name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required minLength={2} maxLength={100} autoFocus /></label><label>Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} maxLength={1000} rows={3} /></label><label>Image URL<input type="text" value={form.image} onChange={event => setForm({ ...form, image: event.target.value })} /></label><label>Display order<input type="number" min="0" max="100000" value={form.displayOrder} onChange={event => setForm({ ...form, displayOrder: Number(event.target.value) })} /></label><label>Visibility<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as CollectionWriteInput['status'] })}><option value="active">Active</option><option value="hidden">Hidden</option></select></label><fieldset className="collection-product-select"><legend>Products in this collection</legend>{products.map(product => <label key={product._id}><input type="checkbox" checked={form.productIds.includes(product._id)} onChange={() => toggleProduct(product._id)} />{product.name} <small>({product.status})</small></label>)}</fieldset><p className="modal-note">Only active collections and active products appear in the storefront.</p><button className="admin-button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create collection'}</button></form></div>}</div>
}

function Inventory() {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    apiRequest<InventoryProduct[]>('/admin-preview/inventory').then(data => {
      if (!cancelled) { setProducts(data); setError('') }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load inventory.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])
  const changeStock = (productId: string, sku: string, stock: number) => {
    setProducts(current => current.map(product => product._id !== productId ? product : {
      ...product,
      variants: product.variants.map(variant => variant.sku === sku ? { ...variant, stock } : variant),
    }))
    setSaved('')
  }
  const saveProduct = async (product: InventoryProduct) => {
    setSaving(product._id)
    setError('')
    setSaved('')
    try {
      await apiRequest(`/admin-preview/products/${product._id}/inventory`, {
        method: 'PATCH',
        body: JSON.stringify({ variants: product.variants.map(({ sku, stock }) => ({ sku, stock })) }),
      })
      setSaved(product._id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save inventory.')
    } finally {
      setSaving('')
    }
  }
  return <div className="admin-content"><PageHeader eyebrow="COMMERCE / STOCK CONTROL" title="Inventory" action={<button className="admin-button" onClick={() => setReload(value => value + 1)}>Refresh</button>} />{error && <div className="admin-alert" role="alert">{error}</div>}{saved && <div className="admin-success" role="status">Inventory saved.</div>}{loading ? <section className="panel table-empty">Loading inventory…</section> : products.map(product => <section className="panel inventory-panel" key={product._id}><div className="panel-heading"><div><h2>{product.name}</h2><p>{product.category} · {product.status}</p></div><button className="admin-button primary" disabled={saving === product._id} onClick={() => saveProduct(product)}>{saving === product._id ? 'Saving…' : 'Save stock'}</button></div><div className="inventory-variants">{product.variants.map(variant => <label key={variant.sku}><span>{variant.color} / {variant.size}<small>{variant.sku}</small></span><input aria-label={`Stock ${product.name} ${variant.color} ${variant.size}`} type="number" min="0" max="100000" step="1" value={variant.stock} onChange={event => changeStock(product._id, variant.sku, Math.max(0, Math.min(100000, Number(event.target.value) || 0)))} /><small>units</small></label>)}</div></section>)}</div>
}

function StoreManagement({ section }: { section: 'content' | 'settings' }) {
  const [data, setData] = useState<StoreSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let cancelled = false
    apiRequest<StoreSettings>(`/admin-preview/${section}`).then(result => {
      if (!cancelled) { setData(result); setError('') }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load store configuration.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [section])
  const update = (key: keyof StoreSettings, value: string | number | string[]) => {
    setData(current => current ? { ...current, [key]: value } : current)
    setSaved(false)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!data) return
    setSaving(true)
    setError('')
    setSaved(false)
    const body = section === 'content'
      ? { announcement: data.announcement, heroEyebrow: data.heroEyebrow, heroTitle: data.heroTitle, heroSubtitle: data.heroSubtitle, campaignEyebrow: data.campaignEyebrow, campaignTitle: data.campaignTitle }
      : { freeShippingThreshold: Number(data.freeShippingThreshold), supportEmail: data.supportEmail, advertisementMessages: (data.advertisementMessages ?? []).map(message => message.trim()).filter(Boolean), shippingSenderName: data.shippingSenderName ?? '', shippingSenderPhone: data.shippingSenderPhone ?? '', shippingSenderAddress: data.shippingSenderAddress ?? '' }
    try {
      const result = await apiRequest<StoreSettings>(`/admin-preview/${section}`, { method: 'PATCH', body: JSON.stringify(body) })
      setData(result)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save store configuration.')
    } finally {
      setSaving(false)
    }
  }
  const title = section === 'content' ? 'Storefront content' : 'Store settings'
  const advertisementMessages = data ? (data.advertisementMessages?.length ? data.advertisementMessages : [data.announcement]) : []
  if (loading) return <div className="admin-content"><PageHeader title={title} /><section className="panel table-empty">Loading configuration…</section></div>
  return <div className="admin-content"><PageHeader eyebrow="STORE MANAGEMENT" title={title} />{error && <div className="admin-alert" role="alert">{error}</div>}{saved && <div className="admin-success" role="status">Changes saved.</div>}{data && <form className="panel management-form" onSubmit={submit}>{section === 'content' ? <><h2>Homepage messaging</h2><label>Fallback announcement (used if the advertisement bar has no messages)<input value={data.announcement} onChange={event => update('announcement', event.target.value)} maxLength={160} required /></label><label>Hero eyebrow<input value={data.heroEyebrow} onChange={event => update('heroEyebrow', event.target.value)} maxLength={100} required /></label><label>Hero heading<input value={data.heroTitle} onChange={event => update('heroTitle', event.target.value)} maxLength={120} required /></label><label>Hero description<input value={data.heroSubtitle} onChange={event => update('heroSubtitle', event.target.value)} maxLength={240} required /></label><label>Campaign eyebrow<input value={data.campaignEyebrow} onChange={event => update('campaignEyebrow', event.target.value)} maxLength={100} required /></label><label>Campaign heading<input value={data.campaignTitle} onChange={event => update('campaignTitle', event.target.value)} maxLength={120} required /></label></> : <><h2>Store preferences</h2><label>Free-shipping threshold (TND)<input type="number" min="0" max="100000" step="1" value={data.freeShippingThreshold} onChange={event => update('freeShippingThreshold', Number(event.target.value))} required /></label><label>Customer support email<input type="email" value={data.supportEmail} onChange={event => update('supportEmail', event.target.value)} placeholder="support@example.com" /></label><h2>Advertisement bar</h2><p className="admin-note">Messages scroll continuously across the announcement bar, separated by a vertical line. Add up to 10 messages.</p>{advertisementMessages.map((message, index) => <div className="advertisement-message-row" key={index}><label>Message {index + 1}<input value={message} onChange={event => { const next = [...advertisementMessages]; next[index] = event.target.value; update('advertisementMessages', next) }} maxLength={160} /></label><button className="admin-button compact" type="button" disabled={advertisementMessages.length <= 1} onClick={() => update('advertisementMessages', advertisementMessages.filter((_, messageIndex) => messageIndex !== index))}>Remove</button></div>)}<button className="admin-button" type="button" disabled={advertisementMessages.length >= 10} onClick={() => update('advertisementMessages', [...advertisementMessages, ''])}>Add message</button><h2>Shipping label sender</h2><label>Sender name<input value={data.shippingSenderName ?? ''} onChange={event => update('shippingSenderName', event.target.value)} maxLength={120} /></label><label>Sender phone<input value={data.shippingSenderPhone ?? ''} onChange={event => update('shippingSenderPhone', event.target.value)} maxLength={32} /></label><label>Sender address<textarea value={data.shippingSenderAddress ?? ''} onChange={event => update('shippingSenderAddress', event.target.value)} maxLength={300} rows={3} /></label><p className="admin-note">Shipping is currently complimentary on all checkout orders; this threshold controls storefront messaging only.</p></>}<button className="admin-button primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></form>}</div>
}

type AnalyticsProductRow = {
  product: { id: string; name: string; slug: string; image: string } | null
  views?: number
  additions?: number
  purchases?: number
  revenue?: number
  visitors?: string[]
}
type AnalyticsOverviewData = {
  period: { days: number; from: string; to: string; month?: string }
  metrics: {
    visitors: number; sessions: number; pageViews: number; orders: number; revenue: number
    conversionRate: number | null; averageOrderValue: number | null; cartAdds: number
    checkoutStarts: number; checkoutAbandonedSessions: number; checkoutAbandonmentRate: number | null
    activeVisitors: number; returningVisitorRate: number | null
  }
  comparison: { visitors: number; sessions: number; pageViews: number; orders: number; revenue: number }
  daily: { date: string; visitors: number; sessions: number; pageViews: number; orders: number; revenue: number }[]
  topViewed: AnalyticsProductRow[]
  topWishlisted: AnalyticsProductRow[]
  topAddedToCart: AnalyticsProductRow[]
  topPurchased: AnalyticsProductRow[]
  topCollections: { _id: string; views: number; visitors: number; collection: { id: string; name: string; slug: string; image: string } | null }[]
  sources: { _id: string; sessions: number; visitors: number }[]
  pages: { _id: string; views: number; visitors: number; sessions: number }[]
  funnel: { stage: string; visitors: number }[]
  attribution: {
    firstTouch: { _id: string; orders: number; revenue: number }[]
    lastTouch: { _id: string; orders: number; revenue: number }[]
  }
  ctas: { _id: string; label?: string; location?: string; impressions: number; clicks: number; ctr: number | null }[]
  demand: {
    sizes: { _id: string; unitsSold: number }[]
    colors: { _id: string; unitsSold: number }[]
    sizeStock: { _id: string; unitsInStock: number }[]
    colorStock: { _id: string; unitsInStock: number }[]
  }
  advanced: {
    products: {
      productId: string
      product: { id: string; name: string; slug: string; image: string } | null
      views: number
      uniqueViewers: number
      wishlistAdditions: number
      cartAddEvents: number
      wishlistVisitors: number
      wishlistAfterViewVisitorCount: number
      cartVisitors: number
      purchaseVisitors: number
      unitsPurchased: number
      viewToWishlistRate: number | null
      wishlistToCartRate: number | null
      viewToCartRate: number | null
      viewToPurchaseRate: number | null
      averageHoursToPurchase: number | null
      availableStock: number | null
      unitsSold90Days: number
      opportunityScore: number | null
      opportunityConfidence: 'insufficient_data' | 'limited' | 'supported'
      highOpportunity: boolean
      highInterestLowConversion: boolean
      mostViewedWithoutPurchases: boolean
      previous: { views: number; viewToPurchaseRate: number | null }
    }[]
    highInterestLowConversion: AnalyticsOverviewData['advanced']['products']
    mostViewedWithoutPurchases: AnalyticsOverviewData['advanced']['products']
    highOpportunityProducts: AnalyticsOverviewData['advanced']['products']
    bestPerformingProducts: { productId: string; product: { id: string; name: string; slug: string; image: string } | null; unitsPurchased: number; revenue: number }[]
    inventory: {
      products: { productId: string; productName: string; availableStock: number; unitsSold90Days: number; unitsPerDay: number; recent30DayUnits: number; previous30DayUnits: number; trendPercent: number | null; monthlyUnits: { month: string; units: number }[]; monthsWithSales: number; forecastAvailable: boolean; estimatedDaysOfStock: number | null }[]
      variantAlerts: { productId: string; productName: string; size: string; color: string; unitsSold90Days: number; availableStock: number; estimatedDaysOfStock: number | null; forecastAvailable: boolean; severity: 'medium' | 'high' }[]
    }
    variants: { productId: string; productName: string; size: string; color: string; selectedVisitors: number; selections: number; purchaseVisitors: number; unitsPurchased: number; conversionRate: number | null; availableStock: number }[]
    variantSizes: { value: string; selectedVisitors: number; purchaseVisitors: number; unitsPurchased: number; availableStock: number; conversionRate: number | null }[]
    variantColors: { value: string; selectedVisitors: number; purchaseVisitors: number; unitsPurchased: number; availableStock: number; conversionRate: number | null }[]
    collectionPerformance: { collectionId: string; collection: { name: string; slug: string } | null; views: number; visitors: number; productClickVisitors: number; purchasingVisitors: number; revenue: number; conversionRate: number | null }[]
    checkout: {
      stages: { stage: string; visitors: number; conversionFromPrevious: number | null; dropOffFromPrevious: number | null }[]
      abandonedCheckouts: number
      abandonmentRate: number | null
      abandonedByStep: { step: string; count: number }[]
      mostCommonExitStep: { step: string; count: number } | null
      maturityMinutes: number
      paymentStepsAvailable: boolean
    }
    campaigns: {
      visitors: { source: string; medium: string; campaign: string; visitors: number; sessions: number }[]
      firstTouch: { source: string; medium: string; campaign: string; visitors: number; attributedPurchasers: number; orders: number; revenue: number; conversionRate: number | null }[]
      lastTouch: { source: string; medium: string; campaign: string; visitors: number; attributedPurchasers: number; orders: number; revenue: number; conversionRate: number | null }[]
      campaignCostDataAvailable: boolean
      roiAvailable: boolean
    }
    customers: {
      metrics: { firstTimeCustomers: number; returningCustomers: number; periodCustomers: number; repeatPurchaseRate: number | null; averagePurchaseFrequency: number | null; averageDaysBetweenPurchases: number | null; averageLifetimeValue: number | null }
      cohorts: { cohort: string; customers: number; months: { month: string; customers: number; retentionRate: number | null }[] }[]
    }
    insights: { title: string; description: string; metrics: Record<string, number | string | null>; comparisonPeriod: string; severity: 'low' | 'medium' | 'high'; recommendedAction: string }[]
  }
}
type AnalyticsSection = 'overview' | 'website' | 'ecommerce' | 'products' | 'wishlist' | 'collections' | 'marketing' | 'customers' | 'reports'

const analyticsSectionTitles: Record<AnalyticsSection, string> = {
  overview: 'Analytics & Intelligence',
  website: 'Website Performance',
  ecommerce: 'E-commerce Performance',
  products: 'Product Intelligence',
  wishlist: 'Wishlist Performance',
  collections: 'Collection Performance',
  marketing: 'Marketing Performance',
  customers: 'Customer Intelligence',
  reports: 'Reports & Insights',
}
const analyticsSections: { section: AnalyticsSection; label: string; path: string; Icon: LucideIcon }[] = [
  { section: 'overview', label: 'Overview', path: '/analytics/overview', Icon: BarChart3 },
  { section: 'website', label: 'Website', path: '/analytics/website', Icon: Eye },
  { section: 'ecommerce', label: 'E-commerce', path: '/analytics/ecommerce', Icon: ShoppingCart },
  { section: 'products', label: 'Products', path: '/analytics/products', Icon: Package },
  { section: 'wishlist', label: 'Wishlist', path: '/analytics/wishlist', Icon: Heart },
  { section: 'collections', label: 'Collections', path: '/analytics/collections', Icon: Layers3 },
  { section: 'marketing', label: 'Marketing', path: '/analytics/marketing', Icon: Megaphone },
  { section: 'customers', label: 'Customers', path: '/analytics/customers', Icon: UserRoundSearch },
  { section: 'reports', label: 'Reports', path: '/analytics/reports', Icon: FileDown },
]
const analyticsNumber = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
const analyticsMoney = (value: number) => formatTnd(value)
const analyticsPercent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`
const analyticsChange = (current: number, previous: number) => previous ? `${((current - previous) / previous * 100).toFixed(1)}% vs previous` : current ? 'New this period' : '0% vs previous'
const analyticsMetricChange = (key: string, data: AnalyticsOverviewData) => {
  const comparison: Record<string, [number, number]> = {
    visitors: [data.metrics.visitors, data.comparison.visitors],
    sessions: [data.metrics.sessions, data.comparison.sessions],
    pageViews: [data.metrics.pageViews, data.comparison.pageViews],
    orders: [data.metrics.orders, data.comparison.orders],
    revenue: [data.metrics.revenue, data.comparison.revenue],
  }
  const values = comparison[key]
  return values ? analyticsChange(values[0], values[1]) : ''
}

function AnalyticsDashboard({ section }: { section: AnalyticsSection }) {
  const [days, setDays] = useState(30)
  const [reportMonth, setReportMonth] = useState(() => {
    const date = new Date()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() - 1)
    return date.toISOString().slice(0, 7)
  })
  const [selectedFunnelStage, setSelectedFunnelStage] = useState('page_view')
  const [data, setData] = useState<AnalyticsOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [reload, setReload] = useState(0)
  const refreshRequested = useRef(false)
  useEffect(() => {
    let cancelled = false
    const load = () => {
      const periodQuery = section === 'reports' ? `month=${encodeURIComponent(reportMonth)}` : `days=${days}`
      const refreshQuery = refreshRequested.current ? '&refresh=1' : ''
      refreshRequested.current = false
      apiRequest<AnalyticsOverviewData>(`/analytics/admin/overview?${periodQuery}${refreshQuery}`).then(result => {
        if (!cancelled) { setData(result); setError(''); setLastUpdated(new Date()) }
      }).catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load analytics.')
      }).finally(() => { if (!cancelled) setLoading(false) })
    }
    setLoading(true)
    load()
    const timer = section === 'overview' ? window.setInterval(load, 60_000) : undefined
    return () => { cancelled = true; if (timer !== undefined) window.clearInterval(timer) }
  }, [days, reportMonth, reload, section])

  const exportCsv = () => {
    if (!data) return
    const csvCell = (value: string | number | boolean | null | undefined) => {
      const text = String(value ?? '')
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
      return `"${safe.replace(/"/g, '""')}"`
    }
    const sectionRows = (title: string, headers: (string | number)[], records: (string | number | boolean | null | undefined)[][]) => [
      [],
      [title],
      headers,
      ...records,
    ]
    const rows = [
      ['OFF STUDIO — MONTHLY BUSINESS REPORT'],
      ['Month', data.period.month ?? reportMonth],
      ['Compared with', data.period.month ? 'Previous month, matched elapsed days when month-to-date' : `Previous ${days}-day period`],
      ...sectionRows('Executive KPIs', ['Metric', 'Current', 'Previous period'], [
        ['Unique visitors', data.metrics.visitors, data.comparison.visitors],
        ['Sessions', data.metrics.sessions, data.comparison.sessions],
        ['Page views', data.metrics.pageViews, data.comparison.pageViews],
        ['Delivered orders', data.metrics.orders, data.comparison.orders],
        ['Realized revenue (TND)', data.metrics.revenue, data.comparison.revenue],
        ['Attributed conversion rate (%)', data.metrics.conversionRate, null],
        ['Average order value (TND)', data.metrics.averageOrderValue, null],
        ['Checkout abandonment rate (%)', data.metrics.checkoutAbandonmentRate, null],
        ['Mature abandoned checkout sessions', data.metrics.checkoutAbandonedSessions, null],
      ]),
      ...sectionRows('Traffic and revenue by day', ['Date', 'Visitors', 'Sessions', 'Page views', 'Orders', 'Revenue (TND)'], data.daily.map(point => [point.date, point.visitors, point.sessions, point.pageViews, point.orders, point.revenue])),
      ...sectionRows('Product performance and opportunity', ['Product', 'Views', 'Unique visitors', 'Wishlist additions', 'Wishlist visitors', 'Wishlist after view', 'Add-to-cart events', 'Cart visitors', 'View-to-purchase (%)', 'Confirmed units', '90-day units', 'Current stock', 'Opportunity score', 'Score confidence', 'High opportunity', 'High interest / low conversion'], data.advanced.products.map(row => [
        row.product?.name ?? 'Unavailable product', row.views, row.uniqueViewers, row.wishlistAdditions, row.wishlistVisitors, row.wishlistAfterViewVisitorCount, row.cartAddEvents, row.cartVisitors,
        row.viewToPurchaseRate, row.unitsPurchased, row.unitsSold90Days, row.availableStock, row.opportunityScore, row.opportunityConfidence, row.highOpportunity, row.highInterestLowConversion,
      ])),
      ...sectionRows('Best performing products', ['Product', 'Confirmed units', 'Item revenue (TND)'], data.advanced.bestPerformingProducts.map(row => [row.product?.name ?? 'Unavailable product', row.unitsPurchased, row.revenue])),
      ...sectionRows('Traffic sources', ['Source', 'Visitors', 'Sessions'], data.sources.map(row => [row._id, row.visitors, row.sessions])),
      ...sectionRows('Collection performance', ['Collection', 'Views', 'Product click visitors', 'Purchasing visitors', 'Conversion (%)', 'Attributed item revenue (TND)'], data.advanced.collectionPerformance.map(row => [
        row.collection?.name ?? 'Unavailable collection', row.views, row.productClickVisitors, row.purchasingVisitors, row.conversionRate, row.revenue,
      ])),
      ...sectionRows('First-touch campaign performance', ['Source', 'Medium', 'Campaign', 'Campaign visitors', 'Attributed purchasers', 'Orders', 'Revenue (TND)', 'Conversion (%)'], data.advanced.campaigns.firstTouch.map(row => [row.source, row.medium, row.campaign, row.visitors, row.attributedPurchasers, row.orders, row.revenue, row.conversionRate])),
      ...sectionRows('Last-touch campaign performance', ['Source', 'Medium', 'Campaign', 'Campaign visitors', 'Attributed purchasers', 'Orders', 'Revenue (TND)', 'Conversion (%)'], data.advanced.campaigns.lastTouch.map(row => [row.source, row.medium, row.campaign, row.visitors, row.attributedPurchasers, row.orders, row.revenue, row.conversionRate])),
      ...sectionRows('CTA performance', ['CTA', 'Page', 'Impression events', 'Click events', 'Visitor click-through rate (%)'], data.ctas.map(row => [row.label ?? row._id, row.location, row.impressions, row.clicks, row.ctr])),
      ...sectionRows('Customer retention', ['Metric', 'Value'], [
        ['First-time customers', data.advanced.customers.metrics.firstTimeCustomers],
        ['Returning customers', data.advanced.customers.metrics.returningCustomers],
        ['Repeat purchase rate (%)', data.advanced.customers.metrics.repeatPurchaseRate],
        ['Average purchase frequency', data.advanced.customers.metrics.averagePurchaseFrequency],
        ['Average days between purchases', data.advanced.customers.metrics.averageDaysBetweenPurchases],
        ['Average lifetime value (TND)', data.advanced.customers.metrics.averageLifetimeValue],
      ]),
      ...sectionRows('Checkout funnel', ['Step', 'Sessions', 'Conversion from previous (%)', 'Drop-off from previous (%)'], data.advanced.checkout.stages.map(row => [row.stage, row.visitors, row.conversionFromPrevious, row.dropOffFromPrevious])),
      ...sectionRows('Customer cohorts', ['Cohort month', 'New customers', 'Retention by month'], data.advanced.customers.cohorts.flatMap(cohort => cohort.months.map(month => [cohort.cohort, cohort.customers, `${month.month}: ${month.retentionRate ?? ''}%`]))),
      ...sectionRows('Inventory and historical demand', ['Product', 'Stock', 'Units sold (90 days)', 'Recent 30-day units', 'Previous 30-day units', 'Demand change (%)', 'Monthly units by calendar month', 'Months with sales', 'Forecast days of stock'], data.advanced.inventory.products.map(row => [
        row.productName, row.availableStock, row.unitsSold90Days, row.recent30DayUnits, row.previous30DayUnits, row.trendPercent, JSON.stringify(row.monthlyUnits), row.monthsWithSales, row.estimatedDaysOfStock,
      ])),
      ...sectionRows('High-demand, low-stock variants', ['Product', 'Color', 'Size', 'Units sold (90 days)', 'Available stock', 'Forecast days of stock', 'Severity'], data.advanced.inventory.variantAlerts.map(row => [
        row.productName, row.color, row.size, row.unitsSold90Days, row.availableStock, row.estimatedDaysOfStock, row.severity,
      ])),
      ...sectionRows('Business opportunities', ['Title', 'Description', 'Severity', 'Comparison period', 'Recommended action', 'Supporting metrics'], data.advanced.insights.map(row => [
        row.title, row.description, row.severity, row.comparisonPeriod, row.recommendedAction, JSON.stringify(row.metrics),
      ])),
    ]
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `off-business-report-${data.period.month ?? `${days}-days`}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }

  const maxVisitors = Math.max(1, ...(data?.daily.map(point => point.visitors) ?? [0]))
  const maxRevenue = Math.max(1, ...(data?.daily.map(point => point.revenue) ?? [0]))
  const visitorPoints = (data?.daily ?? []).map((point, index, list) => {
    const x = list.length < 2 ? 200 : index * 400 / (list.length - 1)
    return `${x},${84 - point.visitors / maxVisitors * 70}`
  }).join(' ')
  const revenuePoints = (data?.daily ?? []).map((point, index, list) => {
    const x = list.length < 2 ? 200 : index * 400 / (list.length - 1)
    return `${x},${84 - point.revenue / maxRevenue * 70}`
  }).join(' ')
  const metricCards = data ? [
    ['Unique Visitors', analyticsNumber(data.metrics.visitors), 'consented visitors in selected period', 'visitors'],
    ['Sessions', analyticsNumber(data.metrics.sessions), 'consented sessions in selected period', 'sessions'],
    ['Page Views', analyticsNumber(data.metrics.pageViews), 'consented analytics only', 'pageViews'],
    ['Delivered Orders', analyticsNumber(data.metrics.orders), 'COD orders delivered and paid', 'orders'],
    ['Realized Revenue', analyticsMoney(data.metrics.revenue), 'COD orders delivered and paid', 'revenue'],
    ['Conversion Rate', analyticsPercent(data.metrics.conversionRate), 'attributed to consented sessions', 'conversion'],
    ['Average Order Value', data.metrics.averageOrderValue === null ? '—' : analyticsMoney(data.metrics.averageOrderValue), 'delivered orders', 'aov'],
    ['Returning Visitors', analyticsPercent(data.metrics.returningVisitorRate), '2+ sessions in period', 'returning'],
    ['Active Visitors', analyticsNumber(data.metrics.activeVisitors), 'active in last 5 minutes', 'active'],
  ] as const : []
  const topProductLists = [
    { title: 'Most Viewed', rows: data?.topViewed ?? [], count: (row: AnalyticsProductRow) => row.views ?? 0 },
    { title: 'Most Wishlisted', rows: data?.topWishlisted ?? [], count: (row: AnalyticsProductRow) => row.additions ?? 0 },
    { title: 'Most Added to Cart', rows: data?.topAddedToCart ?? [], count: (row: AnalyticsProductRow) => row.additions ?? 0 },
    { title: 'Most Purchased', rows: data?.topPurchased ?? [], count: (row: AnalyticsProductRow) => row.purchases ?? 0 },
  ]
  const sourceMax = Math.max(1, ...(data?.sources.map(source => source.sessions) ?? [0]))
  const insights = data?.advanced.insights ?? []
  const sectionDescriptions: Record<AnalyticsSection, string> = {
    overview: 'A privacy-conscious view of consented traffic, confirmed sales, and emerging business signals.',
    website: 'Understand consented visitor activity, traffic sources, and the pages attracting attention.',
    ecommerce: 'Follow the customer journey from cart activity through checkout and confirmed orders.',
    products: 'Explore product interest, variant demand, conversion, and confirmed sales performance.',
    wishlist: 'Review consented wishlist activity and the products customers choose to save.',
    collections: 'Compare collection engagement and consent-attributed purchases for the selected period.',
    marketing: 'Understand campaign visits and attribution; revenue is limited to paid and delivered orders.',
    customers: 'Review aggregate verified-customer cohorts and lifetime purchase behavior.',
    reports: 'Explore a calendar-month business report and export the available verified metrics.',
  }
  const lastUpdatedLabel = lastUpdated
    ? `Updated ${new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(lastUpdated)}`
    : 'Waiting for first report'

  const SectionIcon = analyticsSections.find(item => item.section === section)?.Icon ?? BarChart3
  return <div className="admin-content analytics-content">
    <header className="analytics-heading">
      <div className="analytics-heading-copy">
        <span className="analytics-heading-icon"><SectionIcon size={21} strokeWidth={1.7} /></span>
        <div><p className="admin-eyebrow">ANALYTICS & INTELLIGENCE</p><h1>{analyticsSectionTitles[section]}</h1><p className="analytics-intro">{sectionDescriptions[section]}</p></div>
      </div>
      <div className="analytics-toolbar">{section === 'reports' ? <label className="analytics-range">Report month<input type="month" value={reportMonth} max={new Date().toISOString().slice(0, 7)} onChange={event => { if (event.target.value) setReportMonth(event.target.value) }} /></label> : <label className="analytics-range">Period<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>}<span className="analytics-updated" aria-live="polite">{lastUpdatedLabel}</span><button className="admin-button" type="button" disabled={loading} onClick={() => { refreshRequested.current = true; setReload(value => value + 1) }}>Refresh</button>{section === 'reports' && <button className="admin-button primary" type="button" disabled={!data || loading} onClick={exportCsv}>Export CSV</button>}</div>
    </header>
    <nav className="analytics-subnav" aria-label="Analytics reports">{analyticsSections.map(({ section: itemSection, label, path, Icon }) => <NavLink key={itemSection} to={path} end className={({ isActive }) => isActive ? 'active' : ''}><Icon size={15} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {error && data && <div className="analytics-refresh-status" role="status">Showing the last successful report while the selected period could not be loaded.</div>}
    {loading && data && <div className="analytics-refresh-status" role="status">Updating this report…</div>}
    {loading && !data ? <section className="analytics-loading-state" role="status" aria-label="Loading analytics"><span className="analytics-loading-label">Loading analytics…</span><div className="analytics-loading-kpis" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div><div className="analytics-loading-chart" aria-hidden="true"><i /><i /><i /></div></section> : !data ? <section className="panel analytics-error-state" role="alert"><p>{error || 'No analytics report is available.'}</p><button className="admin-button" type="button" onClick={() => setReload(value => value + 1)}>Retry</button></section> : <>
      {section === 'overview' && <>
        <div className="analytics-live"><span className="analytics-live-dot" /> LIVE SNAPSHOT <b>{analyticsNumber(data.metrics.activeVisitors)}</b> active visitors · refreshed every minute</div>
        <div className="metric-grid analytics-metrics">{metricCards.map(([label, value, note, key]) => <article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong><small className="analytics-delta">{analyticsMetricChange(key, data)}</small><span>{note}</span></article>)}</div>
        <section className="panel analytics-chart-panel"><div className="panel-heading"><div><p className="analytics-section-kicker">PERFORMANCE</p><h2>Visitors & Revenue</h2><p>Daily consented traffic and realized cash-on-delivery sales</p></div><div className="analytics-legend"><span><i className="analytics-dot visitors" />Visitors</span><span><i className="analytics-dot revenue" />Revenue · paid & delivered</span></div></div>{data.daily.some(point => point.visitors || point.revenue) ? <div className="analytics-chart"><div className="analytics-chart-grid"><i /><i /><i /><i /></div><svg viewBox="0 0 400 90" preserveAspectRatio="none" role="img" aria-label="Daily visitors and revenue trend, each series indexed to its own peak"><polyline points={visitorPoints} fill="none" stroke="var(--analytics-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />{data.daily.map((point, index) => <circle key={`visitor-${point.date}`} cx={data.daily.length < 2 ? 200 : index * 400 / (data.daily.length - 1)} cy={84 - point.visitors / maxVisitors * 70} r="2.5" fill="var(--analytics-ink)" tabIndex={0} aria-label={`${point.date}: ${point.visitors} visitors`}><title>{point.date}: {point.visitors} visitors</title></circle>)}<polyline points={revenuePoints} fill="none" stroke="var(--analytics-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />{data.daily.map((point, index) => <circle key={`revenue-${point.date}`} cx={data.daily.length < 2 ? 200 : index * 400 / (data.daily.length - 1)} cy={84 - point.revenue / maxRevenue * 70} r="2.5" fill="var(--analytics-accent)" tabIndex={0} aria-label={`${point.date}: ${analyticsMoney(point.revenue)} revenue`}><title>{point.date}: {analyticsMoney(point.revenue)} revenue</title></circle>)}</svg><div className="analytics-chart-labels"><span>{data.daily[0]?.date ?? ''}</span><span>{data.daily[Math.floor(data.daily.length / 2)]?.date ?? ''}</span><span>{data.daily[data.daily.length - 1]?.date ?? ''}</span></div></div> : <div className="analytics-empty">No consented traffic or delivered sales in this period yet.</div>}</section>
        <div className="analytics-two-column"><AnalyticsFunnel title="Conversion Funnel" description="Tracked visitors through delivered cash-on-delivery orders" stages={data.funnel} selectedStage={selectedFunnelStage} onSelect={setSelectedFunnelStage} /><AnalyticsInsightPanel insights={insights} /></div>
        <div className="analytics-three-column">{topProductLists.slice(0, 3).map(list => <AnalyticsProductPanel key={list.title} title={list.title} rows={list.rows} count={list.count} />)}</div>
        <div className="analytics-two-column"><AnalyticsProductPanel title="Most Purchased" rows={data.topPurchased} count={row => row.purchases ?? 0} /><AnalyticsCollectionPanel rows={data.topCollections} /></div>
        <section className="panel analytics-panel"><div className="panel-heading"><div><h2>Traffic Sources</h2><p>Attributed from consented session entry data</p></div><Link to="/analytics/marketing" className="view-all">Marketing details <ArrowUp size={12} /></Link></div><AnalyticsSourceRows sources={data.sources} max={sourceMax} /></section>
      </>}
      {section === 'website' && <>
        <div className="metric-grid analytics-metrics">
          {metricCards.filter(([, , , key]) => ['visitors', 'sessions', 'pageViews'].includes(key)).map(([label, value, note, key]) => <article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong><small className="analytics-delta">{analyticsMetricChange(key, data)}</small><span>{note}</span></article>)}
          <article className="metric-card"><p>Returning Visitors</p><strong>{analyticsPercent(data.metrics.returningVisitorRate)}</strong><span>Visitors with 2+ sessions in period</span></article>
          <article className="metric-card"><p>Active Visitors</p><strong>{analyticsNumber(data.metrics.activeVisitors)}</strong><span>Currently active in the last five minutes</span></article>
        </div>
        <div className="analytics-two-column">
          <section className="panel analytics-panel"><div className="panel-heading"><div><p className="analytics-section-kicker">DISCOVERY</p><h2>Top Pages</h2><p>Page views and unique visitors</p></div></div>{data.pages.length ? <div className="table-scroll"><table><thead><tr><th>PAGE</th><th>VIEWS</th><th>VISITORS</th><th>SESSIONS</th></tr></thead><tbody>{data.pages.map(row => <tr key={row._id}><td><code>{row._id}</code></td><td>{analyticsNumber(row.views)}</td><td>{analyticsNumber(row.visitors)}</td><td>{analyticsNumber(row.sessions)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty">No page-view records for this period.</div>}</section>
          <section className="panel analytics-panel"><div className="panel-heading"><div><p className="analytics-section-kicker">ACQUISITION</p><h2>Traffic Sources</h2><p>Consented session entry data</p></div></div><AnalyticsSourceRows sources={data.sources} max={sourceMax} /></section>
        </div>
        <section className="panel analytics-panel"><div className="panel-heading"><div><h2>Daily Visitor Activity</h2><p>Visitors, sessions and page views · UTC calendar dates</p></div></div><AnalyticsDailyTable rows={data.daily} /></section>
      </>}
      {section === 'ecommerce' && <>
        <div className="metric-grid analytics-metrics">
          {metricCards.filter(([, , , key]) => ['orders', 'revenue', 'conversion', 'aov'].includes(key)).map(([label, value, note, key]) => <article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong><small className="analytics-delta">{analyticsMetricChange(key, data)}</small><span>{note}</span></article>)}
          <article className="metric-card"><p>Checkout Abandonment</p><strong>{analyticsPercent(data.advanced.checkout.abandonmentRate)}</strong><span>{analyticsNumber(data.advanced.checkout.abandonedCheckouts)} mature consented sessions without order confirmation</span></article>
        </div>
        <div className="analytics-two-column analytics-commerce-panels">
          <AnalyticsCheckoutPanel report={data.advanced.checkout} />
          <section className="panel analytics-panel"><div className="panel-heading"><div><p className="analytics-section-kicker">ORDER PERFORMANCE</p><h2>Sales by Day</h2><p>Revenue includes paid and delivered orders only</p></div></div><AnalyticsDailyTable rows={data.daily} /></section>
        </div>
        <section className="panel analytics-panel"><div className="panel-heading"><div><p className="analytics-section-kicker">PRODUCT MIX</p><h2>Best Selling Products</h2><p>Confirmed paid-and-delivered order lines</p></div></div><AnalyticsProductPanel title="Most Purchased" rows={data.topPurchased} count={row => row.purchases ?? 0} /></section>
      </>}
      {section === 'products' && <>
        <div className="analytics-three-column">
          {topProductLists.filter(list => list.title !== 'Most Wishlisted').map(list => <AnalyticsProductPanel key={list.title} title={list.title} rows={list.rows} count={list.count} />)}
        </div>
        <AnalyticsProductIntelligence report={data.advanced} />
        <div className="analytics-two-column"><AnalyticsVariantTable title="Size Performance" rows={data.advanced.variantSizes} /><AnalyticsVariantTable title="Color Performance" rows={data.advanced.variantColors} /></div>
        <AnalyticsVariantDetail rows={data.advanced.variants} />
        <div className="analytics-two-column"><AnalyticsDemandPanel title="Size Demand vs Stock" demand={data.demand.sizes} stock={data.demand.sizeStock} /><AnalyticsDemandPanel title="Color Demand vs Stock" demand={data.demand.colors} stock={data.demand.colorStock} /></div>
      </>}
      {section === 'wishlist' && <>
        <div className="analytics-three-column"><AnalyticsProductPanel title="Most Wishlisted" rows={data.topWishlisted} count={row => row.additions ?? 0} /><AnalyticsProductPanel title="Most Viewed" rows={data.topViewed} count={row => row.views ?? 0} /><AnalyticsProductPanel title="Most Added to Cart" rows={data.topAddedToCart} count={row => row.additions ?? 0} /></div>
        <section className="panel analytics-panel"><div className="panel-heading"><div><p className="analytics-section-kicker">PRODUCT INTEREST</p><h2>Wishlist & Product Journey</h2><p>Consented events and visitor-level conversion rates supplied by Analytics reports</p></div></div>{data.advanced.products.some(row => row.wishlistAdditions > 0) ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>WISHLIST ADDS</th><th>UNIQUE SAVERS</th><th>WISHLIST → CART</th><th>VIEW → PURCHASE</th></tr></thead><tbody>{data.advanced.products.filter(row => row.wishlistAdditions > 0).map(row => <tr key={row.productId}><td>{row.product?.name ?? 'Unavailable product'}</td><td>{analyticsNumber(row.wishlistAdditions)}</td><td>{analyticsNumber(row.wishlistVisitors)}</td><td>{analyticsPercent(row.wishlistToCartRate)}</td><td>{analyticsPercent(row.viewToPurchaseRate)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty">No wishlist activity is recorded for this period. Necessary storefront functionality remains available.</div>}<p className="analytics-data-note">The current Analytics API does not expose a wishlist-to-order conversion metric; none is inferred here.</p></section>
      </>}
      {section === 'collections' && <>
        <AnalyticsCollectionPerformance rows={data.advanced.collectionPerformance} />
        <div className="analytics-two-column"><AnalyticsCollectionPanel rows={data.topCollections} /><section className="panel analytics-panel"><div className="panel-heading"><div><p className="analytics-section-kicker">ATTRIBUTED REVENUE</p><h2>Collection Outcomes</h2><p>Revenue follows existing paid-and-delivered order rules</p></div></div>{data.advanced.collectionPerformance.length ? <div className="analytics-ranking-list">{data.advanced.collectionPerformance.slice(0, 8).map((row, index) => <article className="analytics-ranking-row" key={row.collectionId}><span className="analytics-ranking-index">{String(index + 1).padStart(2, '0')}</span><div><b>{row.collection?.name ?? 'Unavailable collection'}</b><small>{analyticsNumber(row.visitors)} visitors · {analyticsNumber(row.views)} views</small></div><strong>{analyticsMoney(row.revenue)}</strong></article>)}</div> : <div className="analytics-empty">Collection outcomes will appear when consented engagement and qualifying orders are recorded.</div>}</section></div>
      </>}
      {section === 'marketing' && <><section className="panel analytics-panel"><div className="panel-heading"><div><h2>Traffic Sources</h2><p>Session sources; campaign labels are recorded only with analytics consent</p></div></div><AnalyticsSourceRows sources={data.sources} max={sourceMax} /></section><div className="analytics-two-column"><AnalyticsAttributionPanel title="First-touch Sales Attribution" rows={data.attribution.firstTouch} /><AnalyticsAttributionPanel title="Last-touch Sales Attribution" rows={data.attribution.lastTouch} /></div><AnalyticsCampaignPanel report={data.advanced.campaigns} /><section className="panel analytics-panel"><div className="panel-heading"><div><h2>CTA Performance</h2><p>Impressions counted at 50% visibility; CTR is unique clicked visitors among visitors with a measured impression.</p></div></div>{data.ctas.length ? <div className="table-scroll"><table><thead><tr><th>CTA</th><th>PAGE</th><th>IMPRESSIONS</th><th>CLICKS</th><th>CTR (VISITORS)</th></tr></thead><tbody>{data.ctas.map(cta => <tr key={cta._id}><td>{cta.label || cta._id}</td><td><code>{cta.location || '—'}</code></td><td>{analyticsNumber(cta.impressions)}</td><td>{analyticsNumber(cta.clicks)}</td><td>{analyticsPercent(cta.ctr)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty">No CTA impression or click events have been recorded yet.</div>}</section></>}
      {section === 'customers' && <><div className="metric-grid analytics-metrics"><article className="metric-card"><p>First-time / Returning</p><strong>{analyticsNumber(data.advanced.customers.metrics.firstTimeCustomers)} / {analyticsNumber(data.advanced.customers.metrics.returningCustomers)}</strong><span>verified customer accounts with a confirmed order in period</span></article><article className="metric-card"><p>Repeat Purchase Rate</p><strong>{analyticsPercent(data.advanced.customers.metrics.repeatPurchaseRate)}</strong><span>lifetime paid-and-delivered account customers with 2+ orders</span></article><article className="metric-card"><p>Customer Lifetime Value</p><strong>{data.advanced.customers.metrics.averageLifetimeValue === null ? '—' : analyticsMoney(data.advanced.customers.metrics.averageLifetimeValue)}</strong><span>mean lifetime confirmed revenue per verified account</span></article></div><AnalyticsCustomerCohorts cohorts={data.advanced.customers.cohorts} metrics={data.advanced.customers.metrics} /></>}
      {section === 'reports' && <><div className="metric-grid analytics-metrics">{metricCards.slice(0, 6).map(([label, value, note, key]) => <article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong><small className="analytics-delta">{analyticsMetricChange(key, data)}</small><span>{note}</span></article>)}</div><section className="panel analytics-panel"><div className="panel-heading"><div><h2>Monthly Business Report</h2><p>Calendar-month performance compared with the previous month; export includes traffic sources, product, collection, campaign and CTA performance, retention, funnel, inventory, and insights.</p></div></div><AnalyticsDailyTable rows={data.daily} /></section><AnalyticsInsightPanel insights={insights} /></>}
    </>}
  </div>
}

function AnalyticsProductPanel({ title, rows, count }: { title: string; rows: AnalyticsProductRow[]; count: (row: AnalyticsProductRow) => number }) {
  const emptyMessage = title === 'Most Viewed'
    ? 'No product views recorded for this period.'
    : title === 'Most Wishlisted'
      ? 'No wishlist activity recorded for this period.'
      : title === 'Most Added to Cart'
        ? 'No cart additions recorded for this period.'
        : 'No confirmed purchases recorded for this period.'
  return <section className="panel analytics-product-panel"><div className="panel-heading"><div><h2>{title}</h2></div></div>{rows.length ? rows.map(row => <div className="analytics-product-row" key={row.product?.id ?? title}><span>{row.product?.image ? <img src={row.product.image} alt="" /> : <i />}</span><div><b>{row.product ? <Link className="analytics-product-link" to={`/products?q=${encodeURIComponent(row.product.name)}`}>{row.product.name}</Link> : 'Unavailable product'}</b><small>{row.product?.slug ?? ''}</small></div><strong>{analyticsNumber(count(row))}</strong></div>) : <div className="analytics-empty compact">{emptyMessage}</div>}</section>
}

function AnalyticsCollectionPanel({ rows }: { rows: AnalyticsOverviewData['topCollections'] }) {
  return <section className="panel analytics-product-panel"><div className="panel-heading"><div><h2>Most Viewed Collections</h2></div></div>{rows.length ? rows.map(row => <div className="analytics-product-row" key={row.collection?.id ?? row._id}><span>{row.collection?.image ? <img src={row.collection.image} alt="" /> : <i />}</span><div><b>{row.collection?.name ?? 'Unavailable collection'}</b><small>{analyticsNumber(row.visitors)} unique visitors</small></div><strong>{analyticsNumber(row.views)}</strong></div>) : <div className="analytics-empty compact">No collection views recorded.</div>}</section>
}

function AnalyticsFunnel({ title, description, stages, selectedStage, onSelect }: { title: string; description: string; stages: AnalyticsOverviewData['funnel']; selectedStage: string; onSelect: (stage: string) => void }) {
  const stageLabels: Record<string, string> = { page_view: 'Website Visit', product_view: 'Product View', add_to_cart: 'Add to Cart', begin_checkout: 'Begin Checkout', purchase: 'Purchase' }
  const selectedIndex = Math.max(0, stages.findIndex(stage => stage.stage === selectedStage))
  const selected = stages[selectedIndex]
  const previous = stages[selectedIndex - 1]
  const first = stages[0]?.visitors ?? 0
  const conversion = first && selected ? selected.visitors / first * 100 : null
  const dropOff = previous?.visitors ? (previous.visitors - (selected?.visitors ?? 0)) / previous.visitors * 100 : null
  return <section className="panel analytics-funnel"><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div>{stages.map((stage, index) => { const prior = stages[index - 1]?.visitors ?? first; const label = stageLabels[stage.stage] ?? stage.stage; return <button className={`analytics-funnel-row${selectedStage === stage.stage ? ' selected' : ''}`} type="button" aria-pressed={selectedStage === stage.stage} key={stage.stage} onClick={() => onSelect(stage.stage)}><span>{label}</span><div className="analytics-funnel-track"><i style={{ width: `${first ? Math.min(100, stage.visitors / first * 100) : 0}%` }} /></div><b>{analyticsNumber(stage.visitors)}</b><small>{index ? `${prior ? (stage.visitors / prior * 100).toFixed(1) : '0.0'}% from prior` : '100%'}</small></button>})}<div className="analytics-funnel-detail" aria-live="polite"><b>{selected ? stageLabels[selected.stage] ?? selected.stage : 'Stage'}</b><span>{analyticsNumber(selected?.visitors ?? 0)} visitors · {analyticsPercent(conversion)} of visits{dropOff === null ? '' : ` · ${dropOff.toFixed(1)}% drop-off from prior stage`}</span></div></section>
}

function AnalyticsCheckoutPanel({ report }: { report: AnalyticsOverviewData['advanced']['checkout'] }) {
  const labels: Record<string, string> = {
    checkout_started: 'Checkout started',
    shipping_information_completed: 'Shipping information completed',
    order_confirmed: 'Order confirmed',
  }
  return <section className="panel analytics-panel analytics-advanced-panel"><div className="panel-heading"><div><h2>Checkout Funnel</h2><p>Unique consented sessions; abandoned sessions are mature for at least {report.maturityMinutes} minutes.</p></div></div>{report.stages.length ? <div className="table-scroll"><table><thead><tr><th>STEP</th><th>SESSIONS</th><th>CONVERSION FROM PRIOR</th><th>DROP-OFF FROM PRIOR</th></tr></thead><tbody>{report.stages.map(stage => <tr key={stage.stage}><td>{labels[stage.stage] ?? stage.stage}</td><td>{analyticsNumber(stage.visitors)}</td><td>{analyticsPercent(stage.conversionFromPrevious)}</td><td>{analyticsPercent(stage.dropOffFromPrevious)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty compact">No checkout-step records in this period.</div>}<div className="analytics-checkout-summary"><span><b>Abandoned:</b> {analyticsNumber(report.abandonedCheckouts)} ({analyticsPercent(report.abandonmentRate)})</span><span><b>Most common exit:</b> {report.mostCommonExitStep ? labels[report.mostCommonExitStep.step] ?? report.mostCommonExitStep.step : '—'}</span></div><p className="analytics-data-note">Cash on delivery is the only active payment method. Payment-attempt, failure, and success steps are not reported because the app has no active online payment flow.</p></section>
}

function AnalyticsProductIntelligence({ report }: { report: AnalyticsOverviewData['advanced'] }) {
  const [view, setView] = useState<'conversion' | 'opportunity' | 'inventory' | 'best'>('conversion')
  const products = report.products.filter(row => row.uniqueViewers > 0).slice(0, 10)
  const tabs = [
    ['conversion', 'Conversion'],
    ['opportunity', 'Opportunities'],
    ['inventory', 'Inventory'],
    ['best', 'Best performers'],
  ] as const
  return <section className="panel analytics-panel analytics-advanced-panel"><div className="panel-heading"><div><h2>Product & Inventory Intelligence</h2><p>Consent-attributed product interest, confirmed order data, and current active stock.</p></div><div className="analytics-variant-switch" role="group" aria-label="Product intelligence view">{tabs.map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div></div>
    {view === 'conversion' && <>{products.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>VIEWERS</th><th>VIEW → WISHLIST</th><th>WISHLIST → CART</th><th>VIEW → CART</th><th>VIEW → PURCHASE</th><th>AVG. HOURS TO PURCHASE</th></tr></thead><tbody>{products.map(row => <tr key={row.productId}><td>{row.product ? <Link className="analytics-product-link" to={`/products?q=${encodeURIComponent(row.product.name)}`}>{row.product.name}</Link> : 'Unavailable product'}</td><td>{analyticsNumber(row.uniqueViewers)}</td><td>{analyticsPercent(row.viewToWishlistRate)}</td><td>{analyticsPercent(row.wishlistToCartRate)}</td><td>{analyticsPercent(row.viewToCartRate)}</td><td>{analyticsPercent(row.viewToPurchaseRate)}</td><td>{row.averageHoursToPurchase === null ? '—' : row.averageHoursToPurchase.toFixed(1)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty compact">Product conversion reports appear after consented product activity and attributed confirmed purchases are recorded.</div>}<div className="analytics-two-column analytics-product-flags"><div><h3>High interest, low conversion</h3>{report.highInterestLowConversion.slice(0, 5).map(row => <p key={row.productId}>{row.product?.name} · {analyticsNumber(row.wishlistAfterViewVisitorCount)} wishlist-after-view visitors · {analyticsPercent(row.viewToPurchaseRate)} purchase rate</p>)}{!report.highInterestLowConversion.length && <small>No products meet the evidence threshold.</small>}</div><div><h3>Most viewed without attributed purchases</h3>{report.mostViewedWithoutPurchases.slice(0, 5).map(row => <p key={row.productId}>{row.product?.name} · {analyticsNumber(row.uniqueViewers)} visitors</p>)}{!report.mostViewedWithoutPurchases.length && <small>No products meet the evidence threshold.</small>}</div></div></>}
    {view === 'opportunity' && <><p className="analytics-data-note">Opportunity score (0–100) weights relative views, unique visitors, wishlist additions, cart events, wishlist/cart conversion, purchase conversion, confirmed units, and trailing-90-day sales pressure against active stock. It is a relative prioritization index, not a forecast; fewer than 5 unique viewers yields no score, and only 20+ viewers are labeled supported.</p>{report.highOpportunityProducts.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SCORE</th><th>CONFIDENCE</th><th>VIEWERS</th><th>WISHLIST ADDS</th><th>CART EVENTS</th><th>VIEW → PURCHASE</th><th>90-DAY SALES / STOCK</th></tr></thead><tbody>{report.highOpportunityProducts.map(row => <tr key={row.productId}><td>{row.product?.name ?? 'Unavailable product'}</td><td>{row.opportunityScore}</td><td>{row.opportunityConfidence}</td><td>{analyticsNumber(row.uniqueViewers)}</td><td>{analyticsNumber(row.wishlistAdditions)}</td><td>{analyticsNumber(row.cartAddEvents)}</td><td>{analyticsPercent(row.viewToPurchaseRate)}</td><td>{analyticsNumber(row.unitsSold90Days)} / {row.availableStock === null ? '—' : analyticsNumber(row.availableStock)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty compact">No high-opportunity products meet the supported sample threshold yet.</div>}{report.products.some(row => row.opportunityConfidence === 'limited') && <p className="analytics-data-note">Limited-sample products are excluded from the high-opportunity ranking until they reach 20 unique viewers.</p>}</>}
    {view === 'inventory' && <><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>STOCK</th><th>90-DAY UNITS</th><th>RECENT 30 DAYS</th><th>PRIOR 30 DAYS</th><th>TREND</th><th>MONTHLY HISTORY</th><th>EST. STOCK COVER</th></tr></thead><tbody>{report.inventory.products.slice(0, 12).map(row => <tr key={row.productId}><td>{row.productName}</td><td>{analyticsNumber(row.availableStock)}</td><td>{analyticsNumber(row.unitsSold90Days)}</td><td>{analyticsNumber(row.recent30DayUnits)}</td><td>{analyticsNumber(row.previous30DayUnits)}</td><td>{row.trendPercent === null ? '—' : `${row.trendPercent > 0 ? '+' : ''}${row.trendPercent.toFixed(1)}%`}</td><td>{row.monthlyUnits.map(month => `${month.month}: ${month.units}`).join(' · ') || '—'}</td><td>{row.estimatedDaysOfStock === null ? 'Insufficient history' : `${row.estimatedDaysOfStock.toFixed(0)} days`}</td></tr>)}</tbody></table></div><p className="analytics-data-note">Stock-cover estimates require at least three confirmed units across two or more months in the 90-day history. Demand alerts use confirmed sales and current active variant stock.</p><h3>High-demand, low-stock variants</h3>{report.inventory.variantAlerts.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>COLOR</th><th>SIZE</th><th>90-DAY UNITS</th><th>STOCK</th><th>SEVERITY</th></tr></thead><tbody>{report.inventory.variantAlerts.slice(0, 10).map(row => <tr key={`${row.productId}-${row.color}-${row.size}`}><td>{row.productName}</td><td>{row.color || '—'}</td><td>{row.size || '—'}</td><td>{analyticsNumber(row.unitsSold90Days)}</td><td>{analyticsNumber(row.availableStock)}</td><td>{row.severity}</td></tr>)}</tbody></table></div> : <p className="analytics-empty compact">No variants currently meet the demand-to-stock alert threshold.</p>}</>}
    {view === 'best' && (report.bestPerformingProducts.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CONFIRMED UNITS</th><th>ITEM REVENUE</th></tr></thead><tbody>{report.bestPerformingProducts.map(row => <tr key={row.productId}><td>{row.product ? <Link className="analytics-product-link" to={`/products?q=${encodeURIComponent(row.product.name)}`}>{row.product.name}</Link> : 'Unavailable product'}</td><td>{analyticsNumber(row.unitsPurchased)}</td><td>{analyticsMoney(row.revenue)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty compact">No paid-and-delivered product sales in this period.</div>)}
  </section>
}

function AnalyticsVariantTable({ title, rows }: { title: string; rows: AnalyticsOverviewData['advanced']['variantSizes'] }) {
  const [sortBy, setSortBy] = useState<'views' | 'purchases'>('views')
  const rankedRows = [...rows].sort((a, b) => sortBy === 'views' ? b.selectedVisitors - a.selectedVisitors : b.unitsPurchased - a.unitsPurchased)
  return <section className="panel analytics-panel"><div className="panel-heading"><div><h2>{title}</h2></div><div className="analytics-variant-switch"><button type="button" aria-pressed={sortBy === 'views'} onClick={() => setSortBy('views')}>Most viewed</button><button type="button" aria-pressed={sortBy === 'purchases'} onClick={() => setSortBy('purchases')}>Most purchased</button></div></div>{rankedRows.length ? <div className="table-scroll"><table><thead><tr><th>VARIANT</th><th>SELECTED VISITORS</th><th>UNITS PURCHASED</th><th>CONVERSION</th><th>AVAILABLE STOCK</th></tr></thead><tbody>{rankedRows.slice(0, 8).map(row => <tr key={row.value}><td>{row.value}</td><td>{analyticsNumber(row.selectedVisitors)}</td><td>{analyticsNumber(row.unitsPurchased)}</td><td>{analyticsPercent(row.conversionRate)}</td><td>{analyticsNumber(row.availableStock)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty compact">No variant selections recorded.</div>}</section>
}

function AnalyticsVariantDetail({ rows }: { rows: AnalyticsOverviewData['advanced']['variants'] }) {
  return <section className="panel analytics-panel analytics-advanced-panel"><div className="panel-heading"><div><h2>Variant Conversion & Stock</h2><p>Size/color selections are joined to order line items; stock is current active inventory.</p></div></div>{rows.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>COLOR</th><th>SIZE</th><th>SELECTED VISITORS</th><th>UNITS PURCHASED</th><th>CONVERSION</th><th>STOCK</th></tr></thead><tbody>{rows.slice(0, 12).map(row => <tr key={`${row.productId}-${row.color}-${row.size}`}><td>{row.productName}</td><td>{row.color || '—'}</td><td>{row.size || '—'}</td><td>{analyticsNumber(row.selectedVisitors)}</td><td>{analyticsNumber(row.unitsPurchased)}</td><td>{analyticsPercent(row.conversionRate)}</td><td>{analyticsNumber(row.availableStock)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty compact">No size/color selections or confirmed variant purchases are available.</div>}</section>
}

function AnalyticsCollectionPerformance({ rows }: { rows: AnalyticsOverviewData['advanced']['collectionPerformance'] }) {
  return <section className="panel analytics-panel analytics-advanced-panel"><div className="panel-heading"><div><h2>Collection Performance</h2><p>Purchases are attributed to the last consented collection-product click before order placement.</p></div></div>{rows.length ? <div className="table-scroll"><table><thead><tr><th>COLLECTION</th><th>VIEWS</th><th>PRODUCT CLICK VISITORS</th><th>PURCHASING VISITORS</th><th>CONVERSION</th><th>ATTRIBUTED REVENUE</th></tr></thead><tbody>{rows.slice(0, 10).map(row => <tr key={row.collectionId}><td>{row.collection?.name ?? 'Unavailable collection'}</td><td>{analyticsNumber(row.views)}</td><td>{analyticsNumber(row.productClickVisitors)}</td><td>{analyticsNumber(row.purchasingVisitors)}</td><td>{analyticsPercent(row.conversionRate)}</td><td>{analyticsMoney(row.revenue)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty compact">Collection performance appears once collection clicks and attributed confirmed orders are recorded.</div>}</section>
}

function AnalyticsCampaignPanel({ report }: { report: AnalyticsOverviewData['advanced']['campaigns'] }) {
  const firstRows = report.firstTouch.slice(0, 8)
  const lastRows = report.lastTouch.slice(0, 8)
  return <section className="panel analytics-panel analytics-advanced-panel"><div className="panel-heading"><div><h2>Campaign Intelligence</h2><p>UTM visitors from consented campaign sessions; confirmed paid-and-delivered orders only.</p></div></div><h3>Campaign Visitors</h3>{report.visitors.length ? <div className="table-scroll"><table><thead><tr><th>SOURCE / MEDIUM / CAMPAIGN</th><th>VISITORS</th><th>SESSIONS</th></tr></thead><tbody>{report.visitors.slice(0, 8).map((row, index) => <tr key={`${row.source}-${row.medium}-${row.campaign}-${index}`}><td>{row.source} / {row.medium} / {row.campaign}</td><td>{analyticsNumber(row.visitors)}</td><td>{analyticsNumber(row.sessions)}</td></tr>)}</tbody></table></div> : <p className="analytics-empty compact">No UTM campaign visits recorded.</p>}<div className="analytics-two-column"><div><h3>First-touch campaigns</h3>{firstRows.length ? <div className="table-scroll"><table><thead><tr><th>SOURCE / MEDIUM / CAMPAIGN</th><th>CAMPAIGN VISITORS</th><th>ORDERS</th><th>REVENUE</th><th>CONVERSION</th></tr></thead><tbody>{firstRows.map((row, index) => <tr key={`${row.source}-${row.medium}-${row.campaign}-${index}`}><td>{row.source} / {row.medium} / {row.campaign}</td><td>{analyticsNumber(row.visitors)}</td><td>{analyticsNumber(row.orders)}</td><td>{analyticsMoney(row.revenue)}</td><td>{analyticsPercent(row.conversionRate)}</td></tr>)}</tbody></table></div> : <p className="analytics-empty compact">No first-touch campaign sales recorded.</p>}</div><div><h3>Last-touch campaigns</h3>{lastRows.length ? <div className="table-scroll"><table><thead><tr><th>SOURCE / MEDIUM / CAMPAIGN</th><th>CAMPAIGN VISITORS</th><th>ORDERS</th><th>REVENUE</th><th>CONVERSION</th></tr></thead><tbody>{lastRows.map((row, index) => <tr key={`${row.source}-${row.medium}-${row.campaign}-${index}`}><td>{row.source} / {row.medium} / {row.campaign}</td><td>{analyticsNumber(row.visitors)}</td><td>{analyticsNumber(row.orders)}</td><td>{analyticsMoney(row.revenue)}</td><td>{analyticsPercent(row.conversionRate)}</td></tr>)}</tbody></table></div> : <p className="analytics-empty compact">No last-touch campaign sales recorded.</p>}</div></div><p className="analytics-data-note">{report.roiAvailable ? 'ROI uses configured campaign cost records.' : 'Campaign ROI is unavailable because no campaign cost data is configured.'}</p></section>
}

function AnalyticsCustomerCohorts({ cohorts, metrics }: { cohorts: AnalyticsOverviewData['advanced']['customers']['cohorts']; metrics: AnalyticsOverviewData['advanced']['customers']['metrics'] }) {
  return <><div className="metric-grid analytics-metrics"><article className="metric-card"><p>Average Purchase Frequency</p><strong>{metrics.averagePurchaseFrequency === null ? '—' : metrics.averagePurchaseFrequency.toFixed(2)}</strong><span>lifetime orders per verified customer</span></article><article className="metric-card"><p>Average Time Between Purchases</p><strong>{metrics.averageDaysBetweenPurchases === null ? '—' : `${metrics.averageDaysBetweenPurchases.toFixed(1)} days`}</strong><span>verified accounts with repeat purchases</span></article></div><section className="panel analytics-panel"><div className="panel-heading"><div><h2>Monthly Customer Retention Cohorts</h2><p>Only authenticated customer accounts with paid-and-delivered orders; cohorts begin with first completed purchase.</p></div></div>{cohorts.length ? <div className="table-scroll"><table><thead><tr><th>COHORT</th><th>NEW CUSTOMERS</th>{Array.from({ length: 12 }, (_, index) => <th key={index}>MONTH {index}</th>)}</tr></thead><tbody>{cohorts.map(row => <tr key={row.cohort}><td>{row.cohort}</td><td>{analyticsNumber(row.customers)}</td>{Array.from({ length: 12 }, (_, index) => <td key={index}>{analyticsPercent(row.months[index]?.retentionRate ?? null)}</td>)}</tr>)}</tbody></table></div> : <div className="analytics-empty">No verified customer cohort starts in the selected date range.</div>}</section></>
}

function AnalyticsInsightPanel({ insights }: { insights: AnalyticsOverviewData['advanced']['insights'] }) {
  return <section className="panel analytics-insights analytics-insight-cards"><div className="panel-heading"><div><h2>Automated Business Insights</h2><p>Rule-based observations supported by recorded data</p></div></div>{insights.length ? insights.slice(0, 5).map((insight, index) => <article className={`analytics-insight-card severity-${insight.severity}`} key={`${insight.title}-${index}`}><div><b>{insight.title}</b><span>{insight.severity}</span></div><p>{insight.description}</p><small>Comparison: {insight.comparisonPeriod}</small><dl>{Object.entries(insight.metrics).map(([label, value]) => <div key={label}><dt>{label.replace(/([A-Z])/g, ' $1')}</dt><dd>{typeof value === 'number' ? analyticsNumber(value) : value ?? '—'}</dd></div>)}</dl><p className="analytics-insight-action"><b>Recommended:</b> {insight.recommendedAction}</p></article>) : <div className="analytics-empty compact">Insights will appear when recorded data meets the evidence thresholds.</div>}</section>
}

function AnalyticsSourceRows({ sources, max }: { sources: AnalyticsOverviewData['sources']; max: number }) {
  return sources.length ? <div className="analytics-source-list">{sources.map(source => <div className="analytics-source-row" key={source._id}><b>{source._id || 'Direct'}</b><div className="analytics-funnel-track"><i style={{ width: `${source.sessions / max * 100}%` }} /></div><span>{analyticsNumber(source.sessions)} sessions</span><small>{analyticsNumber(source.visitors)} visitors</small></div>)}</div> : <div className="analytics-empty">No traffic source data recorded for this period.</div>
}

function AnalyticsAttributionPanel({ title, rows }: { title: string; rows: AnalyticsOverviewData['attribution']['firstTouch'] }) {
  return <section className="panel analytics-panel"><div className="panel-heading"><div><h2>{title}</h2><p>Confirmed paid and delivered orders</p></div></div>{rows.length ? rows.map(row => <div className="analytics-source-row analytics-attribution-row" key={row._id}><b>{row._id}</b><span>{analyticsNumber(row.orders)} orders</span><strong>{analyticsMoney(row.revenue)}</strong></div>) : <div className="analytics-empty">No attributed completed orders yet.</div>}</section>
}

function AnalyticsDemandPanel({ title, demand, stock }: { title: string; demand: { _id: string; unitsSold: number }[]; stock: { _id: string; unitsInStock: number }[] }) {
  const entries = new Map<string, { sold: number; stock: number }>()
  demand.forEach(row => entries.set(row._id, { sold: row.unitsSold, stock: 0 }))
  stock.forEach(row => entries.set(row._id, { sold: entries.get(row._id)?.sold ?? 0, stock: row.unitsInStock }))
  const rows = [...entries].sort((a, b) => b[1].sold - a[1].sold)
  return <section className="panel analytics-panel"><div className="panel-heading"><div><h2>{title}</h2><p>Confirmed paid and delivered demand vs active stock</p></div></div>{rows.length ? rows.map(([label, amounts]) => <div className="analytics-attribution-row analytics-source-row" key={label}><b>{label}</b><span>{analyticsNumber(amounts.sold)} sold</span><strong>{analyticsNumber(amounts.stock)} in stock</strong></div>) : <div className="analytics-empty">No variant demand or active stock data available.</div>}</section>
}

function AnalyticsDailyTable({ rows }: { rows: AnalyticsOverviewData['daily'] }) {
  const populated = rows.filter(row => row.visitors || row.sessions || row.pageViews || row.orders || row.revenue)
  return populated.length ? <div className="table-scroll"><table><thead><tr><th>DATE</th><th>VISITORS</th><th>SESSIONS</th><th>PAGE VIEWS</th><th>ORDERS</th><th>REVENUE</th></tr></thead><tbody>{populated.map(row => <tr key={row.date}><td>{row.date}</td><td>{analyticsNumber(row.visitors)}</td><td>{analyticsNumber(row.sessions)}</td><td>{analyticsNumber(row.pageViews)}</td><td>{analyticsNumber(row.orders)}</td><td>{analyticsMoney(row.revenue)}</td></tr>)}</tbody></table></div> : <div className="analytics-empty">No activity for the selected period.</div>
}

type CookieConsentEntry = {
  _id: string
  visitorId: string
  preferences: { necessary: boolean; functional: boolean; analytics: boolean; marketing: boolean }
  action: 'accept_all' | 'reject_all' | 'custom'
  policyVersion: string
  createdAt: string
}
type CookieConsentReport = {
  logs: CookieConsentEntry[]
  total: number
  page: number
  limit: number
  stats: { accept_all: number; reject_all: number; custom: number }
}

function CookieConsentDashboard() {
  const [report, setReport] = useState<CookieConsentReport | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiRequest<CookieConsentReport>(`/admin/website/privacy/consents?page=${page}&limit=50`).then(result => {
      if (!cancelled) { setReport(result); setError('') }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load consent logs.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, reload])
  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / 50))
  const actionLabels = { accept_all: 'Accept All', reject_all: 'Reject All', custom: 'Custom' }
  const preferenceText = (log: CookieConsentEntry) => [
    'Necessary',
    `Functional ${log.preferences.functional ? 'on' : 'off'}`,
    `Analytics ${log.preferences.analytics ? 'on' : 'off'}`,
    `Marketing ${log.preferences.marketing ? 'on' : 'off'}`,
  ].join(' · ')
  return <div className="admin-content">
    <PageHeader eyebrow="SETTINGS / PRIVACY" title="Privacy & Cookies" action={<button className="admin-button" type="button" onClick={() => setReload(value => value + 1)}>Refresh</button>} />
    <p className="cookie-admin-intro">Consent history is stored without names, email addresses, or IP addresses. Each saved preference change creates a separate record.</p>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    <div className="metric-grid cookie-consent-metrics">
      {([
        ['Accept All', report?.stats.accept_all],
        ['Reject All', report?.stats.reject_all],
        ['Custom', report?.stats.custom],
      ] as const).map(([label, count]) => <article className="metric-card" key={label}><p>{label}</p><strong>{count ?? '—'}</strong><span>all recorded changes</span></article>)}
    </div>
    <section className="panel cookie-consent-panel">
      <div className="panel-heading"><div><h2>Consent logs</h2><p>{report ? `${report.total} recorded changes` : 'Visitor choices and accepted policy versions'}</p></div></div>
      {loading ? <div className="table-empty">Loading consent logs…</div> : report?.logs.length ? <div className="table-scroll"><table className="cookie-consent-table"><thead><tr><th>DATE / TIME</th><th>VISITOR ID</th><th>ACTION</th><th>PREFERENCES</th><th>POLICY</th></tr></thead><tbody>{report.logs.map(log => <tr key={log._id}><td>{new Date(log.createdAt).toLocaleString()}</td><td title={log.visitorId}><code>{log.visitorId.slice(0, 8)}…</code></td><td>{actionLabels[log.action]}</td><td>{preferenceText(log)}</td><td>{log.policyVersion}</td></tr>)}</tbody></table></div> : <div className="table-empty">No cookie consent changes have been recorded yet.</div>}
      <div className="table-footer"><span>Page <b>{page}</b> of <b>{totalPages}</b></span><div className="admin-pagination"><button type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft size={14} /></button><button type="button" aria-label="Next page" disabled={page >= totalPages || loading} onClick={() => setPage(current => Math.min(totalPages, current + 1))}><ChevronRight size={14} /></button></div></div>
    </section>
  </div>
}

const websitePath = '/admin/website'
const defaultEditorialImage = 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1300&q=85'
const builtInHeroCutouts: Record<string, string> = { 'logo-t-shirt': '/hero-ai/logo-t-shirt-ai.png', 'ma-quaad-jacket': '/slider/ma-quaad-jacket.png', 'ma-cap': '/hero-ai/ma-cap-ai.png', 'distressed-denim-jeans': '/hero-ai/distressed-denim-jeans-ai.png', 'leather-jacket': '/hero-ai/leather-jacket-ai.png', 'skeleton-sneakers': '/hero-ai/skeleton-sneakers-ai.png' }
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '—'
const mediaUrl = (url: string) => url.startsWith('/') ? `${API_BASE_URL.replace(/\/api\/v1$/, '')}${url}` : url
const sectionLabels: Record<WebsiteSectionType, string> = { hero: 'Hero campaign', 'featured-products': 'Featured products', 'new-arrivals': 'New arrivals', collection: 'Featured collection', categories: 'Category showcase', editorial: 'Editorial image', brand: 'Brand introduction', 'featured-release': 'Featured release', newsletter: 'Newsletter', 'instagram-feed': 'Instagram feed', 'footer-announcement': 'Footer announcement', 'rich-text': 'Text section' }
const makeSection = (type: WebsiteSectionType, order: number): WebsiteSection => ({
  id: `${type}-${Date.now().toString(36)}`, type, title: sectionLabels[type], enabled: true, order,
  settings: type === 'hero' ? { heading: '', subtitle: '', eyebrow: '', image: '', mobileImage: '', buttonLabel: '', destination: '/shop', alignment: 'left', overlay: 20, mode: 'automatic', productIds: [], limit: 3 }
    : type === 'new-arrivals' || type === 'featured-products' ? { heading: sectionLabels[type], subtitle: '', mode: 'automatic', productIds: [], limit: 3, showPrices: true }
      : type === 'instagram-feed' ? { heading: 'FOLLOW US', subtitle: 'OFF / COMMUNITY', instagramUrl: '' }
        : type === 'editorial' ? { eyebrow: 'DRESS WITH INTENTION', heading: 'Uniform for the unordinary.', description: 'Essential forms. Unexpected details. A wardrobe designed to move with you.', image: defaultEditorialImage, mobileImage: '', buttonLabel: 'Explore ready-to-wear', destination: '/shop' }
          : { heading: sectionLabels[type], description: '', image: '', mobileImage: '', buttonLabel: '', destination: '/shop' },
})

const defaultSelectionCards = (products: ApiProduct[]): HomepageSelectionCard[] => [
  { title: 'MEN', description: 'A considered uniform.', productSlug: 'leather-jacket', background: '#e5e2dc' },
  { title: 'WOMEN', description: 'Form meets function.', productSlug: 'distressed-denim-jeans', background: '#e5e2dc' },
  { title: 'ACCESSORIES', description: 'The finishing pieces.', productSlug: 'ma-cap', background: '#d9d5cb' },
].map(({ title, description, productSlug, background }) => ({
  title, description, background, destination: '',
  productId: products.find(product => product.slug === productSlug && product.status === 'active')?._id ?? '',
}))

function SelectionCardsEditor({ cards, products, collections, onChange }: { cards: HomepageSelectionCard[]; products: ApiProduct[]; collections: ApiCollection[]; onChange: (cards: HomepageSelectionCard[]) => void }) {
  const update = (index: number, field: keyof HomepageSelectionCard, value: string) => onChange(cards.map((card, cardIndex) => cardIndex === index ? { ...card, [field]: value } : card))
  return <fieldset className="website-selection-card-editor">
    <legend>Selection cards</legend>
    <p className="admin-note">Configure the three category cards shown on the homepage. Link each card to a collection to keep the Collections page and shop filters in sync.</p>
    {cards.map((card, index) => <div className="website-selection-card-fields" key={`selection-card-${index}`}>
      <b>{['MEN', 'WOMEN', 'ACCESSORIES'][index]}</b>
      <label>Card title<input value={card.title} maxLength={80} onChange={event => update(index, 'title', event.target.value)} /></label>
      <label>Short description<input value={card.description} maxLength={200} onChange={event => update(index, 'description', event.target.value)} /></label>
      <label>Product<select value={card.productId} onChange={event => update(index, 'productId', event.target.value)}><option value="">Select a product</option>{products.filter(product => product.status === 'active').map(product => <option key={product._id} value={product._id}>{product.name}</option>)}</select></label>
      <label>Linked collection<select value={card.collectionId ?? ''} onChange={event => update(index, 'collectionId', event.target.value)}><option value="">No collection linked</option>{collections.filter(collection => collection.status === 'active').map(collection => <option key={collection._id} value={collection._id}>{collection.name}</option>)}</select></label>
      <label>Card background<select value={card.background} onChange={event => update(index, 'background', event.target.value)}><option value="#e5e2dc">Warm stone</option><option value="#111111">Black</option><option value="#d9d5cb">Sand</option><option value="#f0efec">Soft grey</option></select></label>
      <label>Destination<input value={card.destination} maxLength={2048} placeholder={card.productId ? `/product/${card.productId}` : '/shop'} onChange={event => update(index, 'destination', event.target.value)} /></label>
    </div>)}
  </fieldset>
}

function WebsiteOverview() {
  const [data, setData] = useState<{ pages: number; scheduled: number; draftCount: number; lastPublishedAt: string | null; lastUpdatedAt: string | null; recent: WebsitePageRecord[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { apiRequest<typeof data>(websitePath).then(setData).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load website overview.')) }, [])
  const openStore = () => window.open(import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173/', '_blank', 'noopener,noreferrer')
  return <div className="admin-content website-content"><PageHeader eyebrow="WEBSITE / OVERVIEW" title="Website" action={<button className="admin-button" onClick={openStore}><Eye size={14} /> Preview Website</button>} />{error && <div className="admin-alert">{error}</div>}
    <div className="metric-grid website-metrics">{[['Managed pages', data?.pages ?? '—'], ['Unpublished changes', data?.draftCount ?? '—'], ['Scheduled publications', data?.scheduled ?? '—'], ['Publication status', data?.lastPublishedAt ? 'Published' : 'Not published']].map(([label, value]) => <article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong><span>{label === 'Managed pages' ? 'CMS pages and templates' : label === 'Unpublished changes' ? 'Drafts awaiting publication' : label === 'Scheduled publications' ? 'Queued in the CMS' : `Last published ${formatDateTime(data?.lastPublishedAt)}`}</span></article>)}</div>
    <div className="website-quick-actions"><Link className="panel website-action" to="/website/homepage"><PanelsTopLeft /><span><b>Edit Homepage</b><small>Manage sections and storefront content</small></span><ChevronRight size={16} /></Link><Link className="panel website-action" to="/website/pages"><FileText /><span><b>Manage Pages</b><small>Edit reusable page templates</small></span><ChevronRight size={16} /></Link><Link className="panel website-action" to="/website/media"><Image /><span><b>Manage Media</b><small>Browse and upload images</small></span><ChevronRight size={16} /></Link><Link className="panel website-action" to="/website/merchandising"><Package /><span><b>Manual product order</b><small>Curate catalog, category and collection order</small></span><ChevronRight size={16} /></Link></div>
    <section className="panel recent-panel website-recent"><div className="panel-heading"><div><h2>Recently modified pages</h2><p>Last update {formatDateTime(data?.lastUpdatedAt)}</p></div><Link to="/website/pages" className="view-all">All pages <ArrowUp size={12} /></Link></div><div className="table-scroll"><table><thead><tr><th>PAGE</th><th>URL</th><th>STATUS</th><th>UPDATED</th></tr></thead><tbody>{data?.recent.map(page => <tr key={page._id}><td><Link to={page.slug === 'home' ? '/website/homepage' : `/website/pages/${page._id}/editor`}>{page.name}</Link></td><td>/{page.slug === 'home' ? '' : page.slug}</td><td><Status value={page.status} /></td><td>{formatDateTime(page.updatedAt)}</td></tr>)}</tbody></table>{!data?.recent.length && <div className="table-empty">No pages have been changed yet.</div>}</div></section>
  </div>
}

function WebsitePages() {
  const [pages, setPages] = useState<WebsitePageRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const refresh = () => { setLoading(true); apiRequest<WebsitePageRecord[]>(`${websitePath}/pages`).then(setPages).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load pages.')).finally(() => setLoading(false)) }
  useEffect(refresh, [])
  const createPage = async (event: FormEvent) => { event.preventDefault(); try { const page = await apiRequest<WebsitePageRecord>(`${websitePath}/pages`, { method: 'POST', body: JSON.stringify({ name, slug: slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), pageType: 'content' }) }); setCreating(false); setName(''); setSlug(''); setPages(current => [...current, page]) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create the page.') } }
  const publish = async (page: WebsitePageRecord) => { try { const updated = await apiRequest<WebsitePageRecord>(`${websitePath}/pages/${page._id}/publish`, { method: 'POST' }); setPages(current => current.map(item => item._id === updated._id ? updated : item)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to publish this page.') } }
  const unpublish = async (page: WebsitePageRecord) => { try { const updated = await apiRequest<WebsitePageRecord>(`${websitePath}/pages/${page._id}/unpublish`, { method: 'POST' }); setPages(current => current.map(item => item._id === updated._id ? updated : item)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to unpublish this page.') } }
  const duplicate = async (page: WebsitePageRecord) => { try { const copy = await apiRequest<WebsitePageRecord>(`${websitePath}/pages/${page._id}/duplicate`, { method: 'POST' }); setPages(current => [...current, copy]) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to duplicate this page.') } }
  const remove = async (page: WebsitePageRecord) => { if (!window.confirm(`Delete “${page.name}”? This cannot be undone.`)) return; try { await apiRequest(`${websitePath}/pages/${page._id}`, { method: 'DELETE' }); setPages(current => current.filter(item => item._id !== page._id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete the page.') } }
  return <div className="admin-content website-content"><PageHeader eyebrow="WEBSITE / CONTENT" title="Pages" action={<button className="admin-button primary" onClick={() => setCreating(true)}><Plus size={14} /> Add page</button>} />{error && <div className="admin-alert" role="alert">{error}<button onClick={refresh}>Retry</button></div>}{creating && <form className="panel website-create-form" onSubmit={createPage}><label>Page name<input value={name} onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) }} required maxLength={100} /></label><label>URL<input value={`/${slug}`} onChange={e => setSlug(e.target.value.replace(/^\/+/, ''))} required maxLength={80} /></label><button className="admin-button primary">Create page</button><button type="button" className="admin-button" onClick={() => setCreating(false)}>Cancel</button></form>}
    <section className="panel list-panel"><div className="table-scroll"><table><thead><tr><th>PAGE</th><th>URL</th><th>TYPE</th><th>STATUS</th><th>LAST MODIFIED</th><th>LAST PUBLISHED</th><th>ACTIONS</th></tr></thead><tbody>{pages.map(page => <tr key={page._id}><td><b>{page.name}</b></td><td>/{page.slug === 'home' ? '' : page.slug}</td><td>{page.pageType === 'template' ? 'Reusable template' : page.pageType}</td><td><Status value={page.status} />{page.draftVersion > page.publishedVersion && <small className="website-draft-note"> Draft changes</small>}</td><td>{formatDateTime(page.updatedAt)}</td><td>{formatDateTime(page.publishedAt)}</td><td><div className="website-row-actions"><Link className="admin-button compact" to={page.slug === 'home' ? '/website/homepage' : `/website/pages/${page._id}/editor`}>Edit / Preview</Link><button className="admin-button compact" onClick={() => void publish(page)} disabled={page.draftVersion <= page.publishedVersion && page.status !== 'archived'}>Publish</button><button className="admin-button compact" onClick={() => void unpublish(page)} disabled={page.protected || page.status !== 'published'}>Unpublish</button><button className="admin-button compact" onClick={() => void duplicate(page)} disabled={!['content', 'listing'].includes(page.pageType)}>Duplicate</button><button className="admin-button compact danger" onClick={() => void remove(page)} disabled={page.protected}>Delete</button></div></td></tr>)}</tbody></table>{loading && <div className="table-empty">Loading pages…</div>}{!loading && pages.length === 0 && <div className="table-empty">No pages are configured.</div>}</div></section>
  </div>
}

function HeroCutoutTools({ products, images, onChange }: { products: ApiProduct[]; images: Record<string, string>; onChange: (images: Record<string, string>) => void }) {
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const process = async (product: ApiProduct) => {
    const source = product.images?.[0]?.url
    if (!source) { setError(`No source image is available for ${product.name}.`); return }
    setBusyId(product._id); setError(''); setMessage('')
    try {
      const blob = await removePlainBackground(mediaUrl(source))
      const asset = await apiRequest<MediaRecord>(`${websitePath}/media`, { method: 'POST', body: await blob.arrayBuffer(), headers: { 'Content-Type': 'image/png', 'X-File-Name': `${product.slug}-hero-cutout.png`, 'X-Alt-Text': `${product.name}, transparent hero image` } })
      onChange({ ...images, [product._id]: asset.url })
      setMessage(`Transparent cutout created for ${product.name}. Save and publish the homepage to use it.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not process ${product.name}.`)
    } finally { setBusyId('') }
  }
  const storefrontUrl = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173'
  return <fieldset className="website-product-picker website-cutout-tools"><legend>Hero image cutouts</legend><p className="admin-note">Reuse a prepared transparent studio cutout where available. For other products, remove a plain background in the browser; best results use a light, even background.</p>{products.map(product => {
    const preparedCutout = builtInHeroCutouts[product.slug]
    const selectedImage = preparedCutout || images[product._id] || product.images?.[0]?.url || ''
    const previewUrl = selectedImage.startsWith('/slider/') || selectedImage.startsWith('/hero-ai/') ? `${storefrontUrl}${selectedImage}` : mediaUrl(selectedImage)
    const aiRenderNeedsSync = Boolean(preparedCutout && images[product._id] !== preparedCutout)
    return <div className="website-cutout-product" key={product._id}><img src={previewUrl} alt="" /><span>{product.name}<small>{preparedCutout ? 'AI product render ready' : images[product._id] ? 'Transparent cutout selected' : 'Original product image'}</small></span>{aiRenderNeedsSync ? <button className="admin-button compact" type="button" onClick={() => { onChange({ ...images, [product._id]: preparedCutout }); setMessage(`AI product image selected for ${product.name}. Save and publish the homepage to sync this choice.`) }}>Use AI image</button> : preparedCutout ? <button className="admin-button compact" type="button" disabled>AI image active</button> : <button className="admin-button compact" type="button" disabled={Boolean(busyId)} onClick={() => void process(product)}>{busyId === product._id ? 'Processing…' : images[product._id] ? 'Redo' : 'Remove background'}</button>}{images[product._id] && <button className="admin-button compact" type="button" onClick={() => { const next = { ...images }; delete next[product._id]; onChange(next) }}>Reset</button>}</div>
  })}{message && <p className="admin-success" role="status">{message}</p>}{error && <p className="admin-alert" role="alert">{error}</p>}</fieldset>
}

function WebsiteEditor({ homepage = false }: { homepage?: boolean }) {
  const { pageId = '' } = useParams()
  const [page, setPage] = useState<WebsitePageRecord | null>(null)
  const [sections, setSections] = useState<WebsiteSection[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [collections, setCollections] = useState<ApiCollection[]>([])
  const [siteCategories, setSiteCategories] = useState<ApiCategory[]>([])
  const [mode, setMode] = useState('desktop')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishMessage, setPublishMessage] = useState('')
  const [revisions, setRevisions] = useState<any[]>([])
  const [scheduleAt, setScheduleAt] = useState('')
  const [dragSectionIndex, setDragSectionIndex] = useState<number | null>(null)
  const [globalInstagramPosts, setGlobalInstagramPosts] = useState<WebsiteInstagramPost[]>([])
  const key = homepage ? 'home' : pageId
  useEffect(() => { let cancelled = false; Promise.all([apiRequest<WebsitePageRecord>(`${websitePath}/${homepage ? 'homepage' : `pages/${key}`}`), apiRequest<ApiProduct[]>('/admin-preview/products'), apiRequest<ApiCollection[]>('/admin-preview/collections'), apiRequest<ApiCategory[]>('/admin-preview/categories'), apiRequest<{ draft?: { settings?: { instagramPosts?: WebsiteInstagramPost[] } }; published?: { settings?: { instagramPosts?: WebsiteInstagramPost[] } } }>(`${websitePath}/settings`)]).then(([item, catalog, collectionItems, categoryItems, settingsRecord]) => { if (!cancelled) { const initialSections = (item.draftSections ?? []).map(section => section.type === 'editorial' && section.id === 'editorial' && !section.settings.image ? { ...section, settings: { ...section.settings, eyebrow: section.settings.eyebrow || 'DRESS WITH INTENTION', image: defaultEditorialImage } } : section); const configuredPosts = settingsRecord.draft?.settings?.instagramPosts ?? settingsRecord.published?.settings?.instagramPosts ?? []; setGlobalInstagramPosts(Array.isArray(configuredPosts) ? configuredPosts : []); setPage(item); setSections(initialSections); setSelectedId(initialSections[0]?.id ?? ''); setProducts(catalog); setCollections(collectionItems); setSiteCategories(categoryItems) } }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load the editor.') }); return () => { cancelled = true } }, [key, homepage])
  const selected = sections.find(section => section.id === selectedId) ?? sections[0]
  const heroCutoutMap = selected?.settings.productImages && typeof selected.settings.productImages === 'object' && !Array.isArray(selected.settings.productImages) ? selected.settings.productImages as Record<string, string> : {}
  const heroCutoutCandidates = selected?.type !== 'hero' ? [] : selected.settings.mode === 'manual'
    ? (Array.isArray(selected.settings.productIds) ? selected.settings.productIds as string[] : []).map(id => products.find(product => product._id === id)).filter((product): product is ApiProduct => Boolean(product)).slice(0, Number(selected.settings.limit ?? 3))
    : selected.settings.mode === 'collection'
      ? (collections.find(item => item._id === selected.settings.collectionId)?.productIds ?? []).map(id => products.find(product => product._id === id)).filter((product): product is ApiProduct => Boolean(product)).slice(0, Number(selected.settings.limit ?? 3))
      : products.filter(product => product.status === 'active').slice(0, Number(selected.settings.limit ?? 3))
  const change = (field: string, value: unknown) => { if (!selected) return; setSaved(false); setSections(current => current.map(section => section.id === selected.id ? { ...section, settings: { ...section.settings, [field]: value } } : section)) }
  const selectedInstagramPosts = Array.isArray(selected?.settings.instagramPosts)
    ? selected.settings.instagramPosts as WebsiteInstagramPost[]
    : globalInstagramPosts
  const updateInstagramPosts = (posts: WebsiteInstagramPost[]) => change('instagramPosts', posts)
  const moveInstagramPost = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= selectedInstagramPosts.length) return
    const next = [...selectedInstagramPosts]
      ;[next[index], next[target]] = [next[target], next[index]]
    updateInstagramPosts(next)
  }
  const saveDraft = async () => { if (!page) return; setSaving(true); setError(''); try { const path = homepage ? `${websitePath}/homepage` : `${websitePath}/pages/${key}`; const updated = await apiRequest<WebsitePageRecord>(path, { method: 'PATCH', body: JSON.stringify({ sections: sections.map((section, order) => ({ ...section, order })), expectedVersion: page.draftVersion }) }); setPage(updated); setSections(updated.draftSections); setSaved(true) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this draft.') } finally { setSaving(false) } }
  const publish = async () => {
    if (!page) return
    setPublishing(true); setError(''); setPublishMessage('')
    try {
      let readyPage = page
      if (isDirty) {
        const path = homepage ? `${websitePath}/homepage` : `${websitePath}/pages/${key}`
        readyPage = await apiRequest<WebsitePageRecord>(path, { method: 'PATCH', body: JSON.stringify({ sections: sections.map((section, order) => ({ ...section, order })), expectedVersion: page.draftVersion }) })
        setPage(readyPage); setSections(readyPage.draftSections)
      }
      const updated = await apiRequest<WebsitePageRecord>(homepage ? `${websitePath}/homepage/publish` : `${websitePath}/pages/${key}/publish`, { method: 'POST' })
      setPage(updated); setSections(updated.draftSections); setSaved(false)
      setPublishMessage(`${homepage ? 'Homepage' : page.name} published successfully · version ${updated.publishedVersion}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to publish these changes.') }
    finally { setPublishing(false) }
  }
  const move = (index: number, direction: number) => { const next = [...sections]; const target = index + direction; if (target < 0 || target >= next.length) return;[next[index], next[target]] = [next[target], next[index]]; setSections(next); setSaved(false) }
  const movePickedProduct = (productIds: string[], index: number, direction: number) => { const next = [...productIds]; const target = index + direction; if (target < 0 || target >= next.length) return;[next[index], next[target]] = [next[target], next[index]]; change('productIds', next) }
  const changeCategoryOverride = (categoryId: string, field: string, value: string) => { const items = Array.isArray(selected?.settings.categoryItems) ? selected.settings.categoryItems as Record<string, string>[] : []; const existing = items.find(item => item.categoryId === categoryId) ?? { categoryId }; const next = items.filter(item => item.categoryId !== categoryId); change('categoryItems', [...next, { ...existing, [field]: value }]) }
  const addSection = (type: WebsiteSectionType) => { const section = makeSection(type, sections.length); setSections(current => [...current, section]); setSelectedId(section.id); setSaved(false) }
  const openRevisions = async () => { if (!page) return; try { const items = await apiRequest<any[]>(`${websitePath}/pages/${key}/revisions`); setRevisions(items) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load revision history.') } }
  const restoreRevision = async (revisionId: string) => { try { const updated = await apiRequest<WebsitePageRecord>(`${websitePath}/pages/${key}/revisions/${revisionId}/restore`, { method: 'POST' }); setPage(updated); setSections(updated.draftSections); setRevisions([]) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to restore the selected revision.') } }
  const schedule = async () => { if (!page || !scheduleAt) return; try { const updated = await apiRequest<WebsitePageRecord>(`${websitePath}/pages/${key}/schedule`, { method: 'POST', body: JSON.stringify({ publishAt: new Date(scheduleAt).toISOString() }) }); setPage(updated); setScheduleAt('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to schedule publication.') } }
  const isDirty = Boolean(page && JSON.stringify(sections) !== JSON.stringify(page.draftSections))
  if (!page) return <div className="admin-content"><PageHeader title={homepage ? 'Homepage Builder' : 'Page editor'} />{error || 'Loading page…'}</div>
  const textField = (label: string, field: string, multiline = false) => <label>{label}{multiline ? <textarea rows={3} value={String(selected?.settings[field] ?? '')} onChange={e => change(field, e.target.value)} /> : <input value={String(selected?.settings[field] ?? '')} onChange={e => change(field, e.target.value)} />}</label>
  return <div className="admin-content website-content"><PageHeader eyebrow={`WEBSITE / ${homepage ? 'HOMEPAGE BUILDER' : 'PAGE EDITOR'}`} title={homepage ? 'Homepage Builder' : page.name} action={<div className="website-header-actions"><Status value={page.status} /><button className="admin-button" onClick={openRevisions}>History</button><button className="admin-button" disabled={!isDirty} onClick={() => { setSections(page.draftSections); setSaved(false) }}>Discard</button><button className="admin-button primary" disabled={saving || !isDirty} onClick={() => void saveDraft()}><Save size={14} /> {saving ? 'Saving…' : 'Save draft'}</button><button className="admin-button" disabled={publishing} onClick={() => void publish()}>{publishing ? 'Publishing…' : 'Publish'}</button></div>} />{error && <div className="admin-alert" role="alert">{error}</div>}{publishMessage && <div className="admin-success" role="status">{publishMessage}</div>}{saved && <div className="admin-success" role="status">Draft saved. The public website still shows the published version.</div>}
    <div className="website-builder"><aside className="panel website-sections"><h2>Page sections</h2><p>Choose a section to edit its content. Drag or use arrow controls to reorder.</p>{sections.map((section, index) => <div className={`website-section-row${section.id === selectedId ? ' selected' : ''}`} key={section.id} draggable onDragStart={() => setDragSectionIndex(index)} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragSectionIndex !== null) { const next = [...sections]; const [item] = next.splice(dragSectionIndex, 1); next.splice(index, 0, item); setSections(next); setSaved(false) } setDragSectionIndex(null) }} onDragEnd={() => setDragSectionIndex(null)}><button className="website-section-select" onClick={() => setSelectedId(section.id)}><span className="section-grip">⠿</span><span>{section.title || sectionLabels[section.type]}<small>{section.enabled ? 'Visible' : 'Hidden'}</small></span></button><div><button aria-label="Move up" disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={13} /></button><button aria-label="Move down" disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></button></div></div>)}<label className="add-section-select">Add section<select defaultValue="" onChange={event => { if (event.target.value) addSection(event.target.value as WebsiteSectionType); event.target.value = '' }}><option value="" disabled>Select section type</option>{Object.entries(sectionLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label></aside>
      <section className={`panel website-preview website-preview-${mode}`}><div className="website-preview-toolbar"><b>Storefront preview</b><div>{['desktop', 'tablet', 'mobile'].map(value => <button className={mode === value ? 'active' : ''} key={value} onClick={() => setMode(value)}>{value}</button>)}</div></div><div className="website-preview-canvas"><div className="preview-store-header"><img className="preview-logo" src="/off-logo.svg" alt="OFF" /> <span>SHOP &nbsp;&nbsp; COLLECTIONS &nbsp;&nbsp; ABOUT</span></div>{sections.filter(item => item.enabled).sort((a, b) => a.order - b.order).map(item => { const image = String(item.settings.image || (item.type === 'editorial' ? defaultEditorialImage : '')); const feedPosts = Array.isArray(item.settings.instagramPosts) ? item.settings.instagramPosts as { imageUrl?: string }[] : globalInstagramPosts; return <article className={`preview-section preview-${item.type}`} key={item.id}>{image && <img src={mediaUrl(image)} alt="" />}{item.type === 'hero' && <small>{String(item.settings.eyebrow ?? '')}</small>}{item.type === 'instagram-feed' && <small>{String(item.settings.eyebrow || 'OFF / COMMUNITY')}</small>}<h2>{String(item.settings.heading ?? item.title)}</h2>{Boolean(item.settings.subtitle || item.settings.description) && <p>{String(item.settings.subtitle ?? item.settings.description)}</p>}{item.type === 'instagram-feed' && <div className="preview-instagram-grid">{feedPosts.slice(0, 4).map((post, index) => post.imageUrl ? <img src={mediaUrl(post.imageUrl)} alt="" key={`${item.id}-instagram-${index}`} /> : null)}</div>}{item.type.includes('product') || item.type === 'new-arrivals' ? <div className="preview-products">{(Array.isArray(item.settings.productIds) ? item.settings.productIds : products.filter(product => product.status === 'active').slice(0, 3).map(product => product._id)).slice(0, 3).map(id => { const product = products.find(record => record._id === id); return product ? <div key={id}><img src={product.images[0]?.url ?? ''} alt="" /><small>{product.name}</small></div> : null })}</div> : null}{Boolean(item.settings.buttonLabel) && <button>{String(item.settings.buttonLabel)}</button>}</article> })}<div className="preview-store-footer"><img className="preview-logo" src="/off-logo.svg" alt="OFF" /> · Considered pieces. Made to be lived in.</div></div></section>
      <aside className="panel website-section-settings"><h2>Section settings</h2>{selected ? <><label>Section name<input value={selected.title} onChange={e => { const value = e.target.value; setSections(current => current.map(item => item.id === selected.id ? { ...item, title: value } : item)); setSaved(false) }} /></label><label className="checkbox-label"><input type="checkbox" checked={selected.enabled} onChange={e => { setSections(current => current.map(item => item.id === selected.id ? { ...item, enabled: e.target.checked } : item)); setSaved(false) }} /> Visible on website</label>{textField('Heading', 'heading')}{selected.type === 'hero' && textField('Eyebrow', 'eyebrow')}{textField('Subtitle', 'subtitle', true)}{selected.type === 'featured-products' && <SelectionCardsEditor cards={Array.isArray(selected.settings.selectionCards) ? selected.settings.selectionCards as HomepageSelectionCard[] : defaultSelectionCards(products)} products={products} collections={collections} onChange={cards => change('selectionCards', cards)} />}{selected.type === 'instagram-feed' && <fieldset className="website-instagram-picker"><legend>Images Instagram</legend><p className="admin-note">Les images sont synchronisées avec cette section lors de la sauvegarde et de la publication. Ordre affiché de haut en bas · {selectedInstagramPosts.length}/12</p>{selectedInstagramPosts.map((post, index) => <div className="website-instagram-post" key={`instagram-post-${index}`}><label>URL de l’image<input type="url" value={post.imageUrl} onChange={event => updateInstagramPosts(selectedInstagramPosts.map((entry, entryIndex) => entryIndex === index ? { ...entry, imageUrl: event.target.value } : entry))} placeholder="https://… ou /media/…" /></label><div className="website-instagram-actions"><button type="button" className="admin-button compact" aria-label={`Monter l’image ${index + 1}`} title="Monter" disabled={!index} onClick={() => moveInstagramPost(index, -1)}><ArrowUp size={13} /></button><button type="button" className="admin-button compact" aria-label={`Descendre l’image ${index + 1}`} title="Descendre" disabled={index === selectedInstagramPosts.length - 1} onClick={() => moveInstagramPost(index, 1)}><ArrowDown size={13} /></button><button type="button" className="admin-button compact danger" aria-label={`Supprimer l’image ${index + 1}`} onClick={() => updateInstagramPosts(selectedInstagramPosts.filter((_, entryIndex) => entryIndex !== index))}><Trash2 size={13} /> Supprimer</button></div>{post.imageUrl && <img className="website-image-preview" src={mediaUrl(post.imageUrl)} alt={`Aperçu de l’image Instagram ${index + 1}`} />}</div>)}<button type="button" className="admin-button" disabled={selectedInstagramPosts.length >= 12} onClick={() => updateInstagramPosts([...selectedInstagramPosts, { imageUrl: '' }])}><Plus size={13} /> Ajouter une image</button></fieldset>}{selected.type !== 'newsletter' && textField('Description', 'description', true)}{selected.type !== 'newsletter' && <><label>Image URL or media URL<input value={String(selected.settings.image ?? '')} onChange={e => change('image', e.target.value)} placeholder="/media/… or https://…" /></label>{selected.settings.image && <img className="website-image-preview" src={mediaUrl(String(selected.settings.image))} alt="Preview" />}<label>Mobile image URL<input value={String(selected.settings.mobileImage ?? '')} onChange={e => change('mobileImage', e.target.value)} /></label></>}{textField('Button label', 'buttonLabel')}{textField('Button destination', 'destination')}{selected.type === 'collection' && <label>Collection<select value={String(selected.settings.collectionId ?? '')} onChange={e => change('collectionId', e.target.value)}><option value="">Select a collection</option>{collections.map(collection => <option key={collection._id} value={collection._id}>{collection.name}</option>)}</select></label>}{(selected.type === 'hero' || selected.type === 'featured-products' || selected.type === 'new-arrivals') && <><label>Product selection<select value={String(selected.settings.mode ?? 'automatic')} onChange={e => change('mode', e.target.value)}><option value="automatic">Automatic, newest published</option><option value="manual">Manual selection</option>{selected.type === 'new-arrivals' && <option value="collection">From a collection</option>}</select></label><p className="admin-note">Automatic shows the newest products up to the chosen count. Manual shows only checked products, in the order above.</p>{selected.settings.mode === 'collection' && <label>Collection<select value={String(selected.settings.collectionId ?? '')} onChange={e => change('collectionId', e.target.value)}><option value="">Select a collection</option>{collections.map(collection => <option key={collection._id} value={collection._id}>{collection.name}</option>)}</select></label>}{selected.settings.mode === 'manual' && <fieldset className="website-product-picker"><legend>Choose and order products</legend><p className="admin-note">{Array.isArray(selected.settings.productIds) ? (selected.settings.productIds as string[]).length : 0} selected · {Math.min(Array.isArray(selected.settings.productIds) ? (selected.settings.productIds as string[]).length : 0, Number(selected.settings.limit ?? 3))} will appear.</p>{(Array.isArray(selected.settings.productIds) ? selected.settings.productIds as string[] : []).map((id, index, allIds) => { const product = products.find(item => item._id === id); return product ? <div className="website-picked-product" key={id}><label className="checkbox-label"><input type="checkbox" checked onChange={() => change('productIds', allIds.filter(productId => productId !== id))} aria-label={`Uncheck ${product.name}`} />{product.name}</label><button type="button" aria-label="Move selected product up" disabled={!index} onClick={() => movePickedProduct(allIds, index, -1)}><ArrowUp size={12} /></button><button type="button" aria-label="Move selected product down" disabled={index === allIds.length - 1} onClick={() => movePickedProduct(allIds, index, 1)}><ArrowDown size={12} /></button></div> : null })}{products.filter(product => product.status === 'active').map(product => <label key={product._id}><input type="checkbox" checked={Array.isArray(selected.settings.productIds) && (selected.settings.productIds as string[]).includes(product._id)} onChange={e => { const current = Array.isArray(selected.settings.productIds) ? selected.settings.productIds as string[] : []; change('productIds', e.target.checked ? [...current, product._id] : current.filter(id => id !== product._id)) }} />{product.name}</label>)}</fieldset>}{selected.type === 'hero' && <HeroCutoutTools products={heroCutoutCandidates} images={heroCutoutMap} onChange={value => change('productImages', value)} />}<label>Number of products<input type="number" min="1" max="12" value={Number(selected.settings.limit ?? 3)} onChange={e => change('limit', Number(e.target.value))} /></label><label className="checkbox-label"><input type="checkbox" checked={Boolean(selected.settings.showPrices)} onChange={e => change('showPrices', e.target.checked)} /> Show prices</label></>}{selected.type === 'categories' && <fieldset className="website-product-picker"><legend>Homepage-only category images</legend>{siteCategories.map(category => { const override = (Array.isArray(selected.settings.categoryItems) ? selected.settings.categoryItems as Record<string, string>[] : []).find(item => item.categoryId === category._id) ?? { categoryId: category._id }; return <div className="website-category-override" key={category._id}><b>{category.name}</b><label>Display title<input value={override.title ?? ''} placeholder={category.name} onChange={e => changeCategoryOverride(category._id, 'title', e.target.value)} /></label><label>Image override<input value={override.image ?? ''} placeholder="Leave empty to use category image" onChange={e => changeCategoryOverride(category._id, 'image', e.target.value)} /></label><label>Description<input value={override.description ?? ''} onChange={e => changeCategoryOverride(category._id, 'description', e.target.value)} /></label><label>Destination<input value={override.destination ?? ''} placeholder={`/shop?category=${encodeURIComponent(category.name)}`} onChange={e => changeCategoryOverride(category._id, 'destination', e.target.value)} /></label></div> })}</fieldset>}{selected.type === 'hero' && <><label>Text alignment<select value={String(selected.settings.alignment ?? 'left')} onChange={e => change('alignment', e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overlay intensity<select value={String(selected.settings.overlay ?? 20)} onChange={e => change('overlay', Number(e.target.value))}><option value="0">None</option><option value="20">Soft</option><option value="45">Medium</option><option value="70">Strong</option></select></label></>}{selected.type === 'featured-release' && textField('Release name or URL reference', 'releaseId')}<button className="admin-button danger" onClick={() => { if (window.confirm('Remove this section from the draft?')) { setSections(current => current.filter(item => item.id !== selected.id)); setSelectedId(sections.find(item => item.id !== selected.id)?.id ?? '') } }}>Delete section</button></> : <p className="admin-note">Select or add a section to edit its settings.</p>}</aside>
    </div>{revisions.length > 0 && <div className="panel website-revisions"><h2>Revision history</h2>{revisions.map(revision => <div key={revision._id}><span>Version {revision.version} · {revision.status} · {formatDateTime(revision.createdAt)}</span><button className="admin-button compact" onClick={() => void restoreRevision(revision._id)}>Restore to draft</button></div>)}</div>}
    <div className="website-schedule-row"><label>Schedule publication<input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} /></label><button className="admin-button" disabled={!scheduleAt} onClick={() => void schedule()}>Schedule</button></div>
  </div>
}

function WebsiteNavigation() {
  type NavShape = { headerItems: { label: string; destination: string; enabled: boolean }[]; footerGroups: { title: string; links: { label: string; destination: string }[] }[] }
  const [navigation, setNavigation] = useState<NavShape>({ headerItems: [], footerGroups: [] })
  const [version, setVersion] = useState(1)
  const [error, setError] = useState(''); const [message, setMessage] = useState('')
  useEffect(() => { apiRequest<{ navigation: NavShape; version: number }>(`${websitePath}/navigation`).then(value => { setVersion(value.version); setNavigation({ headerItems: value.navigation.headerItems.length ? value.navigation.headerItems : [{ label: 'Shop', destination: '/shop', enabled: true }, { label: 'Collections', destination: '/collections', enabled: true }, { label: 'About OFF', destination: '/about', enabled: true }, { label: 'Contact', destination: '/contact', enabled: true }], footerGroups: value.navigation.footerGroups ?? [] }) }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load navigation.')) }, [])
  const save = async (publish = false) => { setError(''); setMessage(''); try { const result = await apiRequest<{ navigation: NavShape; version: number }>(`${websitePath}/navigation`, { method: 'PATCH', body: JSON.stringify({ navigation, expectedVersion: version }) }); setVersion(result.version); if (publish) await apiRequest(`${websitePath}/settings/publish`, { method: 'POST' }); setMessage(publish ? 'Navigation changes published.' : 'Navigation draft saved.') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save navigation.') } }
  const reorder = <T,>(items: T[], index: number, direction: -1 | 1) => { const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next }
  const updateFooterLink = (groupIndex: number, linkIndex: number, field: 'label' | 'destination', value: string) => setNavigation(current => ({ ...current, footerGroups: current.footerGroups.map((group, i) => i !== groupIndex ? group : { ...group, links: group.links.map((link, j) => j === linkIndex ? { ...link, [field]: value } : link) }) }))
  return <div className="admin-content website-content"><PageHeader eyebrow="WEBSITE / GLOBAL CONTENT" title="Navigation & Footer" action={<><button className="admin-button" onClick={() => void save()}>Save draft</button><button className="admin-button primary" onClick={() => void save(true)}>Publish</button></>} />{error && <div className="admin-alert">{error}</div>}{message && <div className="admin-success">{message}</div>}
    <section className="panel website-settings-panel"><h2>Header navigation</h2><p>OFF logo and account, search, and cart controls stay connected to the store.</p>{navigation.headerItems.map((item, index) => <div className="website-link-edit website-header-link-edit" key={index}><input aria-label="Navigation label" value={item.label} onChange={e => setNavigation(current => ({ ...current, headerItems: current.headerItems.map((entry, i) => i === index ? { ...entry, label: e.target.value } : entry) }))} /><input aria-label="Destination" value={item.destination} onChange={e => setNavigation(current => ({ ...current, headerItems: current.headerItems.map((entry, i) => i === index ? { ...entry, destination: e.target.value } : entry) }))} /><label className="checkbox-label"><input type="checkbox" checked={item.enabled} onChange={e => setNavigation(current => ({ ...current, headerItems: current.headerItems.map((entry, i) => i === index ? { ...entry, enabled: e.target.checked } : entry) }))} />Visible</label><div className="website-order-controls"><button className="admin-button compact" aria-label="Move navigation item up" title="Move up" disabled={!index} onClick={() => setNavigation(current => ({ ...current, headerItems: reorder(current.headerItems, index, -1) }))}><ArrowUp size={13} /></button><button className="admin-button compact" aria-label="Move navigation item down" title="Move down" disabled={index === navigation.headerItems.length - 1} onClick={() => setNavigation(current => ({ ...current, headerItems: reorder(current.headerItems, index, 1) }))}><ArrowDown size={13} /></button></div><button className="admin-button compact" onClick={() => setNavigation(current => ({ ...current, headerItems: current.headerItems.filter((_, i) => i !== index) }))}>Remove</button></div>)}<button className="admin-button" onClick={() => setNavigation(current => ({ ...current, headerItems: [...current.headerItems, { label: 'New link', destination: '/shop', enabled: true }] }))}><Plus size={13} /> Add navigation link</button></section>
    <section className="panel website-settings-panel"><h2>Footer link groups</h2>{navigation.footerGroups.map((group, groupIndex) => <div className="website-footer-group" key={groupIndex}><div className="website-footer-group-heading"><label>Group title<input value={group.title} onChange={e => setNavigation(current => ({ ...current, footerGroups: current.footerGroups.map((entry, i) => i === groupIndex ? { ...entry, title: e.target.value } : entry) }))} /></label><div className="website-order-controls"><button className="admin-button compact" aria-label="Move footer group up" title="Move up" disabled={!groupIndex} onClick={() => setNavigation(current => ({ ...current, footerGroups: reorder(current.footerGroups, groupIndex, -1) }))}><ArrowUp size={13} /></button><button className="admin-button compact" aria-label="Move footer group down" title="Move down" disabled={groupIndex === navigation.footerGroups.length - 1} onClick={() => setNavigation(current => ({ ...current, footerGroups: reorder(current.footerGroups, groupIndex, 1) }))}><ArrowDown size={13} /></button></div></div>{group.links.map((link, linkIndex) => <div className="website-link-edit" key={linkIndex}><input aria-label="Footer label" value={link.label} onChange={e => updateFooterLink(groupIndex, linkIndex, 'label', e.target.value)} /><input aria-label="Footer destination" value={link.destination} onChange={e => updateFooterLink(groupIndex, linkIndex, 'destination', e.target.value)} /><div className="website-order-controls"><button className="admin-button compact" aria-label="Move footer link up" title="Move up" disabled={!linkIndex} onClick={() => setNavigation(current => ({ ...current, footerGroups: current.footerGroups.map((entry, i) => i !== groupIndex ? entry : { ...entry, links: reorder(entry.links, linkIndex, -1) }) }))}><ArrowUp size={13} /></button><button className="admin-button compact" aria-label="Move footer link down" title="Move down" disabled={linkIndex === group.links.length - 1} onClick={() => setNavigation(current => ({ ...current, footerGroups: current.footerGroups.map((entry, i) => i !== groupIndex ? entry : { ...entry, links: reorder(entry.links, linkIndex, 1) }) }))}><ArrowDown size={13} /></button></div><button className="admin-button compact danger" onClick={() => setNavigation(current => ({ ...current, footerGroups: current.footerGroups.map((entry, i) => i === groupIndex ? { ...entry, links: entry.links.filter((_, j) => j !== linkIndex) } : entry) }))}>Remove</button></div>)}<button className="admin-button compact" onClick={() => setNavigation(current => ({ ...current, footerGroups: current.footerGroups.map((entry, i) => i === groupIndex ? { ...entry, links: [...entry.links, { label: 'New link', destination: '/shop' }] } : entry) }))}><Plus size={12} /> Add link</button></div>)}<button className="admin-button" onClick={() => setNavigation(current => ({ ...current, footerGroups: [...current.footerGroups, { title: 'Information', links: [] }] }))}><Plus size={13} /> Add footer group</button><p className="admin-note">Use secure https destinations for external social profiles. Labels and destinations are validated by the API.</p></section>
  </div>
}

function WebsiteGlobalSettings() {
  const [record, setRecord] = useState<any>(null); const [error, setError] = useState(''); const [saved, setSaved] = useState('')
  useEffect(() => { apiRequest<any>(`${websitePath}/settings`).then(setRecord).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load website settings.')) }, [])
  const update = (field: string, value: unknown) => { setRecord((current: any) => ({ ...current, draft: { ...(current?.draft ?? {}), settings: { ...(current?.draft?.settings ?? {}), [field]: value } } })); setSaved('') }
  const save = async (publish = false) => { try { const response = await apiRequest<any>(`${websitePath}/settings`, { method: 'PATCH', body: JSON.stringify({ settings: record?.draft?.settings ?? {}, expectedVersion: record?.draftVersion ?? 1 }) }); setRecord(response); if (publish) { const published = await apiRequest<any>(`${websitePath}/settings/publish`, { method: 'POST' }); setRecord(published) } setSaved(publish ? 'Website settings published.' : 'Draft saved.'); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save settings.') } }
  if (!record) return <div className="admin-content"><PageHeader title="Website Settings" />{error || 'Loading settings…'}</div>
  const settings = record.draft?.settings ?? {}
  return <div className="admin-content website-content"><PageHeader eyebrow="WEBSITE / SETTINGS" title="Website Settings" action={<><button className="admin-button" onClick={() => void save()}>Save draft</button><button className="admin-button primary" onClick={() => void save(true)}>Publish</button></>} />{error && <div className="admin-alert">{error}</div>}{saved && <div className="admin-success">{saved}</div>}<form className="panel management-form website-settings-panel" onSubmit={event => { event.preventDefault(); void save() }}><h2>Announcement bar</h2><label className="checkbox-label"><input type="checkbox" checked={settings.announcementEnabled !== false} onChange={e => update('announcementEnabled', e.target.checked)} /> Show announcement bar</label><label>Announcement text<input maxLength={160} value={String(settings.announcement ?? '')} onChange={e => update('announcement', e.target.value)} /></label><label>Destination<input value={String(settings.announcementDestination ?? '')} onChange={e => update('announcementDestination', e.target.value)} placeholder="/shop" /></label><label>Background color<select value={String(settings.announcementBackground ?? 'dark')} onChange={e => update('announcementBackground', e.target.value)}><option value="dark">OFF black</option><option value="sage">Sage</option><option value="sand">Sand</option><option value="white">White</option></select></label><h2>Header controls</h2><label className="checkbox-label"><input type="checkbox" checked={settings.showSearch !== false} onChange={e => update('showSearch', e.target.checked)} /> Show search</label><label className="checkbox-label"><input type="checkbox" checked={settings.showAccount !== false} onChange={e => update('showAccount', e.target.checked)} /> Show account</label><label className="checkbox-label"><input type="checkbox" checked={settings.showCart !== false} onChange={e => update('showCart', e.target.checked)} /> Show cart</label><label>Logo size<input type="range" min="18" max="32" value={Number(settings.logoSize ?? 24)} onChange={e => update('logoSize', Number(e.target.value))} /></label><h2>Footer details</h2><label>Newsletter heading<input maxLength={120} value={String(settings.newsletterHeading ?? '')} onChange={e => update('newsletterHeading', e.target.value)} /></label><label>Contact email<input type="email" maxLength={254} value={String(settings.contactEmail ?? '')} onChange={e => update('contactEmail', e.target.value)} /></label><label>Copyright text<input maxLength={180} value={String(settings.copyright ?? '')} onChange={e => update('copyright', e.target.value)} /></label><h2>WhatsApp & social links</h2><label>WhatsApp number (international format)<input type="tel" maxLength={32} value={String(settings.whatsappNumber ?? '')} onChange={e => update('whatsappNumber', e.target.value)} placeholder="+216 00 000 000" /></label><label>Instagram URL<input type="url" value={String(settings.instagramUrl ?? '')} onChange={e => update('instagramUrl', e.target.value)} placeholder="https://instagram.com/yourbrand" /></label><label>Instagram feed images (one image URL and optional post URL per line)<textarea rows={4} value={(Array.isArray(settings.instagramPosts) ? settings.instagramPosts : []).map((post: { imageUrl: string; postUrl?: string }) => [post.imageUrl, post.postUrl].filter(Boolean).join(' | ')).join("`n")} onChange={e => update('instagramPosts', e.target.value.split(/\r?\n/).map(line => { const [imageUrl, postUrl] = line.split('|').map(value => value.trim()); return imageUrl ? { imageUrl, ...(postUrl ? { postUrl } : {}) } : null }).filter(Boolean).slice(0, 12))} placeholder="Image URL | Instagram post URL" /></label><p className="admin-note">Paste up to 12 public image URLs from Instagram. Add the post URL after the | character. Save and publish Website Settings to update the feed.</p><label>Facebook URL<input type="url" value={String(settings.facebookUrl ?? '')} onChange={e => update('facebookUrl', e.target.value)} placeholder="https://facebook.com/yourbrand" /></label><label>TikTok URL<input type="url" value={String(settings.tiktokUrl ?? '')} onChange={e => update('tiktokUrl', e.target.value)} placeholder="https://tiktok.com/@yourbrand" /></label><p className="admin-note">Account and administrative pages are never indexed. The OFF logo is fixed to preserve the brand.</p><button className="admin-button primary">Save draft</button></form></div>
}

function WebsiteMedia() {
  const [items, setItems] = useState<MediaRecord[]>([]); const [query, setQuery] = useState(''); const [mimeFilter, setMimeFilter] = useState('all'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const refresh = () => apiRequest<MediaRecord[]>(`${websitePath}/media`).then(setItems).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load media.'))
  useEffect(() => { void refresh() }, [])
  const upload = async (file?: File) => { if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 8 * 1024 * 1024) { setError('Use a JPEG, PNG, WebP or AVIF image under 8 MB.'); return } setBusy(true); setError(''); try { const asset = await apiRequest<MediaRecord>(`${websitePath}/media`, { method: 'POST', body: await file.arrayBuffer(), headers: { 'Content-Type': file.type, 'X-File-Name': file.name } }); setItems(current => [asset, ...current]) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.') } finally { setBusy(false) } }
  const setAlt = async (item: MediaRecord, altText: string) => { try { const updated = await apiRequest<MediaRecord>(`${websitePath}/media/${item._id}`, { method: 'PATCH', body: JSON.stringify({ altText }) }); setItems(current => current.map(asset => asset._id === item._id ? updated : asset)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update image text.') } }
  const replaceImage = async (item: MediaRecord, file?: File) => { if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 8 * 1024 * 1024) { setError('Use a JPEG, PNG, WebP or AVIF image under 8 MB.'); return } try { const updated = await apiRequest<MediaRecord>(`${websitePath}/media/${item._id}/replace`, { method: 'POST', body: await file.arrayBuffer(), headers: { 'Content-Type': file.type, 'X-File-Name': file.name } }); setItems(current => current.map(asset => asset._id === item._id ? updated : asset)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to replace the image.') } }
  const remove = async (item: MediaRecord) => { try { await apiRequest(`${websitePath}/media/${item._id}`, { method: 'DELETE' }); setItems(current => current.filter(asset => asset._id !== item._id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Image cannot be deleted while it is in use.') } }
  const filtered = items.filter(item => item.fileName.toLowerCase().includes(query.toLowerCase()) && (mimeFilter === 'all' || item.mimeType === mimeFilter))
  return <div className="admin-content website-content"><PageHeader eyebrow="WEBSITE / ASSETS" title="Media Library" action={<label className={`admin-button primary${busy ? ' disabled' : ''}`}>{busy ? 'Uploading…' : <><Plus size={14} /> Upload image</>}<input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.currentTarget.value = '' }} /></label>} />{error && <div className="admin-alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}<div className="list-toolbar website-media-toolbar"><label className="admin-search"><Search size={14} /><input placeholder="Search file names…" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="Filter media type" value={mimeFilter} onChange={e => setMimeFilter(e.target.value)}><option value="all">All image types</option>{['image/jpeg', 'image/png', 'image/webp', 'image/avif'].map(type => <option key={type} value={type}>{type.replace('image/', '').toUpperCase()}</option>)}</select><span>{filtered.length} images · 8 MB max</span></div><div className="website-media-grid">{filtered.map(item => <article className="panel website-media-card" key={item._id}><div className="website-media-image"><img src={mediaUrl(item.url)} alt={item.altText} /></div><b>{item.fileName}</b><small>{(item.fileSize / 1024).toFixed(0)} KB · {item.mimeType} · {item.width || '—'} × {item.height || '—'}</small><small>{item.usageReferences?.length ? `Used in: ${item.usageReferences.join(', ')}` : 'Not used by saved pages'}</small><label>Alternative text<input defaultValue={item.altText} maxLength={300} onBlur={e => { if (e.target.value !== item.altText) void setAlt(item, e.target.value) }} /></label><div><button className="admin-button compact" onClick={() => void navigator.clipboard.writeText(mediaUrl(item.url))}>Copy URL</button><label className="admin-button compact">Replace<input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => { void replaceImage(item, e.target.files?.[0]); e.currentTarget.value = '' }} /></label><button className="admin-button compact danger" disabled={Boolean(item.usageReferences?.length)} title={item.usageReferences?.length ? 'This image is in use.' : ''} onClick={() => void remove(item)}>Delete</button></div></article>)}{!filtered.length && <div className="panel table-empty">No images found. Upload a visual to begin your library.</div>}</div><p className="admin-note">Image files are kept in the API media folder; MongoDB stores their metadata and references. Connect cloud storage before deploying across multiple servers.</p></div>
}

function WebsiteMerchandising() {
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [collections, setCollections] = useState<ApiCollection[]>([])
  const [scope, setScope] = useState('global')
  const [ids, setIds] = useState<string[]>([])
  const [version, setVersion] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  useEffect(() => { Promise.all([apiRequest<ApiProduct[]>('/admin-preview/products'), apiRequest<ApiCategory[]>('/admin-preview/categories'), apiRequest<ApiCollection[]>('/admin-preview/collections')]).then(([productItems, categoryItems, collectionItems]) => { setProducts(productItems); setCategories(categoryItems); setCollections(collectionItems) }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load products.')) }, [])
  useEffect(() => { let cancelled = false; apiRequest<{ productIds: string[]; version: number }>(`${websitePath}/merchandising/${scope}`).then(result => { if (cancelled) return; const candidates = products.filter(product => scope === 'global' || scope === 'homepage' || scope.startsWith('category:') && product.categoryId === scope.slice(9) || scope.startsWith('collection:') && collections.find(collection => String(collection._id) === scope.slice(11))?.productIds.includes(product._id)).map(product => product._id); setIds(result.productIds.length ? [...result.productIds, ...candidates.filter(id => !result.productIds.includes(id))] : candidates); setVersion(result.version) }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load product order.') }); return () => { cancelled = true } }, [scope, products, collections])
  const candidateProducts = products.filter(product => scope === 'global' || scope === 'homepage' || scope.startsWith('category:') && product.categoryId === scope.slice(9) || scope.startsWith('collection:') && Boolean(collections.find(collection => String(collection._id) === scope.slice(11))?.productIds.includes(product._id)))
  const ordered = ids.map(id => candidateProducts.find(product => product._id === id)).filter((product): product is ApiProduct => Boolean(product))
  const reorder = (from: number, to: number) => { if (to < 0 || to >= ids.length || from === to) return; const next = [...ids]; const [item] = next.splice(from, 1); next.splice(to, 0, item); setIds(next); setMessage('') }
  const save = async (publish = false) => { setBusy(true); setError(''); setMessage(''); try { const result = await apiRequest<{ productIds: string[]; version: number }>(`${websitePath}/merchandising/${scope}`, { method: 'PUT', body: JSON.stringify({ productIds: ids, expectedVersion: version }) }); setIds(result.productIds); setVersion(result.version); if (publish) await apiRequest(`${websitePath}/merchandising/${scope}/publish`, { method: 'POST' }); setMessage(publish ? 'Product order saved and published.' : 'Product order saved as draft.') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save product order.') } finally { setBusy(false) } }
  const cancel = () => { apiRequest<{ productIds: string[]; version: number }>(`${websitePath}/merchandising/${scope}`).then(result => { setIds(result.productIds.length ? result.productIds : candidateProducts.map(product => product._id)); setVersion(result.version); setMessage('Changes discarded.') }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to reload saved order.')) }
  return <div className="admin-content website-content"><PageHeader eyebrow="WEBSITE / MERCHANDISING" title="Manual product order" action={<><button className="admin-button" disabled={busy} onClick={cancel}>Cancel</button><button className="admin-button" disabled={busy} onClick={() => void save(false)}>Save draft</button><button className="admin-button primary" disabled={busy} onClick={() => void save(true)}>{busy ? 'Saving…' : 'Save & Publish'}</button></>} />{error && <div className="admin-alert" role="alert">{error}</div>}{message && <div className="admin-success" role="status">{message}</div>}<section className="panel website-settings-panel"><h2>Ordering scope</h2><p>Each order is independent. Customer price or date sorting never changes these saved priorities.</p><label>Products shown in<select value={scope} onChange={e => setScope(e.target.value)}><option value="global">Global catalog</option><option value="homepage">Homepage curation</option>{categories.map(category => <option key={category._id} value={`category:${category._id}`}>Category · {category.name}</option>)}{collections.map(collection => <option key={collection._id} value={`collection:${collection._id}`}>Collection · {collection.name}</option>)}</select></label></section><section className="panel list-panel website-merch-list"><div className="panel-heading"><div><h2>Product order</h2><p>Drag a row or use the arrow controls to move it.</p></div><span>{ordered.length} products</span></div><div className="website-merch-items">{ordered.map((product, index) => <div className="website-merch-row" key={product._id} draggable onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragIndex !== null) reorder(dragIndex, index); setDragIndex(null) }} onDragEnd={() => setDragIndex(null)}><span className="section-grip" aria-hidden="true">⠿</span><span className="website-merch-rank">{String(index + 1).padStart(2, '0')}</span>{product.images[0]?.url && <img src={product.images[0].url} alt="" />}<div><b>{product.name}</b><small>{product.category} · {product.status}</small></div><button className="admin-button compact" aria-label={`Move ${product.name} up`} disabled={!index} onClick={() => reorder(index, index - 1)}><ArrowUp size={13} /></button><button className="admin-button compact" aria-label={`Move ${product.name} down`} disabled={index === ordered.length - 1} onClick={() => reorder(index, index + 1)}><ArrowDown size={13} /></button></div>)}{!ordered.length && <div className="table-empty">There are no products in this ordering scope.</div>}</div></section><p className="admin-note">Storefront customers can choose “Manual Order” alongside Featured, Newest, and price sorting. Collection order also preserves its existing collection membership.</p></div>
}

function WebsiteScheduled() {
  const [pages, setPages] = useState<WebsitePageRecord[]>([]); const [error, setError] = useState('')
  useEffect(() => { apiRequest<WebsitePageRecord[]>(`${websitePath}/pages`).then(setPages).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load scheduled pages.')) }, [])
  const scheduled = pages.filter(page => page.status === 'scheduled')
  const cancel = async (page: WebsitePageRecord) => { try { const updated = await apiRequest<WebsitePageRecord>(`${websitePath}/pages/${page._id}/schedule/cancel`, { method: 'POST' }); setPages(current => current.map(item => item._id === page._id ? updated : item)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to cancel this publication.') } }
  return <div className="admin-content website-content"><PageHeader eyebrow="WEBSITE / PUBLISHING" title="Scheduled Publications" />{error && <div className="admin-alert">{error}</div>}<section className="panel list-panel"><div className="table-scroll"><table><thead><tr><th>PAGE</th><th>PUBLICATION DATE</th><th>DRAFT VERSION</th><th></th></tr></thead><tbody>{scheduled.map(page => <tr key={page._id}><td><b>{page.name}</b></td><td>{formatDateTime(page.scheduledAt)}</td><td>{page.draftVersion}</td><td><button className="admin-button compact" onClick={() => void cancel(page)}>Cancel schedule</button><Link className="admin-button compact" to={page.slug === 'home' ? '/website/homepage' : `/website/pages/${page._id}/editor`}>Edit</Link></td></tr>)}</tbody></table>{!scheduled.length && <div className="table-empty">No publications are scheduled.</div>}</div></section><p className="admin-note">Scheduled pages publish when the API scheduler runs at the selected time.</p></div>
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    const token = sessionStorage.getItem(adminTokenKey)
    const handleUnauthorized = () => { setAuthenticated(false); setChecking(false) }
    window.addEventListener('off-admin-unauthorized', handleUnauthorized)
    if (!token) {
      setChecking(false)
    } else {
      apiRequest<{ email: string }>('/auth/me')
        .then(() => setAuthenticated(true))
        .catch(() => { sessionStorage.removeItem(adminTokenKey); setAuthenticated(false) })
        .finally(() => setChecking(false))
    }
    return () => window.removeEventListener('off-admin-unauthorized', handleUnauthorized)
  }, [])
  const signOut = () => {
    sessionStorage.removeItem(adminTokenKey)
    setAuthenticated(false)
  }
  if (checking) return <main className="admin-signin"><p>Checking administrator session…</p></main>
  return authenticated ? <AdminLayout onSignOut={signOut} /> : <AdminSignIn onSignedIn={() => setAuthenticated(true)} />
}
