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

// Full-bleed underlined tabs, not an inset pill.
//
// A pill reads as a filter over the list below it; this strip switches what the whole panel
// IS, so it takes the panel's full width and sits on the sidebar's own border like a tab bar.
// 13px is the sidebar's item size (STYLEGUIDE §type scale) — the 11px meta size belongs to the
// right rail's inline view switch, which really is a filter.
const LANE_ITEM_CLASS =
  'relative h-full min-w-0 flex-1 shrink rounded-none border-b-2 border-transparent px-2 text-[13px] font-normal text-muted-foreground transition-[color,border-color,background-color] hover:bg-worktree-sidebar-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset data-[state=on]:border-worktree-sidebar-ring data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:hover:bg-worktree-sidebar-accent/60'

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
      className="mt-1 flex h-11 w-full shrink-0 items-stretch border-y border-worktree-sidebar-border"
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
