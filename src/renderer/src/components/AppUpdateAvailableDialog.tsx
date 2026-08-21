import { useCallback, useEffect, useState } from 'react'
import { ArrowUpCircle } from 'lucide-react'
import type { AppUpdateCheckStatus } from '../../../shared/app-update-check'
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
import { useAppStore } from '@/store'

type AvailableStatus = Extract<AppUpdateCheckStatus, { state: 'available' }>

function availableUpdate(status: AppUpdateCheckStatus | null): AvailableStatus | null {
  return status?.state === 'available' && !status.dismissed ? status : null
}

/**
 * "A newer release exists" — the whole update surface in this fork.
 *
 * There is no download, no install, and no progress: the corporate build is
 * distributed by IT, so the only action is opening the release page on the company
 * host. Main owns the check schedule and the "skip this version" memory; this
 * component only renders what it is told and reports the user's choice back.
 */
export default function AppUpdateAvailableDialog(): React.JSX.Element | null {
  const [status, setStatus] = useState<AppUpdateCheckStatus | null>(null)
  const [postponed, setPostponed] = useState(false)
  const activeModal = useAppStore((state) => state.activeModal)

  useEffect(() => {
    // Absent in the browser client (`orca serve`, `pnpm dev:web`), which has no update lane.
    const api = window.api?.appUpdate
    if (!api) {
      return
    }
    let cancelled = false
    void api.getStatus().then((initial) => {
      if (!cancelled) {
        setStatus(initial)
      }
    })
    const unsubscribe = api.onStatus((next) => {
      setStatus(next)
      setPostponed(false)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const update = availableUpdate(status)

  const skipThisVersion = useCallback(() => {
    if (update) {
      void window.api?.appUpdate?.dismissVersion({ version: update.latestVersion }).then(setStatus)
    }
  }, [update])

  if (!update) {
    return null
  }

  return (
    <Dialog
      open={!postponed && activeModal === 'none'}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setPostponed(true)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowUpCircle className="size-4 text-muted-foreground" aria-hidden="true" />
            {translate(
              'auto.components.AppUpdateAvailableDialog.title',
              'A newer version of Orca is available'
            )}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {translate(
              'auto.components.AppUpdateAvailableDialog.description',
              'You are running {{value0}}. The company release page lists {{value1}}. Orca does not install updates for you — open the release page to get the new build.',
              { value0: update.currentVersion, value1: update.releaseTag }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={skipThisVersion}>
            {translate('auto.components.AppUpdateAvailableDialog.skip', 'Skip this version')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setPostponed(true)}>
              {translate('auto.components.AppUpdateAvailableDialog.later', 'Later')}
            </Button>
            <Button
              type="button"
              size="sm"
              autoFocus
              onClick={() => void window.api?.appUpdate?.openReleasePage()}
            >
              {translate(
                'auto.components.AppUpdateAvailableDialog.openReleasePage',
                'Open release page'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
