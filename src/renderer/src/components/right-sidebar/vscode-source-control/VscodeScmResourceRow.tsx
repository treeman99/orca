import React from 'react'
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { basename, dirname } from '@/lib/path'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { getVscodeScmDecoration } from './vscode-scm-status-letter'
import { getSubmoduleRowStateLabel } from '../source-control-submodule-state-label'
import type { VscodeScmRow } from './vscode-scm-tree-model'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

const INDENT_PER_DEPTH = 12

export type VscodeScmRowAction = 'stage' | 'unstage' | 'discard'

type RowActionButtonProps = {
  label: string
  /** Replaces the tooltip text when the button is unavailable for a stated reason. */
  disabledReason?: string | null
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}

function RowActionButton({
  label,
  disabledReason = null,
  onClick,
  disabled,
  children
}: RowActionButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{disabledReason ?? label}</TooltipContent>
    </Tooltip>
  )
}

export function VscodeScmDirectoryRow({
  row,
  collapsed,
  onToggle
}: {
  row: Extract<VscodeScmRow, { kind: 'directory' }>
  collapsed: boolean
  onToggle: () => void
}): React.JSX.Element {
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex h-[22px] w-full items-center gap-1 pr-2 text-left text-xs text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={{ paddingLeft: 6 + row.depth * INDENT_PER_DEPTH }}
    >
      <Chevron size={12} className="shrink-0" />
      <span className="truncate">{row.label}</span>
      <span className="ml-auto shrink-0 tabular-nums opacity-60">{row.fileCount}</span>
    </button>
  )
}

export function VscodeScmResourceRow({
  row,
  entry,
  actions,
  busy,
  disabledReason = null,
  onOpen,
  onAction
}: {
  row: Extract<VscodeScmRow, { kind: 'file' }>
  entry: GitStatusEntry
  actions: readonly VscodeScmRowAction[]
  busy: boolean
  /** Shown instead of the action label, and disables it — e.g. a host that cannot write here. */
  disabledReason?: string | null
  onOpen: () => void
  onAction: (action: VscodeScmRowAction) => void
}): React.JSX.Element {
  const decoration = getVscodeScmDecoration(entry)
  const name = basename(entry.path)
  const directory = dirname(entry.path)
  // Why: `git status` annotates a gitlink with this parenthetical; without it a
  // submodule left behind by checkout/pull reads as a file the user edited.
  const submoduleStateLabel = getSubmoduleRowStateLabel(entry)

  return (
    <div
      className="group flex h-[22px] w-full items-center gap-1 pr-1 hover:bg-accent/50"
      style={{ paddingLeft: 6 + row.depth * INDENT_PER_DEPTH }}
    >
      <button
        type="button"
        onClick={onOpen}
        title={entry.path}
        className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {/* Why shrink-0 on the name: VS Code keeps the file name legible and lets the
            directory description collapse first. Without it the flex row truncates both. */}
        <span
          className={cn(
            'max-w-full shrink-0 truncate text-xs',
            decoration.strikeThrough && 'line-through opacity-70'
          )}
          style={{ color: decoration.color }}
        >
          {name}
        </span>
        {directory !== '.' && directory !== '' && (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground/70">{directory}</span>
        )}
        {submoduleStateLabel && (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
            ({submoduleStateLabel})
          </span>
        )}
      </button>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {actions.includes('discard') && (
          <RowActionButton
            label={translate(
              'auto.components.right.sidebar.vscodeSourceControl.discardChanges',
              'Discard Changes'
            )}
            disabled={busy || disabledReason !== null}
            disabledReason={disabledReason}
            onClick={() => onAction('discard')}
          >
            <RotateCcw size={13} />
          </RowActionButton>
        )}
        {actions.includes('unstage') && (
          <RowActionButton
            label={translate(
              'auto.components.right.sidebar.vscodeSourceControl.unstageChanges',
              'Unstage Changes'
            )}
            disabled={busy || disabledReason !== null}
            disabledReason={disabledReason}
            onClick={() => onAction('unstage')}
          >
            <Minus size={13} />
          </RowActionButton>
        )}
        {actions.includes('stage') && (
          <RowActionButton
            label={translate(
              'auto.components.right.sidebar.vscodeSourceControl.stageChanges',
              'Stage Changes'
            )}
            disabled={busy || disabledReason !== null}
            disabledReason={disabledReason}
            onClick={() => onAction('stage')}
          >
            <Plus size={13} />
          </RowActionButton>
        )}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="w-4 shrink-0 text-center text-[11px] font-semibold tabular-nums"
            style={{ color: decoration.color }}
          >
            {decoration.letter}
          </span>
        </TooltipTrigger>
        <TooltipContent>{decoration.tooltip}</TooltipContent>
      </Tooltip>
    </div>
  )
}
