import type React from 'react'
import { CheckCircle2, Info } from 'lucide-react'
import type {
  AppUpdateCheckStatus,
  AppUpdateLookupTarget
} from '../../../../shared/app-update-check'
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
import {
  appUpdateResultTitle,
  appUpdateStatusTarget,
  describeAppUpdateLookupHost,
  describeAppUpdateLookupRepository,
  describeAppUpdateStatus
} from './app-update-status-copy'

type AppUpdateCheckResultDialogProps = {
  status: Exclude<AppUpdateCheckStatus, { state: 'available' }>
  target: AppUpdateLookupTarget | null
  onClose: () => void
}

/**
 * The answer to a check that found nothing to offer.
 *
 * Only a check the user asked for reaches this: the 6-hour timer stays silent unless
 * there is a real upgrade. A failed lookup shows what it tried to reach, because the
 * coordinate is as much of the diagnosis as the outcome.
 */
export function AppUpdateCheckResultDialog({
  status,
  target,
  onClose
}: AppUpdateCheckResultDialogProps): React.JSX.Element {
  const upToDate = status.state === 'up-to-date'
  const lookupTarget = appUpdateStatusTarget(status) ?? target

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {/* Plain wrapper: the icon row's gap belongs here, not on the primitive. */}
            <span className="flex items-center gap-2">
              {upToDate ? (
                <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Info className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              {appUpdateResultTitle(status)}
            </span>
          </DialogTitle>
          <DialogDescription>{describeAppUpdateStatus(status)}</DialogDescription>
        </DialogHeader>
        {status.state === 'unavailable' ? (
          <AppUpdateLookupTargetSummary target={lookupTarget} />
        ) : null}
        <DialogFooter>
          <Button type="button" size="sm" autoFocus onClick={onClose}>
            {/* Not "Close": the dialog's own X already carries that name, and two
                controls with one accessible name is a screen-reader trap. */}
            {translate('auto.components.appUpdate.result.acknowledge', 'OK')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AppUpdateLookupTargetSummary({
  target
}: {
  target: AppUpdateLookupTarget | null
}): React.JSX.Element {
  return (
    <dl className="rounded-md border border-border px-3 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-3 py-0.5">
        <dt className="text-muted-foreground">
          {translate('auto.components.appUpdate.target.host', 'Host')}
        </dt>
        <dd className="min-w-0 truncate font-mono">{describeAppUpdateLookupHost(target)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 py-0.5">
        <dt className="text-muted-foreground">
          {translate('auto.components.appUpdate.target.repository', 'Repository')}
        </dt>
        <dd className="min-w-0 truncate font-mono">{describeAppUpdateLookupRepository(target)}</dd>
      </div>
    </dl>
  )
}
