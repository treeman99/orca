// Ask the person at the keyboard before Computer Use changes anything.
//
// Reads (accessibility tree, screenshots, window lists) are not prompted — they do not
// alter the machine. Every *mutating* action funnels through callComputerSidecarAction,
// whose type signature already excludes the read methods, so this is the one place a
// prompt has to sit for clicks, typing, keys, drags, scrolls, pastes, and value writes.
//
// Fails closed: with no window to parent a dialog to (headless `orca serve`, a CLI-only
// session), the action is refused rather than performed unattended.

import { BrowserWindow, dialog } from 'electron'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { translateMain } from '../i18n/main-i18n'
import { RuntimeClientError } from './runtime-client-error'

export const COMPUTER_USE_ACTION_DENIED = 'computer_use_action_denied'

type ApprovalDialog = typeof dialog.showMessageBox
type WindowSource = () => BrowserWindow | null

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
  deps: { showMessageBox?: ApprovalDialog; getWindow?: WindowSource } = {}
): Promise<void> | undefined {
  if (!requiresComputerUseApproval()) {
    return undefined
  }
  return askForComputerUseApproval(method, params, deps)
}

async function askForComputerUseApproval(
  method: string,
  params: unknown,
  deps: { showMessageBox?: ApprovalDialog; getWindow?: WindowSource }
): Promise<void> {
  const getWindow =
    deps.getWindow ??
    (() => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null)
  const window = getWindow()
  if (!window) {
    throw new RuntimeClientError(
      COMPUTER_USE_ACTION_DENIED,
      'Computer Use needs your confirmation, and there is no Orca window to ask in.'
    )
  }

  const show = deps.showMessageBox ?? dialog.showMessageBox
  const ask = pending.then(() =>
    show(window, {
      type: 'question',
      // Deny is both the default button and the Esc/close result: a dismissed prompt
      // must never read as consent.
      buttons: [
        translateMain('computerUse.approval.deny', 'Deny'),
        translateMain('computerUse.approval.allow', 'Allow')
      ],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: translateMain('computerUse.approval.title', 'Allow agent to control your computer?'),
      message: translateMain(
        'computerUse.approval.message',
        'An agent wants to act on an app outside Orca.'
      ),
      detail: describeAction(method, params)
    })
  )
  // Chain on settle, not on success, so one rejected prompt cannot wedge the queue.
  pending = ask.catch(() => undefined)

  const { response } = await ask
  if (response !== 1) {
    throw new RuntimeClientError(COMPUTER_USE_ACTION_DENIED, 'You denied this Computer Use action.')
  }
}

export function __resetComputerUseApprovalQueueForTests(): void {
  pending = Promise.resolve()
}
