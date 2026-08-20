import React from 'react'
import { ChevronDown, ChevronRight, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { VscodeScmAheadBehind } from './VscodeScmAheadBehind'
import type { VscodeScmRepository } from './vscode-scm-repository'

/**
 * The collapsible section header VS Code shows once a window holds more than one
 * repository: folder name, the branch checked out inside it, and a change count.
 */
export function VscodeScmRepositoryHeader({
  repository,
  changeCount,
  collapsed,
  onToggle
}: {
  repository: VscodeScmRepository
  changeCount: number
  collapsed: boolean
  onToggle: () => void
}): React.JSX.Element {
  const Chevron = collapsed ? ChevronRight : ChevronDown
  const branch = repository.branch
  return (
    <div className="sticky top-0 z-20 flex h-[26px] items-center gap-1 border-b border-border bg-sidebar pr-1 pl-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={repository.title}
        className="flex min-w-0 flex-1 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Chevron size={12} className="shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{repository.name}</span>
        {branch && (
          <span
            className={cn(
              'flex min-w-0 items-center gap-0.5 text-[11px] text-muted-foreground',
              branch.differsFromParent && 'text-[var(--git-decoration-modified)]'
            )}
            title={
              branch.detached
                ? translate(
                    'sourceControl.submoduleDetachedHeadTooltip',
                    'This submodule has a detached HEAD, so it is not on any branch'
                  )
                : translate(
                    'sourceControl.submoduleBranchTooltip',
                    'Branch checked out inside this submodule'
                  )
            }
          >
            <GitBranch size={10} className="shrink-0" />
            <span className="truncate">{branch.name}</span>
            {/* Why not colour alone: the difference has to survive a colour-blind read. */}
            {branch.differsFromParent && (
              <span className="shrink-0">
                {translate('sourceControl.submoduleBranchDiffersFromParent', '(differs from root)')}
              </span>
            )}
          </span>
        )}
        <VscodeScmAheadBehind
          ahead={repository.upstreamStatus?.ahead ?? 0}
          behind={repository.upstreamStatus?.behind ?? 0}
        />
      </button>
      {changeCount > 0 && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] leading-4 tabular-nums text-muted-foreground">
          {changeCount}
        </span>
      )}
    </div>
  )
}
