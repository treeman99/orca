import type React from 'react'
import { translate } from '@/i18n/i18n'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { LeftSidebarLane } from '@/store/slices/left-sidebar-lane'

type SidebarLaneSwitchProps = {
  lane: LeftSidebarLane
  botCount: number
  onSelectLane: (lane: LeftSidebarLane) => void
}

// Matches the right sidebar's explorer switch so both rails read as one control family.
const LANE_ITEM_CLASS =
  'h-full min-w-0 flex-1 shrink rounded-sm px-2 text-[11px] font-normal text-muted-foreground transition-[color,background-color,box-shadow] hover:bg-background/40 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:hover:bg-background data-[state=on]:hover:text-foreground'

export function SidebarLaneSwitch({
  lane,
  botCount,
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
      className="mx-2 mt-2 flex h-7 items-center gap-0.5 rounded-md bg-input/40 p-0.5"
    >
      <ToggleGroupItem value="sessions" aria-label={sessionsLabel} className={LANE_ITEM_CLASS}>
        {sessionsLabel}
      </ToggleGroupItem>
      <ToggleGroupItem value="bots" aria-label={botsLabel} className={LANE_ITEM_CLASS}>
        <span className="flex items-center justify-center gap-1">
          {botsLabel}
          {botCount > 0 ? (
            <span className="text-[10px] tabular-nums text-muted-foreground/70">{botCount}</span>
          ) : null}
        </span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export default SidebarLaneSwitch
