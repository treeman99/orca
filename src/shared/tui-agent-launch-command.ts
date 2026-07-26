import { resolveAgentSessionOptionLaunch } from './agent-session-option-launch'
import type { SessionOptionValue } from './native-chat-session-options'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from './tui-agent-config'
import {
  planAgentCliArgsSuffix,
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from './tui-agent-startup-shell'
import type { TuiAgent } from './types'

export type ResolvedAgentLaunchCommand =
  | {
      ok: true
      command: string
      commandWithoutSessionOptions: string
      appliedSessionOptions: Record<string, SessionOptionValue>
      /** `agentEnv` plus any session-option env; null when both are empty. */
      env: Record<string, string> | null
    }
  | { ok: false; error: string }

export function resolveAgentLaunchCommand(args: {
  agent: TuiAgent
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: NodeJS.Platform
  shell: AgentStartupShell
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  sessionOptions?: Record<string, SessionOptionValue>
  isRemote?: boolean
}): ResolvedAgentLaunchCommand {
  const override = args.cmdOverrides[args.agent]
  const command =
    override ||
    getTuiAgentLaunchCommand(TUI_AGENT_CONFIG[args.agent], args.platform, {
      isRemote: args.isRemote
    })
  const suffix = planAgentCliArgsSuffix(args.agentArgs, args.shell)
  if (!suffix.ok) {
    return suffix
  }
  const trailingTokens = args.agentArgs?.trim()
    ? tokenizeStartupCommand(args.agentArgs.trim(), args.shell)
    : { ok: true as const, tokens: [] }
  if (!trailingTokens.ok) {
    return { ok: false, error: `CLI arguments are invalid: ${trailingTokens.error}` }
  }
  const resolvedOptions = resolveAgentSessionOptionLaunch(
    args.agent,
    args.sessionOptions,
    trailingTokens.tokens
  )
  const optionSuffix = resolvedOptions.args.map((arg) => quoteStartupArg(arg, args.shell)).join(' ')
  const commandWithOptions = optionSuffix ? `${command} ${optionSuffix}` : command
  const commandWithoutSessionOptions = suffix.suffix ? `${command} ${suffix.suffix}` : command
  // Why: session-option env last — it is the backend the user just picked, and
  // must win over a stale value left in the agent's configured default env.
  const env =
    args.agentEnv || resolvedOptions.env ? { ...args.agentEnv, ...resolvedOptions.env } : null
  // Why: session flags precede the free-form suffix so the user's explicit
  // repeated flag remains the final, winning occurrence.
  return {
    ok: true,
    command: suffix.suffix ? `${commandWithOptions} ${suffix.suffix}` : commandWithOptions,
    commandWithoutSessionOptions,
    appliedSessionOptions: resolvedOptions.appliedValues,
    env
  }
}
