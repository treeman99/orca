import { describe, expect, it } from 'vitest'
import type { Bot } from '../../../../../shared/bot-types'
import {
  botSessionTitle,
  buildBotSessionPreamble,
  formatBotToBotMessage,
  parseBotMention
} from './bot-message-routing'
import {
  quoteStartupArg,
  tokenizeStartupCommand
} from '../../../../../shared/tui-agent-startup-shell'

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
    const preamble = buildBotSessionPreamble({ self: checker, roster })
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

  // A lone bot used to get NO preamble at all, so its name, job, and description never
  // reached the agent and it behaved as a generic assistant.
  it('still identifies a lone bot, without a teammate section', () => {
    const preamble = buildBotSessionPreamble({ self: checker, roster: [checker] })
    expect(preamble).toContain('Release Checker')
    expect(preamble).toContain('@release-checker')
    expect(preamble).not.toContain('Teammates you can hand work to')
  })

  // The description is where a user writes scope — "only look in this repo", "read this
  // page first" — so it has to arrive as an instruction, not as background.
  it('delivers the description as standing instructions', () => {
    const scoped = makeBot({
      description: 'Search only https://github.example.com/team/api — never the open web.'
    })
    const preamble = buildBotSessionPreamble({ self: scoped, roster: [scoped] })
    expect(preamble).toContain('Standing instructions')
    expect(preamble).toContain('https://github.example.com/team/api')
    expect(preamble).toContain('every turn')
  })

  it('omits the standing-instructions block when there is no description', () => {
    expect(buildBotSessionPreamble({ self: checker, roster: [checker] })).not.toContain(
      'Standing instructions'
    )
  })

  // Delegation never crosses projects, and a teammate in another checkout could not be
  // started here anyway.
  it('omits a teammate from another project', () => {
    const elsewhere = makeBot({
      id: 'bot9',
      name: 'Other Project Bot',
      projectId: 'r2',
      workspaceKey: 'worktree:r2::/wt'
    })
    const preamble = buildBotSessionPreamble({ self: checker, roster: [checker, elsewhere] })
    expect(preamble).not.toContain('Other Project Bot')
    expect(preamble).not.toContain('Teammates you can hand work to')
  })
})

describe('botSessionTitle', () => {
  it('is the discovery key teammates search for', () => {
    expect(botSessionTitle(checker)).toBe('bot:release-checker')
  })
})

// The preamble is launched as ONE argv entry on Windows, where PowerShell re-parses the line.
// It carries prose — apostrophes, commas, backticks in the command examples — so a quoting hole
// surfaces as `Missing argument in parameter list` at a line number inside the prompt, which
// reads as an agent failure rather than a launch one.
describe('preamble survives the shells it is launched through', () => {
  const preamble = buildBotSessionPreamble({
    self: makeBot({ description: 'Watch the release branch and don\u2019t touch main.' }),
    roster
  })

  it.each(['powershell', 'posix', 'cmd'] as const)('round-trips through %s quoting', (shell) => {
    const tokenized = tokenizeStartupCommand(quoteStartupArg(preamble, shell), shell)
    expect(tokenized.ok && tokenized.tokens).toEqual([preamble])
  })
})
