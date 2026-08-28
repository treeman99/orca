import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TabPopoutContext } from '../../../../shared/tab-popout'

/** Tab strip for a detached window holding several tabs. Selecting switches the
 *  rendered tab; closing returns that tab to the main window. */
export function TabPopoutTabStrip({
  tabs,
  activeTabId,
  onSelect,
  onReturn
}: {
  tabs: TabPopoutContext[]
  activeTabId: string | null
  onSelect: (tabId: string) => void
  onReturn: (tabId: string) => void
}): React.JSX.Element {
  return (
    <div
      role="tablist"
      className="flex min-w-0 shrink-0 items-stretch gap-px overflow-x-auto border-b border-border bg-muted/30"
    >
      {tabs.map((tab) => {
        const isActive = tab.tabId === activeTabId
        return (
          <div
            key={tab.tabId}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            title={tab.title}
            onClick={() => onSelect(tab.tabId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(tab.tabId)
              }
            }}
            className={cn(
              'group flex min-w-0 max-w-52 cursor-default items-center gap-1.5 px-2.5 py-1.5 text-xs',
              isActive
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-background/60'
            )}
          >
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
            <button
              type="button"
              aria-label={translate('tabPopout.returnTab', 'Return tab to main window')}
              className="shrink-0 rounded-sm p-0.5 opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation()
                onReturn(tab.tabId)
              }}
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
