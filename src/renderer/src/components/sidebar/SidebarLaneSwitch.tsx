import type React from 'react'
import { Bot, PanelsTopLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { LeftSidebarLane } from '@/store/slices/left-sidebar-lane'

type SidebarLaneSwitchProps = {
  lane: LeftSidebarLane
  botCount: number
  unreadBotCount: number
  onSelectLane: (lane: LeftSidebarLane) => void
}

// 13px + h-9: the sidebar's own item size (STYLEGUIDE §type scale), not the 11px meta size the
// right rail's inline view switch uses. This strip is a primary destination, not a filter.
const LANE_ITEM_CLASS =
  'h-full min-w-0 flex-1 shrink rounded-[5px] px-3 text-[13px] font-normal text-muted-foreground transition-[color,background-color,box-shadow] hover:bg-background/40 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:hover:bg-background data-[state=on]:hover:text-foreground'

export function SidebarLaneSwitch({
  lane,
  botCount,
  unreadBotCount,
  onSelectLane
}: SidebarLaneSwitchProps): React.JSX.Element {
  const sessionsLabel = translate(
    'auto.components.sidebar.SidebarLaneSwitch.3f1a08c9d2',
    'Sessions'
  )
  const botsLabel = translate('auto.components.sidebar.SidebarLaneSwitch.7b62e4a1c5', 'Bots')

  return (
    <ToggleGroup
      type="single"
      value={lane}
      onValueChange={(value) => {
        // Radix emits '' when the active item is clicked again; keep the lane instead of
        // dropping the sidebar into a state with no roster at all.
        if (value === 'sessions' || value === 'bots') {
          onSelectLane(value)
        }
      }}
      aria-label={translate(
        'auto.components.sidebar.SidebarLaneSwitch.9d40b7f6ae',
        'Sidebar list mode'
      )}
      className="mx-2 mt-2 flex h-9 items-center gap-1 rounded-md bg-input/40 p-1"
    >
      <ToggleGroupItem value="sessions" aria-label={sessionsLabel} className={LANE_ITEM_CLASS}>
        <span className="flex items-center justify-center gap-1.5">
          <PanelsTopLeft className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="truncate">{sessionsLabel}</span>
        </span>
      </ToggleGroupItem>
      <ToggleGroupItem value="bots" aria-label={botsLabel} className={LANE_ITEM_CLASS}>
        <span className="flex items-center justify-center gap-1.5">
          <Bot className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="truncate">{botsLabel}</span>
          {unreadBotCount > 0 ? (
            // Unread beats the plain count: a waiting message is the reason to switch lanes.
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] leading-none font-medium tabular-nums text-primary-foreground">
              {unreadBotCount > 9 ? '9+' : unreadBotCount}
            </span>
          ) : botCount > 0 ? (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
              {botCount}
            </span>
          ) : null}
        </span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export default SidebarLaneSwitch
