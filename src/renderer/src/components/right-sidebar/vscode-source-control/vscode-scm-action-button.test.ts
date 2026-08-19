import { describe, expect, it } from 'vitest'
import {
  resolveVscodeScmActionButton,
  type VscodeScmActionButtonInput
} from './vscode-scm-action-button'

function input(partial: Partial<VscodeScmActionButtonInput> = {}): VscodeScmActionButtonInput {
  return {
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    unresolvedConflictCount: 0,
    commitMessage: '',
    smartCommit: false,
    hasBranch: true,
    hasUpstream: true,
    hasConfiguredPushTarget: false,
    ahead: 0,
    behind: 0,
    conflictOperation: null,
    busy: false,
    ...partial
  }
}

describe('resolveVscodeScmActionButton', () => {
  it('blocks on unresolved conflicts before anything else', () => {
    const button = resolveVscodeScmActionButton(
      input({ unresolvedConflictCount: 1, stagedCount: 3, commitMessage: 'fix', ahead: 2 })
    )
    expect(button.kind).toBe('conflicts')
    expect(button.enabled).toBe(false)
    expect(button.disabledReason).toBe('conflicts')
  })

  it('offers Commit when something is staged, gated on a non-empty message', () => {
    expect(resolveVscodeScmActionButton(input({ stagedCount: 1 }))).toMatchObject({
      kind: 'commit',
      enabled: false,
      disabledReason: 'empty-message',
      stagesAllFirst: false
    })
    expect(
      resolveVscodeScmActionButton(input({ stagedCount: 1, commitMessage: 'fix: thing' }))
    ).toMatchObject({ kind: 'commit', enabled: true, disabledReason: null })
  })

  it('treats a whitespace-only message as empty', () => {
    expect(
      resolveVscodeScmActionButton(input({ stagedCount: 1, commitMessage: '   \n  ' })).enabled
    ).toBe(false)
  })

  it('takes precedence over publish and sync while changes are staged', () => {
    const button = resolveVscodeScmActionButton(
      input({ stagedCount: 1, commitMessage: 'x', hasUpstream: false, ahead: 4 })
    )
    expect(button.kind).toBe('commit')
  })

  it('marks Smart Commit so the caller stages everything first', () => {
    const button = resolveVscodeScmActionButton(
      input({ unstagedCount: 2, commitMessage: 'x', smartCommit: true })
    )
    expect(button).toMatchObject({ kind: 'commit', enabled: true, stagesAllFirst: true })
  })

  it('leaves Commit disabled for unstaged work when Smart Commit is off', () => {
    const button = resolveVscodeScmActionButton(
      input({ unstagedCount: 2, commitMessage: 'x', smartCommit: false })
    )
    expect(button).toMatchObject({
      kind: 'commit',
      enabled: false,
      disabledReason: 'nothing-staged',
      stagesAllFirst: false
    })
  })

  it('offers Publish Branch when the branch has no upstream', () => {
    const button = resolveVscodeScmActionButton(input({ hasUpstream: false }))
    expect(button).toMatchObject({ kind: 'publish', enabled: true })
  })

  it('does not offer Publish when a configured push target already exists', () => {
    const button = resolveVscodeScmActionButton(
      input({ hasUpstream: false, hasConfiguredPushTarget: true, ahead: 1 })
    )
    expect(button.kind).toBe('sync')
  })

  it('offers Sync Changes when ahead or behind', () => {
    expect(resolveVscodeScmActionButton(input({ ahead: 2 }))).toMatchObject({ kind: 'sync' })
    expect(resolveVscodeScmActionButton(input({ behind: 3 }))).toMatchObject({
      kind: 'sync',
      behind: 3
    })
  })

  it('falls back to a disabled Commit when nothing is staged and the branch is in sync', () => {
    expect(resolveVscodeScmActionButton(input())).toMatchObject({
      kind: 'commit',
      enabled: false,
      disabledReason: 'nothing-staged'
    })
  })

  it('reports detached HEAD instead of nothing-staged when there is no branch', () => {
    expect(resolveVscodeScmActionButton(input({ hasBranch: false }))).toMatchObject({
      kind: 'commit',
      disabledReason: 'detached-head'
    })
  })

  it('keeps Commit available to finish a merge whose conflicts are all staged', () => {
    const button = resolveVscodeScmActionButton(
      input({ conflictOperation: 'merge', commitMessage: 'merge branch', ahead: 1 })
    )
    expect(button).toMatchObject({ kind: 'commit', enabled: true, operation: 'merge' })
  })

  it('disables every kind while an operation is in flight', () => {
    expect(resolveVscodeScmActionButton(input({ ahead: 1, busy: true }))).toMatchObject({
      kind: 'sync',
      enabled: false,
      disabledReason: 'busy'
    })
    expect(
      resolveVscodeScmActionButton(input({ stagedCount: 1, commitMessage: 'x', busy: true }))
    ).toMatchObject({ kind: 'commit', enabled: false, disabledReason: 'busy' })
  })
})
