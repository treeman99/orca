import type { AgentType } from './agent-status-types'
import { findCatalogModel, getAgentSessionOptionCatalog } from './agent-session-option-catalog'
import { OPENCODE_LAUNCH_OPTION_CATALOG } from './agent-session-option-catalog-opencode'
import type {
  AgentSessionOptionCatalog,
  CatalogOptionApply
} from './agent-session-option-catalog-types'
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

function isOverriddenByAgentArgs(apply: CatalogOptionApply, tokens: readonly string[]): boolean {
  const kept = apply.removeAgentArgs?.(tokens)
  return kept !== undefined && kept.length < tokens.length
}

export function getAgentSessionOptionLaunchCatalog(
  agent: AgentType
): AgentSessionOptionCatalog | null {
  return agent === 'opencode' ? OPENCODE_LAUNCH_OPTION_CATALOG : getAgentSessionOptionCatalog(agent)
}

export function removeOverriddenAgentSessionArgs(
  agent: AgentType,
  values: Record<string, SessionOptionValue> | null | undefined,
  tokens: readonly string[]
): string[] {
  const catalog = getAgentSessionOptionLaunchCatalog(agent)
  const modelId = typeof values?.model === 'string' ? values.model : null
  if (!catalog || !values || !modelId) {
    return [...tokens]
  }
  let result = catalog.modelApply.removeAgentArgs?.(tokens) ?? [...tokens]
  const model = findCatalogModel(catalog, modelId)
  const modelOptions = model?.options ?? catalog.unknownModelOptions ?? []
  for (const option of modelOptions) {
    if (values[option.id] !== undefined && option.apply.removeAgentArgs) {
      result = option.apply.removeAgentArgs(result)
    }
  }
  return result
}

export function resolveAgentSessionOptionLaunch(
  agent: AgentType,
  values: Record<string, SessionOptionValue> | null | undefined,
  trailingAgentArgs: readonly string[] = [],
  includeCatalogDefaults = true
): ResolvedSessionOptionLaunch {
  const catalog = getAgentSessionOptionLaunchCatalog(agent)
  const modelId = typeof values?.model === 'string' ? values.model : null
  if (!catalog || !values || !modelId) {
    return { args: [], appliedValues: {} }
  }

  const model = findCatalogModel(catalog, modelId)
  const appliedValues: Record<string, SessionOptionValue> = {}
  const args: string[] = []
  const env: Record<string, string> = {}
  const modelOptions = model?.options ?? catalog.unknownModelOptions ?? []
  const modelValues = Object.fromEntries(
    modelOptions.flatMap((option) => {
      const explicitValue = values[option.id]
      if (explicitValue !== undefined) {
        if (
          !model &&
          option.kind.type === 'select' &&
          !option.kind.choices.some((choice) => choice.value === explicitValue)
        ) {
          return []
        }
        return [[option.id, explicitValue]]
      }
      return model && includeCatalogDefaults ? [[option.id, option.kind.defaultValue]] : []
    })
  )
  const composedModelId = catalog.composeModelValue
    ? catalog.composeModelValue(modelId, modelValues)
    : modelId
  // A model may replace the catalog-wide apply when the CLI cannot name it — a
  // corporate endpoint does so even after the policy stopped provisioning it.
  const modelApply = model?.apply ?? catalog.modelApply
  const modelOverridden = isOverriddenByAgentArgs(modelApply, trailingAgentArgs)

  // Why: a repeated model flag can prevent the CLI from starting.
  if (modelApply.launchArgs && !modelOverridden) {
    args.push(...modelApply.launchArgs(composedModelId))
  }
  if (modelApply.launchEnv && !modelOverridden) {
    Object.assign(env, modelApply.launchEnv(composedModelId))
  }
  if ((modelApply.launchArgs || modelApply.launchEnv) && !modelOverridden) {
    appliedValues.model = modelId
  }
  for (const option of modelOptions) {
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
    // Why: options belong to the picked model and may be invalid for the user's model.
    if (
      (!option.apply.launchArgs && !option.apply.launchEnv) ||
      modelOverridden ||
      isOverriddenByAgentArgs(option.apply, trailingAgentArgs)
    ) {
      continue
    }
    if (option.apply.launchArgs) {
      args.push(...option.apply.launchArgs(value))
    }
    if (option.apply.launchEnv) {
      Object.assign(env, option.apply.launchEnv(value))
    }
    appliedValues[option.id] = value
  }
  return launchResult(args, env, appliedValues)
}
