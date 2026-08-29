import { shouldBlankRestoredViewportOnReattach } from '../terminal-restored-viewport'

type RestoredViewportReattachSession = {
  hasRestoredViewportBlankingMarker: () => boolean
  consumeRestoredViewportBlankingMarker: () => boolean
  writeRestoredViewportReset: (args: { ownerProcessEnded: boolean; rows?: number }) => void
}

/**
 * A payload-less reattach leaves the layout-restored rows on screen with the PREVIOUS run's
 * cursor, so the live session overwrites them (every payload branch clears first, which is
 * what re-anchors those panes). The marker survives a repaint so a later fresh spawn in this
 * pane still blanks what the payload painted.
 */
export function clearRestoredViewportOnPayloadlessReattach(
  session: RestoredViewportReattachSession,
  cursorRepainted: boolean
): void {
  if (
    !shouldBlankRestoredViewportOnReattach({
      hasRestoredViewport: session.hasRestoredViewportBlankingMarker(),
      cursorAuthority: cursorRepainted ? 'repainted' : 'restored-buffer-only'
    })
  ) {
    return
  }
  session.consumeRestoredViewportBlankingMarker()
  // Why not ownerProcessEnded: this reattach found a LIVE session; only the payload is
  // missing, so its modes and pen are still owned.
  session.writeRestoredViewportReset({ ownerProcessEnded: false })
}
