import { Info, Server, ServerOff, Star, Trash2, Waypoints } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu'

// Fork: no Update or "Check for updates" items — this build removes remote server updates (README §6).
type RuntimeServerRowMenuProps = {
  showConnect: boolean
  showDisconnect: boolean
  showMakeDefault: boolean
  /** null hides the item; otherwise whether the route is already linked. */
  sshAccessLinked: boolean | null
  detailsExpanded: boolean
  actionBusy: boolean
  isBusy: boolean
  connectDisabled: boolean
  /** Managed-server lifecycle items, placed between setup and removal. */
  managedItems?: React.ReactNode
  onConnect: () => void
  onDisconnect: () => void
  onMakeDefault: () => void
  onSshAccess: () => void
  onToggleDetails: () => void
  onRemove: () => void
}

/** Order: state change → preference → setup → destructive. */
export function RuntimeServerRowMenuItems({
  showConnect,
  showDisconnect,
  showMakeDefault,
  sshAccessLinked,
  detailsExpanded,
  actionBusy,
  isBusy,
  connectDisabled,
  managedItems,
  onConnect,
  onDisconnect,
  onMakeDefault,
  onSshAccess,
  onToggleDetails,
  onRemove
}: RuntimeServerRowMenuProps): React.JSX.Element {
  return (
    <>
      {showDisconnect ? (
        <DropdownMenuItem disabled={actionBusy} onSelect={onDisconnect}>
          <ServerOff />
          {translate('auto.components.settings.RuntimeEnvironmentsPane.disconnect', 'Disconnect')}
        </DropdownMenuItem>
      ) : null}
      {showConnect ? (
        <DropdownMenuItem disabled={actionBusy || connectDisabled} onSelect={onConnect}>
          <Server />
          {translate('auto.components.settings.RuntimeEnvironmentsPane.connect', 'Connect')}
        </DropdownMenuItem>
      ) : null}
      {showMakeDefault ? (
        <DropdownMenuItem disabled={isBusy} onSelect={onMakeDefault}>
          <Star />
          {translate('auto.components.settings.serverList.makeDefault', 'Open new projects here')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      {sshAccessLinked !== null ? (
        <DropdownMenuItem onSelect={onSshAccess}>
          <Waypoints />
          {sshAccessLinked
            ? translate('auto.components.settings.serverList.sshAccessLinked', 'SSH route…')
            : translate('auto.components.settings.serverList.sshAccess', 'Connect through SSH…')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={onToggleDetails}>
        <Info />
        {detailsExpanded
          ? translate('auto.components.settings.serverList.hideDetails', 'Hide details')
          : translate('auto.components.settings.serverList.details', 'Details')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {managedItems}
      <DropdownMenuItem variant="destructive" disabled={isBusy} onSelect={onRemove}>
        <Trash2 />
        {translate('auto.components.settings.serverList.remove', 'Remove…')}
      </DropdownMenuItem>
    </>
  )
}
