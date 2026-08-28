import { useEffect, useState } from 'react'
import { PanelTopOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { TabPopoutWindowState } from '../../../../shared/tab-popout'
import { TabPopoutTabStrip } from './TabPopoutTabStrip'
import { TabPopoutTerminalPanes } from './TabPopoutTerminalPanes'

function readWindowKeyFromLocation(): string | null {
  const windowKey = new URLSearchParams(window.location.search).get('win')
  return windowKey && windowKey.length > 0 ? windowKey : null
}

function TabPopoutMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** Root of a detached-tab window. The main renderer still owns these tabs; this
 *  window renders the active one and can hand any of them back. */
export function TabPopoutRoot(): React.JSX.Element {
  const [windowKey] = useState(readWindowKeyFromLocation)
  const [state, setState] = useState<TabPopoutWindowState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!windowKey) {
      setLoading(false)
      return
    }
    let disposed = false
    void window.api.tabPopout
      .requestWindowState(windowKey)
      .then((next) => {
        if (!disposed) {
          setState(next)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!disposed) {
          setLoading(false)
        }
      })
    const off = window.api.tabPopout.onWindowStateChanged((next) => {
      if (!disposed && next.windowKey === windowKey) {
        setState(next)
      }
    })
    return () => {
      disposed = true
      off()
    }
  }, [windowKey])

  const activeTab = state?.tabs.find((tab) => tab.tabId === state.activeTabId) ?? null

  useEffect(() => {
    if (activeTab?.title) {
      document.title = activeTab.title
    }
  }, [activeTab?.title])

  if (loading) {
    return <TabPopoutMessage>{translate('tabPopout.loading', 'Opening tab…')}</TabPopoutMessage>
  }
  if (!windowKey || !state || state.tabs.length === 0 || !activeTab) {
    return (
      <TabPopoutMessage>
        {translate(
          'tabPopout.unavailable',
          'This tab is no longer detached. You can close this window.'
        )}
      </TabPopoutMessage>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      {state.tabs.length > 1 ? (
        <TabPopoutTabStrip
          tabs={state.tabs}
          activeTabId={state.activeTabId}
          onSelect={(tabId) => void window.api.tabPopout.activate(tabId)}
          onReturn={(tabId) => void window.api.tabPopout.returnTab(tabId)}
        />
      ) : null}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{activeTab.title}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-xs"
          onClick={() => void window.api.tabPopout.focusInMainWindow(activeTab.tabId)}
        >
          <PanelTopOpen size={13} />
          {translate('tabPopout.returnToMainWindow', 'Return to main window')}
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        {activeTab.contentType === 'terminal' ? (
          // Why: keyed by tab so switching remounts against the new PTY rather
          // than replaying the previous tab's snapshot into this terminal.
          <TabPopoutTerminalPanes
            key={activeTab.tabId}
            root={activeTab.layout?.root ?? null}
            ptyIdsByLeafId={activeTab.layout?.ptyIdsByLeafId ?? {}}
          />
        ) : (
          <TabPopoutMessage>
            {translate(
              'tabPopout.unsupportedTabType',
              'Only terminal tabs can be detached right now.'
            )}
          </TabPopoutMessage>
        )}
      </div>
    </div>
  )
}
