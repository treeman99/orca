import { SquareArrowOutUpRight } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { TAB_CONTEXT_SUBMENU_CONTENT_CLASS } from './tab-context-menu-sizing'

/** "Move to New Window", plus a submenu of already-detached windows once any exist. */
export function TabPopoutMenuSection({
  unifiedTabId
}: {
  unifiedTabId: string
}): React.JSX.Element {
  const popOutTab = useAppStore((state) => state.popOutTab)
  const tabPopoutWindows = useAppStore((state) => state.tabPopoutWindows)

  if (tabPopoutWindows.length === 0) {
    return (
      <DropdownMenuItem onSelect={() => void popOutTab(unifiedTabId)}>
        <SquareArrowOutUpRight className="size-3.5 shrink-0" />
        {translate('components.tab.bar.TabPopoutMenuSection.moveToNewWindow', 'Move to New Window')}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <SquareArrowOutUpRight className="size-3.5 shrink-0" />
        {translate('components.tab.bar.TabPopoutMenuSection.moveToWindow', 'Move to Window')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={TAB_CONTEXT_SUBMENU_CONTENT_CLASS}>
        <DropdownMenuItem onSelect={() => void popOutTab(unifiedTabId)}>
          {translate('components.tab.bar.TabPopoutMenuSection.newWindow', 'New Window')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {tabPopoutWindows.map((popoutWindow) => (
          <DropdownMenuItem
            key={popoutWindow.windowKey}
            onSelect={() => void popOutTab(unifiedTabId, popoutWindow.windowKey)}
          >
            <span className="min-w-0 flex-1 truncate">{popoutWindow.title}</span>
            {popoutWindow.tabCount > 1 ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {popoutWindow.tabCount}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
