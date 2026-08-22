// Pure: turns the store's workspace catalogs into the bot editor's picker options.
//
// Folder workspaces are listed but flagged: the automation lane resolves its run target
// through worktree ids only, so a folder-bound bot is a real, savable bot that simply
// cannot own a routine. Hiding folders instead would make the refusal impossible to
// explain — the user would just never see their workspace.

import type { FolderWorkspace } from '../../../../../shared/folder-workspace-types'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { folderWorkspaceKey, worktreeWorkspaceKey } from '../../../../../shared/workspace-scope'

export type BotWorkspaceOption = {
  /** WorkspaceKey; the value stored on the bot. */
  value: string
  label: string
  groupLabel: string
  projectId: string | null
  /** False for folder workspaces: savable as a binding, not usable for routines. */
  supportsRoutines: boolean
}

export function buildBotWorkspaceOptions(input: {
  repos: readonly Repo[]
  worktreesByRepo: Readonly<Record<string, Worktree[]>>
  folderWorkspaces: readonly FolderWorkspace[]
}): BotWorkspaceOption[] {
  const options: BotWorkspaceOption[] = []
  for (const repo of input.repos) {
    for (const worktree of input.worktreesByRepo[repo.id] ?? []) {
      options.push({
        value: worktreeWorkspaceKey(worktree.id),
        label: worktree.displayName,
        groupLabel: repo.displayName,
        projectId: repo.id,
        supportsRoutines: true
      })
    }
  }
  for (const folder of input.folderWorkspaces) {
    options.push({
      value: folderWorkspaceKey(folder.id),
      label: folder.name,
      groupLabel: folder.folderPath,
      projectId: null,
      supportsRoutines: false
    })
  }
  return options
}

export function findBotWorkspaceOption(
  options: readonly BotWorkspaceOption[],
  workspaceKey: string | null
): BotWorkspaceOption | null {
  if (!workspaceKey) {
    return null
  }
  return options.find((option) => option.value === workspaceKey) ?? null
}
