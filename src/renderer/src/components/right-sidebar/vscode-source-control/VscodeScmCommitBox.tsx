import React, { useMemo } from 'react'
import { ArrowDown, ArrowUp, Check, CloudUpload, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { translate } from '@/i18n/i18n'
import type { VscodeScmActionButton } from './vscode-scm-action-button'

const ACTION_ICON = {
  commit: Check,
  publish: CloudUpload,
  sync: RefreshCw,
  conflicts: TriangleAlert
} as const

function actionLabel(button: VscodeScmActionButton): string {
  switch (button.kind) {
    case 'publish':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.publishBranch',
        'Publish Branch'
      )
    case 'sync':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.syncChanges',
        'Sync Changes'
      )
    case 'conflicts':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.resolveConflicts',
        'Resolve Conflicts'
      )
    case 'commit':
      return button.stagesAllFirst
        ? translate('auto.components.right.sidebar.vscodeSourceControl.commitAll', 'Commit All')
        : translate('auto.components.right.sidebar.vscodeSourceControl.commit', 'Commit')
  }
}

function disabledHint(button: VscodeScmActionButton): string | undefined {
  switch (button.disabledReason) {
    case 'conflicts':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.hintConflicts',
        'Resolve every conflict before committing.'
      )
    case 'empty-message':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.hintEmptyMessage',
        'Enter a commit message.'
      )
    case 'nothing-staged':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.hintNothingStaged',
        'Stage a change first, or turn on Smart Commit to commit everything.'
      )
    case 'detached-head':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.hintDetachedHead',
        'HEAD is detached. Check out a branch to commit.'
      )
    case 'busy':
      return translate(
        'auto.components.right.sidebar.vscodeSourceControl.hintBusy',
        'A Git operation is already running.'
      )
    case null:
      return undefined
  }
}

export function VscodeScmCommitBox({
  message,
  onMessageChange,
  actionButton,
  branch,
  smartCommit,
  onToggleSmartCommit,
  disabledReason = null,
  onRun
}: {
  message: string
  onMessageChange: (next: string) => void
  actionButton: VscodeScmActionButton
  branch: string | null
  smartCommit: boolean
  onToggleSmartCommit: () => void
  /** Overrides every enabled state — e.g. a host that cannot write to this repository. */
  disabledReason?: string | null
  onRun: () => void
}): React.JSX.Element {
  const isMac = useMemo(() => getShortcutPlatform() === 'darwin', [])
  const Icon = ACTION_ICON[actionButton.kind]
  const label = actionLabel(actionButton)
  const enabled = actionButton.enabled && disabledReason === null
  const hint = disabledReason ?? disabledHint(actionButton)
  const commitShortcut = isMac ? '⌘⏎' : 'Ctrl+Enter'

  return (
    <div className="flex flex-col gap-2 border-b border-border px-2 py-2">
      <Textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={(event) => {
          const accelerator = isMac ? event.metaKey : event.ctrlKey
          if (accelerator && event.key === 'Enter' && enabled) {
            event.preventDefault()
            onRun()
          }
        }}
        rows={2}
        spellCheck={false}
        aria-label={translate(
          'auto.components.right.sidebar.vscodeSourceControl.commitMessageLabel',
          'Commit message'
        )}
        placeholder={
          branch
            ? translate(
                'auto.components.right.sidebar.vscodeSourceControl.commitMessagePlaceholderBranch',
                'Message ({{shortcut}} to commit on {{branch}})'
              )
                .replace('{{shortcut}}', commitShortcut)
                .replace('{{branch}}', branch)
            : translate(
                'auto.components.right.sidebar.vscodeSourceControl.commitMessagePlaceholder',
                'Message ({{shortcut}} to commit)'
              ).replace('{{shortcut}}', commitShortcut)
        }
        className="min-h-[48px] resize-none text-xs"
      />

      <Button
        type="button"
        size="sm"
        variant={actionButton.kind === 'conflicts' ? 'outline' : 'default'}
        disabled={!enabled}
        title={hint}
        onClick={onRun}
        className="h-7 w-full gap-1.5 text-xs"
      >
        <Icon size={13} />
        <span>{label}</span>
        {actionButton.kind === 'sync' && (
          <span className="ml-1 flex items-center gap-1 tabular-nums opacity-80">
            {actionButton.behind > 0 && (
              <span className="flex items-center gap-0.5">
                <ArrowDown size={11} />
                {actionButton.behind}
              </span>
            )}
            {actionButton.ahead > 0 && (
              <span className="flex items-center gap-0.5">
                <ArrowUp size={11} />
                {actionButton.ahead}
              </span>
            )}
          </span>
        )}
      </Button>

      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={smartCommit}
          onChange={onToggleSmartCommit}
          className="size-3 accent-[var(--primary)]"
        />
        <span>
          {translate(
            'auto.components.right.sidebar.vscodeSourceControl.smartCommit',
            'Smart Commit — commit all changes when nothing is staged'
          )}
        </span>
      </label>

      {hint && !enabled && (
        <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>
      )}
    </div>
  )
}
