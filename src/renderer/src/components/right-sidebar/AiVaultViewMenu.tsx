// The AI Vault's view menu: the agent filter, sort, grouping, and reset.
//
// Split out of AiVaultPanelControls so that file stays under the tsx line budget — this is
// the one control in it that carries real logic (the corporate agent allowlist) rather than
// being a small presentational piece.

import type React from 'react'
import { useMemo } from 'react'
import {
  ArchiveRestore,
  Calendar,
  Clock3,
  FolderOpen,
  ListFilter,
  PanelsTopLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentLabel } from './ai-vault-session-filters'
import { cn } from '@/lib/utils'
import { filterAgentsByPolicy } from '../../../../shared/corporate-agent-access'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import {
  AI_VAULT_AGENTS,
  type AiVaultAgent,
  type AiVaultGroup,
  type AiVaultSort
} from '../../../../shared/ai-vault-types'
import { translate } from '@/i18n/i18n'
import { AGENT_BULK_ACTION_CLASS, VAULT_HEADER_CONTROL_CLASS } from './ai-vault-control-classes'
import { AiVaultSessionLimitMenu } from './AiVaultSessionLimitMenu'
import type { AiVaultSessionLimit } from './ai-vault-session-limit'

export function VaultViewMenu({
  agents,
  sort,
  group,
  hideEmptySessions,
  sessionLimit,
  adjustmentCount,
  onAgentEnabledChange,
  onAllAgentsEnabledChange,
  onSortChange,
  onGroupChange,
  onHideEmptySessionsChange,
  onSessionLimitChange,
  onReset
}: {
  agents: readonly AiVaultAgent[]
  sort: AiVaultSort
  group: AiVaultGroup
  hideEmptySessions: boolean
  sessionLimit: AiVaultSessionLimit
  adjustmentCount: number
  onAgentEnabledChange: (agent: AiVaultAgent, enabled: boolean) => void
  onAllAgentsEnabledChange: (enabled: boolean) => void
  onSortChange: (sort: AiVaultSort) => void
  onGroupChange: (group: AiVaultGroup) => void
  onHideEmptySessionsChange: (hideEmptySessions: boolean) => void
  onSessionLimitChange: (limit: AiVaultSessionLimit) => void
  onReset: () => void
}): React.JSX.Element {
  // Why the policy filter here and not in the persisted options: a blocked agent left in
  // stored state is harmless once it is unlistable, but narrowing the persisted list would
  // rewrite a user's selection every time the policy changed. The two counters below read
  // the visible set for the same reason — comparing against the full roster would leave
  // "All" permanently unlit on a fleet that hides any of them.
  const { allowedAgents } = useEnterprisePolicyView()
  const visibleAgents = useMemo(
    () => filterAgentsByPolicy(AI_VAULT_AGENTS, (agent) => agent, allowedAgents),
    [allowedAgents]
  )
  const allAgentsSelected =
    visibleAgents.length > 0 && visibleAgents.every((agent) => agents.includes(agent))
  const noAgentsSelected = !visibleAgents.some((agent) => agents.includes(agent))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            VAULT_HEADER_CONTROL_CLASS,
            'relative text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
          aria-label={translate(
            'auto.components.right.sidebar.AiVaultPanelControls.viewOptionsAriaLabel',
            'Session History view options'
          )}
        >
          <ListFilter className="size-3" />
          <span className="sr-only">
            {translate(
              'auto.components.right.sidebar.AiVaultPanelControls.viewOptions',
              'View options'
            )}
          </span>
          {adjustmentCount > 0 ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium leading-none text-primary-foreground"
            >
              {adjustmentCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {/* Why: Select all / Clear lets users isolate one agent without unchecking 15 boxes. */}
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {translate('auto.components.right.sidebar.AiVaultPanelControls.agents', 'Agents')}
          </span>
          {/* Why: real menu items so arrow keys reach them; plain buttons are skipped by Radix roving focus. */}
          <div className="flex items-center gap-1">
            <DropdownMenuItem
              disabled={allAgentsSelected}
              // Why: preventDefault keeps the menu open for further multi-select.
              onSelect={(event) => {
                event.preventDefault()
                onAllAgentsEnabledChange(true)
              }}
              className={AGENT_BULK_ACTION_CLASS}
            >
              {translate(
                'auto.components.right.sidebar.AiVaultPanelControls.selectAllAgents',
                'Select all'
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={noAgentsSelected}
              onSelect={(event) => {
                event.preventDefault()
                onAllAgentsEnabledChange(false)
              }}
              className={AGENT_BULK_ACTION_CLASS}
            >
              {translate('auto.components.right.sidebar.AiVaultPanelControls.clearAgents', 'Clear')}
            </DropdownMenuItem>
          </div>
        </div>
        {visibleAgents.map((agent) => (
          <DropdownMenuCheckboxItem
            key={agent}
            checked={agents.includes(agent)}
            onCheckedChange={(checked) => onAgentEnabledChange(agent, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            <AgentIcon agent={agent} size={14} />
            {agentLabel(agent)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {translate('auto.components.right.sidebar.AiVaultPanelControls.sort', 'Sort')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => onSortChange(value as AiVaultSort)}
        >
          <DropdownMenuRadioItem value="updated">
            <Clock3 className="size-3.5" />
            {translate(
              'auto.components.right.sidebar.AiVaultPanelControls.lastUpdated',
              'Last updated'
            )}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="created">
            <Calendar className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.created', 'Created')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {translate('auto.components.right.sidebar.AiVaultPanelControls.group', 'Group')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={group}
          onValueChange={(value) => onGroupChange(value as AiVaultGroup)}
        >
          <DropdownMenuRadioItem value="project">
            <PanelsTopLeft className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.project', 'Project')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="folder">
            <FolderOpen className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.folder', 'Folder')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="agent">
            <ArchiveRestore className="size-3.5" />
            {translate('auto.components.right.sidebar.AiVaultPanelControls.agent', 'Agent')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={hideEmptySessions}
          onCheckedChange={(checked) => onHideEmptySessionsChange(checked === true)}
          onSelect={(event) => event.preventDefault()}
        >
          {translate(
            'auto.components.right.sidebar.AiVaultPanelControls.hideEmptySessions',
            'Hide empty sessions'
          )}
        </DropdownMenuCheckboxItem>
        <AiVaultSessionLimitMenu
          sessionLimit={sessionLimit}
          onSessionLimitChange={onSessionLimitChange}
        />
        {adjustmentCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onReset}>
              {translate(
                'auto.components.right.sidebar.AiVaultPanelControls.resetView',
                'Reset view'
              )}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
