import { describe, expect, it } from 'vitest'
import {
  buildVscodeScmParentRepository,
  buildVscodeScmSubmoduleRepositories,
  collectDirtySubmodulePaths,
  selectDetectedSubmodulePaths,
  VSCODE_SCM_PARENT_REPOSITORY_ID,
  type VscodeScmSubmoduleStatusState
} from './vscode-scm-repository'
import { isUninitializedSubmoduleError } from './vscode-scm-submodule-availability'
import { canDiscardStatusEntry } from '../source-control/listing/entry-actions'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

function entry(partial: Partial<GitStatusEntry> & Pick<GitStatusEntry, 'path'>): GitStatusEntry {
  return { status: 'modified', area: 'unstaged', ...partial }
}

const DIRTY = { commitChanged: true, trackedChanges: true, untrackedChanges: false }

describe('selectDetectedSubmodulePaths', () => {
  const summary = (
    path: string,
    initialized = true
  ): { name: string; path: string; initialized: boolean } => ({
    name: path,
    path,
    initialized
  })

  it('sections every initialized submodule, clean or dirty, sorted', () => {
    expect(selectDetectedSubmodulePaths([summary('vendor/b'), summary('vendor/a')])).toEqual([
      'vendor/a',
      'vendor/b'
    ])
  })

  it('drops an uninitialized submodule instead of opening a failing section', () => {
    expect(selectDetectedSubmodulePaths([summary('vendor/a', false)])).toEqual([])
  })

  // `.gitmodules` is repo-controlled, and these paths become a write's working directory.
  it('refuses a path with a traversal or empty segment', () => {
    expect(
      selectDetectedSubmodulePaths([
        summary('../escape'),
        summary('vendor/../../etc'),
        summary('vendor//sub'),
        summary('./here')
      ])
    ).toEqual([])
  })
})

describe('collectDirtySubmodulePaths', () => {
  it('collects each gitlink row once, sorted, ignoring ordinary files', () => {
    expect(
      collectDirtySubmodulePaths([
        entry({ path: 'src/app.ts' }),
        entry({ path: 'vendor/b', submodule: DIRTY }),
        entry({ path: 'vendor/a', submodule: DIRTY }),
        // The same submodule can carry both a staged and an unstaged gitlink row.
        entry({ path: 'vendor/a', area: 'staged', submodule: DIRTY })
      ])
    ).toEqual(['vendor/a', 'vendor/b'])
  })

  it('ignores rows that live inside a submodule rather than pointing at one', () => {
    expect(
      collectDirtySubmodulePaths([
        entry({ path: 'vendor/a/nested', submodule: DIRTY, submoduleRoot: 'vendor/a' })
      ])
    ).toEqual([])
  })

  it('refuses a traversal path even though it came from the host status', () => {
    expect(collectDirtySubmodulePaths([entry({ path: '../escape', submodule: DIRTY })])).toEqual([])
  })
})

describe('buildVscodeScmParentRepository', () => {
  it('keeps the parent entries verbatim so a gitlink stays one row', () => {
    const entries = [entry({ path: 'vendor/a', submodule: DIRTY }), entry({ path: 'src/app.ts' })]
    const parent = buildVscodeScmParentRepository({
      worktreePath: '/work/orca',
      branch: 'main',
      entries,
      upstreamStatus: null,
      conflictOperation: null,
      truncated: false
    })
    expect(parent.id).toBe(VSCODE_SCM_PARENT_REPOSITORY_ID)
    expect(parent.name).toBe('orca')
    expect(parent.entries).toBe(entries)
    expect(parent.branch).toEqual({ name: 'main', detached: false, differsFromParent: false })
  })
})

describe('buildVscodeScmSubmoduleRepositories', () => {
  const loaded = (
    overrides: Partial<Extract<VscodeScmSubmoduleStatusState, { status: 'loaded' }>> = {}
  ): VscodeScmSubmoduleStatusState => ({
    status: 'loaded',
    entries: [entry({ path: 'lib/index.ts' })],
    branch: 'refs/heads/release',
    ...overrides
  })

  it('exposes the submodule rows unchanged, relative to the submodule root', () => {
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: { 'vendor/a': loaded() },
      parentBranch: 'main'
    })
    expect(repository.submodulePath).toBe('vendor/a')
    expect(repository.name).toBe('a')
    expect(repository.entries.map((row) => row.path)).toEqual(['lib/index.ts'])
    // The rows belong to this repository now, so nothing marks them read-only.
    expect(repository.entries.every((row) => row.submoduleRoot === undefined)).toBe(true)
  })

  it('marks a submodule branch that differs from the parent', () => {
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: { 'vendor/a': loaded() },
      parentBranch: 'main'
    })
    expect(repository.branch).toEqual({
      name: 'release',
      detached: false,
      differsFromParent: true
    })
  })

  it('falls back to an abbreviated OID for a detached submodule', () => {
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: {
        'vendor/a': loaded({ branch: undefined, head: '0123456789abcdef' })
      },
      parentBranch: 'main'
    })
    expect(repository.branch).toEqual({ name: '0123456', detached: true, differsFromParent: true })
  })

  it('reports a still-unfetched submodule as loading rather than empty', () => {
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: {},
      parentBranch: 'main'
    })
    expect(repository.status).toEqual({ kind: 'loading' })
    expect(repository.branch).toBeNull()
  })

  it('treats a deinitialized submodule as a quiet state, not an error', () => {
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: {
        'vendor/a': {
          status: 'error',
          error: 'fatal: not a git repository',
          uninitialized: true
        }
      },
      parentBranch: 'main'
    })
    expect(repository.status).toEqual({ kind: 'uninitialized' })
  })

  it('surfaces a genuine failure with its message', () => {
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: {
        'vendor/a': { status: 'error', error: 'fatal: index.lock exists', uninitialized: false }
      },
      parentBranch: 'main'
    })
    expect(repository.status).toEqual({ kind: 'failed', message: 'fatal: index.lock exists' })
  })

  it('carries the submodule ahead/behind and truncation through', () => {
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: {
        'vendor/a': loaded({
          upstreamStatus: { hasUpstream: true, ahead: 2, behind: 1 },
          didHitLimit: true
        })
      },
      parentBranch: 'main'
    })
    expect(repository.upstreamStatus).toEqual({ hasUpstream: true, ahead: 2, behind: 1 })
    expect(repository.truncated).toBe(true)
  })

  it('keeps a gitlink nested inside a submodule undiscardable', () => {
    const nested = entry({ path: 'inner', submodule: DIRTY })
    const [repository] = buildVscodeScmSubmoduleRepositories({
      submodulePaths: ['vendor/a'],
      statusByPath: { 'vendor/a': loaded({ entries: [nested] }) },
      parentBranch: 'main'
    })
    expect(canDiscardStatusEntry(repository.entries[0])).toBe(false)
  })
})

describe('isUninitializedSubmoduleError', () => {
  it('recognizes the shapes a missing checkout produces', () => {
    expect(isUninitializedSubmoduleError('fatal: not a git repository')).toBe(true)
    expect(
      isUninitializedSubmoduleError('Access denied: submodule path is not a git repository root')
    ).toBe(true)
    expect(isUninitializedSubmoduleError('ENOENT: no such file or directory')).toBe(true)
  })

  it('leaves a real git failure alone', () => {
    expect(isUninitializedSubmoduleError('fatal: index.lock exists')).toBe(false)
  })
})
