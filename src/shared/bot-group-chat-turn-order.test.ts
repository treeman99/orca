import { describe, expect, it } from 'vitest'
import {
  isGroupPassText,
  parseGroupChatMentions,
  resolveGroupResponders,
  rotateGroupSpeakers,
  selectTurnDelta
} from './bot-group-chat-turn-order'
import type { Bot } from './bot-types'
import type { BotGroupChatEntry } from './bot-group-chat-types'

function bot(id: string, name: string, title = ''): Bot {
  return {
    id,
    name,
    title,
    description: '',
    avatarEmoji: '🤖',
    agentId: 'claude',
    workspaceKey: 'worktree:w1',
    projectId: 'p1',
    chatPaneKey: null,
    createdAt: 0,
    updatedAt: 0
  }
}

function entry(from: BotGroupChatEntry['from'], text: string, thread = 't1'): BotGroupChatEntry {
  return { id: `${text}-${thread}`, at: 0, from, text, thread }
}

const radar = bot('b1', 'Radar')
const scribe = bot('b2', 'Scribe', 'Build Bot')
const ops = bot('b3', 'Ops')
const roster = [radar, scribe, ops]

describe('isGroupPassText', () => {
  it('treats the pass marker and its loose forms as silence', () => {
    for (const text of ['(pass)', 'pass', 'PASS.', ' (Pass) ']) {
      expect(isGroupPassText(text)).toBe(true)
    }
  })

  it('treats an empty reply as silence', () => {
    // Load-bearing: agents whose hooks report a finished turn with no assistant text would
    // otherwise stall the room forever.
    expect(isGroupPassText('')).toBe(true)
    expect(isGroupPassText(null)).toBe(true)
  })

  it('does not swallow a real reply that mentions passing', () => {
    expect(isGroupPassText('I will pass this to Ops')).toBe(false)
  })
})

describe('parseGroupChatMentions', () => {
  it('resolves handles, names, and titles', () => {
    expect(parseGroupChatMentions('@radar take it', roster).mentioned).toEqual(new Set(['b1']))
    expect(parseGroupChatMentions('ping @scribe please', roster).mentioned).toEqual(new Set(['b2']))
    // Title's first word is an address too.
    expect(parseGroupChatMentions('@build ?', roster).mentioned).toEqual(new Set(['b2']))
  })

  it('matches mentions anywhere, not only at the start', () => {
    // Unlike the 1:1 composer, where a mid-sentence @name is prose for the current bot.
    const parsed = parseGroupChatMentions('after review @ops should deploy', roster)
    expect(parsed.mentioned).toEqual(new Set(['b3']))
  })

  it('flags @everyone and @all without resolving them to a bot', () => {
    expect(parseGroupChatMentions('@everyone hi', roster).everyone).toBe(true)
    expect(parseGroupChatMentions('@all hi', roster).everyone).toBe(true)
    expect(parseGroupChatMentions('@all hi', roster).mentioned.size).toBe(0)
  })

  it('routes @user to the human rather than a member', () => {
    const parsed = parseGroupChatMentions('@user which one?', roster)
    expect(parsed.needsUser).toBe(true)
    expect(parsed.mentioned.size).toBe(0)
  })

  it('ignores handles that match nobody', () => {
    expect(parseGroupChatMentions('mail a@b and @nobody', roster).mentioned.size).toBe(0)
  })
})

describe('resolveGroupResponders', () => {
  it('answers with everyone when nobody was addressed', () => {
    const log = [entry({ kind: 'user' }, 'what do you think?')]
    expect(resolveGroupResponders(log, roster)).toEqual(roster)
  })

  it('narrows to the addressed members', () => {
    const log = [entry({ kind: 'user' }, 'ship it @ops')]
    expect(resolveGroupResponders(log, roster)).toEqual([ops])
  })

  it('lets a member pull a teammate into the next round', () => {
    const log = [
      entry({ kind: 'user' }, 'ship it @ops'),
      entry({ kind: 'member', botId: 'b3', name: 'Ops' }, 'need a review from @radar')
    ]
    expect(
      resolveGroupResponders(log, roster)
        .map((b) => b.id)
        .sort()
    ).toEqual(['b1', 'b3'])
  })

  it('scans only since the last user entry', () => {
    const log = [
      entry({ kind: 'user' }, 'first @ops'),
      entry({ kind: 'member', botId: 'b3', name: 'Ops' }, 'done'),
      entry({ kind: 'user' }, 'and now?')
    ]
    // The stale @ops from the previous exchange must not keep narrowing the room.
    expect(resolveGroupResponders(log, roster)).toEqual(roster)
  })

  it('expands back to everyone on @everyone even with other mentions present', () => {
    const log = [entry({ kind: 'user' }, '@radar and actually @everyone')]
    expect(resolveGroupResponders(log, roster)).toEqual(roster)
  })
})

describe('rotateGroupSpeakers', () => {
  it('gives each round a different leader', () => {
    expect(rotateGroupSpeakers(roster, 0).map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
    expect(rotateGroupSpeakers(roster, 1).map((b) => b.id)).toEqual(['b2', 'b3', 'b1'])
    expect(rotateGroupSpeakers(roster, 2).map((b) => b.id)).toEqual(['b3', 'b1', 'b2'])
  })

  it('is a no-op below two members', () => {
    expect(rotateGroupSpeakers([radar], 5)).toEqual([radar])
  })
})

describe('selectTurnDelta', () => {
  it('returns only unseen entries of the driven thread', () => {
    const log = [
      entry({ kind: 'user' }, 'a', 't1'),
      entry({ kind: 'user' }, 'b', 't2'),
      entry({ kind: 'user' }, 'c', 't1')
    ]
    expect(selectTurnDelta(log, 1, 't1').map((e) => e.text)).toEqual(['c'])
  })
})
