import { describe, expect, it } from 'vitest'
import { BOT_FACE_SHAPES } from './bot-face-geometry'
import {
  BOT_FACE_COLORS,
  FACE_CATCHLIGHT_ON_CREAM,
  FACE_CATCHLIGHT_ON_INK,
  FACE_PUPIL_CREAM,
  FACE_PUPIL_INK,
  botFaceCatchlightFill,
  botFacePupilFill,
  faceColorContrast,
  hashBotName,
  pickBotFaceColor,
  pickBotFaceShape,
  prefersEmojiAvatar,
  usesLightPupil
} from './bot-face-palette'
import { DEFAULT_BOT_AVATAR } from '../../../../../../shared/bot-types'

// Both sidebar surfaces a face is drawn on, light and dark.
const LIGHT_SURFACES = ['#f5f5f5', '#fafafa', '#ffffff']
const DARK_SURFACES = ['#2a2a2a', '#171717', '#0a0a0a']

const NAMES = [
  'Release Checker',
  'release checker',
  'Hermes',
  '빌드 감시자',
  'a',
  'ab',
  'Nightly Sweep',
  'Flake Hunter',
  'Doc Tidy',
  'PR Triage',
  'Deploy Watch',
  'Lint Ratchet'
]

describe('bot face identity', () => {
  it('derives the same colour and shape from the same name every time', () => {
    for (const name of NAMES) {
      expect(pickBotFaceColor(name)).toBe(pickBotFaceColor(name))
      expect(pickBotFaceShape(name)).toBe(pickBotFaceShape(name))
    }
    // Pinned: a change here re-rolls every existing bot's face, so it must be deliberate.
    expect(hashBotName('Release Checker')).toBe(hashBotName('Release Checker'))
    expect(hashBotName('Release Checker')).not.toBe(hashBotName('release checker'))
  })

  it('only ever produces palette colours and known silhouettes', () => {
    for (const name of NAMES) {
      expect(BOT_FACE_COLORS).toContain(pickBotFaceColor(name))
      expect(BOT_FACE_SHAPES).toContain(pickBotFaceShape(name))
    }
  })

  it('spreads names across the whole palette instead of collapsing onto one face', () => {
    const many = Array.from({ length: 200 }, (_, i) => `bot ${i}`)
    expect(new Set(many.map(pickBotFaceColor)).size).toBe(BOT_FACE_COLORS.length)
    expect(new Set(many.map(pickBotFaceShape)).size).toBe(BOT_FACE_SHAPES.length)
  })

  it('does not lock colour and shape together', () => {
    const many = Array.from({ length: 200 }, (_, i) => `bot ${i}`)
    const shapesPerColor = new Map<string, Set<string>>()
    for (const name of many) {
      const color = pickBotFaceColor(name)
      const shapes = shapesPerColor.get(color) ?? new Set<string>()
      shapes.add(pickBotFaceShape(name))
      shapesPerColor.set(color, shapes)
    }
    for (const shapes of shapesPerColor.values()) {
      expect(shapes.size).toBeGreaterThan(1)
    }
  })
})

describe('palette contrast', () => {
  it('keeps every body readable on both the light and the dark sidebar', () => {
    for (const color of BOT_FACE_COLORS) {
      for (const surface of [...LIGHT_SURFACES, ...DARK_SURFACES]) {
        expect(faceColorContrast(color, surface)).toBeGreaterThanOrEqual(2.4)
      }
    }
  })

  it('has ten distinct colours', () => {
    expect(BOT_FACE_COLORS).toHaveLength(10)
    expect(new Set(BOT_FACE_COLORS).size).toBe(10)
  })
})

describe('eye polarity', () => {
  it('gives a dark body cream pupils and a dark catchlight', () => {
    const dark = '#1f2937'
    expect(usesLightPupil(dark)).toBe(true)
    expect(botFacePupilFill(dark)).toBe(FACE_PUPIL_CREAM)
    // The regression that started this: a white sparkle on a cream pupil is invisible, and the
    // avatar reads as having no dots in its eyes at all.
    expect(botFaceCatchlightFill(dark)).toBe(FACE_CATCHLIGHT_ON_CREAM)
  })

  it('gives a light body ink pupils and a white catchlight', () => {
    const light = '#f2c94c'
    expect(usesLightPupil(light)).toBe(false)
    expect(botFacePupilFill(light)).toBe(FACE_PUPIL_INK)
    expect(botFaceCatchlightFill(light)).toBe(FACE_CATCHLIGHT_ON_INK)
  })

  it('always contrasts the catchlight against the pupil it sits on', () => {
    for (const color of [...BOT_FACE_COLORS, '#1f2937', '#f2c94c', '#ffffff', '#000000']) {
      const pupil = botFacePupilFill(color)
      const catchlight = botFaceCatchlightFill(color)
      expect(faceColorContrast(pupil, catchlight)).toBeGreaterThan(4)
    }
  })

  it('exercises both polarities from the shipped palette', () => {
    const polarities = new Set(BOT_FACE_COLORS.map(botFacePupilFill))
    expect(polarities).toEqual(new Set([FACE_PUPIL_INK, FACE_PUPIL_CREAM]))
  })

  it('picks whichever pupil actually contrasts more with the body', () => {
    for (const color of BOT_FACE_COLORS) {
      const chosen = botFacePupilFill(color)
      const other = chosen === FACE_PUPIL_INK ? FACE_PUPIL_CREAM : FACE_PUPIL_INK
      expect(faceColorContrast(chosen, color)).toBeGreaterThanOrEqual(
        faceColorContrast(other, color)
      )
    }
  })
})

describe('prefersEmojiAvatar', () => {
  it('keeps an avatar the user picked', () => {
    expect(prefersEmojiAvatar('🧪')).toBe(true)
    expect(prefersEmojiAvatar('🦺')).toBe(true)
  })

  // The regression: 🤖 is both the first tile and the old seed, so excluding it drew a
  // generated face for a bot whose editor showed 🤖 as the selection.
  it('keeps the first tile when the user clicks it', () => {
    expect(prefersEmojiAvatar(DEFAULT_BOT_AVATAR)).toBe(true)
  })

  it('treats an empty or missing avatar as "no choice made"', () => {
    expect(prefersEmojiAvatar('')).toBe(false)
    expect(prefersEmojiAvatar('   ')).toBe(false)
    expect(prefersEmojiAvatar(null)).toBe(false)
    expect(prefersEmojiAvatar(undefined)).toBe(false)
  })
})
