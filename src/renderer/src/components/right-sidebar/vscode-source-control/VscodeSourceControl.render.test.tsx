// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import VscodeSourceControl from './VscodeSourceControl'
import type { VscodeScmContext } from './use-vscode-scm-context'
import type { GitStatusEntry, GitStatusResult } from '../../../../../shared/git-status-types'

const scmMock = vi.hoisted(() => ({ current: null as VscodeScmContext | null }))
const submoduleStatusMock = vi.hoisted(() => ({
  byPath: {} as Record<string, GitStatusResult | Error>
}))
const submoduleListMock = vi.hoisted(() => ({
  current: { submodules: [], didHitLimit: false } as {
    submodules: { name: string; path: string; initialized: boolean }[]
    didHitLimit: boolean
    unsupported?: boolean
  }
}))
const gitCallsMock = vi.hoisted(() => ({
  stage: [] as { submodulePath: string; filePaths: string[] }[],
  unstage: [] as { submodulePath: string; filePaths: string[] }[],
  discard: [] as { submodulePath: string; filePath: string }[],
  commit: [] as { submodulePath: string; message: string }[],
  push: [] as { submodulePath: string; publish: boolean }[],
  restorePointer: [] as string[]
}))

vi.mock('./use-vscode-scm-context', () => ({
  useVscodeScmContext: (): VscodeScmContext => {
    if (!scmMock.current) {
      throw new Error('scm context not seeded')
    }
    return scmMock.current
  }
}))

// Why mocked rather than stubbed at the hook: this keeps the real repository
// assembly (dirty-submodule discovery, branch labels, per-section rows) under test.
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => null }))
vi.mock('@/runtime/runtime-git-client', () => ({
  getRuntimeGitSubmoduleStatus: async (
    _context: unknown,
    submodulePath: string
  ): Promise<GitStatusResult> => {
    const seeded = submoduleStatusMock.byPath[submodulePath]
    if (!seeded) {
      throw new Error('fatal: not a git repository')
    }
    if (seeded instanceof Error) {
      throw seeded
    }
    return seeded
  },
  listRuntimeGitSubmodules: async () => submoduleListMock.current,
  stageRuntimeGitSubmodulePaths: async (
    _context: unknown,
    submodulePath: string,
    filePaths: string[]
  ) => {
    gitCallsMock.stage.push({ submodulePath, filePaths })
  },
  unstageRuntimeGitSubmodulePaths: async (
    _context: unknown,
    submodulePath: string,
    filePaths: string[]
  ) => {
    gitCallsMock.unstage.push({ submodulePath, filePaths })
  },
  discardRuntimeGitSubmodulePath: async (
    _context: unknown,
    submodulePath: string,
    filePath: string
  ) => {
    gitCallsMock.discard.push({ submodulePath, filePath })
  },
  commitRuntimeGitSubmodule: async (_context: unknown, submodulePath: string, message: string) => {
    gitCallsMock.commit.push({ submodulePath, message })
    return { success: true }
  },
  pushRuntimeGitSubmodule: async (_context: unknown, submodulePath: string, publish: boolean) => {
    gitCallsMock.push.push({ submodulePath, publish })
  },
  restoreRuntimeGitSubmodulePointer: async (_context: unknown, submodulePath: string) => {
    gitCallsMock.restorePointer.push(submodulePath)
  }
}))

function entry(partial: Partial<GitStatusEntry> & Pick<GitStatusEntry, 'path'>): GitStatusEntry {
  return { status: 'modified', area: 'unstaged', ...partial }
}

function seedContext(overrides: Partial<VscodeScmContext> = {}): VscodeScmContext {
  const context: VscodeScmContext = {
    ready: true,
    worktreeId: 'worktree-1',
    worktreePath: '/work/orca',
    repoSettings: null,
    entries: [],
    branch: 'feature/x',
    upstreamStatus: { hasUpstream: true, ahead: 0, behind: 0 },
    conflictOperation: null,
    repositoryHuge: false,
    busy: false,
    lastError: null,
    clearError: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    stage: vi.fn().mockResolvedValue(undefined),
    unstage: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(true),
    publish: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue(undefined),
    openEntryDiff: vi.fn(),
    openSubmoduleEntryDiff: vi.fn(),
    ...overrides
  }
  scmMock.current = context
  return context
}

let container: HTMLDivElement
let root: Root

function render(): void {
  act(() => {
    root.render(
      <TooltipProvider>
        <VscodeSourceControl />
      </TooltipProvider>
    )
  })
}

async function renderAsync(): Promise<void> {
  // Why async: submodule sections only appear once their own `git status` resolves.
  await act(async () => {
    root.render(
      <TooltipProvider>
        <VscodeSourceControl />
      </TooltipProvider>
    )
  })
}

function sectionTextFor(repositoryId: string): string {
  const section = container.querySelector(`[data-repository="${repositoryId}"]`)
  if (!section) {
    throw new Error(`no repository section for "${repositoryId}"`)
  }
  return section.textContent ?? ''
}

function clickByLabel(label: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === label
  )
  if (!button) {
    throw new Error(`no button labelled "${label}"`)
  }
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  scmMock.current = null
  submoduleStatusMock.byPath = {}
  submoduleListMock.current = { submodules: [], didHitLimit: false }
  for (const calls of Object.values(gitCallsMock)) {
    calls.length = 0
  }
  vi.clearAllMocks()
})

describe('VscodeSourceControl', () => {
  it('tells the user to open a Git worktree when there is none', () => {
    seedContext({ ready: false })
    render()
    expect(container.textContent).toContain('Open a Git worktree')
  })

  it('renders the branch and an empty state for a clean worktree', () => {
    seedContext()
    render()
    expect(container.textContent).toContain('feature/x')
    expect(container.textContent).toContain('No changes detected.')
  })

  it('renders VS Code’s groups for a mixed working tree', () => {
    seedContext({
      entries: [
        entry({ path: 'staged.ts', area: 'staged', status: 'added' }),
        entry({ path: 'changed.ts' }),
        entry({ path: 'new.ts', area: 'untracked', status: 'untracked' }),
        entry({ path: 'conflict.ts', conflictKind: 'both_modified', conflictStatus: 'unresolved' })
      ]
    })
    render()
    const text = container.textContent ?? ''
    expect(text).toContain('Merge Changes')
    expect(text).toContain('Staged Changes')
    expect(text).toContain('Changes')
    // `mixed` is VS Code's default, so untracked folds into Changes rather than its own group.
    expect(text).not.toContain('Untracked Changes')
    expect(text).toContain('new.ts')
  })

  it('stages a single row through the hover action', () => {
    const context = seedContext({ entries: [entry({ path: 'changed.ts' })] })
    render()
    clickByLabel('Stage Changes')
    expect(context.stage).toHaveBeenCalledWith(['changed.ts'])
  })

  it('routes a discard through the confirmation dialog instead of running it immediately', () => {
    const context = seedContext({ entries: [entry({ path: 'changed.ts' })] })
    render()
    clickByLabel('Discard Changes')
    expect(context.discard).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('changed.ts')
  })

  it('keeps the primary button on Commit and disabled until a message is typed', () => {
    seedContext({ entries: [entry({ path: 'staged.ts', area: 'staged' })] })
    render()
    const commit = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Commit')
    )
    expect(commit?.disabled).toBe(true)
    expect(container.textContent).toContain('Enter a commit message.')
  })

  it('rotates the primary button to Publish Branch with no upstream', () => {
    seedContext({ upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 } })
    render()
    expect(container.textContent).toContain('Publish Branch')
  })

  it('rotates the primary button to Sync Changes when ahead of upstream', () => {
    const context = seedContext({ upstreamStatus: { hasUpstream: true, ahead: 2, behind: 1 } })
    render()
    expect(container.textContent).toContain('Sync Changes')
    const sync = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Sync Changes')
    )
    act(() => {
      sync?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(context.sync).toHaveBeenCalled()
  })

  it('blocks committing while a conflict is unresolved', () => {
    seedContext({
      entries: [
        entry({ path: 'conflict.ts', conflictKind: 'both_modified', conflictStatus: 'unresolved' })
      ],
      conflictOperation: 'merge'
    })
    render()
    expect(container.textContent).toContain('Resolve Conflicts')
    expect(container.textContent).toContain('Resolve every conflict before committing.')
  })

  it('surfaces a failed Git operation and lets the user dismiss it', () => {
    const context = seedContext({ lastError: 'fatal: nothing to commit' })
    render()
    expect(container.textContent).toContain('fatal: nothing to commit')
    clickByLabel('Dismiss')
    expect(context.clearError).toHaveBeenCalled()
  })
})

const DIRTY_SUBMODULE = { commitChanged: true, trackedChanges: true, untrackedChanges: false }

function submoduleStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return { entries: [], conflictOperation: 'unknown', ...overrides }
}

function seedSubmoduleList(
  paths: string[],
  options: { didHitLimit?: boolean; unsupported?: boolean; initialized?: boolean } = {}
): void {
  submoduleListMock.current = {
    submodules: paths.map((path) => ({
      name: path,
      path,
      initialized: options.initialized !== false
    })),
    didHitLimit: options.didHitLimit === true,
    ...(options.unsupported === true ? { unsupported: true } : {})
  }
}

function buttonsInSection(repositoryId: string, label: string): HTMLButtonElement[] {
  const section = container.querySelector(`[data-repository="${repositoryId}"]`)
  if (!section) {
    throw new Error(`no repository section for "${repositoryId}"`)
  }
  return [...section.querySelectorAll('button')].filter(
    (button) => button.getAttribute('aria-label') === label
  )
}

describe('VscodeSourceControl submodule repositories', () => {
  it('renders no repository section header when the worktree has no submodules', async () => {
    seedContext({ entries: [entry({ path: 'changed.ts' })] })
    await renderAsync()
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'orca' && button.getAttribute('aria-expanded') !== null
      )
    ).toBe(false)
  })

  // The behaviour that separates `git.detectSubmodules` from "show what is dirty": a clean
  // submodule is still its own repository, and its branch is only ever visible here.
  it('sections a CLEAN submodule and shows its branch', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({ branch: 'refs/heads/release' })
    seedSubmoduleList(['vendor/sdk'])
    seedContext({ entries: [] })
    await renderAsync()
    const section = sectionTextFor('vendor/sdk')
    expect(section).toContain('sdk')
    expect(section).toContain('release')
    expect(section).toContain('No changes detected')
  })

  it('leaves an uninitialized submodule out of the panel entirely', async () => {
    seedSubmoduleList(['vendor/sdk'], { initialized: false })
    seedContext({ entries: [] })
    await renderAsync()
    expect(container.querySelector('[data-repository="vendor/sdk"]')).toBeNull()
  })

  it('says so rather than truncating silently when the detection cap is hit', async () => {
    seedSubmoduleList(['vendor/sdk'], { didHitLimit: true })
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus()
    seedContext({ entries: [] })
    await renderAsync()
    expect(sectionTextFor('<parent>')).toContain('Only the first 10 submodules')
  })

  it('gives a dirty submodule its own section with its name, branch and rows', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({
      branch: 'refs/heads/release',
      entries: [entry({ path: 'src/client.ts' })]
    })
    seedSubmoduleList(['vendor/sdk'])
    seedContext({ entries: [entry({ path: 'vendor/sdk', submodule: DIRTY_SUBMODULE })] })
    await renderAsync()
    const text = container.textContent ?? ''
    expect(text).toContain('sdk')
    expect(text).toContain('release')
    expect(text).toContain('(differs from root)')
    expect(sectionTextFor('vendor/sdk')).toContain('client.ts')
  })

  it('keeps the parent section on the gitlink row and never expands submodule file paths', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({
      branch: 'refs/heads/feature/x',
      entries: [entry({ path: 'src/client.ts' })]
    })
    seedSubmoduleList(['vendor/sdk'])
    seedContext({ entries: [entry({ path: 'vendor/sdk', submodule: DIRTY_SUBMODULE })] })
    await renderAsync()
    const parentText = sectionTextFor('<parent>')
    expect(parentText).toContain('sdk')
    expect(parentText).toContain('new commits, modified content')
    expect(parentText).not.toContain('client.ts')
  })

  it('stages a submodule row against that submodule, with a submodule-relative path', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({
      branch: 'refs/heads/main',
      entries: [entry({ path: 'src/client.ts' })]
    })
    seedSubmoduleList(['vendor/sdk'])
    const context = seedContext({ entries: [] })
    await renderAsync()

    const [stageButton] = buttonsInSection('vendor/sdk', 'Stage Changes')
    await act(async () => {
      stageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(gitCallsMock.stage).toEqual([
      { submodulePath: 'vendor/sdk', filePaths: ['src/client.ts'] }
    ])
    // The parent's own staging API must not be the one that ran.
    expect(context.stage).not.toHaveBeenCalled()
  })

  it('routes a submodule discard through the confirmation dialog', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({
      branch: 'refs/heads/main',
      entries: [entry({ path: 'src/client.ts' })]
    })
    seedSubmoduleList(['vendor/sdk'])
    seedContext({ entries: [] })
    await renderAsync()

    const [discardButton] = buttonsInSection('vendor/sdk', 'Discard Changes')
    await act(async () => {
      discardButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // Nothing may run before the user confirms.
    expect(gitCallsMock.discard).toEqual([])
    expect(document.body.textContent).toContain('Discard changes to')

    const confirm = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Discard'
    )
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(gitCallsMock.discard).toEqual([
      { submodulePath: 'vendor/sdk', filePath: 'src/client.ts' }
    ])
  })

  it('discards a parent gitlink row by restoring the pointer, not by restoring a file', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({ branch: 'refs/heads/main' })
    seedSubmoduleList(['vendor/sdk'])
    const context = seedContext({
      entries: [entry({ path: 'vendor/sdk', submodule: DIRTY_SUBMODULE })]
    })
    await renderAsync()

    const [discardButton] = buttonsInSection('<parent>', 'Discard Changes')
    await act(async () => {
      discardButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // The dialog must state the side effect before the user can accept it.
    expect(document.body.textContent).toContain('detached HEAD')

    const confirm = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Discard'
    )
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(gitCallsMock.restorePointer).toEqual(['vendor/sdk'])
    expect(context.discard).not.toHaveBeenCalled()
  })

  it('never offers discard on a gitlink nested inside a submodule', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({
      branch: 'refs/heads/main',
      entries: [entry({ path: 'inner', submodule: DIRTY_SUBMODULE }), entry({ path: 'a.ts' })]
    })
    seedSubmoduleList(['vendor/sdk'])
    seedContext({ entries: [] })
    await renderAsync()
    // `a.ts` gets one; the nested gitlink must not add a second.
    expect(buttonsInSection('vendor/sdk', 'Discard Changes')).toHaveLength(1)
  })

  // An old host answers git.submoduleList with method-not-found, so the list arrives EMPTY
  // and unsupported. The panel must still show the dirty submodules the parent's own status
  // names — dropping them would read as "no submodules" rather than "this host is behind".
  it('falls back to the parent-flagged submodules when the host has no submodule list', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({
      branch: 'refs/heads/main',
      entries: [entry({ path: 'src/client.ts' })]
    })
    submoduleListMock.current = { submodules: [], didHitLimit: false, unsupported: true }
    seedContext({ entries: [entry({ path: 'vendor/sdk', submodule: DIRTY_SUBMODULE })] })
    await renderAsync()

    expect(sectionTextFor('vendor/sdk')).toContain('client.ts')
  })

  it('disables submodule writes with a reason when the host cannot do them', async () => {
    submoduleStatusMock.byPath['vendor/sdk'] = submoduleStatus({
      branch: 'refs/heads/main',
      entries: [entry({ path: 'src/client.ts' })]
    })
    submoduleListMock.current = { submodules: [], didHitLimit: false, unsupported: true }
    seedContext({ entries: [entry({ path: 'vendor/sdk', submodule: DIRTY_SUBMODULE })] })
    await renderAsync()

    const [stageButton] = buttonsInSection('vendor/sdk', 'Stage Changes')
    // Visible but inert: a missing button reads as a panel bug, not a host limitation.
    expect(stageButton.disabled).toBe(true)
    expect(sectionTextFor('vendor/sdk')).toContain('does not support submodule write operations')

    await act(async () => {
      stageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(gitCallsMock.stage).toEqual([])

    // The parent still writes through the always-present RPCs.
    const [parentStage] = buttonsInSection('<parent>', 'Stage Changes')
    expect(parentStage.disabled).toBe(false)
  })

  it('explains a submodule whose checkout vanished quietly instead of raising an error', async () => {
    seedSubmoduleList(['vendor/sdk'])
    seedContext({ entries: [] })
    await renderAsync()
    expect(container.textContent).toContain('not checked out yet')
  })
})
