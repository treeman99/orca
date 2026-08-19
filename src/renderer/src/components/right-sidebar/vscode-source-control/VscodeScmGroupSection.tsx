import React, { useMemo } from 'react'
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { buildVscodeScmRows } from './vscode-scm-tree-model'
import { VscodeScmDirectoryRow, VscodeScmResourceRow } from './VscodeScmResourceRow'
import type { VscodeScmRowAction } from './VscodeScmResourceRow'
import type { VscodeScmResourceGroup } from './vscode-scm-resource-groups'
import {
  canDiscardStatusEntry,
  canStageStatusEntry,
  canUnstageStatusEntry
} from '../source-control-entry-actions'
import type { GitStatusEntry } from '../../../../../shared/types'

export type VscodeScmGroupAction = 'stage-all' | 'unstage-all' | 'discard-all'

function groupLabel(group: VscodeScmResourceGroup): string {
  switch (group.id) {
    case 'merge':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.mergeChanges',
        'Merge Changes'
      )
    case 'index':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.stagedChanges',
        'Staged Changes'
      )
    case 'untracked':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.untrackedChanges',
        'Untracked Changes'
      )
    case 'workingTree':
      return translate('auto.components.right.sidebar.vscodeSourceControl.changes', 'Changes')
  }
}

function groupActions(group: VscodeScmResourceGroup): VscodeScmGroupAction[] {
  if (group.id === 'index') {
    return ['unstage-all']
  }
  if (group.id === 'merge') {
    return ['stage-all']
  }
  return ['discard-all', 'stage-all']
}

const GROUP_ACTION_ICON: Record<VscodeScmGroupAction, React.ComponentType<{ size?: number }>> = {
  'stage-all': Plus,
  'unstage-all': Minus,
  'discard-all': RotateCcw
}

function groupActionLabel(action: VscodeScmGroupAction): string {
  switch (action) {
    case 'stage-all':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.stageAllChanges',
        'Stage All Changes'
      )
    case 'unstage-all':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.unstageAllChanges',
        'Unstage All Changes'
      )
    case 'discard-all':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.discardAllChanges',
        'Discard All Changes'
      )
  }
}

function rowActionsFor(
  entry: GitStatusEntry,
  groupId: VscodeScmResourceGroup['id']
): VscodeScmRowAction[] {
  const actions: VscodeScmRowAction[] = []
  if (canDiscardStatusEntry(entry)) {
    actions.push('discard')
  }
  if (groupId === 'index' && canUnstageStatusEntry(entry)) {
    actions.push('unstage')
  }
  if (groupId !== 'index' && canStageStatusEntry(entry)) {
    actions.push('stage')
  }
  return actions
}

export function VscodeScmGroupSection({
  group,
  viewMode,
  collapsed,
  collapsedDirectoryKeys,
  busy,
  onToggleCollapsed,
  onToggleDirectory,
  onGroupAction,
  onRowAction,
  onOpenEntry
}: {
  group: VscodeScmResourceGroup
  viewMode: 'list' | 'tree'
  collapsed: boolean
  collapsedDirectoryKeys: ReadonlySet<string>
  busy: boolean
  onToggleCollapsed: () => void
  onToggleDirectory: (key: string) => void
  onGroupAction: (action: VscodeScmGroupAction, group: VscodeScmResourceGroup) => void
  onRowAction: (action: VscodeScmRowAction, entry: GitStatusEntry) => void
  onOpenEntry: (entry: GitStatusEntry) => void
}): React.JSX.Element {
  const rows = useMemo(
    () => buildVscodeScmRows(group.entries, viewMode, collapsedDirectoryKeys),
    [collapsedDirectoryKeys, group.entries, viewMode]
  )
  const Chevron = collapsed ? ChevronRight : ChevronDown
  const label = groupLabel(group)

  return (
    <section className="flex flex-col">
      <div className="group/header sticky top-0 z-10 flex h-[24px] items-center gap-1 bg-sidebar pr-1 pl-1.5">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Chevron size={12} className="shrink-0" />
          <span className="truncate">{label}</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100">
          {groupActions(group).map((action) => {
            const Icon = GROUP_ACTION_ICON[action]
            const actionLabel = groupActionLabel(action)
            return (
              <Tooltip key={action}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${actionLabel} — ${label}`}
                    disabled={busy || group.entries.length === 0}
                    onClick={() => onGroupAction(action, group)}
                    className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Icon size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{actionLabel}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] leading-4 tabular-nums text-muted-foreground">
          {group.entries.length}
        </span>
      </div>

      {!collapsed &&
        rows.map((row) =>
          row.kind === 'directory' ? (
            <VscodeScmDirectoryRow
              key={row.key}
              row={row}
              collapsed={collapsedDirectoryKeys.has(row.key)}
              onToggle={() => onToggleDirectory(row.key)}
            />
          ) : (
            <VscodeScmResourceRow
              key={row.key}
              row={row}
              entry={row.entry}
              actions={rowActionsFor(row.entry, group.id)}
              busy={busy}
              onOpen={() => onOpenEntry(row.entry)}
              onAction={(action) => onRowAction(action, row.entry)}
            />
          )
        )}
    </section>
  )
}
