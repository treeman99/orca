import { describe, expect, it } from 'vitest'
import { botHandle, getBotRoutineEligibility, getBotWorkspaceBinding } from './bot-types'

describe('botHandle', () => {
  it('slugifies a display name', () => {
    expect(botHandle('Release Checker')).toBe('release-checker')
    expect(botHandle('  Nightly  QA  ')).toBe('nightly-qa')
  })

  it('keeps Hangul so a Korean-named bot stays addressable', () => {
    expect(botHandle('릴리스 점검')).toBe('릴리스-점검')
  })

  it('never returns an empty handle', () => {
    expect(botHandle('   ')).toBe('bot')
    expect(botHandle('!!!')).toBe('bot')
  })
})

describe('getBotWorkspaceBinding', () => {
  it('parses both workspace kinds and rejects junk', () => {
    expect(getBotWorkspaceBinding({ workspaceKey: 'worktree:repo::/path' })).toEqual({
      kind: 'worktree',
      worktreeId: 'repo::/path'
    })
    expect(getBotWorkspaceBinding({ workspaceKey: 'folder:f1' })).toEqual({
      kind: 'folder',
      folderWorkspaceId: 'f1'
    })
    expect(getBotWorkspaceBinding({ workspaceKey: 'nonsense' })).toEqual({ kind: 'unbound' })
    expect(getBotWorkspaceBinding({ workspaceKey: null })).toEqual({ kind: 'unbound' })
  })
})

describe('getBotRoutineEligibility', () => {
  it('accepts a worktree-bound bot with a project', () => {
    expect(
      getBotRoutineEligibility({ workspaceKey: 'worktree:repo::/path', projectId: 'repo' })
    ).toEqual({ ok: true, worktreeId: 'repo::/path', projectId: 'repo' })
  })

  // The refusal that matters: the automation lane resolves run targets through worktree
  // ids, so a folder-bound routine would be created and then skip forever.
  it('refuses a folder workspace with a distinguishable reason', () => {
    expect(getBotRoutineEligibility({ workspaceKey: 'folder:f1', projectId: 'repo' })).toEqual({
      ok: false,
      reason: 'folder_workspace'
    })
  })

  it('refuses an unbound bot and a bound bot with no project', () => {
    expect(getBotRoutineEligibility({ workspaceKey: null, projectId: null })).toEqual({
      ok: false,
      reason: 'unbound'
    })
    expect(
      getBotRoutineEligibility({ workspaceKey: 'worktree:repo::/path', projectId: null })
    ).toEqual({ ok: false, reason: 'no_project' })
  })
})
