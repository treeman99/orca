import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOT_FACE_SELECTOR,
  type BotFaceElement,
  type FaceVisibilityTracker,
  createFaceClock,
  paintBotFace,
  startFaceClock,
  stopFaceClock
} from './bot-face-clock'
import { faceEyeLine, facePose } from './bot-face-geometry'

type FakeChild = { attrs: Record<string, string>; setAttribute: (n: string, v: string) => void }

const makeChild = (): FakeChild => {
  const attrs: Record<string, string> = {}
  return { attrs, setAttribute: (n, v) => void (attrs[n] = v) }
}

const FACE_PARTS = [
  '[data-bot-face-body]',
  '[data-bot-face-open]',
  '[data-bot-face-shut]',
  '[data-bot-face-eye="l"]',
  '[data-bot-face-eye="r"]',
  '[data-bot-face-catchlight="l"]',
  '[data-bot-face-catchlight="r"]'
]

type FakeFace = BotFaceElement & { parts: Record<string, FakeChild>; dots: FakeChild[] }

function makeFace({ mood = 'idle', shape = 'circle', dots = 0 } = {}): FakeFace {
  const parts = Object.fromEntries(FACE_PARTS.map((sel) => [sel, makeChild()]))
  const dotNodes = Array.from({ length: dots }, makeChild)
  return {
    parts,
    dots: dotNodes,
    isConnected: true,
    getAttribute: (name) =>
      name === 'data-bot-face-mood' ? mood : name === 'data-bot-face-shape' ? shape : null,
    querySelector: (sel) => parts[sel] ?? null,
    querySelectorAll: (sel) => (sel === '[data-bot-face-dot]' ? dotNodes : []),
    style: { transform: '', transformOrigin: '' }
  }
}

function makeScheduler() {
  const queue = new Map<number, (now: number) => void>()
  let seq = 0
  let hidden = false
  return {
    scheduler: {
      requestFrame: (cb: (now: number) => void) => {
        seq += 1
        queue.set(seq, cb)
        return seq
      },
      cancelFrame: (id: number) => void queue.delete(id),
      isHidden: () => hidden
    },
    pending: () => queue.size,
    setHidden: (value: boolean) => void (hidden = value),
    flush: (now: number) => {
      const callbacks = [...queue.values()]
      queue.clear()
      for (const cb of callbacks) {
        cb(now)
      }
    }
  }
}

function makeTracker() {
  let onVisible = (): void => {}
  let visible: readonly BotFaceElement[] | null = []
  let synced: readonly BotFaceElement[] = []
  let disconnected = false
  return {
    create: (cb: () => void): FaceVisibilityTracker => {
      onVisible = cb
      return {
        sync: (faces) => void (synced = faces),
        visible: () => visible,
        disconnect: () => void (disconnected = true)
      }
    },
    show: (faces: readonly BotFaceElement[]) => {
      visible = faces
      onVisible()
    },
    hideAll: () => void (visible = []),
    synced: () => synced,
    disconnected: () => disconnected
  }
}

describe('createFaceClock scheduling', () => {
  it('keeps exactly one frame in flight no matter how many faces are mounted', () => {
    const s = makeScheduler()
    const faces = [makeFace(), makeFace(), makeFace()]
    const paint = vi.fn()
    createFaceClock({ scheduler: s.scheduler, scan: () => faces, paint })
    expect(s.pending()).toBe(1)
    s.flush(0)
    expect(s.pending()).toBe(1)
    expect(paint).toHaveBeenCalledTimes(3)
  })

  it('paints at 15fps, not on every frame', () => {
    const s = makeScheduler()
    const paint = vi.fn()
    const faces = [makeFace()]
    createFaceClock({ scheduler: s.scheduler, scan: () => faces, paint })
    for (const now of [0, 16, 33, 50, 67, 83, 100, 117, 134]) {
      s.flush(now)
    }
    // 0, 67, 134 — one paint per ~66.7ms.
    expect(paint).toHaveBeenCalledTimes(3)
  })

  it('rescans the document about once a second', () => {
    const s = makeScheduler()
    const scan = vi.fn(() => [makeFace()])
    createFaceClock({ scheduler: s.scheduler, scan, paint: () => {} })
    for (let now = 0; now <= 2100; now += 70) {
      s.flush(now)
    }
    expect(scan).toHaveBeenCalledTimes(3)
  })

  it('skips faces React has already unmounted', () => {
    const s = makeScheduler()
    const live = makeFace()
    const gone = makeFace()
    gone.isConnected = false
    const paint = vi.fn()
    createFaceClock({ scheduler: s.scheduler, scan: () => [live, gone], paint })
    s.flush(0)
    expect(paint).toHaveBeenCalledTimes(1)
    expect(paint).toHaveBeenCalledWith(live, 0)
  })
})

describe('createFaceClock parking', () => {
  it('parks when nothing is mounted and re-arms on wake', () => {
    const s = makeScheduler()
    const clock = createFaceClock({ scheduler: s.scheduler, scan: () => [], paint: () => {} })
    s.flush(0)
    expect(clock.isDormant()).toBe(true)
    expect(s.pending()).toBe(0)

    clock.wake()
    expect(clock.isDormant()).toBe(false)
    expect(s.pending()).toBe(1)
  })

  it('parks when every face scrolls off screen and the tracker wakes it back', () => {
    const s = makeScheduler()
    const tracker = makeTracker()
    const face = makeFace()
    const paint = vi.fn()
    const clock = createFaceClock({
      scheduler: s.scheduler,
      scan: () => [face],
      paint,
      createTracker: tracker.create
    })

    s.flush(0)
    expect(tracker.synced()).toEqual([face])
    expect(paint).not.toHaveBeenCalled()
    expect(clock.isDormant()).toBe(true)

    tracker.show([face])
    expect(clock.isDormant()).toBe(false)
    s.flush(100)
    expect(paint).toHaveBeenCalledTimes(1)

    tracker.hideAll()
    s.flush(200)
    expect(clock.isDormant()).toBe(true)
    expect(s.pending()).toBe(0)
  })

  it('paints every mounted face when visibility cannot be observed', () => {
    const s = makeScheduler()
    const face = makeFace()
    const paint = vi.fn()
    createFaceClock({
      scheduler: s.scheduler,
      scan: () => [face],
      paint,
      createTracker: () => null
    })
    s.flush(0)
    expect(paint).toHaveBeenCalledTimes(1)
  })

  it('does not paint a hidden window, and keeps a frame pending so it resumes', () => {
    const s = makeScheduler()
    const paint = vi.fn()
    const clock = createFaceClock({
      scheduler: s.scheduler,
      scan: () => [makeFace()],
      paint
    })
    s.setHidden(true)
    s.flush(0)
    s.flush(100)
    expect(paint).not.toHaveBeenCalled()
    expect(clock.isDormant()).toBe(false)
    expect(s.pending()).toBe(1)

    s.setHidden(false)
    s.flush(200)
    expect(paint).toHaveBeenCalledTimes(1)
  })

  it('stops for good: no frame, no observer, no further paints', () => {
    const s = makeScheduler()
    const tracker = makeTracker()
    const face = makeFace()
    const paint = vi.fn()
    const clock = createFaceClock({
      scheduler: s.scheduler,
      scan: () => [face],
      paint,
      createTracker: tracker.create
    })
    tracker.show([face])
    s.flush(0)
    expect(paint).toHaveBeenCalledTimes(1)

    clock.stop()
    expect(s.pending()).toBe(0)
    expect(tracker.disconnected()).toBe(true)
    clock.wake()
    expect(s.pending()).toBe(0)
  })
})

describe('paintBotFace', () => {
  it('re-projects the body and moves the eyes with the gaze', () => {
    const face = makeFace({ mood: 'work', shape: 'hexagon', dots: 3 })
    paintBotFace(face, 1.1)
    const pose = facePose('work', 1.1)

    expect(face.parts['[data-bot-face-body]'].attrs.d).toMatch(/^M[\d.]+ [\d.]+L/)
    const eyeY = faceEyeLine('hexagon') + pose.gazeY
    expect(Number(face.parts['[data-bot-face-eye="l"]'].attrs.cy)).toBeCloseTo(eyeY, 1)
    expect(Number(face.parts['[data-bot-face-eye="r"]'].attrs.cx)).toBeCloseTo(24.6 + pose.gazeX, 1)
  })

  it('keeps the catchlights riding on the pupils', () => {
    const face = makeFace({ mood: 'work', shape: 'cloud' })
    paintBotFace(face, 2.3)
    const eyeX = Number(face.parts['[data-bot-face-eye="l"]'].attrs.cx)
    const eyeY = Number(face.parts['[data-bot-face-eye="l"]'].attrs.cy)
    expect(Number(face.parts['[data-bot-face-catchlight="l"]'].attrs.cx)).toBeCloseTo(eyeX - 0.6, 5)
    expect(Number(face.parts['[data-bot-face-catchlight="l"]'].attrs.cy)).toBeCloseTo(eyeY - 0.7, 5)
  })

  it('swaps open eyes for closed lids on a blink', () => {
    const open = makeFace()
    paintBotFace(open, 1.6)
    expect(open.parts['[data-bot-face-open]'].attrs.opacity).toBe('1')
    expect(open.parts['[data-bot-face-shut]'].attrs.opacity).toBe('0')

    const blinking = makeFace()
    paintBotFace(blinking, 3.1)
    expect(blinking.parts['[data-bot-face-open]'].attrs.opacity).toBe('0')
    expect(blinking.parts['[data-bot-face-shut]'].attrs.opacity).toBe('1')
    expect(blinking.parts['[data-bot-face-shut]'].attrs.d).toContain('M')
  })

  it('pulses the working dots and tilts the whole face from the chin', () => {
    const face = makeFace({ mood: 'work', dots: 3 })
    paintBotFace(face, 0.6)
    const opacities = face.dots.map((dot) => dot.attrs.opacity)
    expect(new Set(opacities).size).toBe(3)
    expect(face.style.transform).toMatch(/^rotate\(-?[\d.]+deg\)$/)
    expect(face.style.transformOrigin).toBe('50% 70%')
  })
})

describe('startFaceClock', () => {
  const install = ({ reduceMotion = false } = {}): { frames: () => number } => {
    let frames = 0
    const fakeWindow = {
      requestAnimationFrame: () => {
        frames += 1
        return frames
      },
      cancelAnimationFrame: () => {},
      matchMedia: () => ({ matches: reduceMotion })
    }
    Object.assign(globalThis, {
      window: fakeWindow,
      document: { hidden: false, querySelectorAll: () => [] }
    })
    return { frames: () => frames }
  }

  afterEach(() => {
    stopFaceClock()
    Reflect.deleteProperty(globalThis, 'window')
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('is idempotent — many mounting faces still drive one loop', () => {
    const env = install()
    startFaceClock()
    startFaceClock()
    startFaceClock()
    expect(env.frames()).toBe(1)
  })

  it('runs no clock at all under prefers-reduced-motion', () => {
    const env = install({ reduceMotion: true })
    startFaceClock()
    startFaceClock()
    expect(env.frames()).toBe(0)
  })

  it('scans for mounted faces by data attribute', () => {
    expect(BOT_FACE_SELECTOR).toBe('svg[data-bot-face]')
  })
})
