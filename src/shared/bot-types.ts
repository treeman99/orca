// A bot is a NAME over primitives Orca already owns — an agent choice, a workspace
// binding, and the automations that carry its routines. It deliberately has no runtime of
// its own: every run still goes through AutomationService and OrcaRuntimeService, so a
// bot inherits their SSH boundary, their enterprise gate, and their run history for free.
//
// The alternative (a bot process, a bot conversation store, a bot scheduler) would have
// duplicated three subsystems and left the copies to drift. See docs/reference/bot-lane.md.

import type { TuiAgent } from './tui-agent'
import { parseWorkspaceKey } from './workspace-scope'

export type Bot = {
  id: string
  /** Display name. The @-handle is derived from it, never stored, so a rename cannot
   *  leave a stale address behind. */
  name: string
  /** One line: the job this bot is for. Shown under the name in the roster. */
  title: string
  description: string
  /** Roster avatar. An emoji, not an upload — an image store is its own decision. */
  avatarEmoji: string
  agentId: TuiAgent
  /** `worktree:<id>` or `folder:<id>`; null while the bot is unbound. Stored as a
   *  WorkspaceKey rather than a worktree id so a folder-bound bot is representable and
   *  can be refused explicitly instead of failing somewhere downstream. */
  workspaceKey: string | null
  /** Repo id the routines are created against; null while unbound. */
  projectId: string | null
  /**
   * Pane that holds this bot's one conversation, as `tabId:leafId`.
   *
   * Durable on purpose — the PTY id is not. A pane key survives a PTY restart, so the bot
   * re-attaches to the same conversation whenever the daemon kept it alive, and a dead
   * pane simply re-launches under the same binding. This is Orca's stand-in for Hermes's
   * canonical Bot Chat: one pinned session per bot, never forked.
   */
  chatPaneKey: string | null
  createdAt: number
  updatedAt: number
}

export type BotCreateInput = {
  name: string
  title?: string
  description?: string
  avatarEmoji?: string
  agentId: TuiAgent
  workspaceKey?: string | null
  projectId?: string | null
}

export type BotUpdateInput = Partial<
  Pick<
    Bot,
    | 'name'
    | 'title'
    | 'description'
    | 'avatarEmoji'
    | 'agentId'
    | 'workspaceKey'
    | 'projectId'
    | 'chatPaneKey'
  >
>

export const BOT_NAME_MAX_LENGTH = 48
export const BOT_TITLE_MAX_LENGTH = 80
export const BOT_DESCRIPTION_MAX_LENGTH = 500

/** Avatars offered in the editor. Faces and objects a role reads from at 20px. */
export const BOT_AVATAR_CHOICES: readonly string[] = [
  '🤖',
  '🛠️',
  '🔍',
  '📋',
  '🧪',
  '🚦',
  '📦',
  '🧹',
  '📊',
  '🔔',
  '🗂️',
  '🦺'
]

export const DEFAULT_BOT_AVATAR = BOT_AVATAR_CHOICES[0]

/**
 * The @-handle for a bot, derived from its name.
 *
 * Derived rather than stored so a rename cannot leave a stale address behind. Collisions
 * are possible and deliberately not resolved here — the roster shows names, and the
 * addressing layer that would need uniqueness does not exist yet.
 */
export function botHandle(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'bot'
}

export type BotWorkspaceBinding =
  | { kind: 'unbound' }
  | { kind: 'worktree'; worktreeId: string }
  | { kind: 'folder'; folderWorkspaceId: string }

export function getBotWorkspaceBinding(bot: Pick<Bot, 'workspaceKey'>): BotWorkspaceBinding {
  const scope = bot.workspaceKey ? parseWorkspaceKey(bot.workspaceKey) : null
  if (scope?.type === 'worktree') {
    return { kind: 'worktree', worktreeId: scope.worktreeId }
  }
  if (scope?.type === 'folder') {
    return { kind: 'folder', folderWorkspaceId: scope.folderWorkspaceId }
  }
  return { kind: 'unbound' }
}

export type BotRoutineEligibility =
  | { ok: true; worktreeId: string; projectId: string }
  | { ok: false; reason: 'unbound' | 'folder_workspace' | 'no_project' }

/**
 * Whether this bot can own a scheduled routine, and why not when it cannot.
 *
 * Folder workspaces are refused up front rather than left to fail downstream: the
 * automation lane resolves its run target through worktree ids and has no folder path at
 * all, so a folder-bound routine would be created successfully and then skip forever with
 * "Automation run target is no longer available."
 */
export function getBotRoutineEligibility(
  bot: Pick<Bot, 'workspaceKey' | 'projectId'>
): BotRoutineEligibility {
  const binding = getBotWorkspaceBinding(bot)
  if (binding.kind === 'unbound') {
    return { ok: false, reason: 'unbound' }
  }
  if (binding.kind === 'folder') {
    return { ok: false, reason: 'folder_workspace' }
  }
  if (!bot.projectId) {
    return { ok: false, reason: 'no_project' }
  }
  return { ok: true, worktreeId: binding.worktreeId, projectId: bot.projectId }
}
