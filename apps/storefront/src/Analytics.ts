const CONSENT_STORAGE_KEY = 'off-cookie-consent'
const VISITOR_STORAGE_KEY = 'off-cookie-visitor'
const SESSION_STORAGE_KEY = 'off-analytics-session'
const SESSION_TIMEOUT_MS = 30 * 60_000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api/v1'

type Attribution = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

type AnalyticsEventInput = {
  type:
    | 'page_view' | 'session_start' | 'session_end' | 'scroll_depth' | 'search'
    | 'product_view' | 'product_variant_select' | 'wishlist_add' | 'wishlist_remove'
    | 'add_to_cart' | 'remove_from_cart' | 'collection_view' | 'collection_product_click'
    | 'begin_checkout' | 'checkout_step' | 'purchase' | 'cta_impression' | 'cta_click'
    | 'campaign_visit' | 'login' | 'registration'
  page?: string
  productId?: string
  variantSize?: string
  variantColor?: string
  collectionId?: string
  ctaId?: string
  ctaLabel?: string
  ctaLocation?: string
  searchTerm?: string
  searchResults?: number
  scrollDepth?: 25 | 50 | 75 | 100
  checkoutStep?: 'shipping_information_completed' | 'order_confirmed'
  navigationKey?: string
}

type AnalyticsAttribution = { visitorId: string; sessionId: string }
type AnalyticsSession = { id: string; lastActivity: number; started: boolean; seenCampaigns?: string[] }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const trackedPageKeys = new Set<string>()
const trackedNavigationEvents = new Set<string>()
const navigationEventTypes = new Set(['product_view', 'collection_view', 'begin_checkout'])
const pendingRequests = new Set<AbortController>()
let session: AnalyticsSession | null = null
let analyticsConsentOverride: boolean | null = null

function analyticsConsentIsGranted() {
  if (analyticsConsentOverride !== null) return analyticsConsentOverride
  try {
    const saved = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? 'null') as { preferences?: { analytics?: unknown } } | null
    return saved?.preferences?.analytics === true
  } catch {
    return false
  }
}
export function hasAnalyticsConsent() { return analyticsConsentIsGranted() }
export function setAnalyticsConsent(enabled: boolean) { analyticsConsentOverride = enabled }

function currentAttribution(): Attribution {
  const search = new URLSearchParams(window.location.search)
  return {
    source: search.get('utm_source')?.slice(0, 120) ?? undefined,
    medium: search.get('utm_medium')?.slice(0, 120) ?? undefined,
    campaign: search.get('utm_campaign')?.slice(0, 120) ?? undefined,
    content: search.get('utm_content')?.slice(0, 120) ?? undefined,
    term: search.get('utm_term')?.slice(0, 120) ?? undefined,
  }
}

function getSession() {
  const now = Date.now()
  if (!session) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? 'null') as AnalyticsSession | null
      session = saved && uuidPattern.test(saved.id) && now - saved.lastActivity <= SESSION_TIMEOUT_MS
        ? { ...saved, seenCampaigns: saved.seenCampaigns ?? [] }
        : { id: crypto.randomUUID(), lastActivity: now, started: false, seenCampaigns: [] }
    } catch {
      session = { id: crypto.randomUUID(), lastActivity: now, started: false, seenCampaigns: [] }
    }
  }
  if (now - session.lastActivity > SESSION_TIMEOUT_MS) session = { id: crypto.randomUUID(), lastActivity: now, started: false, seenCampaigns: [] }
  session.lastActivity = now
  try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session)) } catch { /* Analytics remains optional when storage is unavailable. */ }
  return session
}

function deviceCategory(): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (/iPad|Tablet/i.test(navigator.userAgent)) return 'tablet'
  if (/Mobi|Android/i.test(navigator.userAgent)) return 'mobile'
  return 'desktop'
}

function eventBase(type: string, page: string) {
  const visitorId = localStorage.getItem(VISITOR_STORAGE_KEY) ?? ''
  const activeSession = getSession()
  const attribution = currentAttribution()
  let referrerHost = ''
  try {
    if (document.referrer) referrerHost = new URL(document.referrer).hostname.slice(0, 253)
  } catch {
    referrerHost = ''
  }
  return {
    eventId: crypto.randomUUID(),
    type,
    visitorId,
    sessionId: activeSession.id,
    page: page.split(/[?#]/, 1)[0].slice(0, 500) || '/',
    ...(type === 'session_start' ? { trafficSource: attribution.source || referrerHost || 'Direct' } : {}),
    referrerHost,
    deviceCategory: deviceCategory(),
    ...(attribution.source ? { utmSource: attribution.source } : {}),
    ...(attribution.medium ? { utmMedium: attribution.medium } : {}),
    ...(attribution.campaign ? { utmCampaign: attribution.campaign } : {}),
    ...(attribution.content ? { utmContent: attribution.content } : {}),
    ...(attribution.term ? { utmTerm: attribution.term } : {}),
  }
}

function sendEvent(payload: Record<string, unknown>) {
  if (!analyticsConsentIsGranted()) return
  try {
    const visitorId = localStorage.getItem(VISITOR_STORAGE_KEY)
    if (!visitorId || !uuidPattern.test(visitorId)) return
    const controller = new AbortController()
    pendingRequests.add(controller)
    void fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: controller.signal,
    }).then(response => {
      if (!response.ok && response.status !== 403) console.warn(`Analytics event was rejected (${response.status}).`)
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Unable to send an analytics event.', error)
    }).finally(() => pendingRequests.delete(controller))
  } catch (error) {
    console.warn('Unable to create an analytics event.', error)
  }
}

export function trackAnalyticsEvent(input: AnalyticsEventInput) {
  if (!analyticsConsentIsGranted()) return
  try {
    const activeSession = getSession()
    if (input.navigationKey && navigationEventTypes.has(input.type)) {
      const eventKey = `${activeSession.id}:${input.type}:${input.navigationKey}:${input.productId ?? input.collectionId ?? ''}`
      if (trackedNavigationEvents.has(eventKey)) return
      trackedNavigationEvents.add(eventKey)
      if (trackedNavigationEvents.size > 500) trackedNavigationEvents.delete(trackedNavigationEvents.values().next().value!)
    }
    const page = input.page ?? window.location.pathname
    if (!activeSession.started) {
      activeSession.started = true
      sendEvent(eventBase('session_start', page))
    }
    const current = currentAttribution()
    if (Object.values(current).some(Boolean)) {
      const campaignKey = [current.source, current.medium, current.campaign, current.content, current.term].join('|')
      if (!activeSession.seenCampaigns?.includes(campaignKey)) {
        activeSession.seenCampaigns = [...(activeSession.seenCampaigns ?? []), campaignKey]
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(activeSession)) } catch { /* Campaign attribution remains optional when storage is unavailable. */ }
        sendEvent(eventBase('campaign_visit', page))
      }
    }
    sendEvent({
      ...eventBase(input.type, page),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.variantSize ? { variantSize: input.variantSize.slice(0, 40) } : {}),
      ...(input.variantColor ? { variantColor: input.variantColor.slice(0, 80) } : {}),
      ...(input.collectionId ? { collectionId: input.collectionId } : {}),
      ...(input.ctaId ? { ctaId: input.ctaId } : {}),
      ...(input.ctaLabel ? { ctaLabel: input.ctaLabel.slice(0, 120) } : {}),
      ...(input.ctaLocation ? { ctaLocation: input.ctaLocation.slice(0, 120) } : {}),
      ...(input.searchTerm ? { searchTerm: input.searchTerm.slice(0, 120) } : {}),
      ...(input.searchResults !== undefined ? { searchResults: input.searchResults } : {}),
      ...(input.scrollDepth !== undefined ? { scrollDepth: input.scrollDepth } : {}),
      ...(input.checkoutStep ? { checkoutStep: input.checkoutStep } : {}),
    })
  } catch (error) {
    console.warn('Unable to prepare analytics tracking.', error)
  }
}

let removeScrollTracking: (() => void) | null = null

export function trackAnalyticsPage(page: string, navigationKey: string) {
  if (!analyticsConsentIsGranted()) return
  const eventKey = `${navigationKey}:${page}`
  if (trackedPageKeys.has(eventKey)) return
  trackedPageKeys.add(eventKey)
  removeScrollTracking?.()
  trackAnalyticsEvent({ type: 'page_view', page })
  const thresholds = [25, 50, 75, 100] as const
  const sent = new Set<number>()
  const recordScrollDepth = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight
    const percentage = scrollable <= 0 ? 100 : Math.min(100, Math.round(window.scrollY / scrollable * 100))
    for (const threshold of thresholds) {
      if (percentage >= threshold && !sent.has(threshold)) {
        sent.add(threshold)
        trackAnalyticsEvent({ type: 'scroll_depth', page, scrollDepth: threshold })
      }
    }
  }
  window.addEventListener('scroll', recordScrollDepth, { passive: true })
  recordScrollDepth()
  const timeout = window.setTimeout(recordScrollDepth, 250)
  removeScrollTracking = () => {
    window.removeEventListener('scroll', recordScrollDepth)
    window.clearTimeout(timeout)
  }
}

export function getAnalyticsAttribution(): AnalyticsAttribution | undefined {
  if (!analyticsConsentIsGranted()) return undefined
  try {
    const visitorId = localStorage.getItem(VISITOR_STORAGE_KEY)
    if (!visitorId || !uuidPattern.test(visitorId)) return undefined
    return { visitorId, sessionId: getSession().id }
  } catch {
    return undefined
  }
}

export function clearAnalyticsClientState() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch (error) {
    console.warn('Unable to clear analytics session preferences.', error)
  }
  session = null
  trackedPageKeys.clear()
  trackedNavigationEvents.clear()
  for (const controller of pendingRequests) controller.abort()
  pendingRequests.clear()
  removeScrollTracking?.()
  removeScrollTracking = null
}

export function initializeCtaTracking() {
  const seen = new Set<string>()
  const elements = new Set<Element>()
  let observer: IntersectionObserver | null = null
  let mutations: MutationObserver | null = null
  let tracking = false
  const ctaDetails = (element: Element) => {
    const node = element as HTMLElement
    const label = (node.getAttribute('aria-label') || node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!label || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(label) || /\+?\d[\d\s()-]{6,}\d/.test(label) || node.hasAttribute('data-no-analytics')) return null
    const page = window.location.pathname
    const declaredId = node.getAttribute('data-analytics-id')
    const id = `${page.slice(0, 60)}:${(declaredId || `${node.tagName.toLowerCase()}:${label.toLowerCase()}`).slice(0, 39)}`
    return { id, label, page }
  }
  const recordImpression = (element: Element) => {
    if (!hasAnalyticsConsent()) return
    const details = ctaDetails(element)
    if (!details) return
    const key = `${details.page}:${details.id}`
    if (seen.has(key)) return
    seen.add(key)
    trackAnalyticsEvent({ type: 'cta_impression', ctaId: details.id, ctaLabel: details.label, ctaLocation: details.page, page: details.page })
  }
  const scan = (root: ParentNode) => {
    if (!observer) return
    const candidates = root instanceof Element && root.matches('a,button') ? [root] : []
    for (const element of [...candidates, ...root.querySelectorAll('a,button')]) {
      if (elements.has(element)) continue
      elements.add(element)
      observer.observe(element)
    }
  }
  const handleClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest('a,button') : null
    if (!target || !hasAnalyticsConsent()) return
    const details = ctaDetails(target)
    if (details) trackAnalyticsEvent({ type: 'cta_click', ctaId: details.id, ctaLabel: details.label, ctaLocation: details.page, page: details.page })
  }
  const handleNavigation = () => {
    if (!tracking || !hasAnalyticsConsent()) return
    for (const element of elements) {
      if (!element.isConnected) {
        observer?.unobserve(element)
        elements.delete(element)
        continue
      }
      const bounds = element.getBoundingClientRect()
      const visibleHeight = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0))
      if (bounds.height && visibleHeight / bounds.height >= 0.5) recordImpression(element)
    }
  }
  const start = () => {
    if (tracking || !hasAnalyticsConsent()) return
    tracking = true
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) recordImpression(entry.target)
      }
    }, { threshold: [0.5] })
    mutations = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) scan(node)
    })))
    scan(document)
    mutations.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('click', handleClick, true)
    handleNavigation()
  }
  const stop = () => {
    if (!tracking) return
    observer?.disconnect()
    mutations?.disconnect()
    document.removeEventListener('click', handleClick, true)
    observer = null
    mutations = null
    elements.clear()
    seen.clear()
    tracking = false
  }
  const handleConsent = () => hasAnalyticsConsent() ? start() : stop()
  window.addEventListener('off-analytics-consent-changed', handleConsent)
  window.addEventListener('off-analytics-page-change', handleNavigation)
  if (hasAnalyticsConsent()) start()
  return () => {
    stop()
    window.removeEventListener('off-analytics-consent-changed', handleConsent)
    window.removeEventListener('off-analytics-page-change', handleNavigation)
  }
}
