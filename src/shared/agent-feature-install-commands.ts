import { isSkillsCliAgentKeyShaped } from './skills-cli-agent-keys'

/**
 * Default name of the registered Orca command. Hosts that register a different one —
 * `orca-ide` on Linux and WSL, where `orca` is GNOME's screen reader — pass their own.
 */
export const ORCA_CLI_COMMAND_NAME = 'orca'

/** Linux and WSL registration name — `/usr/bin/orca` there is GNOME's screen reader. */
export const LINUX_ORCA_CLI_COMMAND_NAME = 'orca-ide'

export const ORCA_CLI_SKILL_NAME = 'orca-cli'
export const COMPUTER_USE_SKILL_NAME = 'computer-use'
export const ORCHESTRATION_SKILL_NAME = 'orchestration'
export const EPHEMERAL_VMS_SKILL_NAME = 'orca-per-workspace-env'
export const ORCA_LINEAR_SKILL_NAME = 'orca-linear'
export const LINEAR_TICKETS_SKILL_NAME = 'linear-tickets'
export const LINEAR_AGENT_SKILL_NAMES = [ORCA_LINEAR_SKILL_NAME, LINEAR_TICKETS_SKILL_NAME] as const

// Why: `global` defaults on because every Settings/onboarding string installs for all
// projects. `agents` defaults empty so the CLI runs its own detection on the machine
// that will actually hold the skill.
export type AgentFeatureSkillCommandOptions = {
  global?: boolean
  agents?: readonly string[]
  /** Registered Orca command for the host that will run this. Defaults to `orca`. */
  commandName?: string
}

function assertUsableAgents(agents: readonly string[]): void {
  // Why: an agent key Orca has no skills directory for would install nothing, and the
  // CLI rejects it loudly — catching the shape here keeps the printed command honest.
  const unusable = agents.find((agent) => !isSkillsCliAgentKeyShaped(agent))
  if (unusable !== undefined) {
    throw new Error(`"${unusable}" is not a usable install target.`)
  }
}

export function buildAgentFeatureSkillInstallArgs(
  skillNames: readonly string[],
  options: AgentFeatureSkillCommandOptions = {}
): string[] {
  if (skillNames.length === 0) {
    throw new Error('At least one skill name is required.')
  }
  const agents = options.agents ?? []
  assertUsableAgents(agents)
  return [
    'skills',
    'install',
    // Why: one flag per name remains compatible with both single-value and variadic parsers.
    ...skillNames.flatMap((name) => ['--skill', name]),
    // Global is the CLI's default, so only the project scope needs a flag.
    ...(options.global === false ? ['--local'] : []),
    ...agents.flatMap((agent) => ['--agent', agent])
  ]
}

/**
 * The command Orca prints for installing its own skills.
 *
 * It runs Orca's own CLI, which copies the skill packages shipped inside the build —
 * no npm registry, no GitHub, no npx. That is what lets it complete on a locked-down
 * corporate network, where the community `skills` CLI cannot be fetched at all.
 */
export function buildAgentFeatureSkillInstallCommand(
  skillNames: readonly string[],
  options: AgentFeatureSkillCommandOptions = {}
): string {
  const command = options.commandName ?? ORCA_CLI_COMMAND_NAME
  return `${command} ${buildAgentFeatureSkillInstallArgs(skillNames, options).join(' ')}`
}

export function buildAgentFeatureSkillUpdateArgs(
  skillNames: string | readonly string[],
  options: AgentFeatureSkillCommandOptions = {}
): string[] {
  const rawNames = typeof skillNames === 'string' ? [skillNames] : skillNames
  const names = rawNames.map((name) => name.trim()).filter((name) => name.length > 0)
  if (names.length === 0) {
    throw new Error('A skill name is required.')
  }
  return [
    'skills',
    'update',
    ...names.flatMap((name) => ['--skill', name]),
    ...(options.global === false ? ['--local'] : [])
  ]
}

export function buildAgentFeatureSkillUpdateCommand(
  skillNames: string | readonly string[],
  options: AgentFeatureSkillCommandOptions = {}
): string {
  const command = options.commandName ?? ORCA_CLI_COMMAND_NAME
  return `${command} ${buildAgentFeatureSkillUpdateArgs(skillNames, options).join(' ')}`
}

export const ORCA_CLI_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_CLI_SKILL_NAME
])

export const ORCA_CLI_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(ORCA_CLI_SKILL_NAME)

export const COMPUTER_USE_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  COMPUTER_USE_SKILL_NAME
])

export const COMPUTER_USE_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(COMPUTER_USE_SKILL_NAME)

export const ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])

export const ORCHESTRATION_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(ORCHESTRATION_SKILL_NAME)

export const EPHEMERAL_VMS_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  EPHEMERAL_VMS_SKILL_NAME
])

export const EPHEMERAL_VMS_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(EPHEMERAL_VMS_SKILL_NAME)

export const ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
])

export const ORCA_LINEAR_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCA_LINEAR_SKILL_NAME
])

export const ORCA_LINEAR_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(ORCA_LINEAR_SKILL_NAME)

export const LINEAR_TICKETS_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  LINEAR_TICKETS_SKILL_NAME
])

export const LINEAR_TICKETS_SKILL_UPDATE_COMMAND =
  buildAgentFeatureSkillUpdateCommand(LINEAR_TICKETS_SKILL_NAME)
