import React, { useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { VscodeScmCommitBox } from './VscodeScmCommitBox'
import { VscodeScmGroupSection, type VscodeScmGroupAction } from './VscodeScmGroupSection'
import { VscodeScmRepositoryHeader } from './VscodeScmRepositoryHeader'
import type { VscodeScmRowAction } from './VscodeScmResourceRow'
import {
  resolveVscodeScmActionButton,
  type VscodeScmActionButton
} from './vscode-scm-action-button'
import {
  buildVscodeScmResourceGroups,
  getVisibleVscodeScmGroups,
  isMergeGroupEntry,
  type VscodeScmGroupId,
  type VscodeScmResourceGroup,
  type VscodeScmUntrackedPolicy
} from './vscode-scm-resource-groups'
import type { VscodeScmRepository } from './vscode-scm-repository'
import type { PendingDiscardConfirmation } from '../source-control-discard-dialog'
import { canDiscardStatusEntry, canStageStatusEntry } from '../source-control-entry-actions'
import type { DiscardAllArea } from '../discard-all-sequence'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'
import { MAX_DETECTED_SUBMODULES } from '../../../../../shared/git-submodule-list'

const DISCARD_AREA_BY_GROUP: Partial<Record<VscodeScmGroupId, DiscardAllArea>> = {
  index: 'staged',
  workingTree: 'unstaged',
  untracked: 'untracked'
}

/**
 * Everything a repository section needs to change its own repository. Null makes the
 * section read-only, which is what a section whose status could not be read gets.
 *
 * `unavailableReason` is the other axis: the section CAN be driven in principle, but this
 * host cannot do it (an older remote that predates the submodule write RPCs). Those
 * actions stay visible and disabled with the reason as their tooltip, because a silently
 * missing button reads as a panel bug rather than a host limitation.
 */
export type VscodeScmRepositoryMutations = {
  busy: boolean
  unavailableReason: string | null
  error: string | null
  onDismissError: () => void
  message: string
  onMessageChange: (next: string) => void
  smartCommit: boolean
  onToggleSmartCommit: () => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onRequestDiscard: (pending: PendingDiscardConfirmation) => void
  onRun: (button: VscodeScmActionButton) => void
}

function stripPrefix(keys: ReadonlySet<string>, prefix: string): ReadonlySet<string> {
  const stripped = new Set<string>()
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      stripped.add(key.slice(prefix.length))
    }
  }
  return stripped
}

function SectionNotice({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">{children}</p>
}

function statusNotice(repository: VscodeScmRepository): React.JSX.Element | null {
  switch (repository.status.kind) {
    case 'loading':
      return (
        <SectionNotice>
          {translate(
            'auto.components.right.sidebar.vscodeSourceControl.submoduleLoading',
            'Reading submodule status…'
          )}
        </SectionNotice>
      )
    case 'uninitialized':
      return (
        <SectionNotice>
          {translate(
            'auto.components.right.sidebar.vscodeSourceControl.submoduleNotInitialized',
            'This submodule is not checked out yet. Run git submodule update --init to see its changes.'
          )}
        </SectionNotice>
      )
    case 'failed':
      return <SectionNotice>{repository.status.message}</SectionNotice>
    case 'loaded':
      return repository.entries.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.vscodeSourceControl.noChanges',
            'No changes detected.'
          )}
        </p>
      ) : null
  }
}

export function VscodeScmRepositorySection({
  repository,
  layout,
  showHeader,
  collapsed,
  onToggleCollapsed,
  viewMode,
  untrackedPolicy,
  collapsedGroupKeys,
  onToggleGroup,
  collapsedDirectoryKeys,
  onToggleDirectory,
  onOpenEntry,
  mutations
}: {
  repository: VscodeScmRepository
  /** `single` owns the panel's scroll area; `stacked` scrolls with its siblings. */
  layout: 'single' | 'stacked'
  showHeader: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  viewMode: 'list' | 'tree'
  untrackedPolicy: VscodeScmUntrackedPolicy
  collapsedGroupKeys: ReadonlySet<string>
  onToggleGroup: (key: string) => void
  collapsedDirectoryKeys: ReadonlySet<string>
  onToggleDirectory: (key: string) => void
  onOpenEntry: (entry: GitStatusEntry) => void
  mutations: VscodeScmRepositoryMutations | null
}): React.JSX.Element {
  // NUL separator: a repository id is a path, which can hold spaces but never this.
  const keyPrefix = `${repository.id}\u0000`
  const busy = mutations?.busy ?? false
  const writeDisabledReason = mutations?.unavailableReason ?? null

  const groups = useMemo(
    () => buildVscodeScmResourceGroups(repository.entries, untrackedPolicy),
    [repository.entries, untrackedPolicy]
  )
  const visibleGroups = useMemo(() => getVisibleVscodeScmGroups(groups), [groups])
  // Why scoped per repository: two repositories routinely hold the same directory
  // name, and a shared key set would collapse `src` in both at once.
  const scopedDirectoryKeys = useMemo(
    () => stripPrefix(collapsedDirectoryKeys, keyPrefix),
    [collapsedDirectoryKeys, keyPrefix]
  )

  const actionButton = useMemo(() => {
    const byId = (id: VscodeScmGroupId): number =>
      groups.find((group) => group.id === id)?.entries.length ?? 0
    return resolveVscodeScmActionButton({
      stagedCount: byId('index'),
      unstagedCount: byId('workingTree'),
      untrackedCount: byId('untracked'),
      unresolvedConflictCount: repository.entries.filter(
        (entry) => isMergeGroupEntry(entry) && entry.conflictStatus === 'unresolved'
      ).length,
      commitMessage: mutations?.message ?? '',
      smartCommit: mutations?.smartCommit ?? false,
      hasBranch: repository.branch !== null,
      hasUpstream: repository.upstreamStatus?.hasUpstream ?? false,
      hasConfiguredPushTarget: repository.upstreamStatus?.hasConfiguredPushTarget ?? false,
      ahead: repository.upstreamStatus?.ahead ?? 0,
      behind: repository.upstreamStatus?.behind ?? 0,
      conflictOperation: repository.conflictOperation,
      busy
    })
  }, [busy, groups, mutations?.message, mutations?.smartCommit, repository])

  const handleRowAction = useCallback(
    (action: VscodeScmRowAction, entry: GitStatusEntry) => {
      if (!mutations) {
        return
      }
      if (action === 'stage') {
        mutations.onStage([entry.path])
        return
      }
      if (action === 'unstage') {
        mutations.onUnstage([entry.path])
        return
      }
      mutations.onRequestDiscard({ kind: 'entry', entry })
    },
    [mutations]
  )

  const handleGroupAction = useCallback(
    (action: VscodeScmGroupAction, group: VscodeScmResourceGroup) => {
      if (!mutations) {
        return
      }
      if (action === 'stage-all') {
        mutations.onStage(group.entries.filter(canStageStatusEntry).map((entry) => entry.path))
        return
      }
      if (action === 'unstage-all') {
        mutations.onUnstage(group.entries.map((entry) => entry.path))
        return
      }
      const area = DISCARD_AREA_BY_GROUP[group.id]
      const paths = group.entries.filter(canDiscardStatusEntry).map((entry) => entry.path)
      if (!area || paths.length === 0) {
        return
      }
      mutations.onRequestDiscard({ kind: 'area', area, paths })
    },
    [mutations]
  )

  const notice = statusNotice(repository)

  return (
    <div
      data-repository={repository.id}
      className={cn('flex flex-col', layout === 'single' && 'min-h-0 flex-1')}
    >
      {showHeader && (
        <VscodeScmRepositoryHeader
          repository={repository}
          changeCount={repository.entries.length}
          collapsed={collapsed}
          onToggle={onToggleCollapsed}
        />
      )}

      {!collapsed && (
        <>
          {mutations?.error && (
            <div className="flex items-start gap-2 border-b border-border bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
              <span className="min-w-0 flex-1 break-words">{mutations.error}</span>
              <button
                type="button"
                onClick={mutations.onDismissError}
                aria-label={translate(
                  'auto.components.right.sidebar.vscodeSourceControl.dismissError',
                  'Dismiss'
                )}
                className="shrink-0 rounded-sm p-0.5 hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {repository.detectionTruncated && (
            <p className="border-b border-border px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {translate(
                'sourceControl.submoduleDetectionLimit',
                'Only the first {{count}} submodules are shown. The rest are not listed here.',
                { count: MAX_DETECTED_SUBMODULES }
              )}
            </p>
          )}

          {repository.truncated && (
            <p className="border-b border-border px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.vscodeSourceControl.tooManyChanges',
                'Too many changes to list. Ignore the folder that is flooding status, then refresh.'
              )}
            </p>
          )}

          {mutations && (
            <VscodeScmCommitBox
              message={mutations.message}
              onMessageChange={mutations.onMessageChange}
              actionButton={actionButton}
              branch={repository.branch?.name ?? null}
              smartCommit={mutations.smartCommit}
              onToggleSmartCommit={mutations.onToggleSmartCommit}
              disabledReason={writeDisabledReason}
              onRun={() => mutations.onRun(actionButton)}
            />
          )}

          <div
            className={cn(layout === 'single' && 'scrollbar-sleek min-h-0 flex-1 overflow-y-auto')}
          >
            {notice ??
              visibleGroups.map((group) => (
                <VscodeScmGroupSection
                  key={group.id}
                  group={group}
                  viewMode={viewMode}
                  collapsed={collapsedGroupKeys.has(`${keyPrefix}${group.id}`)}
                  collapsedDirectoryKeys={scopedDirectoryKeys}
                  busy={busy}
                  readOnly={mutations === null}
                  role={repository.role}
                  writeDisabledReason={writeDisabledReason}
                  onToggleCollapsed={() => onToggleGroup(`${keyPrefix}${group.id}`)}
                  onToggleDirectory={(key) => onToggleDirectory(`${keyPrefix}${key}`)}
                  onGroupAction={handleGroupAction}
                  onRowAction={handleRowAction}
                  onOpenEntry={onOpenEntry}
                />
              ))}
          </div>
        </>
      )}
    </div>
  )
}
