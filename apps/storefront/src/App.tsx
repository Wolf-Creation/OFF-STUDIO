import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type WheelEvent as ReactWheelEvent } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClerkProvider, useAuth, useUser } from '@clerk/react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, Heart, Instagram, LoaderCircle, Menu, Minus, Plus, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import type { ApiCategory, ApiProduct, ApiResponse, CashOnDeliveryOrderRequest, CashOnDeliveryOrderResponse, ProductVariant, StoreCollection, StoreContent } from '@off/shared-types'
import { TUNISIA_LOCATIONS } from '@off/shared-types/tunisia-locations'
import { CustomerAccountExperience } from './CustomerAccountExperience'
import { AnimatedLogo2 } from './AnimatedLogo2'

export type Product = { id: string; slug: string; name: string; price: number; category: string; color: string; image: string; gallery: string[]; heroImage?: string; secondary: string; sizes: string[]; variants: ProductVariant[]; createdAt?: string; isNew?: boolean }
type SelectionCardSettings = { title: string; description: string; productId: string; collectionId: string; background: string; destination: string }
const defaultSelectionCards = [
  { title: 'MEN', description: 'A considered uniform.', slug: 'leather-jacket', background: '#e5e2dc' },
  { title: 'WOMEN', description: 'Form meets function.', slug: 'distressed-denim-jeans', background: '#e5e2dc' },
  { title: 'ACCESSORIES', description: 'The finishing pieces.', slug: 'ma-cap', background: '#d9d5cb' },
]
type BagItem = { productId: string; quantity: number; size: string; color: string; sku: string; name: string; price: number; image: string }
type CheckoutSavedAddress = { _id: string; label: string; fullName: string; phoneNumber: string; addressLine1: string; addressLine2: string; city: string; postalCode: string; country: string; governorate: string; delegation: string; isDefault: boolean }
type CheckoutFormValues = { email: string; firstName: string; lastName: string; phoneNumber: string; line1: string; line2: string; postalCode: string; governorate: string; delegation: string }
type Category = { id: string; name: string; slug: string; image: string; productCount: number }
type CatalogState = { products: Product[]; categories: Category[]; collections: StoreCollection[]; content: StoreContent; homeSections: { id: string; type: string; title: string; enabled: boolean; order: number; settings: Record<string, unknown> }[]; websiteSettings: Record<string, unknown>; navigation: { headerItems: { label: string; destination: string; enabled: boolean }[]; footerGroups: { title: string; links: { label: string; destination: string }[] }[] } | null; loading: boolean; error: string; reload: () => void }
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api/v1'
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
const ORBIT_STEP_DURATION_MS = 8000
const FAST_ORBIT_STEP_DURATION_MS = 1000
const heroCutouts: Record<string, string> = {
  'logo-t-shirt': '/hero-ai/logo-t-shirt-ai.png',
  'ma-quaad-jacket': '/slider/ma-quaad-jacket.png',
  'ma-cap': '/hero-ai/ma-cap-ai.png',
  'distressed-denim-jeans': '/hero-ai/distressed-denim-jeans-ai.png',
  'leather-jacket': '/hero-ai/leather-jacket-ai.png',
  'skeleton-sneakers': '/hero-ai/skeleton-sneakers-ai.png',
}
const productAlphaPixels = new WeakMap<HTMLImageElement, Uint8ClampedArray>()

function isVisibleProductPixel(image: HTMLImageElement, clientX: number, clientY: number) {
  const bounds = getContainedImageBounds(image)
  if (!bounds || image.naturalWidth === 0 || image.naturalHeight === 0) return false
  const xRatio = (clientX - bounds.left) / bounds.width
  const yRatio = (clientY - bounds.top) / bounds.height
  if (xRatio < 0 || xRatio >= 1 || yRatio < 0 || yRatio >= 1) return false
  const scale = 128 / Math.max(image.naturalWidth, image.naturalHeight)
  const imageWidth = image.naturalWidth * scale
  const imageHeight = image.naturalHeight * scale
  const offsetX = (128 - imageWidth) / 2
  const offsetY = (128 - imageHeight) / 2
  const x = Math.floor(offsetX + xRatio * imageWidth)
  const y = Math.floor(offsetY + yRatio * imageHeight)
  try {
    let pixels = productAlphaPixels.get(image)
    if (!pixels) {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return true
      context.drawImage(image, offsetX, offsetY, imageWidth, imageHeight)
      pixels = context.getImageData(0, 0, 128, 128).data
      productAlphaPixels.set(image, pixels)
    }
    return pixels[(y * 128 + x) * 4 + 3] > 28
  } catch {
    return true
  }
}
function getVisibleProductImageAtPoint(clientX: number, clientY: number) {
  return document.elementsFromPoint(clientX, clientY).find(
    (element): element is HTMLImageElement =>
      element instanceof HTMLImageElement &&
      element.matches('.hero-showcase-image') &&
      isVisibleProductPixel(element, clientX, clientY),
  ) ?? null
}
type ImageBounds = { left: number; top: number; width: number; height: number }
const getContainedImageBounds = (image: HTMLImageElement): ImageBounds | null => {
  const bounds = image.getBoundingClientRect()
  if (!bounds.width || !bounds.height || !image.naturalWidth || !image.naturalHeight) return null
  const imageRatio = image.naturalWidth / image.naturalHeight
  const boundsRatio = bounds.width / bounds.height
  const width = boundsRatio > imageRatio ? bounds.height * imageRatio : bounds.width
  const height = boundsRatio > imageRatio ? bounds.height : bounds.width / imageRatio
  return {
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
    height,
  }
}
function getHeroProductImageAtPoint(clientX: number, clientY: number) {
  const visibleImage = getVisibleProductImageAtPoint(clientX, clientY)
  if (visibleImage) return visibleImage
  return [...document.querySelectorAll<HTMLImageElement>(
    '.hero-showcase-item:not(.hero-showcase-item--active) .hero-showcase-image',
  )].find(image => {
    const bounds = getContainedImageBounds(image)
    return bounds
      && clientX >= bounds.left
      && clientX <= bounds.left + bounds.width
      && clientY >= bounds.top
      && clientY <= bounds.top + bounds.height
  }) ?? null
}
const defaultContent: StoreContent = {
  announcement: 'Complimentary shipping on orders over 500 TND',
  heroEyebrow: '',
  heroTitle: '',
  heroSubtitle: '',
  campaignEyebrow: 'THE OFF UNIFORM',
  campaignTitle: 'Made for the everyday.',
  freeShippingThreshold: 500,
  supportEmail: '',
}
const publicMediaUrl = (url: string) => url.startsWith('/') ? `${API_BASE_URL.replace(/\/api\/v1$/, '')}${url}` : url
const CatalogContext = createContext<CatalogState | null>(null)
type GuestWishlistState = { ids: string[]; toggle: (productId: string) => void }
const GuestWishlistContext = createContext<GuestWishlistState | null>(null)
const GUEST_WISHLIST_STORAGE_KEY = 'off-guest-wishlist'
const photo = (id: string, width = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`
const formatTnd = (value: number) => `${new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 3 }).format(value)} TND`
const colorStyle = (variantColor: string) => /white|stone|sand|cream/i.test(variantColor) ? '#d8d1c6' : /blue/i.test(variantColor) ? '#66788b' : /olive|green/i.test(variantColor) ? '#7d8078' : '#171717'

function applyCheckoutAddress(form: CheckoutFormValues, address: CheckoutSavedAddress): CheckoutFormValues {
  const [firstName = '', ...lastNameParts] = address.fullName.trim().split(/\s+/)
  const governorate = Object.prototype.hasOwnProperty.call(TUNISIA_LOCATIONS, address.governorate) ? address.governorate : Object.keys(TUNISIA_LOCATIONS)[0]
  const options = TUNISIA_LOCATIONS[governorate] ?? []
  const delegation = options.includes(address.delegation) ? address.delegation : options.includes(address.city) ? address.city : options[0] ?? ''
  return { ...form, firstName, lastName: lastNameParts.join(' '), phoneNumber: address.phoneNumber, line1: address.addressLine1, line2: address.addressLine2, postalCode: address.postalCode, governorate, delegation }
}

function mapProduct(item: ApiProduct): Product {
  const variants = item.variants ?? []
  return {
    id: item._id,
    slug: item.slug,
    name: item.name,
    price: item.price,
    category: item.category,
    color: variants.find((variant) => variant.active)?.color ?? '',
    image: item.images?.[0]?.url ?? '',
    gallery: [...new Set((item.images ?? []).map(image => image.url).filter(Boolean))],
    heroImage: (() => { const generatedImage = item.images?.find(image => /AI-generated studio product photo/i.test(image.alt))?.url; return generatedImage ? publicMediaUrl(generatedImage) : heroCutouts[item.slug] })(),
    secondary: variants.find((variant) => variant.active && variant.image)?.image ?? item.images?.[0]?.url ?? '',
    sizes: [...new Set(variants.filter((variant) => variant.active && variant.stock > 0).map((variant) => variant.size))],
    variants,
    createdAt: item.createdAt,
    isNew: item.createdAt ? Date.now() - Date.parse(item.createdAt) < 30 * 24 * 60 * 60 * 1000 : false,
  }
}

function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [collections, setCollections] = useState<StoreCollection[]>([])
  const [content, setContent] = useState<StoreContent>(defaultContent)
  const [homeSections, setHomeSections] = useState<CatalogState['homeSections']>([])
  const [websiteSettings, setWebsiteSettings] = useState<Record<string, unknown>>({})
  const [navigation, setNavigation] = useState<CatalogState['navigation']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestId, setRequestId] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [productResponse, categoryResponse, collectionResponse, contentResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/products?limit=100`, { signal: controller.signal }),
          fetch(`${API_BASE_URL}/categories`, { signal: controller.signal }),
          fetch(`${API_BASE_URL}/collections`, { signal: controller.signal }),
          fetch(`${API_BASE_URL}/store/content`, { signal: controller.signal }),
        ])
        if (!productResponse.ok || !categoryResponse.ok || !collectionResponse.ok || !contentResponse.ok) {
          throw new Error(`Store API request failed (${productResponse.status}/${categoryResponse.status}/${collectionResponse.status}/${contentResponse.status}).`)
        }
        const productPayload = await productResponse.json() as ApiResponse<ApiProduct[]>
        const categoryPayload = await categoryResponse.json() as ApiResponse<ApiCategory[]>
        const collectionPayload = await collectionResponse.json() as ApiResponse<StoreCollection[]>
        const contentPayload = await contentResponse.json() as ApiResponse<StoreContent>
        const homeResponse = await fetch(`${API_BASE_URL}/store/content/home`, { signal: controller.signal })
        const homePayload = homeResponse.ok ? await homeResponse.json() as ApiResponse<{ sections: CatalogState['homeSections'] } | null> : { data: null }
        const [navigationResponse, settingsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/store/content/navigation`, { signal: controller.signal }),
          fetch(`${API_BASE_URL}/store/content/settings`, { signal: controller.signal }),
        ])
        const navigationPayload = navigationResponse.ok ? await navigationResponse.json() as ApiResponse<CatalogState['navigation']> : { data: null }
        const settingsPayload = settingsResponse.ok ? await settingsResponse.json() as ApiResponse<Record<string, unknown> | null> : { data: null }
        if (!Array.isArray(productPayload.data) || !Array.isArray(categoryPayload.data) || !Array.isArray(collectionPayload.data) || !contentPayload.data) {
          throw new Error('Store API returned an invalid response.')
        }
        setProducts(productPayload.data.map(mapProduct))
        setCategories(categoryPayload.data.map((item) => ({ id: item._id, name: item.name, slug: item.slug, image: item.image ?? '', productCount: item.productCount ?? 0 })))
        setCollections(collectionPayload.data)
        setContent({ ...defaultContent, ...contentPayload.data })
        setHomeSections(homePayload.data?.sections ?? [])
        setNavigation(navigationPayload.data)
        setWebsiteSettings(settingsPayload.data ?? {})
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Unable to load the catalog.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [requestId])

  return <CatalogContext.Provider value={{ products, categories, collections, content, homeSections, websiteSettings, navigation, loading, error, reload: () => setRequestId((value) => value + 1) }}>{children}</CatalogContext.Provider>
}

function useCatalog() {
  const catalog = useContext(CatalogContext)
  if (!catalog) throw new Error('useCatalog must be used inside CatalogProvider.')
  return catalog
}

function Logo({ light = false }: { light?: boolean }) {
  return <Link className={`logo ${light ? 'logo-light' : ''}`} to="/" aria-label="OFF home"><img src="/off-logo.svg" alt="" /></Link>
}

function StoreDestinationLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return /^https:\/\//i.test(to) ? <a className={className} href={to} target="_blank" rel="noreferrer">{children}</a> : <Link className={className} to={to}>{children}</Link>
}

function Header({ bagCount, onOpenCart }: { bagCount: number; onOpenCart: () => void }) {
  const { content, navigation, websiteSettings, products } = useCatalog()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [clockTime, setClockTime] = useState(() => new Date())
  const location = useLocation()
  const navigate = useNavigate()
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const searchResults = normalizedSearch ? products.filter(product => [product.name, product.category, product.color, product.slug, ...product.sizes].join(' ').toLocaleLowerCase().includes(normalizedSearch)) : []
  const navItems = navigation?.headerItems.filter(item => item.enabled) ?? [['Shop all', '/shop', true], ['Collections', '/collections', true], ['About OFF', '/about', true], ['Contact', '/about', true]].map(([label, destination, enabled]) => ({ label: String(label), destination: String(destination), enabled: Boolean(enabled) }))
  const announcementPalette: Record<string, { background: string; color: string }> = { dark: { background: '#171918', color: '#fff' }, sage: { background: '#eaf2ec', color: '#304638' }, sand: { background: '#e9e1d5', color: '#39352e' }, white: { background: '#fff', color: '#171918' } }
  const announcementSource = typeof websiteSettings.announcement === 'string' ? websiteSettings.announcement : content.announcement
  const announcementMessages = (content.advertisementMessages?.length ? content.advertisementMessages : [announcementSource]).filter(Boolean)
  const announcementVisible = websiteSettings.announcementEnabled !== false && announcementMessages.length > 0
  const announcementDestination = String(websiteSettings.announcementDestination ?? '')
  const announcementClockParts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Tunis',
  }).formatToParts(clockTime)
  const announcementHour = announcementClockParts.find(part => part.type === 'hour')?.value ?? ''
  const announcementMinute = announcementClockParts.find(part => part.type === 'minute')?.value ?? ''
  const announcementPeriod = announcementClockParts.find(part => part.type === 'dayPeriod')?.value ?? ''
  const renderAnnouncementGroup = (duplicate = false) => <span className="store-announcement-group" aria-hidden={duplicate || undefined}>{announcementMessages.map((message, index) => <span className="store-announcement-item" key={`${index}-${message}`}>{message}</span>)}</span>
  const announcementTicker = <div className={`store-announcement${announcementMessages.length > 1 ? ' is-animated' : ''}`} role="region" aria-label="Store announcements" style={announcementPalette[String(websiteSettings.announcementBackground ?? 'dark')] ?? announcementPalette.dark}>
    <div className="store-announcement-track">{renderAnnouncementGroup()}{announcementMessages.length > 1 && renderAnnouncementGroup(true)}</div>
    <time className="store-announcement-clock" dateTime={clockTime.toISOString()}>
      <span className="store-announcement-clock-time">{announcementHour}:{announcementMinute}</span>
      <span className="store-announcement-clock-period">{announcementPeriod}</span>
    </time>
  </div>
  useEffect(() => { setOpen(false); setSearchOpen(false); setSearchQuery('') }, [location.pathname])
  useEffect(() => {
    const timer = window.setInterval(() => setClockTime(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    let frame = 0
    const measureHeight = () => {
      const promoHeight = document.querySelector('.store-announcement')?.getBoundingClientRect().height ?? 0
      const headerHeight = document.querySelector('.store-header')?.getBoundingClientRect().height ?? 62
      document.documentElement.style.setProperty('--off-header-height', `${promoHeight + headerHeight}px`)
    }
    const updateHeight = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measureHeight)
    }
    const observer = new ResizeObserver(updateHeight)
    const announcementElement = document.querySelector('.store-announcement')
    const headerElement = document.querySelector('.store-header')
    if (announcementElement) observer.observe(announcementElement)
    if (headerElement) observer.observe(headerElement)
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateHeight)
      observer.disconnect()
      document.documentElement.style.removeProperty('--off-header-height')
    }
  }, [announcementVisible])
  return <>
    {announcementVisible && (announcementDestination && /^https:\/\//i.test(announcementDestination) ? <a className="store-announcement-link" href={announcementDestination} target="_blank" rel="noreferrer">{announcementTicker}</a> : announcementDestination ? <Link className="store-announcement-link" to={announcementDestination}>{announcementTicker}</Link> : announcementTicker)}
    <header className="store-header" style={{ '--off-logo-size': `${Math.min(32, Math.max(18, Number(websiteSettings.logoSize ?? 22)))}px` } as CSSProperties}>
      <button className="icon-button header-menu-toggle" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={17} strokeWidth={1.5} /></button>
      <Link className="store-header-logo-link" to="/" aria-label="OFF home"><AnimatedLogo2 className="store-header-logo-motion" loop /></Link>
      <nav className="header-navigation" aria-label="Main navigation">
        {navItems.map(({ label, destination }) => /^https:\/\//i.test(destination)
          ? <a key={`${label}-${destination}`} href={destination} target="_blank" rel="noreferrer">{label}</a>
          : <NavLink key={`${label}-${destination}`} to={destination}>{label}</NavLink>)}
      </nav>
      <div className="header-actions">
        {websiteSettings.showSearch !== false && <button className="icon-button" aria-label="Search" onClick={() => setSearchOpen(!searchOpen)}><Search size={16} strokeWidth={1.5} /></button>}
        {CLERK_PUBLISHABLE_KEY ? <AuthenticatedWishlistHeaderLink className="icon-button header-wishlist-link" /> : <Link className="icon-button header-wishlist-link" aria-label="Wishlist" to="/wishlist"><Heart size={16} strokeWidth={1.4} /></Link>}
        {websiteSettings.showCart !== false && <button className="icon-button bag-link" aria-label={`Open shopping bag, ${bagCount} items`} onClick={onOpenCart}><ShoppingBag size={16} strokeWidth={1.4} />{bagCount > 0 && <span className="bag-count">{bagCount}</span>}</button>}
        {websiteSettings.showAccount !== false && <Link className="icon-button account-link header-account-link" aria-label="Account" to="/account"><UserRound size={16} strokeWidth={1.4} /></Link>}
      </div>
    </header>
    {searchOpen && <div className="search-strip-wrap"><form className="search-strip" onSubmit={event => { event.preventDefault(); if (normalizedSearch) navigate(`/shop?q=${encodeURIComponent(searchQuery.trim())}`) }}><Search size={16} /><input name="q" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search products" autoFocus aria-label="Search existing products" aria-controls="header-search-results" /><button aria-label="Close search" type="button" onClick={() => { setSearchOpen(false); setSearchQuery('') }}><X size={16} /></button></form>{searchQuery.trim() && <div className="search-results" id="header-search-results" role="listbox" aria-label="Matching products">{searchResults.length ? searchResults.map(product => <Link className="search-result-item" key={product.id} role="option" aria-selected="false" to={`/product/${product.id}`} onClick={() => setSearchOpen(false)}><span><strong>{product.name}</strong><small>{product.category} · {formatTnd(product.price)}</small></span><img src={product.image} alt="" loading="lazy" /></Link>) : <p className="search-results-empty">No products match “{searchQuery.trim()}”.</p>}</div>}</div>}
    {open && <div className="drawer-backdrop" onClick={() => setOpen(false)}>
      <nav className="nav-drawer" aria-label="Main navigation" onClick={event => event.stopPropagation()}>
        <button className="drawer-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={19} /></button>
        <Logo />
        <div className="drawer-links">{navItems.map(({ label, destination }) => /^https:\/\//i.test(destination) ? <a key={`${label}-${destination}`} href={destination} target="_blank" rel="noreferrer">{label}<ArrowRight size={15} /></a> : <NavLink key={`${label}-${destination}`} to={destination}>{label}<ArrowRight size={15} /></NavLink>)}</div>
        <div className="nav-drawer-utility">
          {CLERK_PUBLISHABLE_KEY && <NavDrawerGreeting />}
          {websiteSettings.showAccount !== false && <NavLink className="nav-drawer-utility-link" to="/account"><UserRound size={17} strokeWidth={1.5} /><span>Account</span></NavLink>}
          {CLERK_PUBLISHABLE_KEY ? <AuthenticatedWishlistHeaderLink className="nav-drawer-utility-link" showLabel /> : <NavLink className="nav-drawer-utility-link" aria-label="Wishlist" to="/wishlist"><Heart size={17} strokeWidth={1.5} /><span>Wishlist</span></NavLink>}
        </div>
        <p className="drawer-note">A modern expression of luxury.</p>
      </nav>
    </div>}
  </>
}

function NavDrawerGreeting() {
  const { user, isLoaded, isSignedIn } = useUser()
  if (!isLoaded || !isSignedIn || !user) return null
  const username = user.firstName || user.username || user.primaryEmailAddress?.emailAddress.split('@')[0] || 'there'
  return <p className="nav-drawer-greeting">Hello {username} 👋</p>
}

function AuthenticatedWishlistHeaderLink({ className, showLabel = false }: { className: string; showLabel?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth()
  const destination = isLoaded && isSignedIn ? '/account/wishlist' : '/wishlist'
  const content = <><Heart size={showLabel ? 17 : 16} strokeWidth={1.5} />{showLabel && <span>Wishlist</span>}</>
  return showLabel
    ? <NavLink className={className} aria-label="Wishlist" to={destination}>{content}</NavLink>
    : <Link className={className} aria-label="Wishlist" to={destination}>{content}</Link>
}

function Footer({ announcement = '' }: { announcement?: string }) {
  const { content, websiteSettings, navigation } = useCatalog()
  const groups = navigation?.footerGroups.length ? navigation.footerGroups : [{
    title: 'Explore',
    links: [
      { label: 'About', destination: '/about' },
      { label: 'Contact', destination: '/about' },
      { label: 'Privacy', destination: '/about' },
      { label: 'Shipping & Returns', destination: '/about' },
    ],
  }]
  const supportEmail = content.supportEmail || String(websiteSettings.contactEmail ?? '')
  const socialLinks = [
    ['Instagram', websiteSettings.instagramUrl],
    ['Facebook', websiteSettings.facebookUrl],
    ['TikTok', websiteSettings.tiktokUrl],
  ].filter((item): item is [string, string] => typeof item[1] === 'string' && /^https:\/\//i.test(item[1]))
  const marqueeWords = ['Outside the frame', 'Unordinary', 'Considered', 'Lived-in', 'Raw edge', 'Made with intention']
  return <>
  <section className="footer-marquee" aria-label="Outside the frame. Unordinary. Considered. Lived-in. Raw edge. Made with intention.">
    <div className="footer-marquee-track" aria-hidden="true">
      {[0, 1].map(copy => <div className="footer-marquee-group" key={copy}>{marqueeWords.map((word, index) => <span className={`footer-marquee-word${index % 2 ? ' is-italic' : ''}`} key={word}>{word}<i className="footer-marquee-capsule" /></span>)}</div>)}
    </div>
  </section>
  <footer className="store-footer">
    <div className="footer-top">
      <div className="footer-brand"><Logo light /><p>Considered pieces.<br />Made to be lived in.</p></div>
      {groups.map((group, groupIndex) => <nav className="footer-link-group" aria-label={group.title || `Footer links ${groupIndex + 1}`} key={`${group.title}-${groupIndex}`}>
        <h2>{group.title}</h2>
        {group.links.map((item, linkIndex) => /^https:\/\//i.test(item.destination)
          ? <a key={`${item.destination}-${linkIndex}`} href={item.destination} target="_blank" rel="noreferrer">{item.label}</a>
          : <Link key={`${item.destination}-${linkIndex}`} to={item.destination}>{item.label}</Link>)}
      </nav>)}
    </div>
    {announcement && <p className="store-footer-announcement">{announcement}</p>}<div className="footer-bottom"><span>{String(websiteSettings.copyright ?? '© 2025 OFF. All rights reserved.')}</span><div>{socialLinks.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>)}</div><span>{supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : 'Made with intention'}</span></div>
  </footer>
  </>
}

function NewsletterSignupSection({ heading, description }: { heading: string; description: string }) {
  const [subscribed, setSubscribed] = useState(false)
  return <section className="section cms-newsletter">
    <div className="cms-newsletter-content">
      <p className="eyebrow">OFF / NOTES</p>
      <h2>{heading}</h2>
      <p>{description}</p>
      <form onSubmit={event => { event.preventDefault(); setSubscribed(true) }}>
        <label className="sr-only" htmlFor="cms-newsletter-email">Email address</label>
        <div className="newsletter-field">
          <input id="cms-newsletter-email" type="email" placeholder="Email address" required />
          <button type="submit">Subscribe <ArrowRight size={16} /></button>
        </div>
        {subscribed && <small role="status">Thank you for joining us.</small>}
      </form>
    </div>
    <div className="cms-newsletter-mark-panel"><div className="cms-newsletter-mark" aria-hidden="true"><img src="/off-logo.svg" alt="" /><span /></div></div>
  </section>
}

function WhatsAppFloatingButton() {
  const { websiteSettings } = useCatalog()
  const phone = String(websiteSettings.whatsappNumber ?? '').replace(/\D/g, '')
  if (!phone) return null
  return <a className="whatsapp-float" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Contact OFF on WhatsApp"><span className="whatsapp-float-ring" aria-hidden="true" /><svg className="whatsapp-brand-icon" viewBox="0 0 24 24" aria-hidden="true"><path className="whatsapp-chat-mark" d="M20.2 11.6a8.2 8.2 0 0 1-12.1 7.2L3 20l1.3-4.7a8.2 8.2 0 1 1 15.9-3.7Z" /><path className="whatsapp-phone-cutout" d="M8.3 7.9c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.8 1.9c.1.2.1.4 0 .5l-.6.7c-.2.2-.2.4-.1.6.5.9 1.2 1.6 2.1 2.1.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.3.3.6-.1.6-.4 1.2-.9 1.5-.5.4-1.1.5-1.8.3-1-.3-2.3-.9-3.6-2.1-1.1-1-2-2.4-2.3-3.4-.3-.9-.1-1.8.3-2.6.1-.2.3-.4.4-.5Z" /></svg></a>
}

function HeroLoadingIndicator() {
  return <span className="hero-loading-indicator" role="status" aria-label="Loading products">
    <LoaderCircle size={34} strokeWidth={1.4} aria-hidden="true" />
  </span>
}

function ProductLoadingIndicator() {
  return <span className="product-loading-indicator" aria-hidden="true">
    <LoaderCircle size={26} strokeWidth={1.5} />
  </span>
}

function ProductLoadingCard() {
  return <article className="product-card product-card-loading" aria-hidden="true">
    <div className="product-image-wrap product-image-loading"><ProductLoadingIndicator /></div>
    <div className="product-meta"><span className="product-loading-line" /><span className="product-loading-line product-loading-line-short" /></div>
  </article>
}

function ProductCard({ product, showPrice = true, liked: controlledLiked, onWishlistToggle, imageLoading = false }: { product: Product; showPrice?: boolean; liked?: boolean; onWishlistToggle?: () => void; imageLoading?: boolean }) {
  const [localLiked, setLocalLiked] = useState(false)
  const guestWishlist = useContext(GuestWishlistContext)
  const liked = controlledLiked ?? guestWishlist?.ids.includes(product.id) ?? localLiked
  const toggleWishlist = () => {
    if (onWishlistToggle) onWishlistToggle()
    else if (guestWishlist) guestWishlist.toggle(product.id)
    else setLocalLiked(value => !value)
  }
  const cardImage = product.heroImage || product.image
  return <article className="product-card">
    <Link to={`/product/${product.id}`} className={`product-image-wrap${product.heroImage ? ' has-cutout' : ''}${imageLoading ? ' product-image-loading' : ''}`}>{imageLoading ? <ProductLoadingIndicator /> : <img src={cardImage} alt={product.name} loading="lazy" />}<button className={`favorite ${liked ? 'is-liked' : ''}`} aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'} onClick={event => { event.preventDefault(); toggleWishlist() }}><Heart size={16} strokeWidth={1.4} fill={liked ? 'currentColor' : 'none'} /></button>{product.isNew && <span className="product-tag">New arrival</span>}</Link>
    <div className="product-meta"><Link to={`/product/${product.id}`}><span>{product.name}</span>{showPrice && <span>{formatTnd(product.price)}</span>}</Link><small>{product.category} · {product.color}</small></div>
  </article>
}

function HomeSelectionCards({ cards, products, collections = [], imageLoading = false }: { cards: SelectionCardSettings[]; products: Product[]; collections?: StoreCollection[]; imageLoading?: boolean }) {
  return <div className="selection-cards">
    {cards.map((card, index) => {
      const product = products.find(item => item.id === card.productId)
      const collection = collections.find(item => item._id === card.collectionId)
      const fallbackImage = ['/hero-ai/leather-jacket-ai.png', '/hero-ai/distressed-denim-jeans-ai.png', '/hero-ai/ma-cap-ai.png'][index]
      const href = card.destination || (collection ? `/shop?collection=${encodeURIComponent(collection.slug)}` : product ? `/product/${product.slug || product.id}` : '/shop')
      const background = card.background || ['#e5e2dc', '#e5e2dc', '#d9d5cb'][index]
      const foreground = background.toLowerCase() === '#111111' ? '#fff' : '#171715'
      return <Link className="selection-card" key={`${card.title}-${index}`} to={href} style={{ '--selection-background': background, '--selection-foreground': foreground } as CSSProperties}>
        <span className="selection-card-copy"><b>{card.title}</b><small>{card.description}</small></span>
        {imageLoading ? <span className="selection-card-loading-image" aria-hidden="true" /> : <img src={product?.heroImage || fallbackImage} alt={product?.name || card.title} loading="lazy" />}
        <span className="selection-card-arrow" aria-hidden="true"><ArrowRight size={19} strokeWidth={1.5} /></span>
      </Link>
    })}
  </div>
}

function getSelectionCards(settings: Record<string, unknown>, products: Product[], collections: StoreCollection[] = []): SelectionCardSettings[] {
  if (Array.isArray(settings.selectionCards) && settings.selectionCards.length === 3) {
    return settings.selectionCards.map((card, index) => {
      const item = card && typeof card === 'object' ? card as Record<string, unknown> : {}
      const productId = String(item.productId ?? '')
      const titleSlug = String(item.title ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const productCollections = collections.filter(collection => collection.productIds.includes(productId))
      const specificProductCollections = productCollections.filter(collection => (collection.productCount ?? collection.productIds.length) < products.length)
      const linkedCollection = collections.find(collection => collection._id === String(item.collectionId ?? ''))
        ?? collections.find(collection => collection.slug === titleSlug)
        ?? (specificProductCollections.length === 1 ? specificProductCollections[0] : undefined)
      return {
        title: String(item.title ?? defaultSelectionCards[index].title),
        description: String(item.description ?? defaultSelectionCards[index].description),
        productId,
        collectionId: linkedCollection?._id ?? '',
        background: String(item.background ?? defaultSelectionCards[index].background),
        destination: String(item.destination ?? ''),
      }
    })
  }
  return defaultSelectionCards.map(card => ({
    title: card.title,
    description: card.description,
    productId: products.find(product => product.slug === card.slug)?.id ?? '',
    collectionId: collections.find(collection => collection.slug === card.title.toLowerCase())?._id ?? '',
    background: card.background,
    destination: '',
  }))
}

type InstagramPost = { imageUrl: string; postUrl?: string }

function InstagramFeedSection({ settings = {} }: { settings?: Record<string, unknown> }) {
  const { websiteSettings } = useCatalog()
  const instagramUrlValue = [settings.instagramUrl, websiteSettings.instagramUrl]
    .find(value => typeof value === 'string' && /^https:\/\//i.test(value))
  const instagramUrl = typeof instagramUrlValue === 'string'
    ? instagramUrlValue
    : ''
  const fallbackPosts = [
    { image: '/hero-ai/logo-t-shirt-ai.png', alt: 'OFF logo T-shirt' },
    { image: '/hero-ai/ma-cap-ai.png', alt: 'OFF cap' },
    { image: '/hero-ai/distressed-denim-jeans-ai.png', alt: 'OFF denim' },
    { image: '/hero-ai/leather-jacket-ai.png', alt: 'OFF leather jacket' },
    { image: '/hero-ai/skeleton-sneakers-ai.png', alt: 'OFF sneakers' },
    { image: '/slider/ma-quaad-jacket.png', alt: 'OFF jacket' },
  ]
  const hasSectionPosts = Array.isArray(settings.instagramPosts)
  const configuredPosts: unknown[] = Array.isArray(settings.instagramPosts)
    ? settings.instagramPosts as unknown[]
    : Array.isArray(websiteSettings.instagramPosts) ? websiteSettings.instagramPosts as unknown[] : []
  const posts = configuredPosts
    .filter((post): post is InstagramPost => Boolean(post && typeof post === 'object' && typeof (post as InstagramPost).imageUrl === 'string' && (post as InstagramPost).imageUrl))
    .slice(0, 12)
    .map((post, index) => ({
      image: publicMediaUrl(post.imageUrl),
      alt: `OFF Instagram post ${index + 1}`,
      href: typeof post.postUrl === 'string' && /^https:\/\//i.test(post.postUrl) ? post.postUrl : instagramUrl || '/shop',
      external: Boolean((typeof post.postUrl === 'string' && /^https:\/\//i.test(post.postUrl)) || instagramUrl),
    }))
  const feedPosts = posts.length
    ? posts
    : hasSectionPosts ? [] : fallbackPosts.map(post => ({ ...post, href: instagramUrl || '/shop', external: Boolean(instagramUrl) }))
  const eyebrow = typeof settings.eyebrow === 'string' ? settings.eyebrow : 'OFF / COMMUNITY'
  const heading = typeof settings.heading === 'string' ? settings.heading : 'FOLLOW US'

  return <section className="instagram-feed" aria-labelledby="instagram-feed-title">
    <div className="instagram-feed-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id="instagram-feed-title">{heading}</h2>
      {instagramUrl && <a className="text-link" href={instagramUrl} target="_blank" rel="noreferrer">Instagram <ArrowRight size={14} /></a>}
    </div>
    <div className="instagram-feed-window">
      {[0, 1].map(copy => <div className="instagram-feed-track" key={copy} aria-hidden={copy === 1}>
        {feedPosts.map((post, index) => <a
          className="instagram-feed-card"
          href={post.href}
          target={post.external ? '_blank' : undefined}
          rel={post.external ? 'noreferrer' : undefined}
          aria-label={post.external ? `View ${post.alt} on Instagram` : `View ${post.alt}`}
          tabIndex={copy === 1 ? -1 : undefined}
          key={`${copy}-${index}`}
        ><img src={post.image} alt={copy === 1 ? '' : post.alt} loading="lazy" /><span className="instagram-feed-overlay" aria-hidden="true"><Instagram size={34} strokeWidth={1.6} /></span></a>)}
      </div>)}
    </div>
  </section>
}

function WishlistLanding() {
  return CLERK_PUBLISHABLE_KEY ? <AuthenticatedWishlistLanding /> : <GuestWishlistPage />
}

function AuthenticatedWishlistLanding() {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) return <main className="page-shell catalog-message">Loading wishlist…</main>
  return isSignedIn ? <Navigate to="/account/wishlist" replace /> : <GuestWishlistPage />
}

function GuestWishlistPage() {
  const { products, loading, error, reload } = useCatalog()
  const wishlist = useContext(GuestWishlistContext)
  const savedProducts = products.filter(product => wishlist?.ids.includes(product.id))
  return <><main className="page-shell guest-wishlist-page"><div className="breadcrumbs"><Link to="/">Home</Link><span>/</span><span>Wishlist</span></div><div className="page-title-center"><p className="eyebrow">SAVED FOR LATER</p><h1>YOUR WISHLIST</h1></div>{loading ? <p className="catalog-message">Loading your wishlist…</p> : error ? <div className="catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></div> : savedProducts.length ? <div className="product-grid listing-grid">{savedProducts.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><Heart size={24} strokeWidth={1.3} /><h2>Your wishlist is waiting for something special.</h2><p>Save the pieces you love and find them here whenever you return.</p><Link className="button button-dark" to="/shop">DISCOVER THE COLLECTION <ArrowRight size={14} /></Link></div>}</main><Footer /></>
}

function Home({ addToBag }: { addToBag: (id: string, size: string, color: string, sku: string, quantity?: number) => boolean }) {
  const { products, categories, collections, content, homeSections, loading, error, reload } = useCatalog()
  const homeSection = (type: string) => homeSections.find(section => section.enabled && section.type === type)
  const heroSection = homeSection('hero')
  const storedHeroSettings = heroSection?.settings ?? {}
  const hasLegacyCampaignCopy = storedHeroSettings.heading === 'ARTS DISTRICT LOS ANGELES'
    || storedHeroSettings.eyebrow === 'OFF — SPRING / SUMMER 25'
  const heroSettings = hasLegacyCampaignCopy
    ? { ...storedHeroSettings, heading: '', subtitle: '', eyebrow: '', buttonLabel: '' }
    : storedHeroSettings
  const selectSectionProducts = (section: typeof homeSections[number] | undefined, fallback: Product[]) => {
    if (!section) return fallback
    const ids = Array.isArray(section.settings.productIds) ? section.settings.productIds as string[] : []
    const selected = ids.map(id => products.find(product => product.id === id)).filter((product): product is Product => Boolean(product && product.image))
    if (section.settings.mode === 'collection') {
      const collection = collections.find(item => item._id === section.settings.collectionId)
      return (collection?.productIds ?? []).map(id => products.find(product => product.id === id)).filter((product): product is Product => Boolean(product && product.image)).slice(0, Number(section.settings.limit ?? 3))
    }
    if (section.settings.mode === 'manual') {
      return selected.slice(0, Number(section.settings.limit ?? 3))
    }
    const defaultLimit = 3
    return products.filter(product => product.image).sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')).slice(0, Number(section.settings.limit ?? defaultLimit))
  }
  let selectedHeroProducts = selectSectionProducts(heroSection, products.filter((product) => product.image).slice(0, 3))
  const denimIndex = selectedHeroProducts.findIndex(product => product.slug === 'distressed-denim-jeans')
  const capProduct = products.find(product => product.slug === 'ma-cap' || product.name.trim().toLowerCase() === 'ma cap')
  if (denimIndex >= 0 && capProduct) {
    selectedHeroProducts = selectedHeroProducts.some(product => product.id === capProduct.id)
      ? selectedHeroProducts.filter(product => product.slug !== 'distressed-denim-jeans')
      : selectedHeroProducts.map((product, index) => index === denimIndex ? capProduct : product)
  }
  const featuredProducts = selectedHeroProducts.map(product => {
    if (product.slug === 'ma-cap') return { ...product, heroImage: '/hero-ai/ma-cap-ai.png' }
    if (product.heroImage) return product
    const cutout = heroSettings.productImages && typeof heroSettings.productImages === 'object' ? (heroSettings.productImages as Record<string, string>)[product.id] : undefined
    if (!cutout) return product
    const cutoutUrl = cutout.startsWith('/slider/') ? cutout : publicMediaUrl(cutout)
    return { ...product, heroImage: cutoutUrl }
  })
  const arrivalsSection = homeSection('new-arrivals')
  const arrivalsProducts = selectSectionProducts(arrivalsSection, products.slice(0, 3))
  const imageUrl = (value: unknown) => publicMediaUrl(typeof value === 'string' ? value : '')
  const [activeSlide, setActiveSlide] = useState(0)
  const [orbitRotation, setOrbitRotation] = useState(0)
  const [isForwardRotation, setIsForwardRotation] = useState(true)
  const [dragDistance, setDragDistance] = useState(0)
  const [isInteracting, setIsInteracting] = useState(false)
  const [isFastTransition, setIsFastTransition] = useState(false)
  const [pointerProductId, setPointerProductId] = useState<string | null>(null)
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null)
  const [quickViewColor, setQuickViewColor] = useState('')
  const [quickViewSize, setQuickViewSize] = useState('')
  const [quickViewQuantity, setQuickViewQuantity] = useState(1)
  const [quickViewMessage, setQuickViewMessage] = useState('')
  const [quickViewClosing, setQuickViewClosing] = useState(false)
  const [quickViewReturning, setQuickViewReturning] = useState(false)
  const [heroTitleTransition, setHeroTitleTransition] = useState<{ outgoingTitle: string; outgoingHref: string; direction: 'forward' | 'reverse'; id: number } | null>(null)
  const dragStartX = useRef<number | null>(null)
  const heroSectionRef = useRef<HTMLElement | null>(null)
  const quickViewImageRef = useRef<HTMLImageElement | null>(null)
  const quickViewOrigin = useRef<ImageBounds | null>(null)
  const quickViewCloseTimer = useRef<number | null>(null)
  const quickViewReturnFrame = useRef<number | null>(null)
  const heroTitleTransitionTimer = useRef<number | null>(null)
  const wheelDistance = useRef(0)
  const ignoreProductClick = useRef(false)
  const hasDragged = useRef(false)
  const wheelTimer = useRef<number | null>(null)

  const pauseHeroAnimations = () => {
    heroSectionRef.current?.getAnimations({ subtree: true }).forEach(animation => animation.pause())
  }
  const resumeHeroAnimations = () => {
    heroSectionRef.current?.getAnimations({ subtree: true }).forEach(animation => {
      if (animation.playState === 'paused') animation.play()
    })
  }

  const closeQuickView = () => {
    if (!quickViewProduct || quickViewClosing || quickViewReturnFrame.current !== null) return
    const productId = quickViewProduct.id
    const productIndex = featuredProducts.findIndex(product => product.id === productId)
    if (productIndex >= 0) {
      setQuickViewReturning(true)
      setActiveSlide(productIndex)
      setOrbitRotation(productIndex * (360 / Math.max(featuredProducts.length, 1)))
      setDragDistance(0)
    }
    setQuickViewClosing(true)
    quickViewReturnFrame.current = window.requestAnimationFrame(() => {
      quickViewReturnFrame.current = null
      const modalImage = quickViewImageRef.current
      const heroImage = [...document.querySelectorAll<HTMLImageElement>('.hero-showcase-item[data-product-id] img')]
        .find(image => image.closest<HTMLElement>('[data-product-id]')?.dataset.productId === productId)
      const from = modalImage?.getBoundingClientRect()
      const to = heroImage ? getContainedImageBounds(heroImage) : null
      if (!modalImage || !heroImage || !from || !to || !from.width || !from.height) {
        setQuickViewProduct(null)
        setQuickViewClosing(false)
        setQuickViewReturning(false)
        quickViewOrigin.current = null
        return
      }
      const translateX = to.left + to.width / 2 - (from.left + from.width / 2)
      const translateY = to.top + to.height / 2 - (from.top + from.height / 2)
      const scale = Math.min(to.width / from.width, to.height / from.height)
      const returnAnimation = modalImage.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` },
      ], { duration: 760, easing: 'cubic-bezier(.2, .76, .22, 1)', fill: 'forwards' })
    if (quickViewCloseTimer.current !== null) window.clearTimeout(quickViewCloseTimer.current)
    quickViewCloseTimer.current = window.setTimeout(() => {
      returnAnimation.cancel()
      heroImage.closest('button')?.blur()
      setQuickViewProduct(null)
      setQuickViewClosing(false)
      setQuickViewReturning(false)
      quickViewOrigin.current = null
      quickViewCloseTimer.current = null
    }, 760)
    })
  }

  useEffect(() => {
    setActiveSlide(0)
    setOrbitRotation(0)
    setIsForwardRotation(true)
  }, [featuredProducts.length])

  useEffect(() => () => {
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
    if (quickViewCloseTimer.current !== null) window.clearTimeout(quickViewCloseTimer.current)
    if (quickViewReturnFrame.current !== null) window.cancelAnimationFrame(quickViewReturnFrame.current)
    if (heroTitleTransitionTimer.current !== null) window.clearTimeout(heroTitleTransitionTimer.current)
  }, [])

  useEffect(() => {
    const updatePointerProduct = (event: PointerEvent) => {
      const image = getHeroProductImageAtPoint(event.clientX, event.clientY)
      const product = image && heroSectionRef.current?.contains(image)
        ? image.closest<HTMLElement>('[data-product-id]')?.dataset.productId ?? null
        : null
      setPointerProductId(current => current === product ? current : product)
    }
    window.addEventListener('pointermove', updatePointerProduct)
    return () => window.removeEventListener('pointermove', updatePointerProduct)
  }, [])

  useEffect(() => {
    if (quickViewProduct) {
      pauseHeroAnimations()
      return
    }
    resumeHeroAnimations()
  }, [quickViewProduct])

  useEffect(() => {
    if (!quickViewProduct) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeQuickView()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [quickViewProduct, quickViewClosing])

  useLayoutEffect(() => {
    const image = quickViewImageRef.current
    const origin = quickViewOrigin.current
    if (!quickViewProduct || !image || !origin) return
    const destination = image.getBoundingClientRect()
    if (!destination.width || !destination.height) return
    const translateX = origin.left + origin.width / 2 - (destination.left + destination.width / 2)
    const translateY = origin.top + origin.height / 2 - (destination.top + destination.height / 2)
    const scale = Math.min(origin.width / destination.width, origin.height / destination.height)
    const animation = image.animate([
      { transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 720, easing: 'cubic-bezier(.2, .76, .22, 1)', fill: 'both' })
    return () => animation.cancel()
  }, [quickViewProduct])

  const activeProduct = featuredProducts[activeSlide] ?? featuredProducts[0]
  const quickViewColors = quickViewProduct ? [...new Set(quickViewProduct.variants.filter(variant => variant.active).map(variant => variant.color))] : []
  const quickViewVariant = quickViewProduct?.variants.find(variant => variant.active && variant.color === quickViewColor && variant.size === quickViewSize && variant.stock > 0)
  const openQuickView = (product: Product, button: HTMLButtonElement) => {
    const image = button.querySelector('img')
    quickViewOrigin.current = image ? getContainedImageBounds(image) : null
    setQuickViewColor(product.variants.find(variant => variant.active)?.color ?? product.color)
    setQuickViewSize('')
    setQuickViewQuantity(1)
    setQuickViewMessage('')
    setQuickViewClosing(false)
    setQuickViewProduct(product)
  }
  const moveSlide = (direction: number, speed: 'fast' | 'normal' = 'fast', showBackdropTitle = direction > 0) => {
    if (!direction) return
    const currentProduct = featuredProducts[activeSlide]
    if (currentProduct && featuredProducts.length > 1) {
      setHeroTitleTransition({
        outgoingTitle: String(heroSettings.heading || currentProduct.name),
        outgoingHref: `/product/${currentProduct.slug || currentProduct.id}`,
        direction: direction > 0 ? 'forward' : 'reverse',
        id: Date.now(),
      })
      if (heroTitleTransitionTimer.current !== null) window.clearTimeout(heroTitleTransitionTimer.current)
      heroTitleTransitionTimer.current = window.setTimeout(() => {
        setHeroTitleTransition(null)
        heroTitleTransitionTimer.current = null
      }, 520)
    }
    setIsFastTransition(speed === 'fast')
    setIsForwardRotation(showBackdropTitle)
    setOrbitRotation((rotation) => rotation + direction * (360 / Math.max(featuredProducts.length, 1)))
    setActiveSlide((current) => ((current + direction) % featuredProducts.length + featuredProducts.length) % featuredProducts.length)
  }

  const moveToProduct = (index: number) => {
    if (index === activeSlide || featuredProducts.length < 2) return
    const forwardDistance = (index - activeSlide + featuredProducts.length) % featuredProducts.length
    const direction = forwardDistance > featuredProducts.length / 2 ? forwardDistance - featuredProducts.length : forwardDistance
    moveSlide(direction, 'fast')
  }

  const navigateQuickView = (direction: number) => {
    if (!quickViewProduct || featuredProducts.length < 2) return
    const currentIndex = featuredProducts.findIndex(product => product.id === quickViewProduct.id)
    if (currentIndex < 0) return
    const nextIndex = (currentIndex + direction + featuredProducts.length) % featuredProducts.length
    const nextProduct = featuredProducts[nextIndex]
    const activeDistance = (nextIndex - activeSlide + featuredProducts.length) % featuredProducts.length
    const slideDirection = activeDistance > featuredProducts.length / 2 ? activeDistance - featuredProducts.length : activeDistance
    moveSlide(slideDirection, 'fast')
    quickViewOrigin.current = null
    setQuickViewColor(nextProduct.variants.find(variant => variant.active)?.color ?? nextProduct.color)
    setQuickViewSize('')
    setQuickViewQuantity(1)
    setQuickViewMessage('')
    setQuickViewProduct(nextProduct)
  }

  const getOrbitAngle = (index: number) => index * (360 / featuredProducts.length) - orbitRotation - dragDistance * (360 / featuredProducts.length) / 100

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (featuredProducts.length < 2) return
    const horizontalDelta = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX
    if (!horizontalDelta) return
    event.preventDefault()
    wheelDistance.current += horizontalDelta
    const steps = Math.trunc(wheelDistance.current / 100)
    if (steps) {
      wheelDistance.current -= steps * 100
      moveSlide(steps, 'fast')
    }
    setDragDistance(wheelDistance.current)
    setIsInteracting(true)
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
    wheelTimer.current = window.setTimeout(() => {
      const remainder = wheelDistance.current
      const roundedStep = Math.round(remainder / 100)
      const finalStep = roundedStep || (Math.abs(remainder) >= 18 ? Math.sign(remainder) : 0)
      wheelDistance.current = 0
      if (finalStep) moveSlide(finalStep, 'fast')
      setDragDistance(0)
      setIsInteracting(false)
      wheelTimer.current = null
    }, 140)
  }

  return <><main className="home-page">
    <section
      className={`hero hero-product-slider${activeProduct ? ' has-product' : ''}${heroSettings.image ? ' has-campaign-image' : ''}`}
      ref={heroSectionRef}
      aria-label="Featured products"
      onWheel={handleWheel}
      onPointerDown={event => {
        if (event.button !== 0) return
        // Let native clicks reach the hero controls and product list; pointer
        // capture on the section can otherwise swallow them.
        if (event.target instanceof Element && event.target.closest('.hero-slider-controls, .hero-product-list')) return
        resumeHeroAnimations()
        if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
        wheelTimer.current = null
        wheelDistance.current = 0
        dragStartX.current = event.clientX
        hasDragged.current = false
        ignoreProductClick.current = false
        setDragDistance(0)
        setIsInteracting(true)
        const hoveredProductImage = getHeroProductImageAtPoint(event.clientX, event.clientY)
        const productButton = hoveredProductImage?.closest<HTMLElement>('.hero-showcase-item')
          ?? (event.target instanceof Element ? event.target.closest<HTMLElement>('.hero-showcase-item') : null)
        const captureTarget = productButton ?? event.currentTarget
        captureTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        if (dragStartX.current === null) return
        const distance = dragStartX.current - event.clientX
        if (Math.abs(distance) > 8) hasDragged.current = true
        const steps = Math.trunc(distance / 100)
        if (steps) {
          const remainder = distance - steps * 100
          dragStartX.current = event.clientX + remainder
          moveSlide(steps, 'fast')
          setDragDistance(remainder)
        } else {
          setDragDistance(distance)
        }
      }}
      onPointerUp={event => {
        if (dragStartX.current === null) return
        const distance = dragStartX.current - event.clientX
        dragStartX.current = null
        if (hasDragged.current) {
          ignoreProductClick.current = true
          window.setTimeout(() => { ignoreProductClick.current = false }, 350)
          const steps = Math.round(distance / 100)
          if (steps) moveSlide(steps, 'fast')
        }
        hasDragged.current = false
        setDragDistance(0)
        setIsInteracting(false)
      }}
      onPointerCancel={() => { dragStartX.current = null; hasDragged.current = false; setDragDistance(0); setIsInteracting(false) }}
      onPointerLeave={() => setPointerProductId(null)}
    >
      {Boolean(heroSettings.image) && <picture className="hero-campaign-image">{Boolean(heroSettings.mobileImage) && <source media="(max-width: 700px)" srcSet={imageUrl(heroSettings.mobileImage)} />}<img src={imageUrl(heroSettings.image)} alt="" /></picture>}
      <div className="hero-gradient" style={{ '--hero-overlay-opacity': `${Math.min(80, Math.max(0, Number(heroSettings.overlay ?? 20))) / 100}` } as CSSProperties} />
      {activeProduct ? <>
        {featuredProducts.length > 1 && <nav className="hero-product-list" aria-label="Featured products">
          {featuredProducts.map((product, index) => <button
            type="button"
            className={index === activeSlide ? 'active' : ''}
            key={product.id}
            aria-current={index === activeSlide ? 'true' : undefined}
            onClick={() => moveToProduct(index)}
          ><span>{String(index + 1).padStart(2, '0')}</span><span>{product.name}</span></button>)}
        </nav>}
        {featuredProducts.map((product, index) => <p
          className={`hero-backdrop-title${isForwardRotation ? ' is-forward' : ''}`}
          aria-hidden="true"
          key={`backdrop-${product.id}`}
          style={{
            '--orbit-angle': `${getOrbitAngle(index)}deg`,
            '--orbit-duration': `${isFastTransition ? FAST_ORBIT_STEP_DURATION_MS : ORBIT_STEP_DURATION_MS}ms`,
          } as CSSProperties}
        >
          {product.name.toLowerCase().replace(/\b[a-z]/g, character => character.toUpperCase())}
        </p>)}
        <div className={`hero-showcase-stage${loading ? ' is-loading' : ''}${isInteracting ? ' is-interacting' : ''}${quickViewReturning ? ' is-quick-view-returning' : ''}${pointerProductId ? ' is-product-pointer' : ''}`} aria-label="Selected product with neighboring pieces">
          {loading ? <HeroLoadingIndicator /> : featuredProducts.map((product, index) => {
            const offset = (index - activeSlide + featuredProducts.length) % featuredProducts.length
            const position = offset === 0 ? 'active' : offset === 1 ? 'next' : 'previous'
            const className = `hero-showcase-item hero-showcase-item--${position}`
            const angle = getOrbitAngle(index)
            const depth = (1 + Math.cos(angle * Math.PI / 180)) / 2
            const scale = 1.5 + .5 * depth
            return <button
              className={`${className}${pointerProductId === product.id ? ' is-pointer-target' : ''}${quickViewClosing && quickViewProduct?.id === product.id ? ' is-return-source' : ''}`}
              key={product.id}
              type="button"
              data-product-id={product.id}
              style={{ '--orbit-angle': `${angle}deg`, '--orbit-scale': scale, '--orbit-duration': `${isFastTransition ? FAST_ORBIT_STEP_DURATION_MS : ORBIT_STEP_DURATION_MS}ms` } as CSSProperties}
              aria-label={position === 'active' ? `Quick view: ${product.name}` : `Show ${product.name} in the center`}
              aria-haspopup={position === 'active' ? 'dialog' : undefined}
              tabIndex={0}
              onClick={event => {
                if (ignoreProductClick.current) { ignoreProductClick.current = false; return }
                const productButton = event.currentTarget
                const pointerTarget = event.target instanceof Element
                  ? event.target.closest<HTMLButtonElement>('.hero-showcase-item[data-product-id]')
                  : null
                const hitImage = event.detail !== 0
                  ? getHeroProductImageAtPoint(event.clientX, event.clientY)
                    ?? pointerTarget?.querySelector<HTMLImageElement>('.hero-showcase-image')
                    ?? productButton.querySelector<HTMLImageElement>('.hero-showcase-image')
                  : productButton.querySelector<HTMLImageElement>('.hero-showcase-image')
                if (!hitImage) return
                const hitButton = hitImage.closest<HTMLButtonElement>('.hero-showcase-item[data-product-id]') ?? productButton
                const hitProductIndex = featuredProducts.findIndex(item => item.id === hitButton.dataset.productId)
                if (hitProductIndex < 0) return
                const hitProduct = featuredProducts[hitProductIndex]
                resumeHeroAnimations()
                if (hitProductIndex === activeSlide) openQuickView(hitProduct, hitButton)
                else moveToProduct(hitProductIndex)
              }}
            >
              <span className={`hero-product-art hero-product-art--${product.slug}`}>
                <span className="hero-product-shadow" aria-hidden="true" />
                <img className="hero-showcase-image" src={product.heroImage || product.image} alt={position === 'active' ? product.name : ''} draggable={false} />
              </span>
            </button>
          })}
        </div>
        <div className="hero-product-details">
          <h1><span className={`hero-product-title-track${heroTitleTransition ? ` is-${heroTitleTransition.direction}` : ''}`} key={heroTitleTransition?.id ?? activeProduct.id}>
            {heroTitleTransition && <Link className="hero-product-title hero-product-title-outgoing" to={heroTitleTransition.outgoingHref}>{heroTitleTransition.outgoingTitle}</Link>}
            <Link className={`hero-product-title${heroTitleTransition ? ' hero-product-title-incoming' : ''}`} to={`/product/${activeProduct.slug || activeProduct.id}`}>{String(heroSettings.heading || activeProduct.name)}</Link>
          </span></h1>
          {Boolean(heroSettings.subtitle) && <p className="hero-cms-subtitle">{String(heroSettings.subtitle)}</p>}
          {Boolean(heroSettings.heading) && heroSettings.heading !== activeProduct.name && <Link className="hero-active-product-link" to={`/product/${activeProduct.slug || activeProduct.id}`}>{activeProduct.name}</Link>}
          <p className="hero-product-price">{formatTnd(activeProduct.price)}</p>
          {Boolean(heroSettings.buttonLabel) && <StoreDestinationLink className="hero-campaign-cta" to={String(heroSettings.destination ?? '/shop')}>{String(heroSettings.buttonLabel)} <ArrowRight size={12} /></StoreDestinationLink>}
        </div>
        {featuredProducts.length > 1 && <div className="hero-slider-controls" aria-label="Featured product slides">
          <button type="button" aria-label="Previous product" onClick={() => moveSlide(-1, 'fast')}><ArrowLeft size={16} strokeWidth={1.5} /></button>
          <div className="hero-slider-progress" role="group" aria-label="Choose featured product">{featuredProducts.map((product, index) => <button key={product.id} type="button" className={index === activeSlide ? 'active' : ''} aria-label={`Show ${product.name}`} aria-current={index === activeSlide ? 'true' : undefined} onClick={() => moveToProduct(index)} />)}</div>
          <button type="button" aria-label="Next product" onClick={() => moveSlide(1, 'fast')}><ArrowRight size={16} strokeWidth={1.5} /></button>
        </div>}
        <span className="hero-index">{String(activeSlide + 1).padStart(2, '0')} / {String(featuredProducts.length).padStart(2, '0')}</span>
      </> : loading ? <>
        <HeroLoadingIndicator />
        <span className="hero-index">01 / 01</span>
      </> : <span className="hero-index">01 / 01</span>}
    </section>
    {quickViewProduct && <div className={`hero-quick-view${quickViewClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={`Quick view: ${quickViewProduct.name}`} onMouseDown={event => { if (event.target === event.currentTarget) closeQuickView() }}>
      <div className="hero-quick-view-inner">
        <div className="hero-quick-view-image"><img ref={quickViewImageRef} src={quickViewProduct.heroImage || quickViewProduct.image} alt={quickViewProduct.name} /></div>
        <div className="hero-quick-view-toolbar">
          {featuredProducts.length > 1 && <div className="hero-quick-view-pagination" aria-label="Quick view products">
            <button type="button" aria-label="Previous product" onClick={() => navigateQuickView(-1)}><ArrowLeft size={14} strokeWidth={1.7} /></button>
            <span aria-live="polite">{String(featuredProducts.findIndex(product => product.id === quickViewProduct.id) + 1).padStart(2, '0')} / {String(featuredProducts.length).padStart(2, '0')}</span>
            <button type="button" aria-label="Next product" onClick={() => navigateQuickView(1)}><ArrowRight size={14} strokeWidth={1.7} /></button>
          </div>}
          <button className="hero-quick-view-close" type="button" aria-label="Close product details" onClick={closeQuickView}><X size={22} strokeWidth={1.5} /></button>
        </div>
        <div className="hero-quick-view-info">
          <div className="hero-quick-view-product-details">
            <p className="eyebrow">{quickViewProduct.category}{quickViewProduct.color ? ` / ${quickViewProduct.color}` : ''}</p>
            <h2>{quickViewProduct.name}</h2>
            <p className="hero-quick-view-price">{formatTnd(quickViewVariant?.price ?? quickViewProduct.price)}</p>
            <p className="hero-quick-view-description">A considered silhouette with a relaxed fit, crafted for everyday movement. Finished with signature OFF detailing.</p>
            <div className="variant-block hero-quick-view-variants">
              <div className="variant-title"><span>Color</span><span>{quickViewColor}</span></div>
              <div className="swatches">{quickViewColors.map(color => <button key={color} type="button" aria-label={`Select color ${color}`} className={`swatch ${quickViewColor === color ? 'active' : ''}`} style={{ background: colorStyle(color) }} onClick={() => { setQuickViewColor(color); setQuickViewSize(''); setQuickViewQuantity(1); setQuickViewMessage('') }} />)}</div>
            </div>
            <div className="variant-block hero-quick-view-variants">
              <div className="variant-title"><span>Select size</span></div>
              <div className="size-options">{['XS', 'S', 'M', 'L', 'XL'].map(size => {
                const variant = quickViewProduct.variants.find(item => item.active && item.color === quickViewColor && item.size === size)
                return <button key={size} type="button" disabled={!variant || variant.stock < 1} className={quickViewSize === size ? 'active' : ''} onClick={() => { setQuickViewSize(size); setQuickViewQuantity(1); setQuickViewMessage('') }}>{size}</button>
              })}</div>
            </div>
            <div className="hero-quick-view-quantity-row"><span>Quantity</span><div className="quantity-control"><button type="button" aria-label="Decrease quantity" disabled={quickViewQuantity <= 1} onClick={() => setQuickViewQuantity(quantity => Math.max(1, quantity - 1))}><Minus size={12} /></button><span>{quickViewQuantity}</span><button type="button" aria-label="Increase quantity" disabled={!quickViewVariant || quickViewQuantity >= quickViewVariant.stock} onClick={() => setQuickViewQuantity(quantity => Math.min(quickViewVariant?.stock ?? quantity, quantity + 1))}><Plus size={12} /></button></div></div>
          </div>
          <div className="hero-quick-view-actions">
            <button className="button button-dark add-button" type="button" onClick={() => {
              if (!quickViewVariant) { setQuickViewMessage('Please select an available size before adding to your bag.'); return }
              setQuickViewMessage(addToBag(quickViewProduct.id, quickViewSize, quickViewColor, quickViewVariant.sku, quickViewQuantity) ? 'Added to your bag.' : 'There is not enough stock available.')
            }}>ADD TO BAG <Plus size={15} /></button>
            {quickViewMessage && <p className="form-message" role="status">{quickViewMessage}</p>}
            <Link className="button button-dark" to={`/product/${quickViewProduct.slug || quickViewProduct.id}`} onClick={() => setQuickViewProduct(null)}>VIEW FULL DETAILS <ArrowRight size={14} /></Link>
          </div>
        </div>
      </div>
    </div>}
    {homeSections.length ? <>{homeSections.filter(section => section.enabled && section.type !== 'hero').sort((a, b) => a.order - b.order).map(section => {
      const settings = section.settings
      if (section.type === 'featured-products') {
        const heading = String(settings.heading ?? section.title)
        const subtitle = String(settings.subtitle ?? '')
        const destination = String(settings.destination ?? '/shop')
        const viewAllLabel = String(settings.buttonLabel || 'Explore all')
        return <section className="section arrivals cms-featured-products selection-section" key={section.id}><div className="section-heading"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h2>{heading}</h2></div>{settings.showViewAll !== false && <StoreDestinationLink to={destination} className="text-link section-explore-link">{viewAllLabel.toLowerCase() === 'shop all' ? 'Explore all' : viewAllLabel} <ArrowUpRight size={14} /></StoreDestinationLink>}</div>{error ? <div className="catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></div> : <HomeSelectionCards cards={getSelectionCards(settings, products, collections)} products={products} collections={collections} imageLoading={loading} />}</section>
      }
      if (section.type === 'new-arrivals') {
        const items = arrivalsProducts
        const heading = String(settings.heading ?? section.title)
        const subtitle = String(settings.subtitle ?? '')
        const destination = String(settings.destination ?? '/shop')
        const viewAllLabel = String(settings.buttonLabel || 'Explore all')
        return <section className={`section arrivals cms-${section.type}`} key={section.id}><div className="section-heading"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h2>{heading}</h2></div>{settings.showViewAll !== false && <StoreDestinationLink to={destination} className="text-link section-explore-link">{viewAllLabel.toLowerCase() === 'shop all' ? 'Explore all' : viewAllLabel} <ArrowUpRight size={14} /></StoreDestinationLink>}</div>{loading ? <div className="product-grid home-grid product-loading-grid">{Array.from({ length: Math.min(3, Number(settings.limit ?? 3)) }, (_, index) => <ProductLoadingCard key={index} />)}</div> : error ? <div className="catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></div> : items.length ? <div className="product-grid home-grid">{items.slice(0, Number(settings.limit ?? 3)).map(product => <ProductCard key={product.id} product={product} showPrice={settings.showPrices !== false} />)}</div> : <p className="catalog-message">No products are available yet.</p>}</section>
      }
      if (section.type === 'editorial' || section.type === 'brand') {
        const destination = String(settings.destination ?? '/shop')
        return <section className="category-feature cms-editorial" key={section.id}><div className="category-image category-image-symbol"><img src="/off-studio-symbol.png" alt="OFF Studio symbol" loading="lazy" /></div><div className="category-copy"><p className="eyebrow">{String(settings.eyebrow || (section.id === 'editorial' ? 'DRESS WITH INTENTION' : 'OFF / STUDIO'))}</p><h2>{String(settings.heading ?? section.title)}</h2><p>{String(settings.description ?? '')}</p>{Boolean(settings.buttonLabel) && <StoreDestinationLink className="text-link" to={destination}>{String(settings.buttonLabel)} <ArrowRight size={14} /></StoreDestinationLink>}</div></section>
      }
      if (section.type === 'categories') return <section className="category-tiles" key={section.id}>{categories.map(category => { const card = Array.isArray(settings.categoryItems) ? (settings.categoryItems as { categoryId: string; title?: string; description?: string; image?: string; destination?: string }[]).find(item => item.categoryId === category.id) : undefined; return <StoreDestinationLink to={String(card?.destination || `/shop?category=${encodeURIComponent(category.name)}`)} className="category-tile" key={category.slug}><img src={card?.image ? imageUrl(card.image) : category.image || photo('photo-1503342217505-b0a15ec3261c', 700)} alt="" loading="lazy" /><span className="tile-label"><b>{card?.title || category.name}</b><small>{card?.description || `${category.productCount} pieces`}</small></span><ArrowRight size={17} /></StoreDestinationLink> })}</section>
      if (section.type === 'collection' || section.type === 'featured-release') { const collection = collections.find(item => item._id === settings.collectionId); const campaignImage = String(settings.image || collection?.image || ''); const destination = String(settings.destination || (collection ? `/collections/${collection.slug}` : '/collections')); return <section className="campaign" key={section.id}>{campaignImage && <img src={imageUrl(campaignImage)} alt="" loading="lazy" />}<div className="campaign-overlay"><p className="eyebrow">{String(settings.subtitle ?? '')}</p><h2>{String(settings.heading || collection?.name || section.title)}</h2>{Boolean(settings.description) && <p>{String(settings.description)}</p>}{Boolean(settings.buttonLabel) && <StoreDestinationLink className="button button-light" to={destination}>{String(settings.buttonLabel)} <ArrowRight size={14} /></StoreDestinationLink>}</div></section> }
      if (section.type === 'newsletter') return <Fragment key={section.id}><NewsletterSignupSection heading={String(settings.heading ?? 'Join the OFF list')} description={String(settings.description || 'Notes from the studio and new arrivals.')}/>{!homeSections.some(item => item.enabled && item.type === 'instagram-feed') && <InstagramFeedSection />}</Fragment>
      if (section.type === 'instagram-feed') return <InstagramFeedSection key={section.id} settings={settings} />
      if (section.type === 'footer-announcement') return <section className="section cms-footer-announcement" key={section.id}><p>{String(settings.heading ?? settings.description ?? section.title)}</p></section>
      if (section.type === 'rich-text') return <section className="section cms-rich-text" key={section.id}><p className="eyebrow">{String(settings.eyebrow ?? '')}</p><h2>{String(settings.heading ?? section.title)}</h2><p>{String(settings.description ?? '')}</p></section>
      return null
    })}{!homeSections.some(section => section.enabled && (section.type === 'newsletter' || section.type === 'instagram-feed')) && <InstagramFeedSection />}</> : <>
      <section className="section arrivals"><div className="section-heading"><h2>New arrivals</h2><Link to="/shop" className="text-link section-explore-link">Explore all <ArrowUpRight size={14} /></Link></div>{loading ? <div className="product-grid home-grid product-loading-grid">{Array.from({ length: 3 }, (_, index) => <ProductLoadingCard key={index} />)}</div> : error ? <div className="catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></div> : products.length ? <div className="product-grid home-grid">{products.slice(0, 3).map(product => <ProductCard key={product.id} product={product} />)}</div> : <p className="catalog-message">No products are available yet.</p>}</section>
      <section className="category-feature"><div className="category-image"><img src={photo('photo-1529139574466-a303027c1d8b', 1300)} alt="OFF ready-to-wear collection" /></div><div className="category-copy"><p className="eyebrow">DRESS WITH INTENTION</p><h2>Uniform<br />for the<br />unordinary.</h2><p>Essential forms. Unexpected details. A wardrobe designed to move with you.</p><Link className="text-link" to="/shop">Explore ready-to-wear <ArrowRight size={14} /></Link></div></section>
      <section className="category-tiles">{[['MEN', 'Shop the collection', 'photo-1503342217505-b0a15ec3261c'], ['WOMEN', 'Discover the edit', 'photo-1515886657613-9f3515b0c78f'], ['ACCESSORIES', 'Complete the look', 'photo-1521369909029-2afed882baee']].map(([title, sub, image]) => <Link to="/shop" className="category-tile" key={title}><img src={photo(image, 700)} alt="" loading="lazy" /><span className="tile-label"><b>{title}</b><small>{sub}</small></span><ArrowRight size={17} /></Link>)}</section>
      <section className="campaign"><img src={photo('photo-1523398002811-999ca8dec234', 1800)} alt="OFF campaign, made for the everyday" loading="lazy" /><div className="campaign-overlay"><p className="eyebrow">{content.campaignEyebrow}</p><h2>{content.campaignTitle}</h2><Link className="button button-light" to="/shop">DISCOVER OFF <ArrowRight size={14} /></Link></div></section>
      <InstagramFeedSection />
    </>}
  </main><Footer announcement={String(homeSections.find(section => section.type === 'footer-announcement' && section.enabled)?.settings.heading ?? '')} /></>
}

function Shop() {
  const { products, categories, collections, homeSections, loading, error, reload } = useCatalog()
  const [params, setParams] = useSearchParams()
  const [filterOpen, setFilterOpen] = useState(false)
  const category = params.get('category') ?? ''
  const query = params.get('q')?.toLowerCase() ?? ''
  const sort = params.get('sort') ?? 'featured'
  const selectedSize = params.get('size') ?? ''
  const selectedColors = params.getAll('color')
  const selectedCollections = params.getAll('collection')
  const collection = selectedCollections.length === 1 ? collections.find(item => item.slug === selectedCollections[0]) : undefined
  const requestedPrice = Number(params.get('price') ?? '5000')
  const maxPrice = Number.isFinite(requestedPrice) ? Math.min(5000, Math.max(0, requestedPrice)) : 5000
  const page = Math.max(1, Number(params.get('page') ?? '1'))
  const filterKey = params.toString()
  const [filtered, setFiltered] = useState<Product[]>([])
  const [filteredCount, setFilteredCount] = useState(0)
  const totalPages = Math.max(1, Math.ceil(filteredCount / 6))
  const [listingLoading, setListingLoading] = useState(true)
  const [listingError, setListingError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const apiParams = new URLSearchParams(filterKey)
    apiParams.set('limit', '6')
    apiParams.set('page', String(page))
    if (maxPrice < 5000) apiParams.set('price', String(maxPrice))
    else apiParams.delete('price')
    setListingLoading(true)
    setListingError('')
    fetch(`${API_BASE_URL}/products?${apiParams}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Product search failed (${response.status}).`)
        return await response.json() as { data: ApiProduct[]; pagination: { total: number } }
      })
      .then((payload) => {
        if (!Array.isArray(payload.data) || !payload.pagination) throw new Error('Product search returned an invalid response.')
        setFiltered(payload.data.map(mapProduct))
        setFilteredCount(payload.pagination.total)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setListingError(cause instanceof Error ? cause.message : 'Unable to search products.')
      })
      .finally(() => { if (!controller.signal.aborted) setListingLoading(false) })
    return () => controller.abort()
  }, [filterKey, page, maxPrice])
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.delete(key)
    value ? next.set(key, value) : next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }
  const toggleMultiFilter = (key: 'collection' | 'color', value: string) => {
    const next = new URLSearchParams(params)
    const selected = next.getAll(key)
    next.delete(key)
    for (const item of selected) if (item !== value) next.append(key, item)
    if (!selected.includes(value)) next.append(key, value)
    next.delete('page')
    setParams(next)
  }
  const colorChoices = Array.from(new Set(products.flatMap(product => product.variants.filter(variant => variant.active).map(variant => variant.color.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b))
  const selectionSection = homeSections.find(section => section.enabled && section.type === 'featured-products')
  const selectionCards = getSelectionCards(selectionSection?.settings ?? {}, products, collections)
  const linkedCollectionOptions = selectionCards.flatMap(card => {
    const item = collections.find(collection => collection._id === card.collectionId)
    return item ? [{ card, collection: item }] : []
  }).filter((entry, index, entries) => entries.findIndex(candidate => candidate.collection._id === entry.collection._id) === index)
  const collectionOptions = linkedCollectionOptions.length
    ? linkedCollectionOptions
    : collections.map(item => ({ card: { title: item.name }, collection: item }))
  const clearFilters = () => { setParams(query ? { q: query } : {}) }
  const activeFilterCount = [selectedSize, ...selectedColors, ...selectedCollections].filter(Boolean).length
  const filterOptions = <div className="shop-filter-options">
    <div className="filter-group"><h3>Collection</h3><div className="size-chips shop-filter-chips" role="group" aria-label="Filter by collection">{collectionOptions.map(({ card, collection: item }) => <button type="button" key={item._id} className={selectedCollections.includes(item.slug) ? 'selected' : ''} aria-pressed={selectedCollections.includes(item.slug)} onClick={() => toggleMultiFilter('collection', item.slug)}>{card.title}</button>)}</div></div>
    <div className="filter-group"><h3>Size</h3><div className="size-chips">{['XS', 'S', 'M', 'L', 'XL'].map(size => <button type="button" key={size} className={selectedSize === size ? 'selected' : ''} aria-pressed={selectedSize === size} onClick={() => updateFilter('size', selectedSize === size ? '' : size)}>{size}</button>)}</div></div>
    <div className="filter-group"><h3>Product color</h3><div className="size-chips shop-filter-chips" role="group" aria-label="Filter by product color">{colorChoices.map(color => <button type="button" key={color} className={selectedColors.includes(color) ? 'selected' : ''} aria-pressed={selectedColors.includes(color)} onClick={() => toggleMultiFilter('color', color)}>{color}</button>)}</div></div>
    <button className="clear-filter" type="button" onClick={clearFilters}>Clear all filters</button>
  </div>
  const sidebarFilters = <>
    <h3>Categories</h3>
    <button className={!category ? 'selected' : ''} type="button" onClick={() => updateFilter('category', '')}>All pieces <span>{products.length}</span></button>
    {categories.map(item => <button key={item.slug} type="button" className={category === item.name ? 'selected' : ''} onClick={() => updateFilter('category', item.name)}>{item.name}<span>{item.productCount || '—'}</span></button>)}
    <div className="filter-group"><h3>Price — up to {formatTnd(maxPrice)}</h3><input type="range" min="0" max="5000" step="50" value={maxPrice} onChange={event => updateFilter('price', event.target.value === '5000' ? '' : event.target.value)} /><div className="price-range"><span>{formatTnd(0)}</span><span>{formatTnd(5000)}+</span></div></div>
    <button className="clear-filter" type="button" onClick={clearFilters}>Clear all filters</button>
  </>
  return <><main className="shop-page page-shell">
    <div className="breadcrumbs"><Link to="/">Home</Link><span>/</span><span>Shop</span></div>
    <div className="collection-title"><div className="collection-title-main"><div className="collection-title-line"><h1>{collection?.name || (selectedCollections.length > 1 ? 'Selected collections' : category || 'Ready-to-Wear')}</h1><span className="collection-count" aria-label={`${filteredCount} products`}>{filteredCount}</span></div>{collection?.description && <p>{collection.description}</p>}</div><div className="shop-toolbar-actions"><label>Sort by <select value={sort} onChange={event => updateFilter('sort', event.target.value === 'featured' ? '' : event.target.value)}><option value="featured">Featured</option><option value="manual">Manual Order</option><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label><button className="filter-trigger" onClick={() => setFilterOpen(true)}>FILTER<span>{activeFilterCount + (category ? 1 : 0)}</span></button></div></div>
    <div className="shop-layout"><aside className="filter-sidebar">{sidebarFilters}</aside>
      <div className="listing-area">{loading || listingLoading ? <p className="catalog-message">Loading the collection…</p> : error || listingError ? <div className="catalog-message"><p>{error || listingError}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></div> : <>{(query || category || selectedSize || selectedColors.length > 0 || selectedCollections.length > 0 || maxPrice < 5000) && <div className="selected-filters">{query && <span>Search: “{query}”</span>}{category && <span>{category}</span>}{selectedCollections.map(slug => <span key={`collection-${slug}`}>{collections.find(item => item.slug === slug)?.name ?? slug}</span>)}{selectedSize && <span>Size {selectedSize}</span>}{selectedColors.map(color => <span key={`color-${color}`}>{color}</span>)}{maxPrice < 5000 && <span>Up to {formatTnd(maxPrice)}</span>}<button className="text-link" onClick={clearFilters}>Clear all</button></div>}{filtered.length ? <div className="product-grid listing-grid">{filtered.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><p className="eyebrow">NOTHING FOUND</p><h2>No pieces match your search.</h2><button className="text-link" onClick={clearFilters}>Clear filters <ArrowRight size={14} /></button></div>}<div className="pagination shop-pagination" role="group" aria-label="Product pages"><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => updateFilter('page', String(page - 1))}><ArrowLeft size={16} strokeWidth={1.5} /></button><div className="hero-slider-progress">{Array.from({ length: totalPages }, (_, index) => <button type="button" key={index} className={index + 1 === page ? 'active' : ''} aria-label={`Go to page ${index + 1}`} aria-current={index + 1 === page ? 'page' : undefined} onClick={() => updateFilter('page', String(index + 1))} />)}</div><button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => updateFilter('page', String(page + 1))}><ArrowRight size={16} strokeWidth={1.5} /></button></div></>}</div>
    </div>
  </main><Footer />{filterOpen && <div className="drawer-backdrop" onClick={() => setFilterOpen(false)}><div className="filter-drawer" onClick={e => e.stopPropagation()}><button className="drawer-close" onClick={() => setFilterOpen(false)} aria-label="Close filters"><X size={18} /></button><p className="eyebrow">REFINE YOUR EDIT</p><h2>Filters</h2>{filterOptions}<button className="button button-dark" onClick={() => setFilterOpen(false)}>VIEW {filteredCount} PIECES</button></div></div>}</>
}

function CollectionsPage() {
  const { products, collections, homeSections, loading, error, reload } = useCatalog()
  const selectionSection = homeSections.find(section => section.enabled && section.type === 'featured-products')
  const selectionCards = getSelectionCards(selectionSection?.settings ?? {}, products, collections)
  return <><main className="page-shell shop-page"><div className="breadcrumbs"><Link to="/">Home</Link><span>/</span><span>Collections</span></div><div className="collection-title"><div><p className="eyebrow">THE OFF EDIT</p><h1>Collections</h1></div><span>{selectionCards.length} edits</span></div>{loading ? <p className="catalog-message">Loading collections…</p> : error ? <div className="catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></div> : selectionCards.length ? <div className="collections-edition-list">{selectionCards.map((card, index) => {
    const collection = collections.find(item => item._id === card.collectionId)
    const relatedProducts = (collection?.productIds ?? []).slice(0, 4)
      .map(id => products.find(product => product.id === id))
      .filter((product): product is Product => Boolean(product))
    return <section className="collection-edition-row" key={`${card.title}-${collection?._id ?? index}`}>
      <div className="collection-edition-feature"><HomeSelectionCards cards={[card]} products={products} collections={collections} /></div>
      <div className="collection-edition-products">{relatedProducts.map(product => <ProductCard key={product.id} product={product} />)}</div>
    </section>
  })}</div> : <div className="empty-state"><p className="eyebrow">COMING SOON</p><h2>Curated edits are on their way.</h2><Link className="text-link" to="/shop">Shop all pieces <ArrowRight size={14} /></Link></div>}</main><Footer /></>
}

function ProductPage({ addToBag }: { addToBag: (id: string, size: string, color: string, sku: string) => boolean }) {
  const { products, content, loading, error, reload } = useCatalog()
  const location = useLocation()
  const id = location.pathname.split('/').filter(Boolean).pop() ?? ''
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [id])
  const product = products.find(item => item.id === id || item.slug === id)
  const [mainImage, setMainImage] = useState('')
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState('DESCRIPTION')
  useEffect(() => {
    if (product) {
      setMainImage(product.image)
      setColor(product.variants.find((variant) => variant.active && variant.stock > 0)?.color ?? product.variants.find((variant) => variant.active)?.color ?? '')
      setSize('')
    }
  }, [product?.id, product?.variants])
  if (loading) return <main className="page-shell catalog-message">Loading product…</main>
  if (error) return <main className="page-shell catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></main>
  if (!product) return <main className="page-shell empty-state"><p className="eyebrow">PIECE NOT FOUND</p><h1>This piece is no longer available.</h1><Link className="button button-dark" to="/shop">CONTINUE SHOPPING</Link></main>
  const activeVariants = product.variants.filter((variant) => variant.active)
  const colors = [...new Set(activeVariants.map((variant) => variant.color))]
  const colorVariants = activeVariants.filter((variant) => variant.color === color)
  const sizes = [...new Set(colorVariants.map((variant) => variant.size))]
  const productOutOfStock = activeVariants.length === 0 || activeVariants.every((variant) => variant.stock < 1)
  const selectedVariant = product.variants.find((variant) => variant.active && variant.color === color && variant.size === size && variant.stock > 0)
  const galleryImages = [...new Set([...(product.gallery.length ? product.gallery : [product.image]), product.secondary].filter(Boolean))]
  return <><main className="product-page page-shell"><div className="breadcrumbs"><Link to="/">Home</Link><span>/</span><Link to="/shop">Shop</Link><span>/</span><span>{product.name}</span></div><section className="product-detail"><div className="product-gallery"><div className="gallery-main"><img src={mainImage || product.image} alt={product.name} />{productOutOfStock && <span className="product-stock-badge">OUT OF STOCK</span>}</div>{galleryImages.map((image, index) => <button className={`gallery-thumb ${mainImage === image ? 'active' : ''}`} key={`${image}-${index}`} aria-label={`Show ${product.name}, image ${index + 1}`} aria-pressed={mainImage === image} onClick={() => setMainImage(image)}><img src={image} alt={`${product.name}, view ${index + 1}`} /></button>)}</div><div className="product-info"><p className="eyebrow">{product.category} / OFF ESSENTIALS</p><h1>{product.name}</h1><p className="product-price">{formatTnd(selectedVariant?.price ?? product.price)}</p><p className="product-description">A considered silhouette with a relaxed fit, crafted for everyday movement. Finished with signature OFF detailing.</p><div className="variant-block"><div className="variant-title"><span>Color</span><span>{color}</span></div><div className="swatches">{colors.map((variantColor) => { const variantsForColor = activeVariants.filter((item) => item.color === variantColor); const inStock = variantsForColor.some((item) => item.stock > 0); const variantImage = variantsForColor.find((item) => item.stock > 0 && item.image)?.image ?? variantsForColor.find((item) => item.image)?.image; return <button type="button" key={variantColor} disabled={!inStock} aria-label={`Select color ${variantColor}${inStock ? '' : ', out of stock'}`} title={`${variantColor}${inStock ? '' : ' · Out of stock'}`} aria-pressed={color === variantColor} className={`swatch ${color === variantColor ? 'active' : ''} ${!inStock ? 'unavailable' : ''}`} style={{ background: colorStyle(variantColor) }} onClick={() => { setColor(variantColor); setSize(''); setMessage(''); if (variantImage) setMainImage(variantImage) }} /> })}</div></div><div className="variant-block"><div className="variant-title"><span>Select size</span><button type="button" className="text-link" onClick={() => setMessage('Our model is 188cm and wears size M.')}>Size guide <ArrowDown size={12} /></button></div><div className="size-options">{sizes.map(item => { const inStock = colorVariants.some((entry) => entry.size === item && entry.stock > 0); return <button type="button" key={item} disabled={!inStock} aria-label={`Size ${item}${inStock ? '' : ', out of stock'}`} onClick={() => { setSize(item); setMessage('') }} className={size === item ? 'active' : ''}>{item}</button> })}</div></div><button className="button button-dark add-button" disabled={productOutOfStock} onClick={() => { if (!selectedVariant) { setMessage('Please select an available size before adding to your bag.'); return } setMessage(addToBag(product.id, size, color, selectedVariant.sku) ? 'Added to your bag.' : 'There is not enough stock available.') }}>{productOutOfStock ? 'OUT OF STOCK' : 'ADD TO BAG'} {!productOutOfStock && <Plus size={15} />}</button>{message && <p className="form-message">{message}</p>}<p className="delivery-note"><Check size={14} /> Complimentary shipping on orders over {formatTnd(content.freeShippingThreshold)}</p><div className="accordion">{['DESCRIPTION', 'DETAILS', 'SIZE & FIT', 'MATERIALS & CARE', 'SHIPPING & RETURNS'].map(title => <div key={title}><button onClick={() => setExpanded(expanded === title ? '' : title)}>{title}<Plus size={14} /></button>{expanded === title && <p>{title === 'DESCRIPTION' ? 'A modern essential, designed in Los Angeles and made with considered materials. Clean lines, elevated details, enduring quality.' : 'Designed for a relaxed, contemporary fit. Complimentary shipping and easy returns within 14 days.'}</p>}</div>)}</div></div></section><section className="section related"><div className="section-heading"><p className="eyebrow">COMPLETE THE LOOK</p><h2>You may also like</h2></div><div className="product-grid home-grid">{products.filter((item) => item.id !== product.id).slice(0, 3).map(item => <ProductCard key={item.id} product={item} />)}</div></section></main><Footer /></>
}

function Cart({ bag, updateBag }: { bag: BagItem[]; updateBag: (items: BagItem[]) => void }) {
  const { products, content, loading, error, reload } = useCatalog()
  const navigate = useNavigate()
  const total = bag.reduce((sum, item) => sum + (products.find(p => p.id === item.productId)?.variants.find(variant => variant.sku === item.sku)?.price ?? item.price) * item.quantity, 0)
  if (loading) return <main className="page-shell catalog-message">Loading your bag…</main>
  if (error) return <main className="page-shell catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></main>
  return <><main className="page-shell cart-page"><div className="breadcrumbs"><Link to="/">Home</Link><span>/</span><span>Your bag</span></div><div className="page-title-center"><p className="eyebrow">YOUR SELECTION</p><h1>YOUR BAG ({bag.reduce((sum, item) => sum + item.quantity, 0)})</h1></div>{bag.length ? <div className="cart-layout"><div className="cart-lines">{bag.map((item, index) => { const product = products.find(p => p.id === item.productId); if (!product) return <article className="cart-line unavailable-line" key={`${item.productId}-${item.size}-${index}`}><img src={item.image} alt="" /><div className="cart-line-details"><span>{item.name} — no longer available</span><span>{item.color} / {item.size}</span></div><strong>{formatTnd(item.price * item.quantity)}</strong><button className="remove-item" aria-label={`Remove ${item.name}`} onClick={() => updateBag(bag.filter((_, i) => i !== index))}><X size={15} /></button></article>; return <article className="cart-line" key={`${item.productId}-${item.size}-${index}`}><Link to={`/product/${product.slug}`}><img src={product.image} alt={product.name} /></Link><div className="cart-line-details"><Link to={`/product/${product.slug}`}>{product.name}</Link><span>{item.color} / {item.size}</span><div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => updateBag(bag.map((line, i) => i === index ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line))}><Minus size={12} /></button><span>{item.quantity}</span><button aria-label="Increase quantity" onClick={() => updateBag(bag.map((line, i) => i === index ? { ...line, quantity: Math.min(product.variants.find(v => v.sku === item.sku)?.stock ?? line.quantity, line.quantity + 1) } : line))}><Plus size={12} /></button></div></div><strong>{formatTnd(product.price * item.quantity)}</strong><button className="remove-item" aria-label={`Remove ${product.name}`} onClick={() => updateBag(bag.filter((_, i) => i !== index))}><X size={15} /></button></article> })}</div><aside className="order-summary"><h2>Order summary</h2><div><span>Subtotal</span><span>{formatTnd(total)}</span></div><div><span>Shipping</span><span>Calculated at checkout</span></div><div className="summary-total"><span>Total</span><strong>{formatTnd(total)}</strong></div><button className="button button-dark" onClick={() => navigate('/checkout')} disabled={bag.some((item) => !products.some((product) => product.id === item.productId))}>PROCEED TO CHECKOUT <ArrowRight size={14} /></button><p>{content.announcement}</p></aside></div> : <div className="empty-bag"><ShoppingBag size={26} strokeWidth={1.2} /><h2>Your bag is currently empty.</h2><p>Discover pieces made to move with you.</p><Link className="button button-dark" to="/shop">CONTINUE SHOPPING <ArrowRight size={14} /></Link></div>}</main><Footer /></>
}

function CartDrawer({ open, onClose, bag, products, updateBag }: { open: boolean; onClose: () => void; bag: BagItem[]; products: Product[]; updateBag: (items: BagItem[]) => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const triggerRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(() => localStorage.getItem('off-cart-note') ?? '')
  const total = bag.reduce((sum, item) => sum + (products.find(product => product.id === item.productId)?.variants.find(variant => variant.sku === item.sku)?.price ?? item.price) * item.quantity, 0)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return }
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; triggerRef.current?.focus() }
  }, [open, onClose])
  useEffect(() => { if (open) onClose() }, [location.pathname])
  useEffect(() => { localStorage.setItem('off-cart-note', note.slice(0, 500)) }, [note])
  if (!open) return null

  const changeQuantity = (index: number, delta: number) => {
    const item = bag[index]
    const product = products.find(entry => entry.id === item.productId)
    const variant = product?.variants.find(entry => entry.sku === item.sku)
    const nextQuantity = item.quantity + delta
    if (nextQuantity < 1 || nextQuantity > (variant?.stock ?? item.quantity)) return
    updateBag(bag.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: nextQuantity, price: variant?.price ?? line.price, name: product?.name ?? line.name, image: product?.image ?? line.image } : line))
  }
  const checkout = () => { if (!bag.length) return; onClose(); navigate('/checkout') }

  return <div className="cart-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" tabIndex={-1} ref={dialogRef}>
      <header className="cart-drawer-header"><h2 id="cart-drawer-title">CART{bag.length > 0 ? ` (${bag.reduce((sum, item) => sum + item.quantity, 0)})` : ''}</h2><button type="button" className="cart-drawer-close" aria-label="Close cart" onClick={onClose}><X size={20} strokeWidth={1.4} /></button></header>
      {bag.length ? <><div className="cart-drawer-items">{bag.map((item, index) => {
        const product = products.find(entry => entry.id === item.productId)
        const variant = product?.variants.find(entry => entry.sku === item.sku)
        const unavailable = !product || !variant?.active
        const maxStock = variant?.stock ?? item.quantity
        return <article className={`cart-drawer-item${unavailable ? ' is-unavailable' : ''}`} key={`${item.productId}-${item.sku}`}>
          <Link className="cart-drawer-image" to={product ? `/product/${product.slug}` : '/cart'} onClick={onClose}><img src={variant?.image || product?.image || item.image} alt={product?.name ?? item.name} /></Link>
          <div className="cart-drawer-item-info"><p className="cart-drawer-label">OFF ESSENTIALS</p><h3>{product?.name ?? item.name}</h3><p className="cart-drawer-variant">{item.color} / {item.size}</p><p className="cart-drawer-price">{formatTnd((variant?.price ?? item.price) * item.quantity)}</p>{unavailable && <p className="cart-drawer-stock">This item is unavailable. Remove it to continue.</p>}
            <div className="cart-drawer-item-actions"><div className="quantity-control"><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1 || unavailable} onClick={() => changeQuantity(index, -1)}><Minus size={12} /></button><span aria-live="polite">{item.quantity}</span><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= maxStock || unavailable} onClick={() => changeQuantity(index, 1)}><Plus size={12} /></button></div><button className="cart-drawer-remove" type="button" onClick={() => updateBag(bag.filter((_, lineIndex) => lineIndex !== index))}>Remove</button></div>
          </div>
        </article>
      })}</div><footer className="cart-drawer-footer"><button className="cart-note-toggle" type="button" aria-expanded={noteOpen} onClick={() => setNoteOpen(value => !value)}>{noteOpen ? 'Close order note' : 'Add order note'}<span>{noteOpen ? '−' : '+'}</span></button>{noteOpen && <label className="cart-note-field"><span className="sr-only">Order note, up to 500 characters</span><textarea maxLength={500} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Add a note to your order" /><small>{note.length}/500</small></label>}<p className="cart-shipping-note">Taxes and shipping calculated at checkout.</p><div className="cart-subtotal"><span>Subtotal</span><strong>{formatTnd(total)}</strong></div><button className="button button-dark cart-checkout" type="button" onClick={checkout} disabled={bag.some(item => !products.some(product => product.id === item.productId && product.variants.some(variant => variant.sku === item.sku && variant.active && variant.stock >= item.quantity)))}>CHECKOUT <ArrowRight size={15} /></button></footer></> : <div className="cart-drawer-empty"><ShoppingBag size={26} strokeWidth={1.2} /><p className="eyebrow">YOUR BAG IS EMPTY</p><h3>Discover the latest OFF collection.</h3><button className="button button-dark" type="button" onClick={() => { onClose(); navigate('/shop') }}>CONTINUE SHOPPING</button></div>}
    </section>
  </div>
}

function Checkout({ bag, clearBag }: { bag: BagItem[]; clearBag: () => void }) {
  return CLERK_PUBLISHABLE_KEY ? <AuthenticatedCheckout bag={bag} clearBag={clearBag} /> : <CheckoutForm bag={bag} clearBag={clearBag} />
}

function CheckoutForm({ bag, clearBag, getSessionToken, customerProfile, authenticated = false }: { bag: BagItem[]; clearBag: () => void; getSessionToken?: () => Promise<string | null>; customerProfile?: { email: string; firstName: string; lastName: string; phoneNumber: string }; authenticated?: boolean }) {
  const { products, loading, error, reload } = useCatalog()
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [placedOrder, setPlacedOrder] = useState<CashOnDeliveryOrderResponse | null>(null)
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phoneNumber: '', line1: '', line2: '', postalCode: '', governorate: 'Tunis', delegation: 'Bab Bhar' })
  const [savedAddresses, setSavedAddresses] = useState<CheckoutSavedAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [addressesLoading, setAddressesLoading] = useState(false)
  const [addressesError, setAddressesError] = useState('')
  const [saveAddress, setSaveAddress] = useState(false)
  const [addressLabel, setAddressLabel] = useState('Home')
  const [savedAddressMessage, setSavedAddressMessage] = useState('')
  const governorates = Object.keys(TUNISIA_LOCATIONS)
  const delegations = TUNISIA_LOCATIONS[form.governorate] ?? []
  const total = bag.reduce((sum, item) => sum + (products.find(p => p.id === item.productId)?.variants.find(variant => variant.sku === item.sku)?.price ?? item.price) * item.quantity, 0)

  useEffect(() => {
    if (!customerProfile) return
    setForm(current => ({
      ...current,
      email: current.email || customerProfile.email,
      firstName: current.firstName || customerProfile.firstName,
      lastName: current.lastName || customerProfile.lastName,
      phoneNumber: current.phoneNumber || customerProfile.phoneNumber,
    }))
  }, [customerProfile?.email, customerProfile?.firstName, customerProfile?.lastName, customerProfile?.phoneNumber])

  useEffect(() => {
    if (!authenticated || !getSessionToken) return
    let cancelled = false
    setAddressesLoading(true)
    setAddressesError('')
    void (async () => {
      try {
        const token = await getSessionToken()
        if (!token) throw new Error('Your customer session could not be verified. Please sign in again.')
        const response = await fetch(`${API_BASE_URL}/account/addresses`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        const payload = await response.json() as { data?: { addresses?: CheckoutSavedAddress[] }; error?: { message?: string } }
        if (!response.ok || !Array.isArray(payload.data?.addresses)) throw new Error(payload.error?.message ?? 'Unable to load your saved addresses.')
        if (cancelled) return
        const addresses = payload.data.addresses
        setSavedAddresses(addresses)
        const preferred = addresses.find(address => address.isDefault) ?? addresses[0]
        if (preferred) {
          setSelectedAddressId(preferred._id)
          setForm(current => applyCheckoutAddress(current, preferred))
        }
      } catch (cause) {
        if (!cancelled) setAddressesError(cause instanceof Error ? cause.message : 'Unable to load your saved addresses.')
      } finally {
        if (!cancelled) setAddressesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authenticated, getSessionToken])

  const selectSavedAddress = (addressId: string) => {
    setSelectedAddressId(addressId)
    setSaveAddress(false)
    setSavedAddressMessage('')
    if (!addressId) {
      const firstGovernorate = governorates.includes('Tunis') ? 'Tunis' : governorates[0]
      setForm(current => ({ ...current, line1: '', line2: '', postalCode: '', phoneNumber: customerProfile?.phoneNumber ?? '', governorate: firstGovernorate, delegation: TUNISIA_LOCATIONS[firstGovernorate]?.[0] ?? '' }))
      return
    }
    const address = savedAddresses.find(item => item._id === addressId)
    if (address) setForm(current => applyCheckoutAddress(current, address))
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    setSavedAddressMessage('')
    try {
      const sessionToken = await getSessionToken?.()
      if (authenticated && !sessionToken) throw new Error('Your customer session could not be verified. Please sign in again.')
      if (authenticated && saveAddress) {
        if (!form.phoneNumber.trim() || form.phoneNumber.trim().length < 7) throw new Error('Enter a valid phone number to save this delivery address.')
        const addressResponse = await fetch(`${API_BASE_URL}/account/addresses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
          body: JSON.stringify({
            label: addressLabel.trim() || 'Checkout',
            fullName: `${form.firstName} ${form.lastName}`.trim(),
            phoneNumber: form.phoneNumber.trim(),
            addressLine1: form.line1,
            addressLine2: form.line2,
            city: form.delegation,
            postalCode: form.postalCode,
            country: 'TN',
            governorate: form.governorate,
            delegation: form.delegation,
            isDefault: savedAddresses.length === 0,
          }),
        })
        const addressPayload = await addressResponse.json() as { data?: { address?: CheckoutSavedAddress; addresses?: CheckoutSavedAddress[] }; error?: { message?: string } }
        if (!addressResponse.ok || !addressPayload.data?.address) throw new Error(addressPayload.error?.message ?? 'Your address could not be saved. Please review it and try again.')
        setSavedAddresses(addressPayload.data.addresses ?? [...savedAddresses, addressPayload.data.address])
        setSelectedAddressId(addressPayload.data.address._id)
        setSaveAddress(false)
        setSavedAddressMessage('This address has been saved to your account.')
      }
      const orderRequest: CashOnDeliveryOrderRequest = {
        customer: { name: `${form.firstName} ${form.lastName}`.trim(), email: form.email },
        shippingAddress: {
          line1: form.line1,
          line2: form.line2,
          phoneNumber: form.phoneNumber,
          city: form.delegation,
          postalCode: form.postalCode,
          country: 'TN',
          governorate: form.governorate,
          delegation: form.delegation,
        },
        items: bag.map(item => ({ productId: item.productId, sku: item.sku, quantity: item.quantity })),
        orderNote: localStorage.getItem('off-cart-note')?.slice(0, 500) ?? '',
      }
      const response = await fetch(`${API_BASE_URL}/orders/checkout/cod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
        body: JSON.stringify(orderRequest),
      })
      const payload = await response.json() as Partial<ApiResponse<CashOnDeliveryOrderResponse>> & { error?: { message?: string } }
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? 'Unable to place your order.')
      setPlacedOrder(payload.data)
      localStorage.removeItem('off-cart-note')
      clearBag()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Unable to place your order.')
    } finally {
      setSubmitting(false)
    }
  }
  if (loading) return <main className="page-shell catalog-message">Loading checkout…</main>
  if (error) return <main className="page-shell catalog-message"><p>{error}</p><button className="text-link" onClick={reload}>Try again <ArrowRight size={14} /></button></main>
  if (placedOrder) return <main className="page-shell confirmation"><div className="confirmation-mark"><Check size={24} /></div><p className="eyebrow">ORDER CONFIRMED</p><h1>Thank you.</h1><p>Your order is confirmed. Pay {formatTnd(placedOrder.total)} in cash when it is delivered.</p><p>Order {placedOrder.orderNumber}</p><Link className="button button-dark" to="/">RETURN TO OFF</Link></main>
  if (!bag.length) return <><main className="page-shell empty-state"><p className="eyebrow">YOUR BAG IS EMPTY</p><h1>Add something to your bag before checkout.</h1><Link className="button button-dark" to="/shop">DISCOVER THE COLLECTION <ArrowRight size={14} /></Link></main><Footer /></>
  if (bag.some(item => !products.some(product => product.id === item.productId && product.variants.some(variant => variant.sku === item.sku && variant.active)))) return <main className="page-shell catalog-message"><p>A piece in your bag is no longer available. Remove it before checkout.</p><Link className="text-link" to="/cart">Review your bag <ArrowRight size={14} /></Link></main>
  return <><main className="page-shell checkout-page"><div className="breadcrumbs"><Link to="/">Home</Link><span>/</span><Link to="/cart">Bag</Link><span>/</span><span>Checkout</span></div><div className="checkout-steps"><span className="active">01 Information</span><span className="active">02 Delivery</span><span className="active">03 Payment</span></div><h1>CONTACT INFORMATION</h1><form className="checkout-form" onSubmit={submit}><label>Email address (optional)<input type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="name@email.com" /></label>{authenticated && <><label>Saved delivery address<select aria-label="Saved delivery address" value={selectedAddressId} onChange={event => selectSavedAddress(event.target.value)}><option value="">Enter a new address</option>{savedAddresses.map(address => <option key={address._id} value={address._id}>{address.label}{address.isDefault ? ' · Default' : ''} — {address.addressLine1}, {address.city}</option>)}</select></label>{addressesLoading && <p className="payment-note">Loading your saved addresses…</p>}{addressesError && <p className="form-message" role="alert">{addressesError}</p>}</>}<h2>SHIPPING ADDRESS · TUNISIA</h2><div className="form-row"><input aria-label="First name" autoComplete="given-name" value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} placeholder="First name" required /><input aria-label="Last name" autoComplete="family-name" value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} placeholder="Last name" required /></div><label>Phone number<input type="tel" autoComplete="tel" value={form.phoneNumber} onChange={event => setForm({ ...form, phoneNumber: event.target.value })} placeholder="Phone number" /></label><input aria-label="Address" autoComplete="address-line1" value={form.line1} onChange={event => setForm({ ...form, line1: event.target.value })} placeholder="Street address" required /><input aria-label="Apartment" autoComplete="address-line2" value={form.line2} onChange={event => setForm({ ...form, line2: event.target.value })} placeholder="Apartment, suite, etc. (optional)" /><div className="form-row"><select aria-label="Governorate" value={form.governorate} onChange={event => { const governorate = event.target.value; const nextDelegation = TUNISIA_LOCATIONS[governorate][0]; setForm(current => ({ ...current, governorate, delegation: nextDelegation })) }} required>{governorates.map(governorate => <option key={governorate} value={governorate}>{governorate}</option>)}</select><select aria-label="Delegation" value={form.delegation} onChange={event => setForm(current => ({ ...current, delegation: event.target.value }))} required>{delegations.map(delegation => <option key={delegation} value={delegation}>{delegation}</option>)}</select></div><label>Postal code (optional)<input autoComplete="postal-code" value={form.postalCode} onChange={event => setForm({ ...form, postalCode: event.target.value })} placeholder="Postal code" /></label>{authenticated && !selectedAddressId && <div className="checkout-save-address"><label><input type="checkbox" checked={saveAddress} onChange={event => setSaveAddress(event.target.checked)} /> Save this address to my account</label>{saveAddress && <label>Address name<input value={addressLabel} onChange={event => setAddressLabel(event.target.value)} placeholder="Home, Work…" /></label>}</div>}{savedAddressMessage && <p className="payment-note" role="status">{savedAddressMessage}</p>}<h2>DELIVERY METHOD</h2><label className="shipping-choice"><input type="radio" name="shipping" checked readOnly /><span>Standard delivery · 3–5 days</span><b>Complimentary</b></label><h2>PAYMENT</h2><label className="shipping-choice"><input type="radio" name="payment" checked readOnly /><span>Cash on delivery</span><b>Pay when delivered</b></label><p className="payment-note">Your order total is payable in cash upon delivery.</p>{formError && <p className="form-message" role="alert">{formError}</p>}<div className="checkout-total"><span>Order total</span><strong>{formatTnd(total)}</strong></div><button className="button button-dark checkout-submit" disabled={submitting}>{submitting ? 'PLACING YOUR ORDER…' : 'CONFIRM ORDER — PAY ON DELIVERY'} <ArrowRight size={14} /></button></form></main><Footer /></>
}

function AuthenticatedCheckout({ bag, clearBag }: { bag: BagItem[]; clearBag: () => void }) {
  const { getToken } = useAuth()
  const { user } = useUser()
  const customerProfile = { email: user?.primaryEmailAddress?.emailAddress ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phoneNumber: user?.primaryPhoneNumber?.phoneNumber ?? '' }
  return <CheckoutForm bag={bag} clearBag={clearBag} getSessionToken={getToken} customerProfile={customerProfile} authenticated={Boolean(user)} />
}

function CheckoutSuccess({ clearBag }: { clearBag: () => void }) {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id') ?? ''
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'failed' | 'error'>('loading')
  const [orderNumber, setOrderNumber] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!sessionId) { setStatus('error'); return }
    let cancelled = false
    fetch(`${API_BASE_URL}/orders/checkout/session/${encodeURIComponent(sessionId)}`)
      .then(async response => {
        const payload = await response.json() as { data?: { orderNumber: string; paymentStatus: string }; error?: { message?: string } }
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? 'Unable to verify payment.')
        if (cancelled) return
        setOrderNumber(payload.data.orderNumber)
        if (payload.data.paymentStatus === 'paid') {
          setStatus('paid')
          clearBag()
        } else if (payload.data.paymentStatus === 'pending' && attempt < 8) {
          setStatus('pending')
          window.setTimeout(() => { if (!cancelled) setAttempt(value => value + 1) }, 3000)
        } else {
          setStatus(payload.data.paymentStatus === 'failed' ? 'failed' : 'pending')
        }
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [sessionId, attempt, clearBag])
  const message = status === 'loading' ? 'Verifying your payment…'
    : status === 'paid' ? 'Your payment is confirmed. We’ll send your order details by email.'
      : status === 'pending' ? 'Your payment is still processing. Please check your email shortly.'
        : status === 'failed' ? 'This payment was not completed. Your reserved items will be returned to stock.'
          : 'We could not verify this checkout session.'
  return <main className="page-shell confirmation"><div className="confirmation-mark">{status === 'paid' ? <Check size={24} /> : <ShoppingBag size={22} />}</div><p className="eyebrow">{status === 'paid' ? 'ORDER CONFIRMED' : 'PAYMENT STATUS'}</p><h1>{status === 'paid' ? 'Thank you.' : 'Almost there.'}</h1><p>{message}</p>{orderNumber && <p>Order {orderNumber}</p>}<Link className="button button-dark" to="/">RETURN TO OFF</Link></main>
}

type PublishedPageData = { name: string; slug: string; publishedSections: CatalogState['homeSections'] }

function PublishedPageSections({ sections }: { sections: CatalogState['homeSections'] }) {
  const { products, categories, collections } = useCatalog()
  return <>{sections.filter(section => section.enabled).sort((a,b) => a.order-b.order).map(section => {
    const settings = section.settings
    const image = typeof settings.image === 'string' ? publicMediaUrl(settings.image) : ''
    const heading = String(settings.heading ?? section.title)
    const description = String(settings.description ?? settings.subtitle ?? '')
    if (section.type === 'hero' || section.type === 'editorial' || section.type === 'brand' || section.type === 'rich-text') return <section className="about-cms-section" key={section.id}>{Boolean(image) && <img src={image} alt={String(settings.imageAlt ?? '')} />}{Boolean(settings.eyebrow) && <p className="eyebrow">{String(settings.eyebrow)}</p>}<h1>{heading}</h1>{Boolean(description) && <p>{description}</p>}{Boolean(settings.buttonLabel) && <StoreDestinationLink className="text-link" to={String(settings.destination ?? '/shop')}>{String(settings.buttonLabel)} <ArrowRight size={14} /></StoreDestinationLink>}</section>
    if (section.type === 'categories') return <section className="category-tiles" key={section.id}>{categories.map(category => <Link to={`/shop?category=${encodeURIComponent(category.name)}`} className="category-tile" key={category.slug}><img src={category.image} alt="" /><span className="tile-label"><b>{category.name}</b><small>{category.productCount} pieces</small></span></Link>)}</section>
    if (section.type === 'featured-products') return <section className="section selection-section" key={section.id}><div className="section-heading"><h2>{heading}</h2></div><HomeSelectionCards cards={getSelectionCards(settings, products, collections)} products={products} collections={collections} /></section>
    if (section.type === 'new-arrivals') { const ids = Array.isArray(settings.productIds) ? settings.productIds as string[] : []; const list = settings.mode === 'manual' ? ids.map(id => products.find(product => product.id === id)).filter((item): item is Product => Boolean(item)) : products.slice(0, Number(settings.limit ?? 3)); return <section className="section arrivals" key={section.id}><div className="section-heading"><h2>{heading}</h2></div><div className="product-grid home-grid">{list.slice(0, Number(settings.limit ?? 3)).map(product => <ProductCard key={product.id} product={product} showPrice={settings.showPrices !== false} />)}</div></section> }
    if (section.type === 'collection' && image) return <section className="campaign" key={section.id}><img src={image} alt="" /><div className="campaign-overlay"><p className="eyebrow">{String(settings.subtitle ?? '')}</p><h2>{heading}</h2>{Boolean(settings.buttonLabel) && <Link className="button button-light" to={String(settings.destination ?? '/collections')}>{String(settings.buttonLabel)}</Link>}</div></section>
    return null
  })}</>
}

function About() {
  const [page, setPage] = useState<PublishedPageData | null>(null)
  useEffect(() => { const controller = new AbortController(); fetch(`${API_BASE_URL}/store/content/pages/about`, { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(payload => setPage(payload?.data ?? null)).catch(() => undefined); return () => controller.abort() }, [])
  return <>{page?.publishedSections?.length ? <main className="about-page about-cms-page"><PublishedPageSections sections={page.publishedSections} /></main> : <main className="about-page"><div className="about-hero"><img src={photo('photo-1511818966892-d7d671e672a2', 1800)} alt="Sculptural architecture beneath the Los Angeles sky" /></div><section className="about-intro"><p className="eyebrow">A STUDY IN CONTRAST</p><h1>ABOUT OFF</h1><p>Rooted in the spirit of Los Angeles, OFF blends California's cultural influences with a distinctive, modern approach to luxury. Each piece is a reflection of a lifestyle, an attitude and a community.</p></section><div className="about-second"><img src={photo('photo-1523398002811-999ca8dec234', 1200)} alt="A quiet moment from the OFF collection" /><div><p className="eyebrow">OUR POINT OF VIEW</p><h2>A creative<br />vision.</h2><p>Born from the creative energy of Los Angeles, OFF brings together considered craftsmanship, music, art and the people who shape it.</p><Link className="text-link" to="/shop">Discover the collection <ArrowRight size={14} /></Link></div></div><section className="about-statement"><p className="eyebrow">OFF, BY DESIGN</p><p>Less noise.<br />More meaning.</p></section></main>}<Footer /></>
}

function CmsPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<PublishedPageData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { const controller = new AbortController(); setLoading(true); fetch(`${API_BASE_URL}/store/content/pages/${slug}`, { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(payload => setPage(payload?.data ?? null)).catch(() => setPage(null)).finally(() => setLoading(false)); return () => controller.abort() }, [slug])
  if (loading) return <main className="page-shell"><p>Loading page…</p></main>
  if (!page) return <main className="page-shell empty-state"><p className="eyebrow">404 — NOT FOUND</p><h1>This page is not published.</h1><Link className="button button-dark" to="/">BACK TO OFF</Link></main>
  return <><main className="about-page about-cms-page"><header className="about-intro"><p className="eyebrow">OFF / {page.name.toUpperCase()}</p><h1>{page.name.toUpperCase()}</h1></header><PublishedPageSections sections={page.publishedSections} /></main><Footer /></>
}

function CmsRoutePage() {
  const { slug = '' } = useParams()
  return <CmsPage slug={slug} />
}

function ClerkSetupNotice({ title = 'YOUR ACCOUNT' }: { title?: string }) {
  return <main className="page-shell account-page"><p className="eyebrow">WELCOME TO OFF</p><h1>{title}</h1><div className="account-auth-notice" role="status">Customer sign-in is not configured yet. Set VITE_CLERK_PUBLISHABLE_KEY in the storefront environment and restart the app.</div><Link to="/shop" className="text-link">Continue shopping <ArrowRight size={14} /></Link></main>
}

function ClerkRouterProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  if (!CLERK_PUBLISHABLE_KEY) return <>{children}</>
  return <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} localization={{ signIn: { start: { title: 'Sign in' } } }} routerPush={to => navigate(to)} routerReplace={(to) => navigate(to, { replace: true })}>
    {children}
  </ClerkProvider>
}

export default function App() {
  return <ClerkRouterProvider><CatalogProvider><Storefront /></CatalogProvider></ClerkRouterProvider>
}

function Storefront() {
  const [bag, setBag] = useState<BagItem[]>(() => { try { return JSON.parse(localStorage.getItem('off-preview-bag') ?? '[]') as BagItem[] } catch { return [] } })
  const [guestWishlistIds, setGuestWishlistIds] = useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem(GUEST_WISHLIST_STORAGE_KEY) ?? '[]') as unknown; return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [] } catch { return [] } })
  const [cartOpen, setCartOpen] = useState(false)
  const updateBag = useCallback((next: BagItem[]) => { setBag(next); localStorage.setItem('off-preview-bag', JSON.stringify(next)) }, [])
  const toggleGuestWishlist = useCallback((productId: string) => setGuestWishlistIds(current => current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId]), [])
  useEffect(() => { localStorage.setItem(GUEST_WISHLIST_STORAGE_KEY, JSON.stringify(guestWishlistIds)) }, [guestWishlistIds])
  const clearBag = useCallback(() => updateBag([]), [updateBag])
  const { products } = useCatalog()
  const addToBag = (productId: string, size: string, color: string, sku: string, requestedQuantity = 1): boolean => {
    const product = products.find((item) => item.id === productId)
    const variant = product?.variants.find((item) => item.sku === sku && item.color === color && item.size === size && item.active)
    if (!product || !variant) return false
    const quantity = Math.max(1, Math.floor(requestedQuantity))
    const found = bag.findIndex(item => item.productId === productId && item.size === size && item.color === color)
    if (found >= 0 && bag[found].quantity + quantity > variant.stock) return false
    if (found < 0 && quantity > variant.stock) return false
    updateBag(found < 0
      ? [...bag, { productId, quantity, size, color, sku, name: product.name, price: variant.price, image: product.image }]
      : bag.map((item, index) => index === found ? { ...item, quantity: item.quantity + quantity } : item))
    return true
  }
  const count = bag.reduce((sum, item) => sum + item.quantity, 0)
  return <GuestWishlistContext.Provider value={{ ids: guestWishlistIds, toggle: toggleGuestWishlist }}><Header bagCount={count} onOpenCart={() => setCartOpen(true)} /><Routes><Route path="/" element={<Home addToBag={addToBag} />} /><Route path="/shop" element={<Shop />} /><Route path="/wishlist" element={<WishlistLanding />} /><Route path="/collections" element={<CollectionsPage />} /><Route path="/product/:id" element={<ProductPage addToBag={addToBag} />} /><Route path="/cart" element={<Cart bag={bag} updateBag={updateBag} />} /><Route path="/checkout" element={<Checkout bag={bag} clearBag={clearBag} />} /><Route path="/checkout/success" element={<CheckoutSuccess clearBag={clearBag} />} /><Route path="/about" element={<About />} /><Route path="/faq" element={<CmsPage slug="faq" />} /><Route path="/contact" element={<CmsPage slug="contact" />} /><Route path="/legal" element={<CmsPage slug="legal" />} /><Route path="/releases" element={<CmsPage slug="releases" />} /><Route path="/releases/:slug" element={<CmsPage slug="release-detail" />} /><Route path="/account/*" element={CLERK_PUBLISHABLE_KEY ? <CustomerAccountExperience apiBaseUrl={API_BASE_URL} products={products} addToBag={addToBag} formatPrice={formatTnd} renderProductCard={(product, liked, onWishlistToggle) => <ProductCard product={product} liked={liked} onWishlistToggle={onWishlistToggle} />} footer={<Footer />} /> : <ClerkSetupNotice />} /><Route path="/sign-in/*" element={<Navigate to="/account?mode=sign-in" replace />} /><Route path="/sign-up/*" element={<Navigate to="/account?mode=sign-up" replace />} /><Route path="/:slug" element={<CmsRoutePage />} /><Route path="*" element={<main className="page-shell empty-state"><p className="eyebrow">404 — NOT FOUND</p><h1>We can't find that page.</h1><Link className="button button-dark" to="/">BACK TO OFF</Link></main>} /></Routes><CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} bag={bag} products={products} updateBag={updateBag} /><WhatsAppFloatingButton /></GuestWishlistContext.Provider>
}
