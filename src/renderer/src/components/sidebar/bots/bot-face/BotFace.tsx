// A bot's avatar: a procedural SVG face generated from its name, animated by the shared face
// clock. The markup here is only frame 0 — everything the clock moves carries a data attribute
// so it can find it again without React re-rendering the roster 15 times a second.

import { useEffect } from 'react'
import type React from 'react'
import type { Bot } from '../../../../../../shared/bot-types'
import { startFaceClock } from './bot-face-clock'
import {
  FACE_CATCHLIGHT_DX,
  FACE_CATCHLIGHT_DY,
  FACE_CATCHLIGHT_R,
  FACE_DOT_R,
  FACE_DOT_XS,
  FACE_DOT_Y,
  FACE_EYE_LEFT_X,
  FACE_EYE_RIGHT_X,
  FACE_EYE_RX,
  FACE_EYE_RY_IDLE,
  FACE_EYE_RY_WORK,
  type BotFaceMood,
  facePose,
  faceEyeLine,
  projectedFacePath
} from './bot-face-geometry'
import {
  botFaceCatchlightFill,
  botFacePupilFill,
  pickBotFaceColor,
  pickBotFaceShape,
  prefersEmojiAvatar
} from './bot-face-palette'

export type BotFaceProps = {
  bot: Pick<Bot, 'id' | 'name' | 'avatarEmoji'>
  size: number
  mood?: BotFaceMood
}

export function BotFace({ bot, size, mood = 'idle' }: BotFaceProps): React.JSX.Element {
  const emoji = prefersEmojiAvatar(bot.avatarEmoji)

  useEffect(() => {
    if (!emoji) {
      startFaceClock()
    }
  }, [emoji])

  if (emoji) {
    return (
      <span
        // Decorative: the bot's name is always rendered next to its avatar, so announcing the
        // avatar again would just repeat it to a screen reader.
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.8,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {bot.avatarEmoji}
      </span>
    )
  }

  const shape = pickBotFaceShape(bot.name)
  const color = pickBotFaceColor(bot.name)
  const pupil = botFacePupilFill(color)
  const catchlight = botFaceCatchlightFill(color)
  const pose = facePose(mood, 0)
  const eyeY = faceEyeLine(shape) + pose.gazeY
  const eyeL = FACE_EYE_LEFT_X + pose.gazeX
  const eyeR = FACE_EYE_RIGHT_X + pose.gazeX
  const eyeRy = mood === 'work' ? FACE_EYE_RY_WORK : FACE_EYE_RY_IDLE

  return (
    <svg
      data-bot-face={bot.id}
      data-bot-face-mood={mood}
      data-bot-face-shape={shape}
      viewBox="0 0 40 44"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ overflow: 'visible', display: 'block', transformOrigin: '50% 70%' }}
    >
      <path data-bot-face-body="" d={projectedFacePath(shape, pose)} fill={color} />
      <g data-bot-face-open="" opacity={pose.blink ? 0 : 1}>
        <ellipse
          data-bot-face-eye="l"
          cx={eyeL}
          cy={eyeY}
          rx={FACE_EYE_RX}
          ry={eyeRy}
          fill={pupil}
        />
        <ellipse
          data-bot-face-eye="r"
          cx={eyeR}
          cy={eyeY}
          rx={FACE_EYE_RX}
          ry={eyeRy}
          fill={pupil}
        />
        <circle
          data-bot-face-catchlight="l"
          cx={eyeL + FACE_CATCHLIGHT_DX}
          cy={eyeY + FACE_CATCHLIGHT_DY}
          r={FACE_CATCHLIGHT_R}
          fill={catchlight}
        />
        <circle
          data-bot-face-catchlight="r"
          cx={eyeR + FACE_CATCHLIGHT_DX}
          cy={eyeY + FACE_CATCHLIGHT_DY}
          r={FACE_CATCHLIGHT_R}
          fill={catchlight}
        />
      </g>
      <path
        data-bot-face-shut=""
        d={`M${eyeL - 2.6} ${eyeY} L${eyeL + 2.6} ${eyeY} M${eyeR - 2.6} ${eyeY} L${eyeR + 2.6} ${eyeY}`}
        stroke={pupil}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        opacity={pose.blink ? 1 : 0}
      />
      {mood === 'work' ? (
        <g>
          {FACE_DOT_XS.map((x, i) => (
            <circle
              key={x}
              data-bot-face-dot=""
              cx={x}
              cy={FACE_DOT_Y}
              r={FACE_DOT_R}
              fill={color}
              opacity={pose.dots[i]}
            />
          ))}
        </g>
      ) : null}
    </svg>
  )
}
