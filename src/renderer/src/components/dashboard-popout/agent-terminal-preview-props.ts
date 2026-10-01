// Fork-owned: the preview's props live here so the tab pop-out's `scrollbackRows` does not push
// AgentTerminalPreview.tsx over the max-lines cap that upstream fills to the line.
import type { DashboardCardTerminalInput } from '../../../../shared/dashboard-snapshot'

export type AgentTerminalPreviewProps = {
  ptyId: string
  /** Host-input facts relayed with the card; null routes bytes by client OS. */
  terminalInput?: DashboardCardTerminalInput | null
  className?: string
  /** History rows to request. The dashboard peeks; a detached tab wants real scrollback. */
  scrollbackRows?: number
}
