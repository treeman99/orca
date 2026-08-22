// Grouping the roster by project.
//
// A bot is only useful next to the code it works on, and delegation is scoped the same way:
// a coordinator hands work to teammates in ITS project, never across projects. Showing the
// roster in those groups makes that boundary visible instead of implied.

import type { Repo } from '../../../../../shared/repo-types'
import type { Bot } from '../../../../../shared/bot-types'

export type BotRosterGroup = {
  /** Repo id, or null for bots with no workspace binding yet. */
  projectId: string | null
  label: string
  bots: Bot[]
}

export function buildBotRosterGroups(args: {
  bots: readonly Bot[]
  repos: readonly Repo[]
  /** Shown for bots that have no project yet. */
  unassignedLabel: string
}): BotRosterGroup[] {
  const nameByProjectId = new Map(args.repos.map((repo) => [repo.id, repo.displayName]))
  const groups = new Map<string, BotRosterGroup>()
  const unassigned: Bot[] = []

  for (const bot of args.bots) {
    if (!bot.projectId) {
      unassigned.push(bot)
      continue
    }
    const existing = groups.get(bot.projectId)
    if (existing) {
      existing.bots.push(bot)
      continue
    }
    groups.set(bot.projectId, {
      projectId: bot.projectId,
      // A project the catalog no longer knows still gets a row: hiding the bot would make it
      // unreachable, and its id is more use than nothing.
      label: nameByProjectId.get(bot.projectId) ?? bot.projectId,
      bots: [bot]
    })
  }

  const ordered = [...groups.values()].sort((left, right) => left.label.localeCompare(right.label))
  if (unassigned.length > 0) {
    // Last: an unbound bot is unfinished setup, not a peer of the working groups.
    ordered.push({ projectId: null, label: args.unassignedLabel, bots: unassigned })
  }
  return ordered
}

/**
 * The teammates a bot may delegate to: same project, and able to run an agent.
 *
 * Excludes the bot itself, bots in other projects, and bots with no workspace — a folder-bound
 * or unbound teammate cannot be started, so promising it in a roster would repeat the bug
 * where a coordinator was told about teammates that could never appear.
 */
export function getProjectTeammates(bot: Bot, roster: readonly Bot[]): Bot[] {
  if (!bot.projectId) {
    return []
  }
  return roster.filter(
    (candidate) =>
      candidate.id !== bot.id &&
      candidate.projectId === bot.projectId &&
      Boolean(candidate.workspaceKey)
  )
}
