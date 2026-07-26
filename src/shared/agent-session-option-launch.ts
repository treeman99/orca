import type { AgentType } from './agent-status-types'
import { findCatalogModel, getAgentSessionOptionCatalog } from './agent-session-option-catalog'
import { corporateLlmModelApply } from './corporate-llm-session-catalog'
import type { SessionOptionValue } from './native-chat-session-options'

export type ResolvedSessionOptionLaunch = {
  args: string[]
  /** Present only when a chosen model or option has no CLI flag to carry it. */
  env?: Record<string, string>
  appliedValues: Record<string, SessionOptionValue>
}

function launchResult(
  args: string[],
  env: Record<string, string>,
  appliedValues: Record<string, SessionOptionValue>
): ResolvedSessionOptionLaunch {
  return { args, ...(Object.keys(env).length > 0 ? { env } : {}), appliedValues }
}

export function resolveAgentSessionOptionLaunch(
  agent: AgentType,
  values: Record<string, SessionOptionValue> | null | undefined,
  trailingAgentArgs: readonly string[] = []
): ResolvedSessionOptionLaunch {
  const catalog = getAgentSessionOptionCatalog(agent)
  const modelId = typeof values?.model === 'string' ? values.model : null
  if (!catalog || !values || !modelId) {
    return { args: [], appliedValues: {} }
  }

  const model = findCatalogModel(catalog, modelId)
  const appliedValues: Record<string, SessionOptionValue> = {}
  const args: string[] = []
  const env: Record<string, string> = {}
  const modelValues = model
    ? Object.fromEntries(
        model.options.map((option) => [option.id, values[option.id] ?? option.kind.defaultValue])
      )
    : {}
  const composedModelId = catalog.composeModelValue
    ? catalog.composeModelValue(modelId, modelValues)
    : modelId
  // A model may replace the catalog-wide apply when the CLI cannot name it — a
  // corporate endpoint does so even after the policy stopped provisioning it.
  const modelApply = model?.apply ?? corporateLlmModelApply(modelId) ?? catalog.modelApply
  const modelOverridden = modelApply.agentArgsOverride?.(trailingAgentArgs) === true

  if (modelApply.launchArgs) {
    args.push(...modelApply.launchArgs(composedModelId))
  }
  if (modelApply.launchEnv && !modelOverridden) {
    Object.assign(env, modelApply.launchEnv(composedModelId))
  }
  if ((modelApply.launchArgs || modelApply.launchEnv) && !modelOverridden) {
    appliedValues.model = modelId
  }
  if (!model) {
    return launchResult(args, env, appliedValues)
  }

  for (const option of model.options) {
    const value = modelValues[option.id]
    if (value === undefined) {
      continue
    }
    if (option.apply.composedIntoModel) {
      if (modelApply.launchArgs && !modelOverridden) {
        appliedValues[option.id] = value
      }
      continue
    }
    if (!option.apply.launchArgs && !option.apply.launchEnv) {
      continue
    }
    if (option.apply.launchArgs) {
      args.push(...option.apply.launchArgs(value))
    }
    if (option.apply.launchEnv) {
      Object.assign(env, option.apply.launchEnv(value))
    }
    if (!modelOverridden && !option.apply.agentArgsOverride?.(trailingAgentArgs)) {
      appliedValues[option.id] = value
    }
  }
  return launchResult(args, env, appliedValues)
}
