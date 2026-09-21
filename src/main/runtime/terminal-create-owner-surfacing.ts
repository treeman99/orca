// Fork: folds the worker-column anchor into upstream's ownerSurfacing spread so
// orca-runtime-create-terminal.ts carries no extra line and stays inside max-lines (README §6).
import { ownerSurfacing } from './orca-runtime-core'
import type { TerminalPaneGroupPlacement } from '../../shared/terminal-pane-placement'

export function ownerSurfacingWithPaneGroup(
  shouldSurface: boolean,
  paneGroupPlacement?: TerminalPaneGroupPlacement
): { surfaceOwner?: false; paneGroupPlacement?: TerminalPaneGroupPlacement } {
  return {
    ...ownerSurfacing(shouldSurface),
    ...(paneGroupPlacement ? { paneGroupPlacement } : {})
  }
}
