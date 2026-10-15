import { useState } from 'react'
import { AddRepoHostSelector } from './AddRepoHostSelector'
import type { useAddRepoHostSelection } from './use-add-repo-host-selection'
import { AddRemoteHostDialog, type AddRemoteHostMode } from './AddRemoteHostDialog'
import { openWslHostsExperimentalSetting, useWslHostsEnabled } from './use-wsl-hosts-enabled'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import { SSH_REMOTE_HOSTS_REMOVED } from '../../../../shared/ssh-remote-hosts-removal'

export function AddRepoHostSelectorSlot({
  hostSelection
}: {
  hostSelection: ReturnType<typeof useAddRepoHostSelection>
}) {
  const [addRemoteHostMode, setAddRemoteHostMode] = useState<AddRemoteHostMode | null>(null)
  const wslHostsEnabled = useWslHostsEnabled()
  // Fork: SSH hosts are removed from this build; remote servers and WSL hosts (an orcad this
  // desktop attaches to) are refused under disableRemoteOrcaServer.
  const { disableRemoteOrcaServer } = useEnterprisePolicyView()

  return (
    <>
      <AddRepoHostSelector
        hosts={hostSelection.hostOptions}
        selectedHostId={hostSelection.displayedHostId}
        open={hostSelection.hostSelectorOpen}
        onOpenChange={hostSelection.setHostSelectorOpen}
        onSelectHost={(hostId) => void hostSelection.handleSelectAddProjectHost(hostId)}
        onConnectHost={(hostId) => void hostSelection.handleConnectAddProjectHost(hostId)}
        onAddSshHost={SSH_REMOTE_HOSTS_REMOVED ? undefined : () => setAddRemoteHostMode('ssh')}
        onAddRemoteServer={
          disableRemoteOrcaServer ? undefined : () => setAddRemoteHostMode('server')
        }
        onAddWslHost={
          wslHostsEnabled && !disableRemoteOrcaServer ? () => setAddRemoteHostMode('wsl') : undefined
        }
        onOpenWslHostsSetting={disableRemoteOrcaServer ? undefined : openWslHostsExperimentalSetting}
      />
      <AddRemoteHostDialog mode={addRemoteHostMode} onOpenChange={setAddRemoteHostMode} />
    </>
  )
}
