import type { PtyConnectResult } from '../pty-transport'
import type { ReattachPayloadSession } from './reattach-payload-session'

// Fork-owned: the `terminal-restore` diagnostic lines for the reattach paths, kept out of
// apply-reattach-payload.ts so upstream growth there cannot push them over max-lines.

type DiagnosticSession = Pick<ReattachPayloadSession, 'logRestoreDiagnostic'>

export function logReattachSnapshotDiagnostic(
  session: DiagnosticSession,
  connectResult: PtyConnectResult
): void {
  session.logRestoreDiagnostic?.('reattach-snapshot', {
    dims: `${connectResult.snapshotCols ?? '?'}x${connectResult.snapshotRows ?? '?'}`,
    cold: Boolean(connectResult.coldRestore),
    owner: connectResult.snapshotTerminalOwner ?? 'app'
  })
}

export function logReattachReplayDiagnostic(
  session: DiagnosticSession,
  connectResult: PtyConnectResult,
  replay: string
): void {
  session.logRestoreDiagnostic?.('reattach-replay', {
    chars: replay.length,
    cold: Boolean(connectResult.coldRestore)
  })
}

export function logColdRestoreRepaintDiagnostic(
  session: DiagnosticSession,
  coldRestore: NonNullable<PtyConnectResult['coldRestore']>,
  blankRows: number
): void {
  session.logRestoreDiagnostic?.('cold-restore-repaint', {
    dims: `${coldRestore.cols ?? '?'}x${coldRestore.rows ?? '?'}`,
    blankRows,
    chars: coldRestore.scrollback.length
  })
}
