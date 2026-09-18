import type React from 'react'
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
import { AppUpdateCheckResultDialog } from './app-update/AppUpdateCheckResultDialog'
import {
  dismissAppUpdatePresentation,
  openAppUpdateReleasePage,
  skipAppUpdateVersion,
  useAppUpdateCheck
} from './app-update/app-update-check-store'

type AvailableStatus = Extract<AppUpdateCheckStatus, { state: 'available' }>

/**
 * The whole update surface in this fork: "a newer release exists", plus the answer to a
 * check the user asked for.
 *
 * There is no download, no install, and no progress — the corporate build is distributed
 * by IT, so the only action is opening the release page on the company host. Main owns
 * the check schedule and the "skip this version" memory; the store decides what may be
 * shown, and this component only renders it.
 */
export default function AppUpdateAvailableDialog(): React.JSX.Element | null {
  const { pending, target } = useAppUpdateCheck()
  const activeModal = useAppStore((state) => state.activeModal)

  if (!pending) {
    return null
  }
  // A scheduled check waits its turn behind whatever the user is doing. A manual one was
  // asked for, so it answers even over another dialog — silence would read as a failure.
  if (pending.source === 'background' && activeModal !== 'none') {
    return null
  }
  if (pending.status.state !== 'available') {
    return (
      <AppUpdateCheckResultDialog
        status={pending.status}
        target={target}
        onClose={dismissAppUpdatePresentation}
      />
    )
  }
  return <AppUpdateAvailableBody update={pending.status} />
}

function AppUpdateAvailableBody({ update }: { update: AvailableStatus }): React.JSX.Element {
  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          dismissAppUpdatePresentation()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {/* Plain wrapper: the icon row's gap belongs here, not on the primitive. */}
            <span className="flex items-center gap-2">
              <ArrowUpCircle className="size-4 text-muted-foreground" aria-hidden="true" />
              {translate(
                'auto.components.AppUpdateAvailableDialog.title',
                'A newer version of Orca is available'
              )}
            </span>
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.AppUpdateAvailableDialog.description',
              'You are running {{value0}}. The company release page lists {{value1}}. Orca does not install updates for you — open the release page to get the new build.',
              { value0: update.currentVersion, value1: update.releaseTag }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void skipAppUpdateVersion(update.latestVersion)}
          >
            {translate('auto.components.AppUpdateAvailableDialog.skip', 'Skip this version')}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={dismissAppUpdatePresentation}
            >
              {translate('auto.components.AppUpdateAvailableDialog.later', 'Later')}
            </Button>
            <Button type="button" size="sm" autoFocus onClick={openAppUpdateReleasePage}>
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
