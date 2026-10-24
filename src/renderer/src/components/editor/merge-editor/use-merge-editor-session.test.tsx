// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ readMergeConflictInputs: vi.fn() }))

vi.mock('./merge-editor-git', () => ({
  readMergeConflictInputs: mocks.readMergeConflictInputs
}))

import { useMergeEditorSession } from './use-merge-editor-session'

const lf = (...lines: string[]): string => lines.map((line) => `${line}\n`).join('')

const FILE = {
  id: '/repo/a.ts',
  worktreeId: 'wt-1',
  filePath: '/repo/a.ts',
  relativePath: 'a.ts',
  runtimeEnvironmentId: undefined
}

describe('useMergeEditorSession', () => {
  afterEach(() => {
    cleanup()
    mocks.readMergeConflictInputs.mockReset()
  })

  it('falls back to the markers when the host has no stage read, and swaps in the reset result', async () => {
    mocks.readMergeConflictInputs.mockResolvedValue(null)
    const marked = lf('top', '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> topic', 'end')
    const onContentChange = vi.fn()

    const { result } = renderHook(() =>
      useMergeEditorSession({ ...FILE, id: '/repo/fallback.ts' }, marked, onContentChange)
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.status === 'ready' && result.current.session.fromMarkers).toEqual({
      hasBase: false
    })
    // Why: no common ancestor, so the conflict starts at the empty base and stays unhandled.
    expect(onContentChange).toHaveBeenCalledWith(lf('top', 'end'))
  })

  it('reports a file it cannot merge instead of showing empty panes', async () => {
    mocks.readMergeConflictInputs.mockResolvedValue({
      base: { content: '', exists: true, isBinary: true },
      ours: { content: '', exists: true, isBinary: true },
      theirs: { content: '', exists: true, isBinary: true },
      operation: 'merge'
    })
    const onContentChange = vi.fn()

    const { result } = renderHook(() =>
      useMergeEditorSession({ ...FILE, id: '/repo/binary.png' }, 'x', onContentChange)
    )

    await waitFor(() => expect(result.current).toEqual({ status: 'unavailable', reason: 'binary' }))
    expect(onContentChange).not.toHaveBeenCalled()
  })
})
