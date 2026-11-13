import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './CookieConsent.css'
import { clearAnalyticsClientState, setAnalyticsConsent } from './Analytics'

const CONSENT_STORAGE_KEY = 'off-cookie-consent'
const VISITOR_STORAGE_KEY = 'off-cookie-visitor'
export const COOKIE_POLICY_VERSION = '2026-11-v1'

export type CookiePreferences = {
  necessary: true
  functional: boolean
  analytics: boolean
  marketing: boolean
}

type ConsentAction = 'accept_all' | 'reject_all' | 'custom'
type SavedConsent = { preferences: CookiePreferences; action: ConsentAction; policyVersion: string }
type GoogleConsentUpdate = {
  analytics_storage: 'granted' | 'denied'
  ad_storage: 'granted' | 'denied'
  ad_user_data: 'granted' | 'denied'
  ad_personalization: 'granted' | 'denied'
  functionality_storage: 'granted' | 'denied'
  personalization_storage: 'granted' | 'denied'
  security_storage: 'granted'
}

declare global {
  interface Window {
    dataLayer?: IArguments[]
    gtag?: (...args: unknown[]) => void
    __offGoogleTagLoaded?: boolean
  }
}

const googleTagId = import.meta.env.VITE_GOOGLE_TAG_ID?.trim() ?? ''

function storedConsent(): SavedConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SavedConsent>
    const preferences = value.preferences
    if (!preferences || typeof preferences.functional !== 'boolean' || typeof preferences.analytics !== 'boolean' || typeof preferences.marketing !== 'boolean') return null
    if (!['accept_all', 'reject_all', 'custom'].includes(String(value.action))) return null
    if (value.policyVersion !== COOKIE_POLICY_VERSION) return null
    return {
      preferences: { necessary: true, functional: preferences.functional, analytics: preferences.analytics, marketing: preferences.marketing },
      action: value.action as ConsentAction,
      policyVersion: COOKIE_POLICY_VERSION,
    }
  } catch (error) {
    console.warn('Unable to read stored cookie preferences.', error)
    return null
  }
}

function googleConsent(preferences?: CookiePreferences): GoogleConsentUpdate {
  return {
    analytics_storage: preferences?.analytics ? 'granted' : 'denied',
    ad_storage: preferences?.marketing ? 'granted' : 'denied',
    ad_user_data: preferences?.marketing ? 'granted' : 'denied',
    ad_personalization: preferences?.marketing ? 'granted' : 'denied',
    functionality_storage: preferences?.functional ? 'granted' : 'denied',
    personalization_storage: preferences?.functional ? 'granted' : 'denied',
    security_storage: 'granted',
  }
}

function loadGoogleTag() {
  if (!/^(G-[A-Z0-9]+|AW-\d+)$/i.test(googleTagId) || window.__offGoogleTagLoaded) return
  window.__offGoogleTagLoaded = true
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`
  script.onload = () => window.gtag?.('config', googleTagId)
  script.onerror = () => {
    window.__offGoogleTagLoaded = false
    console.error('Unable to load the configured Google tag.')
  }
  document.head.appendChild(script)
}

export function applyCookieConsent(preferences?: CookiePreferences) {
  window.dataLayer = window.dataLayer ?? []
  window.gtag = window.gtag ?? function gtag() { window.dataLayer?.push(arguments) }
  window.gtag('consent', 'update', googleConsent(preferences))
  if (preferences?.analytics || preferences?.marketing) loadGoogleTag()
}

export function initializeCookieConsent() {
  window.dataLayer = window.dataLayer ?? []
  window.gtag = window.gtag ?? function gtag() { window.dataLayer?.push(arguments) }
  window.gtag('consent', 'default', {
    ...googleConsent(),
    wait_for_update: 500,
  })
  const saved = storedConsent()
  setAnalyticsConsent(saved?.preferences.analytics ?? false)
  if (saved) applyCookieConsent(saved.preferences)
}

function visitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_STORAGE_KEY)
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(VISITOR_STORAGE_KEY, id)
    return id
  } catch (error) {
    console.error('Unable to persist the anonymous cookie visitor ID.', error)
    throw new Error('Your browser could not save the anonymous consent ID. Please enable site storage and try again.')
  }
}

function CookieCheckbox({ label, checked, onChange, disabled = false, hint }: { label: string; checked: boolean; onChange?: (checked: boolean) => void; disabled?: boolean; hint: string }) {
  return <label className="cookie-preference-row">
    <span className="cookie-preference-copy"><strong>{label}</strong><small>{hint}</small></span>
    {disabled ? <span className="cookie-always-active">Always active</span> : <input type="checkbox" checked={checked} onChange={event => onChange?.(event.target.checked)} />}
  </label>
}

export function CookieConsentManager() {
  const [saved, setSaved] = useState<SavedConsent | null>(() => storedConsent())
  const [preferences, setPreferences] = useState<CookiePreferences>(() => storedConsent()?.preferences ?? { necessary: true, functional: false, analytics: false, marketing: false })
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [logError, setLogError] = useState('')

  useEffect(() => {
    const openSettings = () => {
      setPreferences(saved?.preferences ?? { necessary: true, functional: false, analytics: false, marketing: false })
      setCustomizeOpen(true)
    }
    window.addEventListener('off-open-cookie-settings', openSettings)
    return () => window.removeEventListener('off-open-cookie-settings', openSettings)
  }, [saved])

  useEffect(() => {
    if (!customizeOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCustomizeOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [customizeOpen])

  const saveConsent = async (nextPreferences: CookiePreferences, action: ConsentAction) => {
    const nextSaved = { preferences: nextPreferences, action, policyVersion: COOKIE_POLICY_VERSION }
    setPreferences(nextPreferences)
    setSaved(nextSaved)
    applyCookieConsent(nextPreferences)
    setAnalyticsConsent(nextPreferences.analytics)
    if (!nextPreferences.analytics) clearAnalyticsClientState()
    setCustomizeOpen(false)
    setLogError('')
    let storageError = ''
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(nextSaved))
    } catch (error) {
      console.error('Unable to persist cookie preferences.', error)
      storageError = ' Your browser could not save these preferences for the next visit.'
    }
    if (!nextPreferences.analytics) window.dispatchEvent(new Event('off-analytics-consent-changed'))
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api/v1'}/store/consents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: visitorId(), ...nextSaved }),
      })
      if (!response.ok) {
        const payload = await response.json() as { error?: { message?: string } }
        throw new Error(payload.error?.message ?? `Consent log request failed (${response.status}).`)
      }
      window.dispatchEvent(new Event('off-analytics-consent-changed'))
      if (storageError) setLogError(storageError.trim())
    } catch (error) {
      console.error('Unable to record cookie consent.', error)
      setLogError(`${error instanceof Error ? error.message : 'Unable to record cookie consent.'}${storageError}`)
    }
  }

  const setPreference = (key: 'functional' | 'analytics' | 'marketing', checked: boolean) => {
    setPreferences(current => ({ ...current, [key]: checked }))
  }

  const acceptAll = () => saveConsent({ necessary: true, functional: true, analytics: true, marketing: true }, 'accept_all')
  const rejectAll = () => saveConsent({ necessary: true, functional: false, analytics: false, marketing: false }, 'reject_all')

  return <>
    {!saved && <aside className="cookie-banner" aria-label="Cookie consent">
      <div className="cookie-banner-copy"><p className="eyebrow">YOUR PRIVACY, CONSIDERED</p><p>We use necessary cookies to run this store. With your permission, we also use optional cookies to improve your experience and measure our campaigns.</p><Link to="/legal">Privacy Policy</Link></div>
      <div className="cookie-banner-actions"><button type="button" className="cookie-button cookie-button-text" onClick={rejectAll}>Reject All</button><button type="button" className="cookie-button cookie-button-text" onClick={() => setCustomizeOpen(true)}>Customize Preferences</button><button type="button" className="cookie-button cookie-button-dark" onClick={acceptAll}>Accept All</button></div>
    </aside>}
    {logError && <div className="cookie-log-error" role="alert">{logError}</div>}
    {customizeOpen && <div className="cookie-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCustomizeOpen(false) }}>
      <section className="cookie-modal" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title">
        <button type="button" className="cookie-modal-close" aria-label="Close cookie preferences" onClick={() => setCustomizeOpen(false)}>×</button>
        <p className="eyebrow">OFF / PRIVACY</p><h2 id="cookie-modal-title">Cookie preferences</h2>
        <p className="cookie-modal-intro">Choose which optional cookies OFF Studio may use. You can change or withdraw your consent at any time using Cookie Settings in the footer.</p>
        <div className="cookie-preferences">
          <CookieCheckbox label="Necessary" hint="Required for security, checkout and core store functions." checked disabled />
          <CookieCheckbox label="Functional" hint="Remembers preferences that improve your visit." checked={preferences.functional} onChange={checked => setPreference('functional', checked)} />
          <CookieCheckbox label="Analytics" hint="Helps us understand how the store is used." checked={preferences.analytics} onChange={checked => setPreference('analytics', checked)} />
          <CookieCheckbox label="Marketing" hint="Allows advertising measurement and personalization." checked={preferences.marketing} onChange={checked => setPreference('marketing', checked)} />
        </div>
        <div className="cookie-modal-actions"><button type="button" className="cookie-button cookie-button-text" onClick={rejectAll}>Reject All</button><button type="button" className="cookie-button cookie-button-text" onClick={acceptAll}>Accept All</button><button type="button" className="cookie-button cookie-button-dark" onClick={() => saveConsent(preferences, 'custom')}>Save Preferences</button></div>
        <Link className="cookie-policy-link" to="/legal" onClick={() => setCustomizeOpen(false)}>Read our Privacy Policy</Link>
      </section>
    </div>}
  </>
}
