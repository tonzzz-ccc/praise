const COLORS = ['#0958d9', '#1677ff', '#4096ff', '#91caff', '#ffffff']
const PARTICLE_COUNT = 28
const DURATION_MS = 1000
const GRAVITY = 260

const FAREWELL_MS = 1000
const FAREWELL_GRAVITY = 90

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Plays one burst on a temporary canvas attached to the page, so it keeps running
// after the Login page is replaced by the dashboard. It removes itself when done.
export function playFireworks({ x, y }) {
  if (prefersReducedMotion()) return

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return

  const scale = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * scale
  canvas.height = window.innerHeight * scale
  canvas.setAttribute('aria-hidden', 'true')
  canvas.dataset.praiseFireworks = ''
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  context.scale(scale, scale)
  document.body.appendChild(canvas)

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.3
    const speed = 110 + Math.random() * 170
    return {
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 1.5,
      color: COLORS[index % COLORS.length],
    }
  })

  const start = performance.now()

  const draw = (now) => {
    const seconds = (now - start) / 1000
    const progress = (now - start) / DURATION_MS
    if (progress >= 1) {
      canvas.remove()
      return
    }

    context.clearRect(0, 0, window.innerWidth, window.innerHeight)
    context.globalAlpha = 1 - progress * progress
    for (const particle of particles) {
      // Slows each spark as it spreads, then lets it fall.
      const spread = (1 - Math.exp(-3 * seconds)) / 3
      context.beginPath()
      context.arc(
        x + particle.velocityX * spread,
        y + particle.velocityY * spread + 0.5 * GRAVITY * seconds * seconds,
        particle.radius,
        0,
        Math.PI * 2,
      )
      context.fillStyle = particle.color
      context.fill()
    }

    requestAnimationFrame(draw)
  }

  requestAnimationFrame(draw)
}

// A calmer, mirrored version of the burst for Sign Out: a soft page fade and slow blue and
// white sparkles drifting down. It always calls onDone (immediately when motion is reduced or
// anything fails, otherwise after about a second), so signing out is never blocked by the animation.
export function playFarewell(onDone) {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    overlay?.remove()
    try {
      onDone?.()
    } catch {
      // Signing out is the caller's job; nothing more to do here.
    }
  }

  let overlay = null
  try {
    if (prefersReducedMotion()) return finish()

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return finish()

    overlay = document.createElement('div')
    overlay.setAttribute('aria-hidden', 'true')
    overlay.dataset.praiseFarewell = ''
    overlay.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:9999;background:rgba(240,245,255,0);transition:background 700ms ease'

    const scale = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * scale
    canvas.height = window.innerHeight * scale
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none'
    context.scale(scale, scale)

    overlay.append(canvas)
    document.body.appendChild(overlay)

    requestAnimationFrame(() => {
      overlay.style.background = 'rgba(240,245,255,0.55)'
    })

    const sparkles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: window.innerWidth * (0.2 + Math.random() * 0.6),
      y: window.innerHeight * (0.12 + Math.random() * 0.26),
      velocityX: (Math.random() - 0.5) * 26,
      velocityY: 16 + Math.random() * 34,
      radius: 1.5 + Math.random() * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))

    const start = performance.now()
    const draw = (now) => {
      if (done) return
      const seconds = (now - start) / 1000
      const progress = (now - start) / FAREWELL_MS
      if (progress >= 1) return finish()

      context.clearRect(0, 0, window.innerWidth, window.innerHeight)
      context.globalAlpha = Math.max(0, 1 - progress)
      for (const sparkle of sparkles) {
        context.beginPath()
        context.arc(
          sparkle.x + sparkle.velocityX * seconds,
          sparkle.y + sparkle.velocityY * seconds + 0.5 * FAREWELL_GRAVITY * seconds * seconds,
          sparkle.radius,
          0,
          Math.PI * 2,
        )
        context.fillStyle = sparkle.color
        context.fill()
      }
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)

    // Fallback in case requestAnimationFrame is paused (for example, a hidden tab).
    setTimeout(finish, FAREWELL_MS + 200)
  } catch {
    finish()
  }
}
