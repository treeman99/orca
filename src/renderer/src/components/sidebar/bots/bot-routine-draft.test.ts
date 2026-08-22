import { describe, expect, it } from 'vitest'
import type { Bot } from '../../../../../shared/bot-types'
import {
  buildBotRoutineCreateInput,
  createBotRoutineDraft,
  isBotRoutineDraftComplete
} from './bot-routine-draft'

const makeBot = (overrides: Partial<Bot> = {}): Bot => ({
  id: 'bot1',
  name: 'Checker',
  title: '',
  description: '',
  avatarEmoji: '🤖',
  agentId: 'claude',
  workspaceKey: 'worktree:r1::/wt',
  projectId: 'r1',
  createdAt: 0,
  updatedAt: 0,
  ...overrides
})

const completeDraft = () => ({
  ...createBotRoutineDraft(),
  name: 'Morning check',
  prompt: 'Check the release branch'
})

describe('isBotRoutineDraftComplete', () => {
  it('requires a name and a prompt', () => {
    expect(isBotRoutineDraftComplete(createBotRoutineDraft())).toBe(false)
    expect(isBotRoutineDraftComplete({ ...completeDraft(), prompt: '   ' })).toBe(false)
    expect(isBotRoutineDraftComplete(completeDraft())).toBe(true)
  })
})

describe('buildBotRoutineCreateInput', () => {
  it('produces an ordinary automation tagged with the bot', () => {
    const input = buildBotRoutineCreateInput({
      bot: makeBot(),
      draft: { ...completeDraft(), preset: 'daily', time: '07:30' },
      timezone: 'Asia/Seoul',
      now: 1_700_000_000_000
    })

    expect(input).toMatchObject({
      botId: 'bot1',
      name: 'Morning check',
      agentId: 'claude',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'r1::/wt',
      reuseSession: true,
      timezone: 'Asia/Seoul',
      rrule: 'FREQ=DAILY;BYHOUR=7;BYMINUTE=30',
      enabled: true
    })
  })

  it('builds the weekly and hourly presets from the same draft shape', () => {
    expect(
      buildBotRoutineCreateInput({
        bot: makeBot(),
        draft: { ...completeDraft(), preset: 'weekly', time: '18:00', dayOfWeek: 3 },
        timezone: 'UTC',
        now: 0
      })?.rrule
    ).toBe('FREQ=WEEKLY;BYDAY=WE;BYHOUR=18;BYMINUTE=0')

    expect(
      buildBotRoutineCreateInput({
        bot: makeBot(),
        draft: { ...completeDraft(), preset: 'hourly', time: '18:45' },
        timezone: 'UTC',
        now: 0
      })?.rrule
    ).toBe('FREQ=HOURLY;BYMINUTE=45')
  })

  // The refusal has to happen here, not downstream: a folder-bound routine would save and
  // then skip forever with a target-unavailable error nobody can act on.
  it('refuses a folder-bound bot', () => {
    expect(
      buildBotRoutineCreateInput({
        bot: makeBot({ workspaceKey: 'folder:f1' }),
        draft: completeDraft(),
        timezone: 'UTC',
        now: 0
      })
    ).toBeNull()
  })

  it('refuses an unbound bot and an incomplete draft', () => {
    expect(
      buildBotRoutineCreateInput({
        bot: makeBot({ workspaceKey: null, projectId: null }),
        draft: completeDraft(),
        timezone: 'UTC',
        now: 0
      })
    ).toBeNull()
    expect(
      buildBotRoutineCreateInput({
        bot: makeBot(),
        draft: createBotRoutineDraft(),
        timezone: 'UTC',
        now: 0
      })
    ).toBeNull()
  })

  it('falls back to 09:00 for an unparseable time rather than producing a bad rrule', () => {
    expect(
      buildBotRoutineCreateInput({
        bot: makeBot(),
        draft: { ...completeDraft(), preset: 'daily', time: '' },
        timezone: 'UTC',
        now: 0
      })?.rrule
    ).toBe('FREQ=DAILY;BYHOUR=9;BYMINUTE=0')
  })
})
