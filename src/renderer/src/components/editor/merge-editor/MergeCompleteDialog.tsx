import React, { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'

export type MergeCompleteDialogState = {
  count: number
  resolve: (confirmed: boolean) => void
} | null

/** The "complete with conflicts" prompt (O11) as a promise the completion flow can await. */
export function useMergeCompleteConfirm(): {
  confirmWithUnhandled: (count: number) => Promise<boolean>
  dialogState: MergeCompleteDialogState
  settle: (confirmed: boolean) => void
} {
  const [dialogState, setDialogState] = useState<MergeCompleteDialogState>(null)
  const confirmWithUnhandled = useCallback(
    (count: number) =>
      new Promise<boolean>((resolve) => {
        setDialogState({ count, resolve })
      }),
    []
  )
  const settle = useCallback(
    (confirmed: boolean) => {
      dialogState?.resolve(confirmed)
      setDialogState(null)
    },
    [dialogState]
  )
  return { confirmWithUnhandled, dialogState, settle }
}

export function MergeCompleteDialogHost({
  state,
  onSettle
}: {
  state: MergeCompleteDialogState
  onSettle: (confirmed: boolean) => void
}): React.JSX.Element {
  // Why: Radix keeps the content mounted while it animates out; keep the count it showed.
  const shownCountRef = useRef(0)
  if (state) {
    shownCountRef.current = state.count
  }
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onSettle(false)}>
      <DialogContent showCloseButton={false} size="compact">
        <DialogHeader>
          <DialogTitle size="compact">
            {translate(
              'auto.components.editor.mergeEditor.confirmTitle',
              'Complete the merge with unhandled conflicts?'
            )}
          </DialogTitle>
          <DialogDescription size="compact">
            {translate(
              'auto.components.editor.mergeEditor.confirmDescription',
              "{{value0}} conflicts are not handled yet. Completing saves the result exactly as shown, without conflict markers (an untouched conflict keeps the common ancestor's text), and stages the file.",
              { value0: shownCountRef.current }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onSettle(false)}>
            {translate('auto.components.editor.mergeEditor.cancel', 'Cancel')}
          </Button>
          <Button type="button" size="sm" onClick={() => onSettle(true)}>
            {translate(
              'auto.components.editor.mergeEditor.completeWithConflicts',
              'Complete Anyway'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
