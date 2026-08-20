import React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

/** VS Code's incoming/outgoing counter, shared by the panel header and each repository section. */
export function VscodeScmAheadBehind({
  ahead,
  behind
}: {
  ahead: number
  behind: number
}): React.JSX.Element | null {
  if (behind <= 0 && ahead <= 0) {
    return null
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
      {behind > 0 && (
        <span className="flex items-center gap-0.5">
          <ArrowDown size={10} />
          {behind}
        </span>
      )}
      {ahead > 0 && (
        <span className="flex items-center gap-0.5">
          <ArrowUp size={10} />
          {ahead}
        </span>
      )}
    </span>
  )
}
