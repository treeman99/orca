// Name -> face identity. A bot's colour, silhouette and eye polarity are all derived here so
// the same name always draws the same face, on every machine and across restarts.

import { BOT_FACE_SHAPES, type BotFaceShape } from './bot-face-geometry'
import { DEFAULT_BOT_AVATAR } from '../../../../../../shared/bot-types'

/**
 * Ten bodies picked to clear both themes: every entry keeps >=2.4:1 against the light sidebar
 * (#f5f5f5) *and* the dark one (#2a2a2a). That band is why there is no white and no near-black
 * in here — either one disappears into one of the two backgrounds. The last three sit low enough
 * in the band to flip their pupils to cream, so both eye polarities are real, not theoretical.
 */
export const BOT_FACE_COLORS: readonly string[] = [
  '#c9821f', // amber
  '#e2653f', // ember
  '#cf3d86', // magenta
  '#8b5cf6', // violet
  '#2b8fc4', // azure
  '#2f9e8f', // teal
  '#4f9a3f', // moss
  '#8a5a2b', // bronze
  '#a04a94', // plum
  '#5f6a85' // slate
]

/** Pupils and their sparkle. Solid, not alpha, so the contrast comparison below is exact. */
export const FACE_PUPIL_INK = '#141414'
export const FACE_PUPIL_CREAM = '#e8dcc3'
export const FACE_CATCHLIGHT_ON_INK = '#ffffff'
export const FACE_CATCHLIGHT_ON_CREAM = '#2b2b2b'

/** FNV-1a over code units — small, stable, and independent of locale or Node version. */
export function hashBotName(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Second mix so colour and silhouette do not move together across similar names. */
function remix(hash: number): number {
  let h = hash ^ (hash >>> 15)
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return h >>> 0
}

export function pickBotFaceColor(name: string): string {
  return BOT_FACE_COLORS[hashBotName(name) % BOT_FACE_COLORS.length]
}

export function pickBotFaceShape(name: string): BotFaceShape {
  return BOT_FACE_SHAPES[remix(hashBotName(name)) % BOT_FACE_SHAPES.length]
}

function channelLuminance(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  if (!Number.isFinite(n)) {
    return 0
  }
  return (
    0.2126 * channelLuminance((n >> 16) & 255) +
    0.7152 * channelLuminance((n >> 8) & 255) +
    0.0722 * channelLuminance(n & 255)
  )
}

/** WCAG contrast ratio, used both by the palette test and by the pupil choice below. */
export function faceColorContrast(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Dark bodies swallow an ink pupil, so the pupil flips to cream — measured, not thresholded. */
export function usesLightPupil(bodyColor: string): boolean {
  return (
    faceColorContrast(FACE_PUPIL_CREAM, bodyColor) > faceColorContrast(FACE_PUPIL_INK, bodyColor)
  )
}

export function botFacePupilFill(bodyColor: string): string {
  return usesLightPupil(bodyColor) ? FACE_PUPIL_CREAM : FACE_PUPIL_INK
}

/**
 * The catchlight tracks the PUPIL, not the body. A white sparkle on a cream pupil is invisible,
 * which reads as "this avatar has no dots in its eyes" on every dark-bodied face.
 */
export function botFaceCatchlightFill(bodyColor: string): string {
  return usesLightPupil(bodyColor) ? FACE_CATCHLIGHT_ON_CREAM : FACE_CATCHLIGHT_ON_INK
}

/**
 * An avatar the user actually picked wins over the generated face.
 *
 * The editor seeds every new bot with DEFAULT_BOT_AVATAR, so that value alone is not a choice —
 * anything else in the field was typed or clicked by a person and must not be thrown away when
 * generated faces land.
 */
export function prefersEmojiAvatar(avatarEmoji: string | null | undefined): boolean {
  const emoji = avatarEmoji?.trim() ?? ''
  return emoji.length > 0 && emoji !== DEFAULT_BOT_AVATAR
}
