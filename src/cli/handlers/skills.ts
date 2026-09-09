import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { getRepeatedStringFlag } from '../flags'
import { writeStdoutLine } from '../stdout-line'
import { loadCanonicalGuides, type BundledSkillGuide } from './bundled-skill-guide-table'
import { SKILL_GUIDE_GET_HANDLER } from './skill-guide-get'
import { detectCommandsInInstallDirs } from '../../shared/local-agent-install-dir-detection'
import {
  getTuiAgentDetectionProbeCommands,
  KNOWN_TUI_AGENT_DETECTION_COMMANDS,
  resolveDetectedTuiAgentIds
} from '../../shared/tui-agent-detection-commands'
import { isSkillsCliAgentKeyShaped, toSkillsCliAgentKeys } from '../../shared/skills-cli-agent-keys'
import { knownAgentSkillInstallAgentKeys } from '../../shared/agent-skill-install-roots'
import { runOfflineSkillMutation, type OfflineSkillMutation } from './skills-offline-install'

function resolveSelectedSkillNames(
  flags: Map<string, string | boolean>,
  guides: BundledSkillGuide[]
): string[] {
  const requestedSkills = getRepeatedStringFlag(flags, 'skill')
  const selectAll = flags.get('all') === true
  if (flags.has('skill') && requestedSkills.length === 0) {
    throw new RuntimeClientError('invalid_argument', 'Missing required --skill')
  }
  if (selectAll && requestedSkills.length > 0) {
    throw new RuntimeClientError('invalid_argument', 'Use either --all or --skill, not both.')
  }
  if (!selectAll && requestedSkills.length === 0) {
    return []
  }
  if (selectAll) {
    return guides.map((guide) => guide.name)
  }
  const availableTopics = guides.map((guide) => guide.name).join(', ')
  const guideByTopic = new Map<string, BundledSkillGuide>(
    guides.flatMap((guide) => [guide.name, ...guide.aliases].map((name) => [name, guide]))
  )
  const canonicalNames = new Set<string>()
  for (const requested of requestedSkills) {
    const guide = guideByTopic.get(requested)
    if (!guide) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Unknown skill "${requested}". Available skills: ${availableTopics}`
      )
    }
    canonicalNames.add(guide.name)
  }
  return [...canonicalNames].sort()
}

type SkillMutationVerb = OfflineSkillMutation['verb']

/** Agents Orca can see on this host, as `skills --agent` keys. */
function detectSkillsCliAgentKeys(): string[] {
  const runtime = process.platform
  const probes = getTuiAgentDetectionProbeCommands(KNOWN_TUI_AGENT_DETECTION_COMMANDS, runtime)
  const detected = resolveDetectedTuiAgentIds(
    KNOWN_TUI_AGENT_DETECTION_COMMANDS,
    detectCommandsInInstallDirs(probes),
    runtime
  )
  return detected.length === 0 ? [] : toSkillsCliAgentKeys(detected)
}

function resolveInstallAgentKeys(flags: Map<string, string | boolean>): string[] {
  const requested = flags.get('agent')
  if (flags.has('agent') && typeof requested !== 'string') {
    throw new RuntimeClientError('invalid_argument', 'Missing required --agent')
  }
  if (typeof requested === 'string') {
    // Why: one comma-separated value rather than a repeatable flag — `agent` is a
    // single-value flag on other commands and the repeatable set is process-wide,
    // so making it repeatable here would change how those parse a second --agent.
    const keys = [
      ...new Set(
        requested
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    ]
    // Why: a value like "," parses to nothing. Falling through to detection would
    // be surprising, and emitting no --agent would restore the all-agents install.
    if (keys.length === 0) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --agent')
    }
    const unusable = keys.find((key) => !isSkillsCliAgentKeyShaped(key))
    if (unusable !== undefined) {
      // Why: the skills CLI drops a value starting with `-`, which leaves it with
      // no target and installs into every agent it knows.
      throw new RuntimeClientError(
        'invalid_argument',
        `Invalid --agent value "${unusable}". Pass agent names such as claude-code, ` +
          'codex, or universal.'
      )
    }
    const unknown = keys.find((key) => !knownAgentSkillInstallAgentKeys().includes(key))
    if (unknown !== undefined) {
      // Why: the offline installer writes only directories Orca also scans, so an
      // agent it has no root for would silently install nothing.
      throw new RuntimeClientError(
        'invalid_argument',
        `Orca has no skills directory for agent "${unknown}". Valid targets: ` +
          `${knownAgentSkillInstallAgentKeys().join(', ')}.`
      )
    }
    return keys
  }
  const detected = detectSkillsCliAgentKeys()
  const installable = detected.filter((key) => knownAgentSkillInstallAgentKeys().includes(key))
  if (installable.length > 0) {
    return installable
  }
  // Why: without --agent, `skills add -y` falls into its own zero-detected branch
  // and installs into every agent it knows (~75), creating config directories for
  // agents this host does not have. Say so instead.
  throw new RuntimeClientError(
    'invalid_environment',
    'No coding agent detected on this host, so there is no install target. Pass ' +
      '--agent <name>[,<name>...] to choose targets explicitly — --agent universal ' +
      'writes only the shared .agents/skills directory that Orca reads.'
  )
}

function formatSkillSelectionHelp(verb: SkillMutationVerb, skillNames: string[]): string {
  return [
    `Choose one or more skills to ${verb}:`,
    ...skillNames.map((name) => `  ${name}`),
    '',
    `Usage: orca skills ${verb} --skill <name> [--skill <name> ...]`,
    `   or: orca skills ${verb} --all`
  ].join('\n')
}

function createSkillMutationHandler(verb: SkillMutationVerb): CommandHandler {
  return async ({ flags, json }) => {
    const guides = await loadCanonicalGuides()
    const skillNames = resolveSelectedSkillNames(flags, guides)

    if (skillNames.length === 0) {
      const names = guides.map((guide) => guide.name)
      writeStdoutLine(
        json
          ? JSON.stringify({ availableSkills: names }, null, 2)
          : formatSkillSelectionHelp(verb, names)
      )
      return
    }

    // Why: this runs before target resolution because the answer belongs to the
    // other machine — agents detected here would be the wrong host's, and a host
    // that detects none would hide the forwarding problem behind that error.
    if (process.env.ORCA_CLI_CWD) {
      throw new RuntimeClientError(
        'invalid_environment',
        `orca skills ${verb} writes to the machine that runs it, but this shell forwards ` +
          `orca to the Orca host. Run the same orca skills ${verb} command on the machine ` +
          "you want it on, where it can detect that host's agents."
      )
    }

    const global = flags.get('local') !== true
    // Why: install scopes its targets; update only refreshes what is already placed.
    const agentKeys = verb === 'install' ? resolveInstallAgentKeys(flags) : []

    if (flags.get('dry-run') === true) {
      const plan = { skills: skillNames, global, agents: agentKeys, executed: false }
      writeStdoutLine(
        json
          ? JSON.stringify(plan, null, 2)
          : [
              `Would ${verb} from this build's bundled packages (no network):`,
              ...skillNames.map((name) => `  ${name}`),
              global ? '  scope: global' : '  scope: project',
              agentKeys.length > 0 ? `  agents: ${agentKeys.join(', ')}` : '',
              '',
              `Rerun without --dry-run to ${verb} now.`
            ]
              .filter(Boolean)
              .join('\n')
      )
      return
    }

    const report = await runOfflineSkillMutation({ verb, skillNames, global, agentKeys })
    writeStdoutLine(
      json
        ? JSON.stringify(
            { skills: skillNames, global, agents: agentKeys, failed: report.failedNames },
            null,
            2
          )
        : report.lines.join('\n')
    )
    if (report.failedNames.length > 0) {
      process.exitCode = 1
    }
  }
}

export const SKILL_HANDLERS: Record<string, CommandHandler> = {
  'skills list': async ({ json }) => {
    // Why: generated registry order is not a user-facing contract, while stable
    // canonical sorting keeps agent-visible output reproducible across builds.
    const topics = (await loadCanonicalGuides()).map((guide) => ({
      name: guide.name,
      description: guide.description.replace(/\s+/g, ' ').trim()
    }))
    writeStdoutLine(
      json
        ? JSON.stringify({ topics }, null, 2)
        : topics.map((topic) => `${topic.name}: ${topic.description}`).join('\n')
    )
  },
  ...SKILL_GUIDE_GET_HANDLER,
  'skills install': createSkillMutationHandler('install'),
  'skills update': createSkillMutationHandler('update')
}
