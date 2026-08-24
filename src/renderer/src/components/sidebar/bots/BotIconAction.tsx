// One icon button for the bot lane's detail screen, with the two things every one of them
// was missing.
//
// `shrink-0`: these sit in flex rows next to a growing label. Without it the sidebar getting
// narrower shrinks the BUTTONS instead of the label, and the glyphs clip.
//
// A tooltip: the actions are glyph-only, so `aria-label` told a screen reader what they do and
// left everyone else guessing.

import type React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type BotIconActionProps = {
  /** Serves as both the accessible name and the tooltip copy — they must not drift apart. */
  label: string
  onClick: () => void
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function BotIconAction({
  label,
  onClick,
  children,
  side = 'bottom',
  className
}: BotIconActionProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('shrink-0', className)}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export default BotIconAction
