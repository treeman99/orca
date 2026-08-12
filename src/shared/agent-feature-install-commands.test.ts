import { describe, expect, it } from 'vitest'
import {
  buildAgentFeatureSkillInstallArgs,
  buildAgentFeatureSkillInstallCommand,
  ORCA_CLI_SKILL_INSTALL_COMMAND,
  buildAgentFeatureSkillUpdateArgs,
  buildAgentFeatureSkillUpdateCommand,
  COMPUTER_USE_SKILL_UPDATE_COMMAND,
  EPHEMERAL_VMS_SKILL_UPDATE_COMMAND,
  LINEAR_TICKETS_SKILL_UPDATE_COMMAND,
  ORCA_LINEAR_SKILL_UPDATE_COMMAND,
  ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND,
  ORCA_CLI_SKILL_UPDATE_COMMAND,
  ORCHESTRATION_SKILL_UPDATE_COMMAND
} from './agent-feature-install-commands'

describe('agent feature skill commands', () => {
  it('builds a global install command by default', () => {
    expect(buildAgentFeatureSkillInstallCommand(['orca-cli'])).toBe(
      'orca skills install --skill orca-cli'
    )
  })

  it('adds --local when installing into the current project', () => {
    expect(buildAgentFeatureSkillInstallCommand(['orca-cli'], { global: false })).toBe(
      'orca skills install --skill orca-cli --local'
    )
  })

  // The whole point of the offline lane: a corporate network reaches neither the npm
  // registry nor github.com, so a printed command that needs either can never complete.
  it('never sends the user to npx or a vendor repository', () => {
    const commands = [
      ORCA_CLI_SKILL_INSTALL_COMMAND,
      ORCA_CLI_SKILL_UPDATE_COMMAND,
      COMPUTER_USE_SKILL_UPDATE_COMMAND,
      ORCHESTRATION_SKILL_UPDATE_COMMAND,
      EPHEMERAL_VMS_SKILL_UPDATE_COMMAND,
      ORCA_LINEAR_SKILL_UPDATE_COMMAND,
      LINEAR_TICKETS_SKILL_UPDATE_COMMAND,
      ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND,
      buildAgentFeatureSkillInstallCommand(['orca-cli'], { agents: ['universal'] })
    ]
    for (const command of commands) {
      expect(command).not.toContain('npx')
      expect(command).not.toContain('github.com')
      expect(command).not.toContain('http')
      expect(command.startsWith('orca skills ')).toBe(true)
    }
  })

  it('repeats --skill per name for multi-skill installs', () => {
    expect(buildAgentFeatureSkillInstallCommand(['orca-cli', 'orchestration'])).toBe(
      'orca skills install --skill orca-cli --skill orchestration'
    )
    expect(buildAgentFeatureSkillInstallArgs(['orca-cli', 'orchestration'])).toEqual([
      'skills',
      'install',
      '--skill',
      'orca-cli',
      '--skill',
      'orchestration'
    ])
  })

  it('refuses a target the CLI would drop', () => {
    // Why: a `-`-leading --agent value is parsed as a flag, which would leave the
    // command with no target at all.
    expect(() => buildAgentFeatureSkillInstallCommand(['orca-cli'], { agents: ['-y'] })).toThrow(
      '"-y" is not a usable install target.'
    )
    expect(() =>
      buildAgentFeatureSkillInstallArgs(['orca-cli'], { agents: ['universal', 'a b'] })
    ).toThrow('"a b" is not a usable install target.')
  })

  it('appends explicit agent targets', () => {
    expect(buildAgentFeatureSkillInstallCommand(['orca-cli'], { agents: ['universal'] })).toBe(
      'orca skills install --skill orca-cli --agent universal'
    )
  })

  it('retargets the command name for hosts that register orca-ide', () => {
    expect(buildAgentFeatureSkillInstallCommand(['orca-cli'], { commandName: 'orca-ide' })).toBe(
      'orca-ide skills install --skill orca-cli'
    )
    expect(buildAgentFeatureSkillUpdateCommand('orca-cli', { commandName: 'orca-ide' })).toBe(
      'orca-ide skills update --skill orca-cli'
    )
  })

  it('builds single-skill update commands', () => {
    expect(buildAgentFeatureSkillUpdateCommand('orchestration')).toBe(
      'orca skills update --skill orchestration'
    )
  })

  it('trims and rejects blank update skill names', () => {
    expect(buildAgentFeatureSkillUpdateCommand('  orca-cli  ')).toBe(
      'orca skills update --skill orca-cli'
    )
    expect(() => buildAgentFeatureSkillUpdateCommand('   ')).toThrow('A skill name is required.')
  })

  it('builds multi-skill update commands and selects project scope for --local', () => {
    expect(buildAgentFeatureSkillUpdateCommand(['orca-cli', 'orchestration'])).toBe(
      'orca skills update --skill orca-cli --skill orchestration'
    )
    expect(buildAgentFeatureSkillUpdateCommand(['orca-cli'], { global: false })).toBe(
      'orca skills update --skill orca-cli --local'
    )
    expect(buildAgentFeatureSkillUpdateArgs(['orca-cli'], { global: false })).toEqual([
      'skills',
      'update',
      '--skill',
      'orca-cli',
      '--local'
    ])
    expect(() => buildAgentFeatureSkillUpdateCommand([])).toThrow('A skill name is required.')
  })

  it('exports single-skill update constants without changing install bundles', () => {
    expect(ORCA_CLI_SKILL_UPDATE_COMMAND).toBe('orca skills update --skill orca-cli')
    expect(COMPUTER_USE_SKILL_UPDATE_COMMAND).toBe('orca skills update --skill computer-use')
    expect(ORCHESTRATION_SKILL_UPDATE_COMMAND).toBe('orca skills update --skill orchestration')
    expect(EPHEMERAL_VMS_SKILL_UPDATE_COMMAND).toBe(
      'orca skills update --skill orca-per-workspace-env'
    )
    expect(ORCA_LINEAR_SKILL_UPDATE_COMMAND).toBe('orca skills update --skill orca-linear')
    expect(LINEAR_TICKETS_SKILL_UPDATE_COMMAND).toBe('orca skills update --skill linear-tickets')
    expect(ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND).toBe(
      buildAgentFeatureSkillInstallCommand(['orca-cli', 'orchestration'])
    )
  })
})
