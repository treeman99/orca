// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import VscodeSourceControl from './VscodeSourceControl'
import type { VscodeScmContext } from './use-vscode-scm-context'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

const scmMock = vi.hoisted(() => ({ current: null as VscodeScmContext | null }))

vi.mock('./use-vscode-scm-context', () => ({
  useVscodeScmContext: (): VscodeScmContext => {
    if (!scmMock.current) {
      throw new Error('scm context not seeded')
    }
    return scmMock.current
  }
}))

function entry(partial: Partial<GitStatusEntry> & Pick<GitStatusEntry, 'path'>): GitStatusEntry {
  return { status: 'modified', area: 'unstaged', ...partial }
}

function seedContext(overrides: Partial<VscodeScmContext> = {}): VscodeScmContext {
  const context: VscodeScmContext = {
    ready: true,
    worktreeId: 'worktree-1',
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
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  scmMock.current = null
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
