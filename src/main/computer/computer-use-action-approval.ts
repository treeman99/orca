// Ask the person at the keyboard before Computer Use changes anything.
//
// Reads (accessibility tree, screenshots, window lists) are not prompted — they do not
// alter the machine. Every *mutating* action funnels through callComputerSidecarAction,
// whose type signature already excludes the read methods, so this is the one place a
// prompt has to sit for clicks, typing, keys, drags, scrolls, pastes, and value writes.
//
// Fails closed: with no window to parent a dialog to (headless `orca serve`, a CLI-only
// session), the action is refused rather than performed unattended.

import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { getRuntimeDesktopSurface } from '../runtime/runtime-desktop-surface'
import { RuntimeClientError } from './runtime-client-error'

export const COMPUTER_USE_ACTION_DENIED = 'computer_use_action_denied'

// The prompt itself lives in the desktop surface (src/main/host/), so this module —
// which the Orca runtime reaches through sidecar-client — never imports `electron`.
type ConfirmAction = (detail: string) => Promise<'allowed' | 'denied' | 'no-window'>

// Serialized so a burst of actions asks one question at a time instead of stacking
// modals the user cannot tell apart.
let pending: Promise<unknown> = Promise.resolve()

function describeAction(method: string, params: unknown): string {
  const record = (typeof params === 'object' && params !== null ? params : {}) as Record<
    string,
    unknown
  >
  const app = typeof record.app === 'string' ? record.app : 'an app'
  switch (method) {
    case 'typeText':
    case 'pasteText':
      return `${method === 'typeText' ? 'Type' : 'Paste'} into ${app}: ${quote(record.text)}`
    case 'pressKey':
    case 'hotkey':
      return `Press ${quote(record.key)} in ${app}`
    case 'setValue':
      return `Set a field in ${app} to ${quote(record.value)}`
    case 'click':
      return `Click in ${app}`
    case 'performSecondaryAction':
      return `Perform ${quote(record.action)} in ${app}`
    case 'scroll':
      return `Scroll ${app}`
    case 'drag':
      return `Drag in ${app}`
    default:
      return `${method} in ${app}`
  }
}

// The text is the point of the prompt — it is what lands in another application — but an
// agent can hand over a whole file, so show enough to judge and no more.
function quote(value: unknown): string {
  if (typeof value !== 'string') {
    return '""'
  }
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > 120 ? `"${oneLine.slice(0, 120)}…"` : `"${oneLine}"`
}

export function requiresComputerUseApproval(): boolean {
  return getEnterprisePolicy().requireComputerUseApproval
}

/**
 * Returns undefined — not a resolved promise — when no approval is needed, mirroring the
 * paste validator above it. An unconditional `await` here would defer the sidecar spawn
 * by a microtask on every action, which the transport's callers observe.
 */
export function requireComputerUseApproval(
  method: string,
  params: unknown,
  deps: { confirm?: ConfirmAction } = {}
): Promise<void> | undefined {
  if (!requiresComputerUseApproval()) {
    return undefined
  }
  return askForComputerUseApproval(method, params, deps)
}

async function askForComputerUseApproval(
  method: string,
  params: unknown,
  deps: { confirm?: ConfirmAction }
): Promise<void> {
  const confirm =
    deps.confirm ??
    ((detail: string) => getRuntimeDesktopSurface().confirmComputerUseAction(detail))
  const ask = pending.then(() => confirm(describeAction(method, params)))
  // Chain on settle, not on success, so one rejected prompt cannot wedge the queue.
  pending = ask.catch(() => undefined)

  const verdict = await ask
  if (verdict === 'no-window') {
    throw new RuntimeClientError(
      COMPUTER_USE_ACTION_DENIED,
      'Computer Use needs your confirmation, and there is no Orca window to ask in.'
    )
  }
  if (verdict !== 'allowed') {
    throw new RuntimeClientError(COMPUTER_USE_ACTION_DENIED, 'You denied this Computer Use action.')
  }
}

export function __resetComputerUseApprovalQueueForTests(): void {
  pending = Promise.resolve()
}
