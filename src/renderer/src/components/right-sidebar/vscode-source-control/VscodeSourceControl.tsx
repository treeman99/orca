import React, { useCallback, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  FileQuestion,
  GitBranch,
  List,
  ListTree,
  RefreshCw,
  X
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useVscodeScmContext } from './use-vscode-scm-context'
import { VscodeScmCommitBox } from './VscodeScmCommitBox'
import { VscodeScmGroupSection, type VscodeScmGroupAction } from './VscodeScmGroupSection'
import type { VscodeScmRowAction } from './VscodeScmResourceRow'
import { resolveVscodeScmActionButton } from './vscode-scm-action-button'
import {
  buildVscodeScmResourceGroups,
  getVisibleVscodeScmGroups,
  isMergeGroupEntry,
  type VscodeScmGroupId,
  type VscodeScmResourceGroup,
  type VscodeScmUntrackedPolicy
} from './vscode-scm-resource-groups'
import {
  SourceControlDiscardDialog,
  type PendingDiscardConfirmation
} from '../source-control-discard-dialog'
import { canDiscardStatusEntry, canStageStatusEntry } from '../source-control-entry-actions'
import type { DiscardAllArea } from '../discard-all-sequence'
import type { GitStatusEntry } from '../../../../../shared/types'

const DISCARD_AREA_BY_GROUP: Partial<Record<VscodeScmGroupId, DiscardAllArea>> = {
  index: 'staged',
  workingTree: 'unstaged',
  untracked: 'untracked'
}

function HeaderButton({
  label,
  active,
  disabled,
  onClick,
  children
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
            active && 'bg-accent text-accent-foreground'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function VscodeSourceControl(): React.JSX.Element {
  const scm = useVscodeScmContext()
  const [messageByWorktree, setMessageByWorktree] = useState<Record<string, string>>({})
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  // VS Code's `git.untrackedChanges`; `mixed` folds Untracked into Changes and is its default.
  const [untrackedPolicy, setUntrackedPolicy] = useState<VscodeScmUntrackedPolicy>('mixed')
  const [smartCommit, setSmartCommit] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())
  const [collapsedDirectoryKeys, setCollapsedDirectoryKeys] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscardConfirmation | null>(null)

  const messageKey = scm.worktreeId ?? ''
  const message = messageByWorktree[messageKey] ?? ''
  const setMessage = useCallback(
    (next: string) => setMessageByWorktree((prev) => ({ ...prev, [messageKey]: next })),
    [messageKey]
  )

  const groups = useMemo(
    () => buildVscodeScmResourceGroups(scm.entries, untrackedPolicy),
    [scm.entries, untrackedPolicy]
  )
  const visibleGroups = useMemo(() => getVisibleVscodeScmGroups(groups), [groups])
  const counts = useMemo(() => {
    const byId = (id: VscodeScmGroupId): number =>
      groups.find((group) => group.id === id)?.entries.length ?? 0
    return {
      staged: byId('index'),
      workingTree: byId('workingTree'),
      untracked: byId('untracked'),
      unresolvedConflicts: scm.entries.filter(
        (entry) => isMergeGroupEntry(entry) && entry.conflictStatus === 'unresolved'
      ).length
    }
  }, [groups, scm.entries])

  const actionButton = useMemo(
    () =>
      resolveVscodeScmActionButton({
        stagedCount: counts.staged,
        unstagedCount: counts.workingTree,
        untrackedCount: counts.untracked,
        unresolvedConflictCount: counts.unresolvedConflicts,
        commitMessage: message,
        smartCommit,
        hasBranch: scm.branch !== null,
        hasUpstream: scm.upstreamStatus?.hasUpstream ?? false,
        hasConfiguredPushTarget: scm.upstreamStatus?.hasConfiguredPushTarget ?? false,
        ahead: scm.upstreamStatus?.ahead ?? 0,
        behind: scm.upstreamStatus?.behind ?? 0,
        conflictOperation: scm.conflictOperation,
        busy: scm.busy
      }),
    [counts, message, scm.branch, scm.busy, scm.conflictOperation, scm.upstreamStatus, smartCommit]
  )

  const toggleKey = useCallback(
    (setter: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>, key: string) => {
      setter((prev) => {
        const next = new Set(prev)
        if (!next.delete(key)) {
          next.add(key)
        }
        return next
      })
    },
    []
  )

  const handleRunAction = useCallback(async () => {
    if (actionButton.kind === 'publish') {
      await scm.publish()
      return
    }
    if (actionButton.kind === 'sync') {
      await scm.sync()
      return
    }
    if (actionButton.kind !== 'commit') {
      return
    }
    const committed = await scm.commit(message, { stageAllFirst: actionButton.stagesAllFirst })
    if (committed) {
      setMessage('')
    }
  }, [actionButton.kind, actionButton.stagesAllFirst, message, scm, setMessage])

  const handleRowAction = useCallback(
    (action: VscodeScmRowAction, entry: GitStatusEntry) => {
      if (action === 'stage') {
        void scm.stage([entry.path])
        return
      }
      if (action === 'unstage') {
        void scm.unstage([entry.path])
        return
      }
      setPendingDiscard({ kind: 'entry', entry })
    },
    [scm]
  )

  const handleGroupAction = useCallback(
    (action: VscodeScmGroupAction, group: VscodeScmResourceGroup) => {
      if (action === 'stage-all') {
        void scm.stage(group.entries.filter(canStageStatusEntry).map((entry) => entry.path))
        return
      }
      if (action === 'unstage-all') {
        void scm.unstage(group.entries.map((entry) => entry.path))
        return
      }
      const area = DISCARD_AREA_BY_GROUP[group.id]
      const paths = group.entries.filter(canDiscardStatusEntry).map((entry) => entry.path)
      if (!area || paths.length === 0) {
        return
      }
      setPendingDiscard({ kind: 'area', area, paths })
    },
    [scm]
  )

  const confirmDiscard = useCallback(() => {
    if (!pendingDiscard) {
      return
    }
    const paths =
      pendingDiscard.kind === 'entry' ? [pendingDiscard.entry.path] : [...pendingDiscard.paths]
    setPendingDiscard(null)
    void scm.discard(paths)
  }, [pendingDiscard, scm])

  if (!scm.ready) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.vscodeSourceControl.noGitWorkspace',
          'Open a Git worktree to use Source Control.'
        )}
      </div>
    )
  }

  const ahead = scm.upstreamStatus?.ahead ?? 0
  const behind = scm.upstreamStatus?.behind ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[28px] shrink-0 items-center gap-1 border-b border-border px-2">
        <GitBranch size={12} className="shrink-0 text-muted-foreground" />
        <span className="truncate text-xs" title={scm.branch ?? undefined}>
          {scm.branch ??
            translate(
              'auto.components.right.sidebar.vscodeSourceControl.detachedHead',
              'Detached HEAD'
            )}
        </span>
        {(behind > 0 || ahead > 0) && (
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
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <HeaderButton
            label={
              viewMode === 'list'
                ? translate(
                    'auto.components.right.sidebar.vscodeSourceControl.viewAsTree',
                    'View as Tree'
                  )
                : translate(
                    'auto.components.right.sidebar.vscodeSourceControl.viewAsList',
                    'View as List'
                  )
            }
            onClick={() => setViewMode((prev) => (prev === 'list' ? 'tree' : 'list'))}
          >
            {viewMode === 'list' ? <ListTree size={13} /> : <List size={13} />}
          </HeaderButton>
          <HeaderButton
            label={
              untrackedPolicy === 'mixed'
                ? translate(
                    'auto.components.right.sidebar.vscodeSourceControl.separateUntracked',
                    'Show Untracked as a separate group'
                  )
                : translate(
                    'auto.components.right.sidebar.vscodeSourceControl.mixUntracked',
                    'Fold Untracked into Changes'
                  )
            }
            active={untrackedPolicy === 'separate'}
            onClick={() => setUntrackedPolicy((prev) => (prev === 'mixed' ? 'separate' : 'mixed'))}
          >
            <FileQuestion size={13} />
          </HeaderButton>
          <HeaderButton
            label={translate(
              'auto.components.right.sidebar.vscodeSourceControl.refresh',
              'Refresh'
            )}
            disabled={scm.busy}
            onClick={() => void scm.refresh()}
          >
            <RefreshCw size={13} className={cn(scm.busy && 'animate-spin')} />
          </HeaderButton>
        </div>
      </div>

      {scm.lastError && (
        <div className="flex items-start gap-2 border-b border-border bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
          <span className="min-w-0 flex-1 break-words">{scm.lastError}</span>
          <button
            type="button"
            onClick={scm.clearError}
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

      {scm.repositoryHuge && (
        <p className="border-b border-border px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.vscodeSourceControl.tooManyChanges',
            'Too many changes to list. Ignore the folder that is flooding status, then refresh.'
          )}
        </p>
      )}

      <VscodeScmCommitBox
        message={message}
        onMessageChange={setMessage}
        actionButton={actionButton}
        branch={scm.branch}
        smartCommit={smartCommit}
        onToggleSmartCommit={() => setSmartCommit((prev) => !prev)}
        onRun={() => void handleRunAction()}
      />

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {scm.entries.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.vscodeSourceControl.noChanges',
              'No changes detected.'
            )}
          </p>
        ) : (
          visibleGroups.map((group) => (
            <VscodeScmGroupSection
              key={group.id}
              group={group}
              viewMode={viewMode}
              collapsed={collapsedGroups.has(group.id)}
              collapsedDirectoryKeys={collapsedDirectoryKeys}
              busy={scm.busy}
              onToggleCollapsed={() => toggleKey(setCollapsedGroups, group.id)}
              onToggleDirectory={(key) => toggleKey(setCollapsedDirectoryKeys, key)}
              onGroupAction={handleGroupAction}
              onRowAction={handleRowAction}
              onOpenEntry={scm.openEntryDiff}
            />
          ))
        )}
      </div>

      <SourceControlDiscardDialog
        pendingDiscard={pendingDiscard}
        onCancel={() => setPendingDiscard(null)}
        onConfirm={confirmDiscard}
      />
    </div>
  )
}
