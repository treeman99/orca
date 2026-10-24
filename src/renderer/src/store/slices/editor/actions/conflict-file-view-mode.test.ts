import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { createEditorStore } from '../../editor-slice-test-harness'

const FILE_ID = '/repo/src/conflict.ts'

function conflictEntry(overrides: Partial<GitStatusEntry> = {}): GitStatusEntry {
  return {
    path: 'src/conflict.ts',
    status: 'modified',
    area: 'unstaged',
    conflictKind: 'both_modified',
    conflictStatus: 'unresolved',
    conflictStatusSource: 'git',
    ...overrides
  }
}

const resolvedEntry = conflictEntry({
  conflictStatus: 'resolved_locally',
  conflictStatusSource: 'session'
})

describe('openConflictFile view mode', () => {
  it.each(['both_modified', 'both_added'] as const)(
    'opens an unresolved %s conflict in the merge view',
    (conflictKind) => {
      const store = createEditorStore()
      store.getState().openConflictFile('wt-1', '/repo', conflictEntry({ conflictKind }), 'ts')
      expect(store.getState().editorViewMode[FILE_ID]).toBe('merge')
    }
  )

  it.each([
    ['deleted_by_us', conflictEntry({ conflictKind: 'deleted_by_us' })],
    ['resolved', resolvedEntry]
  ])('keeps the text editor for a %s file', (_name, entry) => {
    const store = createEditorStore()
    store.getState().openConflictFile('wt-1', '/repo', entry, 'ts')
    expect(store.getState().openFiles.map((file) => file.id)).toEqual([FILE_ID])
    expect(store.getState().editorViewMode[FILE_ID]).toBeUndefined()
  })

  it('drops a merge view left over once the conflict is resolved', () => {
    const store = createEditorStore()
    store.getState().openConflictFile('wt-1', '/repo', conflictEntry(), 'ts')
    store.getState().openConflictFile('wt-1', '/repo', resolvedEntry, 'ts')
    expect(store.getState().editorViewMode[FILE_ID]).toBeUndefined()
  })

  it('leaves a plain file open (file explorer) in the text editor', () => {
    const store = createEditorStore()
    store.getState().openFile({
      filePath: FILE_ID,
      relativePath: 'src/conflict.ts',
      worktreeId: 'wt-1',
      language: 'ts',
      mode: 'edit'
    })
    expect(store.getState().editorViewMode[FILE_ID]).toBeUndefined()
  })
})
