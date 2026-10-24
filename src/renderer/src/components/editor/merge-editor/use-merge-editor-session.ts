import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { readMergeConflictInputs } from './merge-editor-git'
import { initialMergeViewState } from './merge-editor-result-state'
import {
  buildMergeEditorSession,
  type MergeEditorSession,
  type MergeSessionUnavailableReason
} from './merge-editor-session'
import { getCachedMergeSession } from './merge-editor-session-cache'
import type { MergeHandledState } from './model/merge-handled-state'

export type MergeSessionLoad =
  | { status: 'loading' }
  | { status: 'ready'; session: MergeEditorSession; handled: MergeHandledState }
  | { status: 'unavailable'; reason: MergeSessionUnavailableReason }

type MergeSessionFile = Pick<
  OpenFile,
  'id' | 'worktreeId' | 'filePath' | 'relativePath' | 'runtimeEnvironmentId'
>

/**
 * Reads the conflict's inputs once per mount (the view is keyed by file) and, when the buffer
 * still has markers, swaps in the recomputed result before the panes first render (O6).
 */
export function useMergeEditorSession(
  file: MergeSessionFile,
  bufferText: string,
  onContentChange: (content: string) => void
): MergeSessionLoad {
  const [load, setLoad] = useState<MergeSessionLoad>(() => {
    const cached = getCachedMergeSession(file.id)
    return cached ? { status: 'ready', ...cached } : { status: 'loading' }
  })
  const latestRef = useRef({ file, bufferText, onContentChange })
  latestRef.current = { file, bufferText, onContentChange }
  const needsRead = load.status === 'loading'

  useEffect(() => {
    if (!needsRead) {
      return
    }
    let cancelled = false
    const target = latestRef.current.file
    void readMergeConflictInputs(target).then((inputs) => {
      if (cancelled) {
        return
      }
      const { bufferText: buffer, onContentChange: writeBuffer } = latestRef.current
      const operation =
        useAppStore.getState().gitConflictOperationByWorktree?.[target.worktreeId] ?? 'merge'
      const built = buildMergeEditorSession(inputs, buffer, operation)
      if (built.kind === 'unavailable') {
        setLoad({ status: 'unavailable', reason: built.reason })
        return
      }
      const initial = initialMergeViewState(built.session, buffer)
      if (initial.result !== buffer) {
        writeBuffer(initial.result)
      }
      setLoad({ status: 'ready', session: built.session, handled: initial.handled })
    })
    return () => {
      cancelled = true
    }
  }, [needsRead])

  return load
}
