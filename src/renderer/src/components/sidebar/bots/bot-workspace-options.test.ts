import { describe, expect, it } from 'vitest'
import type { FolderWorkspace } from '../../../../../shared/folder-workspace-types'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { buildBotWorkspaceOptions, findBotWorkspaceOption } from './bot-workspace-options'

const repo = { id: 'r1', path: '/r1', displayName: 'Repo One', badgeColor: '#000', addedAt: 0 }
const worktree = { id: 'r1::/wt', repoId: 'r1', displayName: 'feature-x' } as Worktree
const folder = { id: 'f1', name: 'Notes', folderPath: '/home/me/notes' } as FolderWorkspace

describe('buildBotWorkspaceOptions', () => {
  it('lists worktrees under their repo and carries the project id', () => {
    const options = buildBotWorkspaceOptions({
      repos: [repo as Repo],
      worktreesByRepo: { r1: [worktree] },
      folderWorkspaces: []
    })
    expect(options).toEqual([
      {
        value: 'worktree:r1::/wt',
        label: 'feature-x',
        groupLabel: 'Repo One',
        projectId: 'r1',
        supportsRoutines: true
      }
    ])
  })

  // Listed, not hidden: a user must be able to see their workspace and be told why the
  // routine list stays empty, rather than wondering where it went.
  it('lists folder workspaces but marks them unable to run routines', () => {
    const options = buildBotWorkspaceOptions({
      repos: [],
      worktreesByRepo: {},
      folderWorkspaces: [folder]
    })
    expect(options).toEqual([
      {
        value: 'folder:f1',
        label: 'Notes',
        groupLabel: '/home/me/notes',
        projectId: null,
        supportsRoutines: false
      }
    ])
  })

  it('tolerates a repo with no worktrees loaded yet', () => {
    expect(
      buildBotWorkspaceOptions({ repos: [repo as Repo], worktreesByRepo: {}, folderWorkspaces: [] })
    ).toEqual([])
  })
})

describe('findBotWorkspaceOption', () => {
  it('resolves a stored key, and returns null for null or a stale key', () => {
    const options = buildBotWorkspaceOptions({
      repos: [repo as Repo],
      worktreesByRepo: { r1: [worktree] },
      folderWorkspaces: []
    })
    expect(findBotWorkspaceOption(options, 'worktree:r1::/wt')?.label).toBe('feature-x')
    expect(findBotWorkspaceOption(options, null)).toBeNull()
    expect(findBotWorkspaceOption(options, 'worktree:r1::/deleted')).toBeNull()
  })
})
