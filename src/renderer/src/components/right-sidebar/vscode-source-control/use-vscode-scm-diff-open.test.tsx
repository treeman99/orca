// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'
import { useVscodeScmDiffOpen } from './use-vscode-scm-diff-open'

const conflictRow: GitStatusEntry = {
  path: 'src/conflict.ts',
  status: 'modified',
  area: 'unstaged',
  conflictKind: 'both_modified',
  conflictStatus: 'unresolved',
  conflictStatusSource: 'git'
}

describe('useVscodeScmDiffOpen', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens a merge-conflict row as the working file in the merge view, not as a diff', () => {
    const { result } = renderHook(() => useVscodeScmDiffOpen('wt-scm', '/scm-repo'))

    act(() => result.current.openEntryDiff(conflictRow))

    const state = useAppStore.getState()
    const opened = state.openFiles.find((file) => file.filePath === '/scm-repo/src/conflict.ts')
    expect(opened).toMatchObject({ mode: 'edit', conflict: { conflictKind: 'both_modified' } })
    expect(opened && state.editorViewMode[opened.id]).toBe('merge')
  })
})
