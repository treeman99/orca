import type { ReattachPayloadContext } from './reattach-payload-context'
import type { ReattachPayloadSession } from './reattach-payload-session'
import {
  logColdRestoreRepaintDiagnostic,
  logReattachReplayDiagnostic
} from './reattach-restore-diagnostics'
import { clearRestoredViewportOnPayloadlessReattach } from './restored-viewport-reattach-clear'

// Fork-owned: every fork call apply-reattach-payload.ts makes, one line each behind one namespace
// import, so upstream growth there cannot push that file over max-lines.
export { logReattachSnapshotDiagnostic } from './reattach-restore-diagnostics'

type ForkRestoreSession = Pick<
  ReattachPayloadSession,
  | 'writeRestoredViewportReset'
  | 'logRestoreDiagnostic'
  | 'hasRestoredViewportBlankingMarker'
  | 'consumeRestoredViewportBlankingMarker'
>

export function logReplayDiagnostic(
  session: ForkRestoreSession,
  ctx: ReattachPayloadContext
): void {
  if (ctx.connectResult?.replay) {
    logReattachReplayDiagnostic(session, ctx.connectResult, ctx.connectResult.replay)
  }
}

/** Cold-restore repaint: the restored rows belong to an ended owner, so reset them and log it. */
export function resetColdRestoredViewport(
  session: ForkRestoreSession,
  ctx: ReattachPayloadContext,
  rows: number
): void {
  session.writeRestoredViewportReset({ ownerProcessEnded: true, rows })
  if (ctx.connectResult?.coldRestore) {
    logColdRestoreRepaintDiagnostic(session, ctx.connectResult.coldRestore, rows)
  }
}

export function clearOnPayloadlessReattach(
  session: ForkRestoreSession,
  ctx: ReattachPayloadContext
): void {
  const repainted = Boolean(ctx.shouldApplyStructuralPayload || ctx.prefetchedParkModelSnapshot)
  clearRestoredViewportOnPayloadlessReattach(session, repainted)
}
