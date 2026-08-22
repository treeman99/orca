import { ClipboardCopy, FolderOpen, Info, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { DiscoveredSkill, SkillProvider } from '../../../../shared/skills'
import { sourceKindLabel } from './skill-display-labels'

const providerLabels: Record<SkillProvider, string> = {
  codex: 'Codex',
  claude: 'Claude',
  'agent-skills': 'Agent Skills'
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric'
})

function formatUpdatedAt(value: number | null): string {
  return value
    ? dateFormatter.format(new Date(value))
    : translate('auto.components.skills.SkillRow.updatedUnknown', 'No date')
}

type SkillRowAction = {
  key: string
  label: string
  icon: React.JSX.Element
  disabled?: boolean
  onSelect: () => void
}

export function SkillRow({
  skill,
  focusable,
  onOpenDetail,
  onFocus,
  onKeyDown
}: {
  skill: DiscoveredSkill
  focusable: boolean
  onOpenDetail: () => void
  onFocus: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
}): React.JSX.Element {
  const revealSkill = async (): Promise<void> => {
    const result = await window.api.shell.openInFileManager(skill.skillFilePath)
    if (!result.ok) {
      toast.error(
        translate('auto.components.skills.SkillsPage.995fde8337', 'Could not reveal skill file')
      )
    }
  }

  const copyPath = async (): Promise<void> => {
    await window.api.ui.writeClipboardText(skill.skillFilePath)
    toast.success(translate('auto.components.skills.SkillRow.pathCopied', 'Path copied'))
  }

  const actions: SkillRowAction[] = [
    {
      key: 'details',
      label: translate('auto.components.skills.SkillRow.viewDetails', 'View details'),
      icon: <Info />,
      onSelect: onOpenDetail
    },
    {
      key: 'reveal',
      label: translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file'),
      icon: <FolderOpen />,
      onSelect: () => void revealSkill()
    },
    {
      key: 'copy-path',
      label: translate('auto.components.skills.SkillRow.copyPath', 'Copy path'),
      icon: <ClipboardCopy />,
      onSelect: () => void copyPath()
    }
  ]

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="option"
          aria-selected={false}
          tabIndex={focusable ? 0 : -1}
          data-skill-row={skill.id}
          onFocus={onFocus}
          onClick={onOpenDetail}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpenDetail()
              return
            }
            onKeyDown(event)
          }}
          className="group flex w-full cursor-pointer items-start gap-3 border-b border-border/50 px-2 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {/* Why: metadata is its own grid column, so the description truncates
              where that column starts instead of at the window edge. */}
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate text-sm font-medium" data-skill-name>
                {skill.name}
              </span>
              {!skill.installed ? (
                <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                  {translate('auto.components.skills.SkillsPage.35b9a724a0', 'Available')}
                </Badge>
              ) : null}
            </div>
            <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span>{sourceKindLabel(skill.sourceKind)}</span>
              <span className="hidden sm:inline" aria-hidden>
                ·
              </span>
              <span className="hidden sm:inline">
                {skill.providers.map((provider) => providerLabels[provider]).join(', ')}
              </span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatUpdatedAt(skill.updatedAt)}</span>
            </span>
            <p className="col-start-1 min-w-0 truncate text-xs leading-5 text-muted-foreground">
              {skill.description ??
                translate('auto.components.skills.SkillsPage.9963dff6d3', 'No description found.')}
            </p>
          </div>
          <div
            className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-visible:opacity-100 has-[[data-state=open]]:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate(
                    'auto.components.skills.SkillRow.skillActions',
                    'Actions for {{value0}}',
                    { value0: skill.name }
                  )}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.key}
                    disabled={action.disabled}
                    onSelect={action.onSelect}
                  >
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <ContextMenuItem key={action.key} disabled={action.disabled} onSelect={action.onSelect}>
            {action.icon}
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
