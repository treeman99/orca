import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import {
  buildBotProjectOptions,
  findBotProjectOption,
  resolveProjectWorktree
} from './bot-project-options'

const repo = (id: string, displayName: string): Repo =>
  ({ id, path: `/${id}`, displayName, badgeColor: '#000', addedAt: 0 }) as Repo

const worktree = (id: string, isMain = false): Worktree =>
  ({ id, repoId: 'r1', displayName: id, isMainWorktree: isMain }) as Worktree

describe('resolveProjectWorktree', () => {
  // A feature worktree can disappear when its branch is merged, stranding every bot bound
  // to it; the main worktree is the one that exists for every project.
  it('prefers the main worktree over whatever is first', () => {
    expect(resolveProjectWorktree([worktree('feature'), worktree('main', true)])?.id).toBe('main')
  })

  it('falls back to the first worktree when none is marked main', () => {
    expect(resolveProjectWorktree([worktree('a'), worktree('b')])?.id).toBe('a')
  })

  it('returns null for a project with no checkout', () => {
    expect(resolveProjectWorktree([])).toBeNull()
  })
})

describe('buildBotProjectOptions', () => {
  it('offers one option per project and resolves the checkout behind it', () => {
    expect(
      buildBotProjectOptions({
        repos: [repo('r1', 'Orca')],
        worktreesByRepo: { r1: [worktree('feature'), worktree('r1::/main', true)] }
      })
    ).toEqual([
      {
        projectId: 'r1',
        label: 'Orca',
        worktreeId: 'r1::/main',
        workspaceKey: 'worktree:r1::/main'
      }
    ])
  })

  // Savable, but the bot cannot chat or run routines until the project has a checkout — the
  // editor says so rather than hiding the project.
  it('keeps a project with no checkout, with a null workspace key', () => {
    expect(buildBotProjectOptions({ repos: [repo('r2', 'Empty')], worktreesByRepo: {} })).toEqual([
      { projectId: 'r2', label: 'Empty', worktreeId: null, workspaceKey: null }
    ])
  })
})

describe('findBotProjectOption', () => {
  const options = buildBotProjectOptions({
    repos: [repo('r1', 'Orca')],
    worktreesByRepo: { r1: [worktree('r1::/main', true)] }
  })

  it('resolves a stored project, and returns null for none or a stale one', () => {
    expect(findBotProjectOption(options, 'r1')?.label).toBe('Orca')
    expect(findBotProjectOption(options, null)).toBeNull()
    expect(findBotProjectOption(options, 'removed')).toBeNull()
  })
})
