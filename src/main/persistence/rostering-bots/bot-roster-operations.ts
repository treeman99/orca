import { randomUUID } from 'node:crypto'
import {
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  DEFAULT_BOT_AVATAR,
  type Bot,
  type BotCreateInput,
  type BotUpdateInput
} from '../../../shared/bot-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { isWorkspaceKey } from '../../../shared/workspace-scope'
import type { StoreOwnedPersistedState } from '../loading-store/store-owned-state'

export type BotRosterOperations = {
  state: StoreOwnedPersistedState
  flush: () => void
  /** Detaches the deleted bot's routines instead of deleting them; see deleteBot. */
  detachBotRoutines: (botId: string) => void
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

// Why not throw: an admin-deployed or hand-edited state file with a junk workspaceKey
// should leave the bot unbound and visible, not make the whole roster unreadable.
function normalizeWorkspaceKey(value: string | null | undefined): string | null {
  return typeof value === 'string' && isWorkspaceKey(value) ? value : null
}

export function listBots(state: PersistedState): Bot[] {
  return [...(state.bots ?? [])].sort((left, right) => left.name.localeCompare(right.name))
}

export function createBot(operations: BotRosterOperations, input: BotCreateInput): Bot {
  const now = Date.now()
  const workspaceKey = normalizeWorkspaceKey(input.workspaceKey)
  const bot: Bot = {
    id: randomUUID(),
    name: clamp(input.name, BOT_NAME_MAX_LENGTH) || 'Untitled bot',
    title: clamp(input.title ?? '', BOT_TITLE_MAX_LENGTH),
    description: clamp(input.description ?? '', BOT_DESCRIPTION_MAX_LENGTH),
    avatarEmoji: input.avatarEmoji?.trim() || DEFAULT_BOT_AVATAR,
    agentId: input.agentId,
    workspaceKey,
    // A project without a workspace is meaningless to the routine lane, and a workspace
    // without a project cannot create one; keep the pair consistent at the door.
    projectId: workspaceKey ? (input.projectId ?? null) : null,
    chatPaneKey: null,
    createdAt: now,
    updatedAt: now
  }
  operations.state.bots = [...(operations.state.bots ?? []), bot]
  operations.flush()
  return bot
}

export function updateBot(
  operations: BotRosterOperations,
  id: string,
  updates: BotUpdateInput
): Bot {
  const bots = operations.state.bots ?? []
  const index = bots.findIndex((entry) => entry.id === id)
  if (index === -1) {
    throw new Error('Bot not found.')
  }
  const current = bots[index]
  // Why: the renderer forwards a Partial verbatim, so `{ title: undefined }` survives
  // structuredClone and would blank the stored value in the spread below.
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as BotUpdateInput
  const workspaceKey = Object.hasOwn(defined, 'workspaceKey')
    ? normalizeWorkspaceKey(defined.workspaceKey)
    : current.workspaceKey
  const projectId = Object.hasOwn(defined, 'projectId') ? defined.projectId : current.projectId
  // Rebinding the workspace strands the old pane: it lives in a checkout this bot no longer
  // works in, so the next message must open a fresh conversation rather than resume there.
  const workspaceChanged = workspaceKey !== current.workspaceKey
  const chatPaneKey = workspaceChanged
    ? null
    : Object.hasOwn(defined, 'chatPaneKey')
      ? (defined.chatPaneKey ?? null)
      : (current.chatPaneKey ?? null)
  const updated: Bot = {
    ...current,
    ...defined,
    name: defined.name === undefined ? current.name : clamp(defined.name, BOT_NAME_MAX_LENGTH),
    title: defined.title === undefined ? current.title : clamp(defined.title, BOT_TITLE_MAX_LENGTH),
    description:
      defined.description === undefined
        ? current.description
        : clamp(defined.description, BOT_DESCRIPTION_MAX_LENGTH),
    avatarEmoji: defined.avatarEmoji?.trim() || current.avatarEmoji,
    workspaceKey,
    projectId: workspaceKey ? (projectId ?? null) : null,
    chatPaneKey,
    updatedAt: Date.now()
  }
  const next = [...bots]
  next[index] = updated
  operations.state.bots = next
  operations.flush()
  return updated
}

/**
 * Remove the bot and detach its routines.
 *
 * Deliberately not a cascade delete: a routine is a scheduled agent run the user set up,
 * and deleting a roster entry must not silently cancel work. Detached routines keep
 * running and stay visible on the Automations page, where they can be reassigned or
 * removed on purpose.
 */
export function deleteBot(operations: BotRosterOperations, id: string): void {
  operations.state.bots = (operations.state.bots ?? []).filter((entry) => entry.id !== id)
  operations.detachBotRoutines(id)
  operations.flush()
}
