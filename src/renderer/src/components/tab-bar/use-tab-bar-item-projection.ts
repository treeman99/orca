import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { GitFileStatus } from '../../../../shared/git-status-types'
import type { Tab } from '../../../../shared/tab-types'
import type { TabBarProps } from './tab-bar-props'
import {
  buildOrderedTabItems,
  buildTabDropIndicators,
  buildTabStripLayoutKey,
  findActiveVisibleTabId,
  type TabBarItem
} from './tab-bar-item-model'
import type { DropIndicator } from './drop-indicator'

export type TabBarItemProjection = {
  orderedItems: TabBarItem[]
  sortableIds: string[]
  dropIndicatorByVisibleId: Map<string, DropIndicator>
  activeVisibleTabId: string | null
  tabStripLayoutKey: string
}

export function useTabBarItemProjection({
  props,
  resolvedGroupId,
  unifiedTabs,
  unifiedTabByVisibleId,
  generatedTabTitlesEnabled,
  statusByRelativePath
}: {
  props: TabBarProps
  resolvedGroupId: string
  unifiedTabs: readonly Tab[]
  unifiedTabByVisibleId: Map<string, Tab>
  generatedTabTitlesEnabled: boolean
  statusByRelativePath: Map<string, GitFileStatus>
}): TabBarItemProjection {
  const {
    tabs,
    editorFiles,
    browserTabs,
    tabBarOrder,
    hoveredTabInsertion,
    activeTabId,
    activeFileId,
    activeBrowserTabId,
    activeSimulatorTabId,
    activeTabType,
    expandedPaneByTabId
  } = props
  const terminalMap = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs])
  const editorMap = useMemo(
    () => new Map((editorFiles ?? []).map((file) => [file.tabId ?? file.id, file])),
    [editorFiles]
  )
  const browserMap = useMemo(
    () => new Map((browserTabs ?? []).map((tab) => [tab.id, tab])),
    [browserTabs]
  )
  const terminalIds = useMemo(() => tabs.map((tab) => tab.id), [tabs])
  const editorFileIds = useMemo(
    () => editorFiles?.map((file) => file.tabId ?? file.id) ?? [],
    [editorFiles]
  )
  const browserTabIds = useMemo(() => browserTabs?.map((tab) => tab.id) ?? [], [browserTabs])
  const simulatorTabIds = useMemo(
    () =>
      unifiedTabs
        .filter((tab) => tab.groupId === resolvedGroupId && tab.contentType === 'simulator')
        .map((tab) => tab.id),
    [unifiedTabs, resolvedGroupId]
  )
  const orderedItems = useMemo(
    () =>
      buildOrderedTabItems({
        tabBarOrder,
        terminalIds,
        editorFileIds,
        browserTabIds,
        simulatorTabIds,
        terminalMap,
        editorMap,
        browserMap,
        unifiedTabByVisibleId
      }),
    [
      tabBarOrder,
      terminalIds,
      editorFileIds,
      browserTabIds,
      simulatorTabIds,
      terminalMap,
      editorMap,
      browserMap,
      unifiedTabByVisibleId
    ]
  )
  const poppedOutTabIds = useAppStore((state) => state.poppedOutTabIds)
  // Why: a detached tab keeps its store entry so its panes stay alive; it just
  // must not appear in this window's strip while another window renders it.
  const visibleItems = useMemo(() => {
    if (poppedOutTabIds.length === 0) {
      return orderedItems
    }
    const detached = new Set(poppedOutTabIds)
    return orderedItems.filter((item) => {
      const unifiedTab = unifiedTabByVisibleId.get(item.id)
      return !unifiedTab || !detached.has(unifiedTab.id)
    })
  }, [orderedItems, poppedOutTabIds, unifiedTabByVisibleId])
  const sortableIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems])
  const activeIndicator =
    hoveredTabInsertion?.groupId === resolvedGroupId ? hoveredTabInsertion : null
  const dropIndicatorByVisibleId = useMemo(
    () => buildTabDropIndicators(visibleItems, activeIndicator),
    [activeIndicator, visibleItems]
  )
  const activeVisibleTabId = useMemo(
    () =>
      findActiveVisibleTabId(visibleItems, {
        activeTabId,
        activeFileId,
        activeBrowserTabId,
        activeSimulatorTabId,
        activeTabType
      }),
    [
      activeBrowserTabId,
      activeFileId,
      activeSimulatorTabId,
      activeTabId,
      activeTabType,
      visibleItems
    ]
  )
  const tabStripLayoutKey = useMemo(
    () =>
      buildTabStripLayoutKey(
        visibleItems,
        generatedTabTitlesEnabled,
        expandedPaneByTabId,
        statusByRelativePath
      ),
    [expandedPaneByTabId, generatedTabTitlesEnabled, visibleItems, statusByRelativePath]
  )

  return {
    orderedItems: visibleItems,
    sortableIds,
    dropIndicatorByVisibleId,
    activeVisibleTabId,
    tabStripLayoutKey
  }
}
