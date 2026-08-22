// A bot belongs to a PROJECT, not to a checkout.
//
// The first version asked for a workspace, which leaked an implementation detail: the routine
// lane happens to resolve its run target through a worktree id. But that is Orca's problem,
// not the user's — nobody thinks "this bot works on the third worktree of Orca", they think
// "this bot works on Orca". So the picker offers projects and this module resolves the
// checkout behind each one.

import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { worktreeWorkspaceKey } from '../../../../../shared/workspace-scope'

export type BotProjectOption = {
  projectId: string
  label: string
  /** The checkout the bot will run in, resolved from the project. */
  worktreeId: string | null
  /** WorkspaceKey stored on the bot, or null when the project has no checkout yet. */
  workspaceKey: string | null
}

/**
 * The checkout a bot on this project should run in.
 *
 * Main worktree first: it is the one that exists for every project and the one a person means
 * by "the repo". A feature worktree can disappear when its branch is merged, which would
 * strand every bot bound to it.
 */
export function resolveProjectWorktree(worktrees: readonly Worktree[]): Worktree | null {
  return worktrees.find((worktree) => worktree.isMainWorktree) ?? worktrees[0] ?? null
}

export function buildBotProjectOptions(input: {
  repos: readonly Repo[]
  worktreesByRepo: Readonly<Record<string, Worktree[]>>
}): BotProjectOption[] {
  return input.repos.map((repo) => {
    const worktree = resolveProjectWorktree(input.worktreesByRepo[repo.id] ?? [])
    return {
      projectId: repo.id,
      label: repo.displayName,
      worktreeId: worktree?.id ?? null,
      workspaceKey: worktree ? worktreeWorkspaceKey(worktree.id) : null
    }
  })
}

export function findBotProjectOption(
  options: readonly BotProjectOption[],
  projectId: string | null
): BotProjectOption | null {
  if (!projectId) {
    return null
  }
  return options.find((option) => option.projectId === projectId) ?? null
}
