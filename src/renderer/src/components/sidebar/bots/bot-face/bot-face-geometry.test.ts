import { describe, expect, it } from 'vitest'
import {
  BOT_FACE_SHAPES,
  FACE_EYE_LEFT_X,
  FACE_EYE_RIGHT_X,
  FACE_EYE_RX,
  asBotFaceShape,
  facePose,
  faceEyeLine,
  projectFacePoint,
  projectedFacePath,
  ringToPath,
  sampleFaceRing,
  type BotFaceShape,
  type FacePoint
} from './bot-face-geometry'

const bounds = (
  pts: readonly FacePoint[]
): { minX: number; maxX: number; minY: number; maxY: number } => ({
  minX: Math.min(...pts.map(([x]) => x)),
  maxX: Math.max(...pts.map(([x]) => x)),
  minY: Math.min(...pts.map(([, y]) => y)),
  maxY: Math.max(...pts.map(([, y]) => y))
})

/** Half-width of the silhouette at a scan line, by nearest sampled points on each side. */
const widthAt = (shape: BotFaceShape, y: number): { left: number; right: number } => {
  const pts = sampleFaceRing(shape, 240).filter(([, py]) => Math.abs(py - y) < 1.2)
  return {
    left: Math.min(...pts.map(([x]) => x)),
    right: Math.max(...pts.map(([x]) => x))
  }
}

describe('sampleFaceRing', () => {
  it('draws every silhouette inside the 40x40 design box', () => {
    for (const shape of BOT_FACE_SHAPES) {
      const b = bounds(sampleFaceRing(shape))
      expect(b.minX, shape).toBeGreaterThanOrEqual(0)
      expect(b.maxX, shape).toBeLessThanOrEqual(40)
      expect(b.minY, shape).toBeGreaterThanOrEqual(0)
      expect(b.maxY, shape).toBeLessThanOrEqual(40)
    }
  })

  it('fills the box rather than drawing a token in the middle of it', () => {
    for (const shape of BOT_FACE_SHAPES) {
      const b = bounds(sampleFaceRing(shape))
      expect(b.maxX - b.minX, shape).toBeGreaterThan(25)
      expect(b.maxY - b.minY, shape).toBeGreaterThan(18)
    }
  })

  it('gives every shape a distinct outline', () => {
    const paths = BOT_FACE_SHAPES.map((shape) => ringToPath(sampleFaceRing(shape)))
    expect(new Set(paths).size).toBe(BOT_FACE_SHAPES.length)
  })

  it('is deterministic', () => {
    for (const shape of BOT_FACE_SHAPES) {
      expect(sampleFaceRing(shape)).toEqual(sampleFaceRing(shape))
    }
  })

  it('leaves room for both eyes at the shape eye line', () => {
    for (const shape of BOT_FACE_SHAPES) {
      const { left, right } = widthAt(shape, faceEyeLine(shape))
      expect(left, shape).toBeLessThan(FACE_EYE_LEFT_X - FACE_EYE_RX)
      expect(right, shape).toBeGreaterThan(FACE_EYE_RIGHT_X + FACE_EYE_RX)
    }
  })

  it('gives the cloud a flat floor and the drop a single top tip', () => {
    const cloudFloor = sampleFaceRing('cloud', 240).filter(([, y]) => y > 32.5)
    expect(cloudFloor.length).toBeGreaterThan(4)
    expect(Math.max(...cloudFloor.map(([, y]) => y))).toBeCloseTo(33, 5)

    const drop = sampleFaceRing('drop', 240)
    const top = Math.min(...drop.map(([, y]) => y))
    const tips = drop.filter(([, y]) => y < top + 1)
    expect(tips.every(([x]) => Math.abs(x - 20) < 3)).toBe(true)
  })
})

describe('projectFacePoint', () => {
  it('leaves the centre fixed', () => {
    expect(projectFacePoint(20, 20, 30, 20, 15)).toEqual([20, 20])
  })

  it('squashes as the head turns away and restores when it faces front', () => {
    const [frontX] = projectFacePoint(36, 20, 0, 0, 0)
    const [turnedX] = projectFacePoint(36, 20, 90, 0, 0)
    expect(frontX).toBeCloseTo(36, 6)
    expect(turnedX).toBeLessThan(frontX)
    expect(turnedX).toBeGreaterThan(20)
  })

  it('rolls the outline around the centre', () => {
    const [x, y] = projectFacePoint(20, 4, 0, 0, 90)
    expect(x).toBeCloseTo(36, 5)
    expect(y).toBeCloseTo(20, 5)
  })
})

describe('ringToPath', () => {
  it('emits a closed path with two decimals', () => {
    expect(
      ringToPath([
        [1, 2],
        [3.14159, 4]
      ])
    ).toBe('M1.00 2.00L3.14 4.00Z')
  })

  it('is empty for an empty ring', () => {
    expect(ringToPath([])).toBe('')
  })

  it('re-projects the body path as the pose changes', () => {
    const rest = projectedFacePath('circle', facePose('idle', 0))
    const moved = projectedFacePath('circle', facePose('work', 1.4))
    expect(rest).not.toBe(moved)
    expect(moved.startsWith('M')).toBe(true)
    expect(moved.endsWith('Z')).toBe(true)
  })
})

describe('facePose', () => {
  it('idles with a small sway and blinks about every 3.2s', () => {
    const samples = Array.from({ length: 400 }, (_, i) => facePose('idle', i / 50))
    expect(Math.max(...samples.map((p) => Math.abs(p.turn)))).toBeLessThan(2)
    expect(samples.every((p) => p.gazeX === 0 && p.gazeY === 0)).toBe(true)
    expect(samples.every((p) => p.dots.every((d) => d === 0))).toBe(true)
    expect(facePose('idle', 3.1).blink).toBe(true)
    expect(facePose('idle', 1.6).blink).toBe(false)
  })

  it('leans left, looks around, and blinks more often while working', () => {
    const samples = Array.from({ length: 400 }, (_, i) => facePose('work', i / 50))
    const turns = samples.map((p) => p.turn)
    expect(Math.max(...turns)).toBeLessThan(0)
    expect(turns.reduce((a, b) => a + b, 0) / turns.length).toBeLessThan(-6)
    expect(Math.max(...samples.map((p) => Math.abs(p.gazeX)))).toBeGreaterThan(1)
    const blinks = samples.filter((p) => p.blink).length
    const idleBlinks = Array.from({ length: 400 }, (_, i) => facePose('idle', i / 50)).filter(
      (p) => p.blink
    ).length
    expect(blinks).toBeGreaterThan(idleBlinks)
  })

  it('pulses the three working dots out of phase', () => {
    const [a, b, c] = facePose('work', 0.6).dots
    expect(new Set([a, b, c]).size).toBe(3)
    for (const t of [0, 0.3, 0.9, 1.7, 4.2]) {
      for (const d of facePose('work', t).dots) {
        expect(d).toBeGreaterThanOrEqual(0.2)
        expect(d).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is a pure function of time', () => {
    expect(facePose('work', 2.5)).toEqual(facePose('work', 2.5))
  })
})

describe('asBotFaceShape', () => {
  it('falls back to a circle for anything unknown', () => {
    expect(asBotFaceShape('hexagon')).toBe('hexagon')
    expect(asBotFaceShape('blobatar')).toBe('circle')
    expect(asBotFaceShape(null)).toBe('circle')
    expect(asBotFaceShape(undefined)).toBe('circle')
  })
})
