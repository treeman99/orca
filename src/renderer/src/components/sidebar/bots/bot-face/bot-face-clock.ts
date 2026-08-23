// One clock for every face on screen. A roster can mount hundreds of avatars; each one owning a
// rAF loop would burn a frame budget on cards nobody is looking at. Scheduling and DOM scanning
// are injected so the whole state machine is testable without a browser.

import {
  FACE_CATCHLIGHT_DX,
  FACE_CATCHLIGHT_DY,
  FACE_EYE_LEFT_X,
  FACE_EYE_RIGHT_X,
  asBotFaceShape,
  facePose,
  faceEyeLine,
  projectedFacePath
} from './bot-face-geometry'

type FaceChild = { setAttribute: (name: string, value: string) => void }

/** Structural subset of SVGSVGElement — a real element satisfies it, a test fake can too. */
export type BotFaceElement = {
  isConnected: boolean
  getAttribute: (name: string) => string | null
  querySelector: (selectors: string) => FaceChild | null
  querySelectorAll: (selectors: string) => Iterable<FaceChild>
  style: { transform: string; transformOrigin: string }
}

export const BOT_FACE_SELECTOR = 'svg[data-bot-face]'

function setPoint(node: FaceChild | null, cx: number, cy: number): void {
  if (!node) {
    return
  }
  node.setAttribute('cx', cx.toFixed(2))
  node.setAttribute('cy', cy.toFixed(2))
}

/** Rewrites one face for time `t` (seconds). Pure w.r.t. the element's data attributes. */
export function paintBotFace(svg: BotFaceElement, t: number): void {
  const mood = svg.getAttribute('data-bot-face-mood') === 'work' ? 'work' : 'idle'
  const shape = asBotFaceShape(svg.getAttribute('data-bot-face-shape'))
  const pose = facePose(mood, t)

  svg.querySelector('[data-bot-face-body]')?.setAttribute('d', projectedFacePath(shape, pose))

  const eyeY = faceEyeLine(shape) + pose.gazeY
  const eyeL = FACE_EYE_LEFT_X + pose.gazeX
  const eyeR = FACE_EYE_RIGHT_X + pose.gazeX
  setPoint(svg.querySelector('[data-bot-face-eye="l"]'), eyeL, eyeY)
  setPoint(svg.querySelector('[data-bot-face-eye="r"]'), eyeR, eyeY)
  // Catchlights ride the pupils; left where they were, they drift off the lower-set cloud eyes.
  setPoint(
    svg.querySelector('[data-bot-face-catchlight="l"]'),
    eyeL + FACE_CATCHLIGHT_DX,
    eyeY + FACE_CATCHLIGHT_DY
  )
  setPoint(
    svg.querySelector('[data-bot-face-catchlight="r"]'),
    eyeR + FACE_CATCHLIGHT_DX,
    eyeY + FACE_CATCHLIGHT_DY
  )

  svg.querySelector('[data-bot-face-open]')?.setAttribute('opacity', pose.blink ? '0' : '1')
  const shut = svg.querySelector('[data-bot-face-shut]')
  if (shut) {
    shut.setAttribute(
      'd',
      `M${(eyeL - 2.6).toFixed(2)} ${eyeY.toFixed(2)} L${(eyeL + 2.6).toFixed(2)} ${eyeY.toFixed(2)}` +
        ` M${(eyeR - 2.6).toFixed(2)} ${eyeY.toFixed(2)} L${(eyeR + 2.6).toFixed(2)} ${eyeY.toFixed(2)}`
    )
    shut.setAttribute('opacity', pose.blink ? '1' : '0')
  }

  let i = 0
  for (const dot of svg.querySelectorAll('[data-bot-face-dot]')) {
    dot.setAttribute('opacity', String(pose.dots[Math.min(i, 2)]))
    i += 1
  }

  svg.style.transform = `rotate(${pose.tilt.toFixed(2)}deg)`
  svg.style.transformOrigin = '50% 70%'
}

export type FaceClockScheduler = {
  requestFrame: (callback: (now: number) => void) => number
  cancelFrame: (handle: number) => void
  isHidden: () => boolean
}

export type FaceVisibilityTracker = {
  sync: (faces: readonly BotFaceElement[]) => void
  /** null means "cannot tell" — every mounted face is painted in that case. */
  visible: () => readonly BotFaceElement[] | null
  disconnect: () => void
}

export type FaceClockOptions = {
  scheduler: FaceClockScheduler
  scan: () => readonly BotFaceElement[]
  paint?: (face: BotFaceElement, t: number) => void
  createTracker?: (onVisible: () => void) => FaceVisibilityTracker | null
  fps?: number
  rescanMs?: number
}

export type FaceClock = {
  /** Re-arm a parked clock. Cheap and safe to call on every face mount. */
  wake: () => void
  stop: () => void
  isDormant: () => boolean
}

const DEFAULT_FPS = 15
const DEFAULT_RESCAN_MS = 1000

export function createFaceClock(options: FaceClockOptions): FaceClock {
  const { scheduler, scan } = options
  const paint = options.paint ?? paintBotFace
  const frameMs = 1000 / (options.fps ?? DEFAULT_FPS)
  const rescanMs = options.rescanMs ?? DEFAULT_RESCAN_MS

  let faces: readonly BotFaceElement[] = []
  let t0: number | null = null
  let lastScan = Number.NEGATIVE_INFINITY
  let lastPaint = Number.NEGATIVE_INFINITY
  let handle = 0
  let dormant = false
  let stopped = false

  const tracker = options.createTracker?.(() => wake()) ?? null

  const draw = (now: number): void => {
    if (now - lastScan >= rescanMs) {
      faces = scan()
      tracker?.sync(faces)
      lastScan = now
    }
    t0 ??= now
    const t = (now - t0) / 1000
    for (const face of tracker?.visible() ?? faces) {
      if (face.isConnected) {
        paint(face, t)
      }
    }
  }

  // Nothing worth animating: no faces mounted (a mount wakes us) or none on screen (the
  // visibility tracker wakes us).
  const idle = (): boolean => {
    if (faces.length === 0) {
      return true
    }
    return tracker?.visible()?.length === 0
  }

  const tick = (now: number): void => {
    if (stopped) {
      return
    }
    handle = 0
    // A hidden window never fires rAF, so leaving the request pending IS the pause — and the loop
    // resumes on the first frame after the window comes back, with nothing to re-arm it.
    if (scheduler.isHidden()) {
      handle = scheduler.requestFrame(tick)
      return
    }
    if (now - lastPaint >= frameMs) {
      draw(now)
      lastPaint = now
    }
    if (idle()) {
      dormant = true
      return
    }
    handle = scheduler.requestFrame(tick)
  }

  function wake(): void {
    if (stopped || !dormant) {
      return
    }
    dormant = false
    lastScan = Number.NEGATIVE_INFINITY
    handle = scheduler.requestFrame(tick)
  }

  handle = scheduler.requestFrame(tick)

  return {
    wake,
    stop: () => {
      stopped = true
      if (handle) {
        scheduler.cancelFrame(handle)
        handle = 0
      }
      tracker?.disconnect()
      faces = []
    },
    isDormant: () => dormant
  }
}

// Why: STYLEGUIDE + OS accessibility — a user who asked for less motion gets the static frame-0
// face rather than a throttled one. Hermes has no equivalent; this is ours.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function createIntersectionTracker(onVisible: () => void): FaceVisibilityTracker | null {
  if (typeof IntersectionObserver !== 'function') {
    return null
  }
  const seen = new Set<BotFaceElement>()
  const onScreen = new Set<BotFaceElement>()
  const observer = new IntersectionObserver((entries) => {
    let appeared = false
    for (const entry of entries) {
      const face = entry.target as unknown as BotFaceElement
      if (entry.isIntersecting) {
        onScreen.add(face)
        appeared = true
      } else {
        onScreen.delete(face)
      }
    }
    if (appeared) {
      onVisible()
    }
  })
  return {
    sync: (faces) => {
      const current = new Set(faces)
      for (const face of seen) {
        if (!current.has(face)) {
          observer.unobserve(face as unknown as Element)
          seen.delete(face)
          onScreen.delete(face)
        }
      }
      for (const face of faces) {
        if (!seen.has(face)) {
          seen.add(face)
          observer.observe(face as unknown as Element)
        }
      }
    },
    visible: () => [...onScreen],
    disconnect: () => {
      observer.disconnect()
      seen.clear()
      onScreen.clear()
    }
  }
}

let sharedClock: FaceClock | null = null

/** Idempotent: many faces mount, one rAF loop runs. A later call just re-arms a parked clock. */
export function startFaceClock(): void {
  if (typeof window === 'undefined' || prefersReducedMotion()) {
    return
  }
  if (sharedClock) {
    sharedClock.wake()
    return
  }
  sharedClock = createFaceClock({
    scheduler: {
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      isHidden: () => document.hidden
    },
    scan: () => [...document.querySelectorAll<SVGSVGElement>(BOT_FACE_SELECTOR)],
    createTracker: createIntersectionTracker
  })
}

export function stopFaceClock(): void {
  sharedClock?.stop()
  sharedClock = null
}
