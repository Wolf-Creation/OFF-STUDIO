import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'
import './AnimatedLogo2.css'

const TAGLINE = 'OUTSIDE THE FRAME'
const LOGO_PATH = 'M27.174 67.661 C27.552 54.416 27.217 41.133 27.25 27.882 C27.266 21.634 26.418 13.863 29.583 8.267 C36.138 -3.322 56.408 -2.554 62.074 9.484 C63.866 13.292 63.75 17.384 63.755 21.488 C63.758 24.071 63.783 26.655 63.776 29.238 C63.743 42.079 63.582 54.941 63.796 67.779 L75.937 67.725 C75.75 51.854 75.871 35.96 75.972 20.088 C75.986 17.838 75.975 15.588 75.995 13.337 C76.029 9.519 75.871 5.161 79.107 2.457 C81.945 0.085 85.368 0.258 88.837 0.298 C93.73 0.356 98.626 0.36 103.519 0.382 L103.615 6.933 L89.554 7.114 C88.036 7.114 87.734 8.001 87.734 10.231 C87.734 12.631 87.663 15.08 87.659 17.478 C87.652 21.145 87.682 24.812 87.678 28.479 C87.663 41.587 87.797 54.695 87.68 67.802 L110.206 67.857 C110.074 61.697 110.162 55.538 110.154 49.376 C110.141 39.543 110.102 29.707 110.118 19.874 C110.122 17.54 110.117 15.207 110.168 12.874 C110.255 8.96 110.217 4.808 113.558 2.104 C116.275 -0.095 119.601 0.24 122.871 0.287 C128.19 0.363 133.519 0.311 138.838 0.269 L138.725 6.846 L123.415 7.171 C121.951 7.171 121.758 8.046 121.758 10.394 C121.758 12.953 121.729 15.584 121.736 18.142 C121.747 21.809 121.742 25.476 121.745 29.143 C121.753 42.022 121.723 54.901 121.736 67.781 L153.626 67.828 L153.633 74.459 L121.703 74.443 L121.596 138.965 L110.239 139.017 C110.017 126.833 110.161 114.648 110.11 102.463 C110.07 93.114 109.767 83.727 110.206 74.387 L87.747 74.671 L87.643 139.047 L75.857 139.162 L76.043 74.509 L63.863 74.678 C63.765 87.387 63.813 100.096 63.74 112.806 C63.703 119.208 64.594 126.354 61.119 132.092 C56.047 140.466 41.689 141.26 34.071 136.256 C31.821 134.777 30.11 132.665 28.943 130.257 C27.328 126.927 27.29 123.378 27.238 119.765 C27.199 117.015 27.215 114.264 27.217 111.514 C27.225 99.162 27.223 86.809 27.329 74.458 L0.04 74.445 L0 67.802 Z M52.104 67.823 C51.823 52.606 51.962 37.357 52.036 22.137 C52.044 20.47 52.02 18.802 52.019 17.135 C52.018 13.366 52.075 8.557 47.38 7.557 C45.655 7.19 43.579 7.331 42.114 8.381 C38.404 11.042 39.081 16.183 39.122 20.18 C39.283 36.023 39.096 51.868 39.249 67.711 Z M39.281 74.614 C39.113 89.716 39.15 104.832 39.202 119.936 C39.216 123.994 38.463 129.754 43.081 131.635 C44.476 132.203 46.02 132.31 47.492 132.005 C51.978 131.078 52.023 126.288 52.022 122.626 C52.022 121.124 52.038 119.622 52.042 118.12 C52.087 103.557 52.08 88.994 52.122 74.431 Z'
const TRANSFORM = 'translate(800 450) scale(3.6) translate(-76.8165 -71.1)'
const TOTAL_MS = 7300
const LOOP_HOLD_MS = 3000
type AnimationDirection = 'forward' | 'reverse' | 'forward-resume'

export type AnimatedLogo2Handle = {
  replay: () => void
}

export type AnimatedLogo2Props = {
  color?: string
  loop?: boolean
  playOnView?: boolean
  onComplete?: () => void
  className?: string
}

type LogoStyle = CSSProperties & { '--off-color': string }
type ClipName = 'top' | 'bar' | 'bot'

export const AnimatedLogo2 = forwardRef<AnimatedLogo2Handle, AnimatedLogo2Props>(function AnimatedLogo2(
  { color = 'currentColor', loop = false, playOnView = true, onComplete, className = '' },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const uid = useId().replace(/:/g, '')
  const ids = {
    path: `off-${uid}-p`,
    top: `off-${uid}-t`,
    bar: `off-${uid}-b`,
    bot: `off-${uid}-o`,
  }
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const clearTimers = useCallback(() => {
    timers.current.forEach(timer => window.clearTimeout(timer))
    timers.current = []
  }, [])

  const play = useCallback(() => {
    const element = rootRef.current
    if (!element) return

    clearTimers()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const startSequence = (direction: AnimationDirection) => {
      const currentElement = rootRef.current
      if (!currentElement) return

      currentElement.classList.remove('off-play', 'off-reverse', 'off-resume-forward')
      void currentElement.offsetWidth
      currentElement.classList.add('off-play')
      if (direction === 'reverse') currentElement.classList.add('off-reverse')
      if (direction === 'forward-resume') currentElement.classList.add('off-resume-forward')

      const timer = window.setTimeout(() => {
        timers.current = timers.current.filter(activeTimer => activeTimer !== timer)
        onCompleteRef.current?.()
        if (loop && !reduceMotion) {
          const nextDirection: AnimationDirection = direction === 'forward'
            ? 'reverse'
            : direction === 'reverse' ? 'forward-resume' : 'reverse'
          const holdTimer = window.setTimeout(() => {
            timers.current = timers.current.filter(activeTimer => activeTimer !== holdTimer)
            startSequence(nextDirection)
          }, LOOP_HOLD_MS)
          timers.current.push(holdTimer)
        }
      }, reduceMotion ? 0 : direction === 'forward-resume' ? TOTAL_MS - 2500 : TOTAL_MS)
      timers.current.push(timer)
    }
    startSequence('forward')
  }, [clearTimers, loop])

  useImperativeHandle(ref, () => ({ replay: play }), [play])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return

    let observer: IntersectionObserver | undefined
    if (playOnView && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          observer?.disconnect()
          play()
        }
      }, { threshold: 0.4 })
      observer.observe(element)
    } else {
      play()
    }

    return () => {
      observer?.disconnect()
      clearTimers()
    }
  }, [clearTimers, loop, play, playOnView])

  const layer = (className: string, clip: ClipName) => (
    <svg className={`off-layer ${className}`} viewBox="0 0 1600 900" aria-hidden="true">
      <g transform={TRANSFORM}>
        <use href={`#${ids.path}`} clipPath={`url(#${ids[clip]})`} />
      </g>
    </svg>
  )

  return (
    <div
      ref={rootRef}
      className={`off-motion ${className}`.trim()}
      style={{ '--off-color': color } as LogoStyle}
      role="img"
      aria-label="OFF"
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <path id={ids.path} d={LOGO_PATH} />
          <clipPath id={ids.top}><rect x="-10" y="-10" width="175" height="78" /></clipPath>
          <clipPath id={ids.bar}><rect x="-10" y="67.6" width="175" height="7" /></clipPath>
          <clipPath id={ids.bot}><rect x="-10" y="74.2" width="175" height="75" /></clipPath>
        </defs>
      </svg>

      {layer('off-bar', 'bar')}
      <div className="off-mask off-mtop">{layer('off-top', 'top')}</div>
      <div className="off-mask off-mbot">{layer('off-bot', 'bot')}</div>
      <div className="off-vline" aria-hidden="true" />
      <div className="off-tagline" aria-hidden="true">
        {Array.from(TAGLINE).map((character, index) => character === ' '
          ? <span className="sp" key={index} />
          : <span className="ch" key={index} style={{ '--i': index } as CSSProperties}>{character}</span>)}
      </div>
    </div>
  )
})

AnimatedLogo2.displayName = 'AnimatedLogo2'
