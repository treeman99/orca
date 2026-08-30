import { safeFitAndThen } from '@/lib/pane-manager/pane-tree-ops'
import { getFitOverrideForPty } from '@/lib/pane-manager/mobile-fit-overrides'
import { isRemoteRuntimePtyId } from './paired-parked-terminal-restore'

import type { ReattachPayloadContext } from './reattach-payload-context'
import type { ReattachPayloadSession } from './reattach-payload-session'

/** The post-restore resize half of the reattach handlers, split out only so
 *  `apply-reattach-payload.ts` stays under the max-lines cap. */
export async function fitAfterReattachRestore(
  session: ReattachPayloadSession,
  ctx: ReattachPayloadContext
): Promise<void> {
  if (!ctx.isCurrentReattachPayload()) {
    return
  }
  const reattachPtyId = session.transport.getPtyId()
  if (!reattachPtyId) {
    return
  }
  if (!getFitOverrideForPty(reattachPtyId)) {
    const gridPush = session.createReattachGridPush(ctx.attemptGeneration, reattachPtyId)
    const fit = safeFitAndThen(session.pane, 'reattach-pty-resize', gridPush.continuation, {
      shouldContinue: gridPush.shouldContinue,
      retryIfUnmeasurable: true,
      // Why only this caller: a restored floating workspace is display:none until the
      // user opens it, so dropping the grid push strands the PTY at the replay grid.
      deferIfHidden: true
    })
    session.pendingReattachFit = fit
    try {
      // Why: reattach resize is fire-and-forget, so the continuation itself requests the
      // applied-grid verification — it is the only point reached by both the immediate
      // and the deferred-until-revealed path.
      await fit.completion
    } finally {
      if (session.pendingReattachFit === fit) {
        session.pendingReattachFit = null
      }
    }
  } else if (ctx.isCurrentReattachPayload() && !isRemoteRuntimePtyId(reattachPtyId)) {
    window.api.pty.signal(reattachPtyId, 'SIGWINCH')
  }
}
