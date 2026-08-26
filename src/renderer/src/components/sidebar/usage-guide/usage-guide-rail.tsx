// The guide's section rail.
//
// One list of real <button>s, not two: a vertical rail at >=sm and a horizontal strip below
// it. Rendering both variants would duplicate every item in the accessibility tree and make
// Tab visit each section twice.

import type React from 'react'
import { cn } from '@/lib/utils'

export type UsageGuideRailItem = {
  id: string
  label: string
}

export function UsageGuideRail(props: {
  ariaLabel: string
  items: readonly UsageGuideRailItem[]
  activeId: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <nav
      aria-label={props.ariaLabel}
      className="scrollbar-sleek flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 p-2 sm:w-52 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-b-0"
    >
      {props.items.map((item, index) => {
        const active = item.id === props.activeId
        return (
          <button
            key={item.id}
            type="button"
            data-usage-guide-rail-item={item.id}
            aria-current={active ? 'true' : undefined}
            onClick={() => props.onSelect(item.id)}
            // The active wash follows the Settings nav recipe: bg-accent alone is invisible
            // on a light dialog surface, so it carries a hairline ring as well.
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-accent font-medium text-accent-foreground ring-1 ring-ring/25'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <span aria-hidden="true" className="font-mono text-[11px] text-muted-foreground">
              {index + 1}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
