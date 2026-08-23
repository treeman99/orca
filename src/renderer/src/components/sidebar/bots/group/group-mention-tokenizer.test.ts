import { describe, expect, it } from 'vitest'
import type { Bot } from '../../../../../../shared/bot-types'
import { buildMentionOptions, insertMention, mentionTokenAt } from './group-mention-tokenizer'

function makeBot(overrides: Partial<Bot> & Pick<Bot, 'id' | 'name'>): Bot {
  return {
    title: '',
    description: '',
    avatarEmoji: '🤖',
    agentId: 'claude',
    workspaceKey: null,
    projectId: null,
    chatPaneKey: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  } as Bot
}

const ROSTER: Bot[] = [
  makeBot({ id: 'b1', name: 'Ada Lint', title: 'Reviewer' }),
  makeBot({ id: 'b2', name: 'Bors', title: 'Merge queue' })
]

describe('mentionTokenAt', () => {
  it('opens on an @ that begins a word', () => {
    expect(mentionTokenAt('hey @ad', 7)).toEqual({ query: 'ad', start: 4 })
  })

  it('opens on a bare @ at the start of the field', () => {
    expect(mentionTokenAt('@', 1)).toEqual({ query: '', start: 0 })
  })

  it('stays closed mid-word so an email fragment is not an address', () => {
    expect(mentionTokenAt('a@b', 3)).toBeNull()
  })

  it('stays closed once the mention is followed by a space', () => {
    expect(mentionTokenAt('@ada ', 5)).toBeNull()
  })

  it('reads the text before the caret, not the whole field', () => {
    expect(mentionTokenAt('@ad rest of line', 3)).toEqual({ query: 'ad', start: 0 })
  })

  it('clamps a caret past the end of the text', () => {
    expect(mentionTokenAt('@ad', 99)).toEqual({ query: 'ad', start: 0 })
  })
})

describe('buildMentionOptions', () => {
  it('returns nothing without a token', () => {
    expect(buildMentionOptions(null, ROSTER)).toEqual([])
  })

  it('leads with the room-wide addresses, then members', () => {
    const options = buildMentionOptions({ query: '', start: 0 }, ROSTER)
    expect(options.map((option) => option.handle)).toEqual(['everyone', 'all', 'ada-lint', 'bors'])
  })

  it('matches a member on its handle', () => {
    const options = buildMentionOptions({ query: 'ada-', start: 0 }, ROSTER)
    expect(options.map((option) => option.handle)).toEqual(['ada-lint'])
  })

  it('matches a member on its display name', () => {
    const options = buildMentionOptions({ query: 'ada l', start: 0 }, ROSTER)
    expect(options.map((option) => option.handle)).toEqual(['ada-lint'])
  })

  it('matches a member on its title', () => {
    const options = buildMentionOptions({ query: 'merge', start: 0 }, ROSTER)
    expect(options.map((option) => option.handle)).toEqual(['bors'])
  })

  it('keeps @all when the query is its prefix', () => {
    expect(buildMentionOptions({ query: 'al', start: 0 }, ROSTER)).toEqual([
      { kind: 'everyone', handle: 'all' }
    ])
  })

  it('carries the bot id so colliding handles stay distinguishable', () => {
    const options = buildMentionOptions({ query: 'bors', start: 0 }, ROSTER)
    expect(options[0]).toMatchObject({ kind: 'member', botId: 'b2', title: 'Merge queue' })
  })
})

describe('insertMention', () => {
  it('produces exactly "@handle " and parks the caret after it', () => {
    expect(
      insertMention({
        value: 'hey @ad',
        caret: 7,
        token: { query: 'ad', start: 4 },
        handle: 'ada-lint'
      })
    ).toEqual({ text: 'hey @ada-lint ', caret: 14 })
  })

  it('keeps the text after the caret', () => {
    expect(
      insertMention({
        value: '@ad please look',
        caret: 3,
        token: { query: 'ad', start: 0 },
        handle: 'ada-lint'
      })
    ).toEqual({ text: '@ada-lint  please look', caret: 10 })
  })

  it('clamps a caret past the end of the value', () => {
    expect(
      insertMention({ value: '@b', caret: 99, token: { query: 'b', start: 0 }, handle: 'bors' })
    ).toEqual({ text: '@bors ', caret: 6 })
  })
})
