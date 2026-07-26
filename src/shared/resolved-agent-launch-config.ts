// What a woken sleeping agent replays, derived from a resolved launch command.
//
// Extracted so there is one place that decides it, and so the corporate-endpoint
// selection cannot be persisted on one launch path but silently dropped on another.

import type { SleepingAgentLaunchConfig } from './agent-session-resume'
import { buildSleepingAgentLaunchConfig } from './sleeping-agent-launch-config'

export function resolvedLaunchConfig(
  args: { agentArgs?: string | null },
  baseCommand: {
    env: Record<string, string> | null
    commandWithoutSessionOptions: string
  }
): SleepingAgentLaunchConfig {
  return buildSleepingAgentLaunchConfig({
    ...args,
    // Why: session-option env carries no secret — the corporate selection is an
    // endpoint id — so replaying it is what keeps a woken agent on that backend.
    agentEnv: baseCommand.env,
    // Why: picker flags are a one-time launch choice; a resumed provider
    // session restores its own state and must retain only explicit user args.
    agentCommand: baseCommand.commandWithoutSessionOptions
  })
}
