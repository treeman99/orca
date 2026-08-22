import React, { useCallback, useMemo, useState } from 'react'
import { FileQuestion, GitBranch, List, ListTree, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useVscodeScmContext } from './use-vscode-scm-context'
import { useVscodeScmRepositories } from './use-vscode-scm-repositories'
import { useVscodeScmSectionMutations } from './use-vscode-scm-section-mutations'
import { VscodeScmAheadBehind } from './VscodeScmAheadBehind'
import { VscodeScmRepositorySection } from './VscodeScmRepositorySection'
import type { VscodeScmUntrackedPolicy } from './vscode-scm-resource-groups'
import type { VscodeScmRepository } from './vscode-scm-repository'
import { SourceControlDiscardDialog } from '../source-control/commit/discard-dialog'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

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
  const { repositories, refreshSubmodule, submoduleList } = useVscodeScmRepositories(scm)
  const { mutationsFor, pendingDiscard, cancelDiscard, confirmDiscard } =
    useVscodeScmSectionMutations({
      scm,
      refreshSubmodule,
      submoduleWriteSupported: submoduleList.writeSupported
    })
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  // VS Code's `git.untrackedChanges`; `mixed` folds Untracked into Changes and is its default.
  const [untrackedPolicy, setUntrackedPolicy] = useState<VscodeScmUntrackedPolicy>('mixed')
  const [collapsedRepositories, setCollapsedRepositories] = useState<ReadonlySet<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())
  const [collapsedDirectoryKeys, setCollapsedDirectoryKeys] = useState<ReadonlySet<string>>(
    new Set()
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

  const openEntryFor = useCallback(
    (repository: VscodeScmRepository, entry: GitStatusEntry) => {
      if (repository.submodulePath) {
        scm.openSubmoduleEntryDiff(repository.submodulePath, entry)
        return
      }
      scm.openEntryDiff(entry)
    },
    [scm]
  )

  // VS Code's `scm.alwaysShowRepositories` defaults to false: a single repository
  // renders with no section header at all.
  const stacked = repositories.length > 1
  const sections = useMemo(
    () =>
      repositories.map((repository) => (
        <VscodeScmRepositorySection
          key={repository.id}
          repository={repository}
          layout={stacked ? 'stacked' : 'single'}
          showHeader={stacked}
          collapsed={collapsedRepositories.has(repository.id)}
          onToggleCollapsed={() => toggleKey(setCollapsedRepositories, repository.id)}
          viewMode={viewMode}
          untrackedPolicy={untrackedPolicy}
          collapsedGroupKeys={collapsedGroups}
          onToggleGroup={(key) => toggleKey(setCollapsedGroups, key)}
          collapsedDirectoryKeys={collapsedDirectoryKeys}
          onToggleDirectory={(key) => toggleKey(setCollapsedDirectoryKeys, key)}
          onOpenEntry={(entry) => openEntryFor(repository, entry)}
          mutations={mutationsFor(repository)}
        />
      )),
    [
      collapsedDirectoryKeys,
      collapsedGroups,
      collapsedRepositories,
      mutationsFor,
      openEntryFor,
      repositories,
      stacked,
      toggleKey,
      untrackedPolicy,
      viewMode
    ]
  )

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
        <VscodeScmAheadBehind
          ahead={scm.upstreamStatus?.ahead ?? 0}
          behind={scm.upstreamStatus?.behind ?? 0}
        />
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
            onClick={() => {
              void scm.refresh()
              submoduleList.refresh()
            }}
          >
            <RefreshCw size={13} className={cn(scm.busy && 'animate-spin')} />
          </HeaderButton>
        </div>
      </div>

      {stacked ? (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">{sections}</div>
      ) : (
        sections
      )}

      <SourceControlDiscardDialog
        pendingDiscard={pendingDiscard}
        onCancel={cancelDiscard}
        onConfirm={confirmDiscard}
      />
    </div>
  )
}
