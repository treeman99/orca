import { translate } from '@/i18n/i18n'
import { isConnectedRuntimeHostState } from '@/runtime/runtime-host-connection-state'
import {
  getRuntimeServerConnectionLabel,
  type RuntimeServerConnectionState
} from './runtime-environment-host-details'
import type { ServerRowStatus } from './runtime-server-list-row'

// Fork: no update phases, available-update text or update-reported versions — this build removes
// remote server updates (README §6).

export type RuntimeServerStatusInput = {
  connectionState: RuntimeServerConnectionState
  accessRevoked: boolean
  compatibilityBlocked: boolean
  /** The latest probe failed with an error rather than being a user disconnect. */
  probeFailed: boolean
  connecting: boolean
  disconnecting: boolean
  /** A managed server whose loaded status has no active version. */
  managedNotRunning?: boolean
}

/** One status per row; it replaces the old stack of "Disconnected", "Offline" and "Status unavailable". */
export function getRuntimeServerStatusIndicator(input: RuntimeServerStatusInput): ServerRowStatus {
  // Why: the host answered and refused our token, so "Disconnected" would misstate a reachable host.
  if (input.accessRevoked) {
    return {
      label: translate(
        'auto.components.settings.RuntimeEnvironmentsPane.serverAccessRevoked',
        'Access revoked'
      ),
      tone: 'destructive'
    }
  }
  if (input.connecting) {
    return {
      label: translate('auto.components.settings.serverList.connecting', 'Connecting…'),
      tone: 'muted',
      busy: true
    }
  }
  if (input.disconnecting) {
    return {
      label: translate('auto.components.settings.serverList.disconnecting', 'Disconnecting…'),
      tone: 'muted',
      busy: true
    }
  }
  if (input.compatibilityBlocked) {
    return {
      label: translate('auto.components.settings.serverList.needsUpdate', 'Needs update'),
      tone: 'destructive'
    }
  }
  // Why after the states above: revoked, updating, connecting or incompatible say more than this.
  if (input.managedNotRunning && !isConnectedRuntimeHostState(input.connectionState)) {
    return {
      label: translate('auto.components.settings.managedServers.row.notRunning', 'Not running'),
      tone: 'muted'
    }
  }
  const label = getRuntimeServerConnectionLabel(input.connectionState)
  switch (input.connectionState) {
    case 'connected':
      return { label, tone: 'success' }
    case 'checking':
      return { label, tone: 'muted', busy: true }
    case 'reconnecting':
      return { label, tone: 'warning', busy: true }
    case 'runtime-unavailable':
    case 'workspace-window-closed':
      return { label, tone: 'warning' }
    case 'disconnected':
      // Why "Unreachable": a probe that got no answer doesn't prove the host is down.
      return input.probeFailed
        ? {
            label: translate('auto.components.settings.serverList.unreachable', 'Unreachable'),
            tone: 'muted'
          }
        : { label, tone: 'muted' }
  }
}

/** The version part of the meta line; null when no version was ever verified. */
export function getRuntimeServerVersionText(
  lastKnownVersion: string | null | undefined
): string | null {
  const version = lastKnownVersion?.trim()
  return version
    ? translate('auto.components.settings.serverList.version', 'v{{version}}', {
        version
      })
    : null
}

/** host:port of a ws:// endpoint; the raw string when it isn't a URL. */
export function formatRuntimeEndpointAddress(endpoint: string | undefined): string | null {
  if (!endpoint) {
    return null
  }
  try {
    return new URL(endpoint).host || endpoint
  } catch {
    return endpoint
  }
}
