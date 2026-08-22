import { describe, expect, it } from 'vitest'
import type { Bot } from '../../../../../shared/bot-types'
import {
  botSessionTitle,
  buildBotTeammatePreamble,
  formatBotToBotMessage,
  parseBotMention
} from './bot-message-routing'

const makeBot = (overrides: Partial<Bot> = {}): Bot => ({
  id: 'bot1',
  name: 'Release Checker',
  title: '',
  description: '',
  avatarEmoji: '🤖',
  agentId: 'claude',
  workspaceKey: 'worktree:r1::/wt',
  projectId: 'r1',
  chatPaneKey: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides
})

const checker = makeBot()
const reviewer = makeBot({ id: 'bot2', name: 'Code Reviewer', title: 'Reviews open PRs' })
const korean = makeBot({ id: 'bot3', name: '릴리스 점검' })
const roster = [checker, reviewer, korean]

describe('parseBotMention', () => {
  it('routes a leading mention and strips it from the body', () => {
    expect(parseBotMention('@code-reviewer 이 PR 좀 봐줘', roster)).toEqual({
      target: reviewer,
      handle: 'code-reviewer',
      body: '이 PR 좀 봐줘'
    })
  })

  it('matches the spaceless form of a handle', () => {
    expect(parseBotMention('@codereviewer look', roster)?.target).toBe(reviewer)
  })

  it('routes a Hangul handle', () => {
    expect(parseBotMention('@릴리스-점검 확인해줘', roster)?.target).toBe(korean)
  })

  // Only a LEADING mention routes: a mention mid-sentence is prose the author wants the
  // current bot to read, and redirecting it would lose the message.
  it('ignores a mention that is not at the start', () => {
    expect(parseBotMention('ask @code-reviewer about this', roster)).toBeNull()
    expect(parseBotMention('plain message', roster)).toBeNull()
  })

  it('reports an unknown handle instead of guessing a target', () => {
    const parsed = parseBotMention('@nobody hello', roster)
    expect(parsed?.target).toBeNull()
    expect(parsed?.handle).toBe('nobody')
  })

  it('tolerates a mention with no body', () => {
    expect(parseBotMention('@code-reviewer', roster)).toEqual({
      target: reviewer,
      handle: 'code-reviewer',
      body: ''
    })
  })
})

describe('formatBotToBotMessage', () => {
  // Without attribution the receiving agent reads the text as if the user typed it and
  // answers the wrong party.
  it('attributes the sender by name and handle', () => {
    const message = formatBotToBotMessage({ fromBot: checker, body: 'PR 3 needs review' })
    expect(message).toContain('Release Checker')
    expect(message).toContain('@release-checker')
    expect(message.endsWith('PR 3 needs review')).toBe(true)
  })
})

describe('buildBotTeammatePreamble', () => {
  it('names every teammate but not the bot itself', () => {
    const preamble = buildBotTeammatePreamble({ self: checker, roster })
    expect(preamble).toContain('@code-reviewer — Code Reviewer: Reviews open PRs')
    expect(preamble).toContain('@릴리스-점검')
    expect(preamble).not.toContain('@release-checker —')
    // Discovery has to be a command the agent can actually run today.
    expect(preamble).toContain('orca terminal list --json')
    expect(preamble).toContain('orca terminal send')
    // A teammate that was never messaged has no terminal; without the create step the
    // coordinator concludes it has nobody to delegate to and does the work itself.
    expect(preamble).toContain('orca terminal create')
    expect(preamble).toContain('bot:code-reviewer')
    expect(preamble).toContain('agent: claude')
  })

  it('returns null for a lone bot — an empty roster is noise in a system prompt', () => {
    expect(buildBotTeammatePreamble({ self: checker, roster: [checker] })).toBeNull()
  })
})

describe('botSessionTitle', () => {
  it('is the discovery key teammates search for', () => {
    expect(botSessionTitle(checker)).toBe('bot:release-checker')
  })
})
