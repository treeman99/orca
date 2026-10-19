import { translate } from '@/i18n/i18n'
import {
  getRuntimeServerConnectionLabel,
  getRuntimeServerDotClass,
  type RuntimeServerConnectionState
} from './runtime-environment-host-details'

export type RuntimeServerStatusIndicator = {
  label: string
  labelClassName: string
  dotClassName: string
}

export function getRuntimeServerStatusIndicator(
  connectionState: RuntimeServerConnectionState,
  accessRevoked: boolean
): RuntimeServerStatusIndicator {
  // Why: the host answered and refused our token, so "Disconnected" would misstate a reachable host.
  if (accessRevoked) {
    return {
      label: translate(
        'auto.components.settings.RuntimeEnvironmentsPane.serverAccessRevoked',
        'Access revoked'
      ),
      labelClassName: 'text-destructive',
      dotClassName: 'bg-destructive'
    }
  }
  return {
    label: getRuntimeServerConnectionLabel(connectionState),
    labelClassName: 'text-muted-foreground',
    dotClassName: getRuntimeServerDotClass(connectionState)
  }
}

// Fork: no version footer — it renders a remote-server update entry, and this build removes
// remote server updates (README §6).
