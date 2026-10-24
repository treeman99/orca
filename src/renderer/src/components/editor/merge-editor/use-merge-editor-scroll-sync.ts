import { useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import { monaco } from '@/lib/monaco-setup'

export type MergePaneId = 'input1' | 'input2' | 'result'

export type MergePaneEditors = Record<MergePaneId, editor.IStandaloneCodeEditor | null>

const PANE_IDS: readonly MergePaneId[] = ['input1', 'input2', 'result']

/**
 * Keeps the three panes on the same content (D6): the top visible line of the scrolled pane is
 * mapped through the ranges into each other pane. Line padding alignment is out of scope.
 */
export function useMergeEditorScrollSync(
  editors: MergePaneEditors,
  mapLine: (from: MergePaneId, to: MergePaneId, line: number) => number
): void {
  const mapLineRef = useRef(mapLine)
  mapLineRef.current = mapLine
  const { input1, input2, result } = editors

  useEffect(() => {
    const panes = PANE_IDS.flatMap((id) => {
      const instance = { input1, input2, result }[id]
      return instance ? [{ id, instance }] : []
    })
    if (panes.length < 2) {
      return
    }
    // Why: the follower's own scroll event would otherwise echo back and fight the leader.
    let syncing = false
    const subscriptions = panes.map(({ id, instance }) =>
      instance.onDidScrollChange((event) => {
        if (syncing || !event.scrollTopChanged) {
          return
        }
        const topLine = instance.getVisibleRanges()[0]?.startLineNumber ?? 1
        const offset = instance.getScrollTop() - instance.getTopForLineNumber(topLine)
        syncing = true
        try {
          for (const other of panes) {
            if (other.id === id) {
              continue
            }
            const line = mapLineRef.current(id, other.id, topLine)
            other.instance.setScrollTop(
              Math.max(0, other.instance.getTopForLineNumber(line) + offset),
              monaco.editor.ScrollType.Immediate
            )
          }
        } finally {
          syncing = false
        }
      })
    )
    return () => {
      for (const subscription of subscriptions) {
        subscription.dispose()
      }
    }
  }, [input1, input2, result])
}
