import type { AgentType } from './agent-status-types'
import type {
  SessionOptionDescriptor,
  SessionOptionSelectChoice,
  SessionOptionValue
} from './native-chat-session-options'

export type CatalogAgentInteractionDetection = 'claude-model-switch-confirmation'

export type CatalogMidSessionApply =
  | {
      kind: 'command'
      build: (value: SessionOptionValue) => string
      pickerCommand?: string
      detectAgentInteraction?: CatalogAgentInteractionDetection
    }
  | { kind: 'toggle-command'; command: string }
  | { kind: 'agent-picker'; command: string }
  /** Why: no command can change this mid-session, but recording the pick is not a
   * no-op either — it is what the next launch of this agent will use. */
  | { kind: 'next-launch' }
  | { kind: 'unsupported' }

export type CatalogOptionApply = {
  launchArgs?: (value: SessionOptionValue) => string[]
  /** Launch environment, for a choice the agent CLI exposes no flag for. */
  launchEnv?: (value: SessionOptionValue) => Record<string, string>
  /** Why: later free-form args win, so the launch record must discard any
   * picker value that those args may have replaced. */
  agentArgsOverride?: (tokens: readonly string[]) => boolean
  composedIntoModel?: true
  midSession?: CatalogMidSessionApply
}

export type CatalogOption = {
  id: string
  label: string
  description?: string
  category?: SessionOptionDescriptor['category']
  kind:
    | {
        type: 'select'
        choices: SessionOptionSelectChoice[]
        defaultValue: string
      }
    | { type: 'boolean'; defaultValue: boolean }
  apply: CatalogOptionApply
}

export type CatalogModel = {
  id: string
  label: string
  description?: string
  isDefault?: boolean
  options: CatalogOption[]
  /** Replaces `catalog.modelApply` for this model — a backend the agent's model
   * flag cannot name. Absent for every model the CLI selects by name. */
  apply?: CatalogOptionApply
}

export type AgentSessionOptionCatalog = {
  models: CatalogModel[]
  modelApply: CatalogOptionApply
  composeModelValue?: (modelId: string, values: Record<string, SessionOptionValue>) => string
  listModels?: {
    command: string
    parse: (stdout: string) => CatalogModel[]
  }
}

export type AgentSessionOptionCatalogMap = Partial<Record<AgentType, AgentSessionOptionCatalog>>
