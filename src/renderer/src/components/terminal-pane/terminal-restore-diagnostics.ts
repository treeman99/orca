import type { Terminal } from '@xterm/xterm'

/**
 * One line per restore decision in the opt-in troubleshooting log.
 *
 * Why: the "restart or project switch leaves the old conversation on screen and
 * the new prompt draws over it" report has now been fixed twice (payload-less
 * reattach, dead-TUI alt screen) against paths reproduced headlessly, and both
 * missed the user's machine. Each restore path here re-anchors the cursor by a
 * different rule — persisted-buffer replay, fresh-shell blank, payload-less
 * reattach blank, cold-restore repaint, hidden-output snapshot, reattach
 * snapshot/replay — and which one a pane took, in what order and at what grid,
 * is exactly what a Windows log can say and a macOS repro cannot. Fields stay
 * within main's 12-field cap.
 */
export type TerminalRestoreDiagnosticEvent =
  | 'layout-restore'
  | 'fresh-spawn-blank'
  | 'reattach-payloadless'
  | 'reattach-snapshot'
  | 'reattach-replay'
  | 'cold-restore-repaint'
  | 'snapshot-restore'
  | 'snapshot-unavailable'

// Why 12: main's diagnosticLog:write handler keeps the first twelve fields and drops the rest.
const MAX_FIELDS = 12

type TerminalRestoreDiagnosticArgs = {
  tabId: string
  ptyId?: string | null
  terminal?: Pick<Terminal, 'rows' | 'cols' | 'buffer'> | null
  visible?: boolean
  nativeConpty?: boolean
  extra?: Record<string, string | number | boolean | null | undefined>
}

function readBufferFields(
  terminal: TerminalRestoreDiagnosticArgs['terminal']
): Record<string, string | number | boolean> {
  if (!terminal) {
    return {}
  }
  const buffer = terminal.buffer?.active
  return {
    grid: `${terminal.cols}x${terminal.rows}`,
    ...(buffer
      ? {
          // Why baseY: how many rows sit in scrollback tells whether a blank scrolled
          // the restored rows away or a repaint replaced them.
          baseY: buffer.baseY,
          cursor: `${buffer.cursorY},${buffer.cursorX}`,
          alt: buffer.type === 'alternate'
        }
      : {})
  }
}

export function logTerminalRestoreDiagnostic(
  event: TerminalRestoreDiagnosticEvent,
  args: TerminalRestoreDiagnosticArgs
): void {
  const write = (globalThis as { window?: Window }).window?.api?.diagnosticLog?.write
  if (typeof write !== 'function') {
    return
  }
  const fields: Record<string, string | number | boolean> = {
    event,
    tab: args.tabId,
    ...(args.ptyId ? { pty: args.ptyId } : {}),
    ...(args.visible !== undefined ? { visible: args.visible } : {}),
    ...(args.nativeConpty !== undefined ? { conpty: args.nativeConpty } : {}),
    ...readBufferFields(args.terminal)
  }
  for (const [key, value] of Object.entries(args.extra ?? {})) {
    if (Object.keys(fields).length >= MAX_FIELDS) {
      break
    }
    if (value !== undefined && value !== null) {
      fields[key] = value
    }
  }
  try {
    const pending = write('terminal-restore', fields)
    if (pending && typeof pending.catch === 'function') {
      pending.catch(() => {})
    }
  } catch {
    // A troubleshooting aid must never break the restore it observes.
  }
}
