import { useEffect, useRef, type MutableRefObject } from 'react'
import { useAppStore } from '@/store'

/**
 * Leaving the merge view by any route but its own buttons (the header's Changes toggle, a
 * conflict reopened as resolved) must still put unhandled conflicts back as markers (D4).
 * A tab switch or a closed tab is not a leave: the mode is still 'merge', or the file is gone.
 */
export function useMergeViewLeaveGuard(
  fileId: string,
  leftRef: MutableRefObject<boolean>,
  restoreMarkers: () => void
): void {
  const restoreRef = useRef(restoreMarkers)
  restoreRef.current = restoreMarkers

  useEffect(
    () => () => {
      if (leftRef.current) {
        return
      }
      const state = useAppStore.getState()
      if (
        !state.openFiles.some((file) => file.id === fileId) ||
        state.editorViewMode[fileId] === 'merge'
      ) {
        return
      }
      leftRef.current = true
      restoreRef.current()
    },
    [fileId, leftRef]
  )
}
