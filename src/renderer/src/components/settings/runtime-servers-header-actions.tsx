import { ArrowUpRight, ChevronDown, Cloud, Link2, Plus, TerminalSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { SSH_REMOTE_HOSTS_REMOVED } from '../../../../shared/ssh-remote-hosts-removal'
import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { useRuntimeServersPage } from './runtime-servers-page-context'
import { RuntimeShareComputerButton } from './runtime-share-computer-button'
import { getManagedOrcadApi } from './use-managed-server-catalog'

function AddServerMenuItem({
  icon,
  label,
  description,
  trailing,
  onSelect
}: {
  icon: React.ReactNode
  label: string
  description: string
  trailing?: React.ReactNode
  onSelect: () => void
}): React.JSX.Element {
  return (
    <DropdownMenuItem className="items-start" onSelect={onSelect}>
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          {label}
          {trailing}
        </span>
        <span className="block text-2xs text-muted-foreground">{description}</span>
      </span>
    </DropdownMenuItem>
  )
}

/**
 * Section-header actions for Remote Orca Servers: the Add server split button.
 * Fork: no update-all — this build removes remote server updates (README §6) — and no
 * "Set up Orca on an SSH host", which can only run over the SSH hosts this build removes.
 */
export function RuntimeServersHeaderActions({
  canGeneratePairingUrl
}: {
  canGeneratePairingUrl: boolean
}): React.JSX.Element {
  const { setDialog } = useRuntimeServersPage()
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const canInstall = !SSH_REMOTE_HOSTS_REMOVED && getManagedOrcadApi() !== undefined

  return (
    <div data-settings-section="remote-servers" className="flex items-center gap-2">
      <ButtonGroup>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog('add')}>
          <Plus />
          {translate('auto.components.settings.serverList.addServer', 'Add server')}
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={translate(
                'auto.components.settings.serverList.moreWaysToAdd',
                'More ways to add a server'
              )}
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <AddServerMenuItem
              icon={<Link2 />}
              label={translate(
                'auto.components.settings.serverList.pasteAccessLink',
                'Paste access link'
              )}
              description={translate(
                'auto.components.settings.serverList.pasteAccessLinkHelp',
                'Pair with Orca already running on another machine.'
              )}
              onSelect={() => setDialog('add')}
            />
            {canInstall ? (
              <AddServerMenuItem
                icon={<TerminalSquare />}
                label={translate(
                  'auto.components.settings.serverList.setUpOnSshHost',
                  'Set up Orca on an SSH host'
                )}
                description={translate(
                  'auto.components.settings.managedServers.description',
                  'Orca installs itself on an empty SSH host and keeps itself up to date.'
                )}
                onSelect={() => setDialog('install')}
              />
            ) : null}
            <AddServerMenuItem
              icon={<Cloud />}
              label={translate('auto.components.settings.serverList.cloudVm', 'Cloud VM')}
              trailing={<ArrowUpRight className="ml-auto" />}
              description={translate(
                'auto.components.settings.serverList.cloudVmHelp',
                'Created per workspace from an environment recipe.'
              )}
              onSelect={() =>
                openSettingsTarget({
                  pane: 'experimental',
                  repoId: null,
                  sectionId: 'ephemeral-vms'
                })
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      {canGeneratePairingUrl ? <RuntimeShareComputerButton /> : null}
    </div>
  )
}
