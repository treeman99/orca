import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import {
  canDiscardStatusEntry,
  canStageStatusEntry,
  canUnstageStatusEntry
} from './source-control-entry-actions'

function entry(overrides: Partial<GitStatusEntry>): GitStatusEntry {
  return {
    path: 'file.ts',
    status: 'modified',
    area: 'unstaged',
    ...overrides
  } as GitStatusEntry
}

describe('source control entry actions', () => {
  it('hides Unstage for submodule-internal staged rows but keeps it for normal staged rows', () => {
    expect(canUnstageStatusEntry(entry({ area: 'staged' }))).toBe(true)
    expect(canUnstageStatusEntry(entry({ area: 'staged', submoduleRoot: 'vendor/lib' }))).toBe(
      false
    )
    expect(canUnstageStatusEntry(entry({ area: 'unstaged' }))).toBe(false)
  })

  it('offers Discard for a file inside a submodule, routed to that repository', () => {
    // Why this opened up: the discard now runs in the submodule's own repository, so an inner
    // file is restorable there even though the parent can neither stage nor unstage it.
    expect(canDiscardStatusEntry(entry({ area: 'unstaged', submoduleRoot: 'vendor/lib' }))).toBe(
      true
    )
    expect(
      canDiscardStatusEntry(
        entry({ area: 'untracked', status: 'untracked', submoduleRoot: 'vendor/lib' })
      )
    ).toBe(true)
  })

  it('hides Discard for gitlink rows at any depth, and for conflict and staged rows', () => {
    expect(canDiscardStatusEntry(entry({ area: 'unstaged' }))).toBe(true)
    expect(canDiscardStatusEntry(entry({ area: 'untracked', status: 'untracked' }))).toBe(true)
    // The gitlink row is a recorded pointer, not a file; `git restore` cannot move it.
    expect(
      canDiscardStatusEntry(
        entry({
          area: 'unstaged',
          submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
        })
      )
    ).toBe(false)
    // Nested gitlink: `submoduleRoot` is set too, which is how it used to slip through.
    expect(
      canDiscardStatusEntry(
        entry({
          area: 'unstaged',
          submoduleRoot: 'vendor/lib',
          submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
        })
      )
    ).toBe(false)
    // An older relay can still send these; the files are already committed inside the submodule.
    expect(
      canDiscardStatusEntry(
        entry({ area: 'unstaged', submoduleRoot: 'vendor/lib', submoduleCommitRange: true })
      )
    ).toBe(false)
    expect(canDiscardStatusEntry(entry({ area: 'staged' }))).toBe(false)
    expect(canDiscardStatusEntry(entry({ area: 'unstaged', conflictStatus: 'unresolved' }))).toBe(
      false
    )
    expect(
      canDiscardStatusEntry(entry({ area: 'unstaged', conflictStatus: 'resolved_locally' }))
    ).toBe(false)
  })

  it('hides Stage for submodule-internal rows', () => {
    expect(canStageStatusEntry(entry({ area: 'unstaged' }))).toBe(true)
    expect(canStageStatusEntry(entry({ area: 'unstaged', submoduleRoot: 'vendor/lib' }))).toBe(
      false
    )
  })
})
