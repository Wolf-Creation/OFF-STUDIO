import { useEffect, useMemo, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import './SocialLanding.css'

type WebsiteSettings = Record<string, unknown>
type SocialPlatform = 'Instagram' | 'TikTok' | 'Facebook' | 'WhatsApp'
type SocialLink = { platform: SocialPlatform; href: string; detail: string; primary: boolean }
type FilmRingStyle = CSSProperties & { '--ring-duration': string; '--ring-direction': string }

function settingUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function linkDetail(url: URL, platform: 'Instagram' | 'TikTok' | 'Facebook') {
  const segment = url.pathname.split('/').filter(Boolean).pop()
  if (!segment) return ''
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    decoded = segment
  }
  return platform === 'Facebook' ? decoded : `@${decoded.replace(/^@/, '')}`
}

function socialLinksFrom(settings: WebsiteSettings): SocialLink[] {
  const links: SocialLink[] = []
  for (const platform of ['Instagram', 'TikTok', 'Facebook'] as const) {
    const url = settingUrl(settings[`${platform.toLowerCase()}Url`])
    if (url) links.push({ platform, href: url.toString(), detail: linkDetail(url, platform), primary: platform === 'Instagram' })
  }
  const storedNumber = String(settings.whatsappNumber ?? '')
  const digits = storedNumber.replace(/\D/g, '')
  if (digits) links.push({ platform: 'WhatsApp', href: `https://wa.me/${digits}`, detail: storedNumber, primary: false })
  return links
}

function BrandIcon({ platform }: { platform: SocialPlatform }) {
  if (platform === 'Instagram') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" /><circle cx="12" cy="12" r="4.1" /><circle className="social-icon-fill" cx="17.7" cy="6.5" r="1.1" /></svg>
  if (platform === 'TikTok') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 3.5v11.2a4.2 4.2 0 1 1-3.1-4.1M14.2 6.1c1.1 2.2 2.8 3.4 5.3 3.6" /></svg>
  if (platform === 'Facebook') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.1 20.5v-7.7h2.6l.4-3h-3V7.9c0-.9.3-1.5 1.5-1.5h1.6V3.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v1.9H7.8v3h2.7v7.7" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 11.6a8.2 8.2 0 0 1-12.1 7.2L3 20l1.3-4.7a8.2 8.2 0 1 1 15.9-3.7Z" /><path d="M8.3 7.9c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.8 1.9c.1.2.1.4 0 .5l-.6.7c-.2.2-.2.4-.1.6.5.9 1.2 1.6 2.1 2.1.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.3.3.6-.1.6-.4 1.2-.9 1.5-.5.4-1.1.5-1.8.3-1-.3-2.3-.9-3.6-2.1-1.1-1-2-2.4-2.3-3.4-.3-.9-.1-1.8.3-2.6.1-.2.3-.4.4-.5Z" /></svg>
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function makeRingPath(radius: number, index: number) {
  const phases = [seededUnit(index + 1), seededUnit(index + 37), seededUnit(index + 73)].map(value => value * Math.PI * 2)
  const points = Array.from({ length: 60 }, (_, step) => {
    const theta = step / 60 * Math.PI * 2
    const organic = 1
      + .11 * Math.sin(2 * theta + phases[0]!)
      + .07 * Math.sin(3 * theta + phases[1]!)
      + .04 * Math.sin(5 * theta + phases[2]!)
    const x = 270 + radius * organic * Math.cos(theta)
    const y = 330 + radius * organic * Math.sin(theta) * 1.1
    return `${step ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  })
  return `${points.join(' ')} Z`
}

function FilmBackground({ videoSrc }: { videoSrc?: string }) {
  const rings = useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    index,
    opacity: .34 - index * (.27 / 17),
    path: makeRingPath(30 + index * 34, index),
    style: {
      '--ring-duration': `${60 + index * 7}s`,
      '--ring-direction': index % 2 ? 'reverse' : 'normal',
    } as FilmRingStyle,
  })), [])

  return <div className="social-film" aria-hidden="true">
    {videoSrc
      ? <video className="social-film-video" src={videoSrc} muted autoPlay loop playsInline />
      : <svg className="social-film-rings" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        {rings.map(ring => <g key={ring.index} style={ring.style}><path d={ring.path} opacity={ring.opacity} /></g>)}
      </svg>}
    <div className="social-film-words">
      <span>OUTSIDE THE FRAME</span>
      <span className="is-italic">Unordinary</span>
      <span>CONSIDERED</span>
      <span className="is-italic">Lived-in</span>
    </div>
    <i className="social-film-line" />
    <img className="social-film-capsule" src="/off-studio-symbol.png" alt="" />
    <div className="social-film-scrim" />
  </div>
}

function SocialLanding({ websiteSettings, videoSrc }: { websiteSettings: WebsiteSettings; videoSrc?: string }) {
  const links = useMemo(() => socialLinksFrom(websiteSettings), [websiteSettings])

  useEffect(() => {
    const previousTitle = document.title
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const createdRobotsTag = !robots
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    const previousRobotsContent = robots.content
    document.title = 'Follow OFF'
    robots.content = 'noindex'
    return () => {
      document.title = previousTitle
      if (createdRobotsTag) robots?.remove()
      else if (robots) robots.content = previousRobotsContent
    }
  }, [])

  // Development note: point the production QR code to https://<production-domain>/follow.
  return <div className="social-landing-page">
    <main className="social-landing">
      <FilmBackground videoSrc={videoSrc} />
      <div className="social-landing-content">
        <header className="social-landing-header">
          <Link className="social-landing-logo" to="/" aria-label="OFF home"><img src="/off-logo.svg" alt="OFF" /></Link>
          <span className="social-film-label"><i />Brand film</span>
        </header>
        <section className="social-landing-message" aria-labelledby="social-landing-title">
          <span className="social-title-rule" />
          <p className="social-eyebrow">FOLLOW OFF</p>
          <h1 id="social-landing-title">Stay <em>outside</em> the frame.</h1>
          <p className="social-description">New pieces, studio notes and what we are wearing. Follow us wherever you are.</p>
        </section>
        <nav className="social-links" aria-label="Follow OFF on social media">
          {links.map((link, index) => <a
            className={`social-card${link.primary ? ' is-primary' : ''}`}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Follow OFF on ${link.platform}`}
            key={link.platform}
            style={{ animationDelay: `${index * .1}s` }}
          >
            <span className="social-card-icon"><BrandIcon platform={link.platform} /></span>
            <span className="social-card-copy"><span className="social-card-name">{link.platform}</span><span className="social-card-detail">{link.detail}</span></span>
            <ArrowRight className="social-card-arrow" size={24} strokeWidth={1.6} aria-hidden="true" />
          </a>)}
        </nav>
        <footer className="social-landing-footer">
          <Link to="/shop">Shop the collection <span aria-hidden="true">→</span></Link>
          <span>© 2026 OFF</span>
        </footer>
      </div>
      <span className="social-bottom-bar" aria-hidden="true" />
    </main>
  </div>
}

export { SocialLanding }
