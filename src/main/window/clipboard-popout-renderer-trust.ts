import type { WebContents } from 'electron'
import { isDashboardPopoutRenderer } from './dashboard-popout-window'
import { isTabPopoutRenderer } from './tab-popout-renderer-trust'

/**
 * Terminal copy/paste also runs in the fork's detached tab windows, under the dashboard popout's
 * limits (no image, file, or remote clipboard). Imported under upstream's predicate name so the
 * clipboard gate stays byte-identical to upstream, whose file sits at its max-lines cap.
 */
export function isDashboardOrTabPopoutRenderer(sender: WebContents): boolean {
  return isDashboardPopoutRenderer(sender) || isTabPopoutRenderer(sender)
}
