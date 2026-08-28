import { AgentTerminalPreview } from '@/components/dashboard-popout/AgentTerminalPreview'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TerminalPaneLayoutNode } from '../../../../shared/terminal-tab-types'

// Why: a detached tab is a working terminal, not the dashboard's peek — request
// real history so scrolling back in the pop-out matches the pane it replaced.
const DETACHED_SCROLLBACK_ROWS = 1000

type PaneNodeProps = {
  node: TerminalPaneLayoutNode
  ptyIdsByLeafId: Record<string, string>
}

function PaneNode({ node, ptyIdsByLeafId }: PaneNodeProps): React.JSX.Element {
  if (node.type === 'leaf') {
    const ptyId = ptyIdsByLeafId[node.leafId]
    if (!ptyId) {
      return (
        <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
          {translate(
            'tabPopout.paneUnavailable',
            'This pane has no live terminal. Close the window to return the tab.'
          )}
        </div>
      )
    }
    return (
      <AgentTerminalPreview
        ptyId={ptyId}
        scrollbackRows={DETACHED_SCROLLBACK_ROWS}
        className="h-full w-full"
      />
    )
  }

  // 'vertical' splits along width (side by side); 'horizontal' splits along height.
  const ratio =
    typeof node.ratio === 'number' && node.ratio > 0 && node.ratio < 1 ? node.ratio : 0.5
  return (
    <div
      className={cn(
        'flex h-full w-full gap-px',
        node.direction === 'vertical' ? 'flex-row' : 'flex-col'
      )}
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flex: ratio }}>
        <PaneNode node={node.first} ptyIdsByLeafId={ptyIdsByLeafId} />
      </div>
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flex: 1 - ratio }}>
        <PaneNode node={node.second} ptyIdsByLeafId={ptyIdsByLeafId} />
      </div>
    </div>
  )
}

/** Renders a detached terminal tab's whole pane tree, preserving its split layout. */
export function TabPopoutTerminalPanes({
  root,
  ptyIdsByLeafId
}: {
  root: TerminalPaneLayoutNode | null
  ptyIdsByLeafId: Record<string, string>
}): React.JSX.Element {
  if (!root) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        {translate('tabPopout.noPanes', 'This tab has no terminal panes to show.')}
      </div>
    )
  }
  return (
    <div className="h-full w-full bg-background">
      <PaneNode node={root} ptyIdsByLeafId={ptyIdsByLeafId} />
    </div>
  )
}
