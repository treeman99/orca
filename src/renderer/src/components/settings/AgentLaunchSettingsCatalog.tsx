import { useMemo } from 'react'
import type {
  AgentLaunchSettings,
  AgentLaunchSettingsMutation
} from '../../../../shared/agent-launch-settings'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { AUTO_TUI_AGENT_ARGS } from '../../../../shared/tui-agent-permissions'
import type { AgentPermissionsSettingProps } from './AgentPermissionsSetting'
import { buildAgentRowPermissions } from './agent-row-permission-model'
import {
  getTuiAgentDefaultArgs,
  getTuiAgentDefaultEnv,
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import { useDetectedAgents, type AgentDetectionTarget } from '@/hooks/useDetectedAgents'
import { AgentDefaultSetting } from './AgentDefaultSetting'
import { AgentDetectionCatalog } from './AgentDetectionCatalog'
import type { AgentCatalogRowProps } from './AgentCatalogRow'
import { HostAgentEnvironmentEditor } from './HostAgentEnvironmentEditor'
import { buildCodexSessionSourceHomeControl } from './codex-session-source-home-control'
import { translate } from '@/i18n/i18n'

export type AgentPermissionsRenderer = (props: AgentPermissionsSettingProps) => React.ReactNode

export function AgentLaunchSettingsCatalog({
  settings,
  mutate,
  detectionTarget,
  hostName,
  renderPermissions,
  refreshSettings,
  autoSupported = true,
  nativeChatPermissionsSupported = false,
  local
}: {
  settings: AgentLaunchSettings
  mutate: (mutation: AgentLaunchSettingsMutation) => Promise<void>
  detectionTarget: AgentDetectionTarget
  hostName: string | null
  renderPermissions: AgentPermissionsRenderer
  refreshSettings?: () => void
  autoSupported?: boolean
  nativeChatPermissionsSupported?: boolean
  local?: {
    settings: GlobalSettings
    updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  }
}): React.JSX.Element {
  const {
    detectedIds: detected,
    detectionFailed,
    isRefreshing,
    refresh
  } = useDetectedAgents(detectionTarget)
  const detectedIds = useMemo(() => (detected ? new Set(detected) : null), [detected])
  // Why the read is kept even where the value is unused: getAgentCatalog() applies the
  // corporate allowlist itself but is not reactive, so this subscription is what re-renders
  // the catalog once the policy lands at startup.
  const { disableAgentInstallSuggestions } = useEnterprisePolicyView()
  const catalog = getAgentCatalog()
  const detectedAgents =
    detectedIds === null ? [] : catalog.filter((agent) => detectedIds.has(agent.id))
  // Empty under policy: on a fleet where CLIs arrive through corporate software
  // distribution, "go install this yourself" is the wrong instruction — and each row
  // links out to the vendor's site to do it.
  const undetectedAgents = disableAgentInstallSuggestions
    ? []
    : catalog.filter((agent) => detectedIds !== null && !detectedIds.has(agent.id))
  const save = (mutation: AgentLaunchSettingsMutation): void => {
    const scopedMutation =
      mutation.type === 'permissions' && nativeChatPermissionsSupported
        ? { ...mutation, syncNativeChat: true as const }
        : mutation
    void mutate(scopedMutation).catch(() => {})
  }
  const permissions = buildAgentRowPermissions({
    agents: catalog.map((agent) => agent.id),
    settings,
    localEnv: local ? (local.settings.agentDefaultEnv ?? {}) : null,
    autoSupported,
    save
  })
  const rowProps = (
    agent: (typeof catalog)[number],
    isDetected: boolean
  ): AgentCatalogRowProps => ({
    agentId: agent.id,
    label: agent.label,
    homepageUrl: agent.homepageUrl,
    defaultCmd: agent.cmd,
    defaultArgs: getTuiAgentDefaultArgs(agent.id),
    defaultEnv: getTuiAgentDefaultEnv(agent.id),
    isDetected,
    isEnabled: isTuiAgentEnabled(agent.id, settings.disabledTuiAgents),
    isDefault: isDetected && settings.defaultTuiAgent === agent.id,
    cmdOverride: isDetected ? settings.agentCmdOverrides[agent.id] : undefined,
    argsOverride: resolveTuiAgentLaunchArgs(agent.id, settings.agentDefaultArgs),
    envOverride: local ? resolveTuiAgentLaunchEnv(agent.id, local.settings.agentDefaultEnv) : {},
    permission: permissions.rows.get(agent.id),
    onSetDefault: () =>
      save({
        type: 'default',
        agent: settings.defaultTuiAgent === agent.id ? 'blank' : agent.id
      }),
    onSetEnabled: (enabled) => save({ type: 'availability', agent: agent.id, enabled }),
    onSaveOverride: (value) => mutate({ type: 'command', agent: agent.id, value }),
    onSaveArgs: (value) => mutate({ type: 'arguments', agent: agent.id, value }),
    onSaveEnv: (value) => {
      if (local) {
        local.updateSettings({
          agentDefaultEnv: { ...local.settings.agentDefaultEnv, [agent.id]: value }
        })
      }
    },
    ...(!local
      ? {
          environmentNames: settings.environmentNames[agent.id] ?? [],
          environmentEditor: (
            <HostAgentEnvironmentEditor
              agent={agent.id}
              names={settings.environmentNames[agent.id] ?? []}
              mutate={mutate}
            />
          )
        }
      : {}),
    sessionSourceHome:
      local && isDetected && agent.id === 'codex'
        ? buildCodexSessionSourceHomeControl(local.settings, local.updateSettings)
        : undefined
  })
  return (
    <>
      <AgentDefaultSetting
        defaultAgent={settings.defaultTuiAgent}
        detectedIds={detectedIds}
        enabledDetectedAgents={detectedAgents.filter((agent) =>
          isTuiAgentEnabled(agent.id, settings.disabledTuiAgents)
        )}
        catalog={catalog}
        description={translate(
          'settings.agents.hostDefaults',
          'Defaults for new agents on the selected host.'
        )}
        onSetDefault={(agent) => save({ type: 'default', agent })}
      />
      {renderPermissions({
        mode: permissions.globalMode,
        nonAutoMode: settings.nonAutoPermissionMode,
        majorityMode: permissions.majorityMode,
        autoAgentLabels: catalog
          .filter((agent) => agent.id in AUTO_TUI_AGENT_ARGS)
          .map((agent) => agent.label),
        onChange: (mode) => save({ type: 'permissions', mode }),
        onChangeNonAuto: (mode) => save({ type: 'permissions', mode, exceptAuto: true }),
        autoSupported
      })}
      <AgentDetectionCatalog
        detectedAgents={detectedAgents}
        undetectedAgents={undetectedAgents}
        detectionPending={detectedIds === null}
        detectionFailed={detectionFailed}
        isRefreshing={isRefreshing}
        activeServerEnvironmentId={
          detectionTarget.kind === 'runtime' ? detectionTarget.environmentId : null
        }
        activeServerName={hostName}
        onRefresh={() => {
          void refresh()
          refreshSettings?.()
        }}
        getRowProps={rowProps}
      />
      {/* Without this the pane is simply empty below Agent Permissions when detection
          succeeded and found nothing, which reads as a broken screen rather than a policy. */}
      {disableAgentInstallSuggestions &&
        detectedIds !== null &&
        !detectionFailed &&
        detectedAgents.length === 0 && (
          <div className="flex items-center justify-center rounded-md border border-dashed border-border/50 px-4 py-6 text-center text-sm text-muted-foreground">
            {translate(
              'auto.components.settings.AgentsPane.corporateNoAgentsDetected',
              'No agent CLIs were detected. Install them through your organization’s software distribution, then refresh.'
            )}
          </div>
        )}
    </>
  )
}
