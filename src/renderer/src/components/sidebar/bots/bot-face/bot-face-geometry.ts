// Pure face geometry: silhouette outlines, the 3D-ish projection the clock re-writes every
// frame, and the two poses. No DOM here — every function is a formula over numbers so the
// shapes can be asserted in a unit test instead of eyeballed in the app.

export type BotFaceShape =
  | 'circle'
  | 'squircle'
  | 'pill'
  | 'triangle'
  | 'hexagon'
  | 'cloud'
  | 'drop'

export const BOT_FACE_SHAPES: readonly BotFaceShape[] = [
  'circle',
  'squircle',
  'pill',
  'triangle',
  'hexagon',
  'cloud',
  'drop'
]

export type FacePoint = readonly [number, number]

/** Centre of the 40x40 design box; the SVG viewBox adds 4px below it for the working dots. */
export const FACE_CENTER = 20

// Eye layout, shared by the static React render and the clock's per-frame writer so a face
// does not jump on its first painted frame.
export const FACE_EYE_LEFT_X = 15.4
export const FACE_EYE_RIGHT_X = 24.6
export const FACE_EYE_RX = 2.2
export const FACE_EYE_RY_IDLE = 2.3
export const FACE_EYE_RY_WORK = 2.6
export const FACE_CATCHLIGHT_R = 0.65
export const FACE_CATCHLIGHT_DX = -0.6
export const FACE_CATCHLIGHT_DY = -0.7
export const FACE_DOT_Y = 41.2
export const FACE_DOT_R = 1.15
export const FACE_DOT_XS: readonly number[] = [16.4, 20, 23.6]

export function asBotFaceShape(value: string | null | undefined): BotFaceShape {
  return BOT_FACE_SHAPES.includes(value as BotFaceShape) ? (value as BotFaceShape) : 'circle'
}

/** Eye line per silhouette — the cloud, drop and triangle are too narrow at the default line. */
export function faceEyeLine(shape: BotFaceShape): number {
  if (shape === 'cloud') {
    return 22
  }
  if (shape === 'drop') {
    return 21.5
  }
  if (shape === 'triangle') {
    return 19.5
  }
  return 17.2
}

/** Regular polygon in polar form; `clamp` rounds the corners off instead of spiking. */
function polygonRadius(
  sides: number,
  apothem: number,
  angle: number,
  vertexAngle: number,
  clamp: number
): number {
  const seg = (Math.PI * 2) / sides
  const edgeAngle = vertexAngle + seg / 2
  const raw = (((angle - edgeAngle) % seg) + seg) % seg
  const local = raw > seg / 2 ? raw - seg : raw
  return apothem / Math.max(clamp, Math.cos(local))
}

/** Superellipse radius: p=2 is a circle, larger p squares the corners off. */
function superRadius(radius: number, aspect: number, angle: number, p: number): number {
  const c = Math.abs(Math.cos(angle)) ** p
  const s = Math.abs(Math.sin(angle) / aspect) ** p
  return radius / ((c + s) ** (1 / p) || 1)
}

function radialRadius(shape: BotFaceShape, angle: number): number {
  if (shape === 'squircle') {
    return superRadius(16.2, 1, angle, 5)
  }
  if (shape === 'pill') {
    return superRadius(16, 0.72, angle, 8)
  }
  if (shape === 'triangle') {
    return polygonRadius(3, 8.75, angle, -Math.PI / 2, 0.52)
  }
  if (shape === 'hexagon') {
    return polygonRadius(6, 14.03, angle, -Math.PI / 2, 0.78)
  }
  return 16.2
}

// Three overlapping puffs with a flat floor. Every puff contains CLOUD_ORIGIN, which makes the
// union star-shaped about it — so the farthest ray exit *is* the outline, no boolean union needed.
const CLOUD_ORIGIN: FacePoint = [20, 25]
const CLOUD_PUFFS: readonly (readonly [number, number, number])[] = [
  [12, 25, 8.2],
  [20, 20, 9.8],
  [28, 25, 8.2]
]
const CLOUD_FLOOR = 33

function sampleCloudRing(steps: number): FacePoint[] {
  const [ox, oy] = CLOUD_ORIGIN
  const pts: FacePoint[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let t = 0
    for (const [cx, cy, r] of CLOUD_PUFFS) {
      const px = ox - cx
      const py = oy - cy
      const b = px * dx + py * dy
      const disc = b * b - (px * px + py * py - r * r)
      if (disc <= 0) {
        continue
      }
      t = Math.max(t, -b + Math.sqrt(disc))
    }
    const y = oy + dy * t
    if (y > CLOUD_FLOOR) {
      const k = (CLOUD_FLOOR - oy) / (dy * t)
      pts.push([ox + dx * t * k, CLOUD_FLOOR])
      continue
    }
    pts.push([ox + dx * t, y])
  }
  return pts
}

// Tip plus a circle, joined by the circle's two tangent lines — a real teardrop rather than a
// bezier whose control points only look right at one size.
const DROP_TIP: FacePoint = [20, 3.5]
const DROP_ORIGIN: FacePoint = [20, 25]
const DROP_R = 13

function sampleDropRing(steps: number): FacePoint[] {
  const [tx, ty] = DROP_TIP
  const [cx, cy] = DROP_ORIGIN
  const span = Math.hypot(cx - tx, cy - ty)
  const tangentLen = Math.sqrt(span * span - DROP_R * DROP_R)
  const alpha = Math.acos(DROP_R / span)
  const up = -Math.PI / 2
  const arcSweep = Math.PI * 2 - 2 * alpha
  const arcLen = arcSweep * DROP_R
  const total = tangentLen * 2 + arcLen
  const nSide = Math.max(4, Math.round((steps * tangentLen) / total))
  const nArc = Math.max(8, steps - nSide * 2)
  const at = (angle: number): FacePoint => [
    cx + DROP_R * Math.cos(angle),
    cy + DROP_R * Math.sin(angle)
  ]
  const [rx, ry] = at(up + alpha)
  const [lx, ly] = at(up - alpha)
  const pts: FacePoint[] = []
  for (let i = 0; i < nSide; i++) {
    const k = i / nSide
    pts.push([tx + (rx - tx) * k, ty + (ry - ty) * k])
  }
  for (let i = 0; i <= nArc; i++) {
    pts.push(at(up + alpha + arcSweep * (i / nArc)))
  }
  for (let i = 1; i < nSide; i++) {
    const k = i / nSide
    pts.push([lx + (tx - lx) * k, ly + (ty - ly) * k])
  }
  return pts
}

/** Outline of a silhouette, sampled clockwise from the top of the 40x40 box. */
export function sampleFaceRing(shape: BotFaceShape, steps = 52): FacePoint[] {
  if (shape === 'cloud') {
    return sampleCloudRing(Math.max(24, steps))
  }
  if (shape === 'drop') {
    return sampleDropRing(Math.max(24, steps))
  }
  const pts: FacePoint[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2
    const r = radialRadius(shape, a)
    pts.push([FACE_CENTER + r * Math.cos(a), FACE_CENTER + r * Math.sin(a)])
  }
  return pts
}

/** Fake perspective: roll spins the outline, turn/tilt squash it along each axis. */
export function projectFacePoint(
  x: number,
  y: number,
  turn: number,
  tilt: number,
  roll: number
): FacePoint {
  const dx = x - FACE_CENTER
  const dy = y - FACE_CENTER
  const r = (roll * Math.PI) / 180
  const xr = dx * Math.cos(r) - dy * Math.sin(r)
  const yr = dx * Math.sin(r) + dy * Math.cos(r)
  const sx = 0.74 + 0.26 * Math.abs(Math.cos((turn * Math.PI) / 180))
  const sy = 0.8 + 0.2 * Math.abs(Math.cos((tilt * Math.PI) / 180))
  return [FACE_CENTER + xr * sx, FACE_CENTER + yr * sy]
}

export function ringToPath(pts: readonly FacePoint[]): string {
  if (pts.length === 0) {
    return ''
  }
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 1; i < pts.length; i++) {
    d += `L${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`
  }
  return `${d}Z`
}

export function projectedFacePath(
  shape: BotFaceShape,
  pose: Pick<FacePose, 'turn' | 'tilt' | 'roll'>
): string {
  return ringToPath(
    sampleFaceRing(shape).map(([x, y]) => projectFacePoint(x, y, pose.turn, pose.tilt, pose.roll))
  )
}

export type BotFaceMood = 'idle' | 'work'

export type FacePose = {
  turn: number
  tilt: number
  roll: number
  gazeX: number
  gazeY: number
  blink: boolean
  /** Per-dot opacity for the working indicator, phase-shifted so they chase each other. */
  dots: readonly [number, number, number]
}

const WORK_DOT_PHASE = 0.7

/** Head pose at t seconds. Deterministic in t, so frame 0 is also the static render. */
export function facePose(mood: BotFaceMood, t: number): FacePose {
  if (mood === 'work') {
    const dot = (phase: number): number => 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.6 - phase))
    return {
      turn: -11 + Math.sin(t * 0.48) * 8,
      tilt: Math.sin(t * 0.42) * 8 + Math.sin(t * 1.1) * 1.6,
      roll: Math.sin(t * 0.75) * 4.2,
      gazeX: Math.sin(t * 0.55) * 3.6,
      gazeY: -1.6 + Math.sin(t * 0.38) * 2,
      blink: t % 1.45 > 1.26,
      dots: [dot(0), dot(WORK_DOT_PHASE), dot(WORK_DOT_PHASE * 2)]
    }
  }
  return {
    turn: Math.sin(t * 0.5) * 1.5,
    tilt: Math.sin(t * 0.27),
    roll: Math.sin(t * 0.85) * 1.2,
    gazeX: 0,
    gazeY: 0,
    blink: t % 3.2 > 3.02,
    dots: [0, 0, 0]
  }
}
