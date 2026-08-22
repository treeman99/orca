import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../shared/repo-types'
import type { Bot } from '../../../../../shared/bot-types'
import { buildBotRosterGroups, getProjectTeammates } from './bot-roster-groups'

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

const repo = (id: string, displayName: string): Repo =>
  ({ id, path: `/${id}`, displayName, badgeColor: '#000', addedAt: 0 }) as Repo

describe('buildBotRosterGroups', () => {
  it('groups by project and labels each with the repo name', () => {
    const groups = buildBotRosterGroups({
      bots: [
        makeBot({ id: 'a', name: 'A', projectId: 'r2', workspaceKey: 'worktree:r2::/wt' }),
        makeBot({ id: 'b', name: 'B' }),
        makeBot({ id: 'c', name: 'C' })
      ],
      repos: [repo('r1', 'Orca'), repo('r2', 'Alpha')],
      unassignedLabel: '미지정'
    })
    expect(groups.map((group) => [group.label, group.bots.map((bot) => bot.id)])).toEqual([
      ['Alpha', ['a']],
      ['Orca', ['b', 'c']]
    ])
  })

  // Hiding the bot would make it unreachable; its id is more use than nothing.
  it('keeps a bot whose project the catalog no longer knows, labelled by id', () => {
    const groups = buildBotRosterGroups({
      bots: [makeBot({ projectId: 'gone', workspaceKey: 'worktree:gone::/wt' })],
      repos: [],
      unassignedLabel: '미지정'
    })
    expect(groups).toEqual([
      { projectId: 'gone', label: 'gone', bots: [expect.objectContaining({ id: 'bot1' })] }
    ])
  })

  // Unbound bots are unfinished setup, not a peer of the working groups.
  it('puts unassigned bots last under their own label', () => {
    const groups = buildBotRosterGroups({
      bots: [makeBot({ id: 'u', projectId: null, workspaceKey: null }), makeBot({ id: 'bound' })],
      repos: [repo('r1', 'Orca')],
      unassignedLabel: '미지정'
    })
    expect(groups.map((group) => group.label)).toEqual(['Orca', '미지정'])
    expect(groups[1].projectId).toBeNull()
  })

  it('returns nothing for an empty roster', () => {
    expect(buildBotRosterGroups({ bots: [], repos: [], unassignedLabel: 'x' })).toEqual([])
  })
})

describe('getProjectTeammates', () => {
  const self = makeBot({ id: 'self' })
  const sameProject = makeBot({ id: 'mate', name: 'Mate' })
  const otherProject = makeBot({ id: 'other', projectId: 'r2', workspaceKey: 'worktree:r2::/wt' })
  const unbound = makeBot({ id: 'unbound', projectId: 'r1', workspaceKey: null })

  it('takes same-project bots only, never the bot itself', () => {
    expect(
      getProjectTeammates(self, [self, sameProject, otherProject]).map((bot) => bot.id)
    ).toEqual(['mate'])
  })

  // Promising a teammate that can never be started is the bug that made a coordinator
  // conclude it had nobody to delegate to.
  it('excludes a teammate with no workspace, which could not be started', () => {
    expect(getProjectTeammates(self, [self, unbound])).toEqual([])
  })

  it('returns nothing for a bot with no project of its own', () => {
    const orphan = makeBot({ id: 'orphan', projectId: null, workspaceKey: null })
    expect(getProjectTeammates(orphan, [orphan, sameProject])).toEqual([])
  })
})
