import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { BotDeliveryResult } from '@/components/sidebar/bots/bot-chat-delivery'
import {
  formatBotToBotMessage,
  parseBotMention
} from '@/components/sidebar/bots/bot-message-routing'

/**
 * One line of the log Orca itself owns for a bot.
 *
 * Deliberately NOT the conversation: the authoritative transcript is the agent's own session,
 * which Orca reads but never writes. This records only what Orca routed — what you sent and
 * what another bot relayed — so the chat surface can show a thread without inventing a store
 * that would drift from the agent's.
 */
export type BotChatEntry = {
  id: string
  kind: 'sent' | 'relayed-out' | 'relayed-in' | 'error'
  text: string
  /** Set on relayed entries: who addressed whom. */
  counterpartBotId?: string
  counterpartName?: string
  at: number
}

/** Bounded: this is a UI convenience log, not history. */
const MAX_ENTRIES_PER_BOT = 50

export type BotSendFailureReason = Extract<BotDeliveryResult, { ok: false }>['reason']

export type BotSendOutcome =
  | { status: 'delivered'; targetBotId: string; launched: boolean }
  | { status: 'unknown-handle'; handle: string }
  | { status: 'failed'; reason: BotSendFailureReason; botId: string }

export type BotChatSlice = {
  /** Session-only. Lost on restart by design — the agent session holds the real thread. */
  botChatLog: Record<string, BotChatEntry[]>
  /** Bots that received a relayed message while the user was looking elsewhere. */
  unreadBotIds: string[]
  botSendInFlight: string[]
  sendBotMessage: (args: { botId: string; text: string }) => Promise<BotSendOutcome | null>
  /** Bring a bot's conversation up with nothing to do, so it can be opened or delegated to. */
  startBotSession: (botId: string) => Promise<'started' | 'exists' | 'failed'>
  markBotChatRead: (botId: string) => void
  clearBotChat: (botId: string) => void
}

function appendEntry(
  log: Record<string, BotChatEntry[]>,
  botId: string,
  entry: BotChatEntry
): Record<string, BotChatEntry[]> {
  const next = [...(log[botId] ?? []), entry]
  return { ...log, [botId]: next.slice(-MAX_ENTRIES_PER_BOT) }
}

export const createBotChatSlice: StateCreator<AppState, [], [], BotChatSlice> = (set, get) => ({
  botChatLog: {},
  unreadBotIds: [],
  botSendInFlight: [],

  sendBotMessage: async ({ botId, text }) => {
    const body = text.trim()
    if (!body) {
      return null
    }
    const state = get()
    const sender = state.bots.find((bot) => bot.id === botId)
    if (!sender) {
      return null
    }

    // A LEADING @handle re-addresses the message; anything else is prose for this bot.
    const mention = parseBotMention(body, state.bots)
    if (mention && !mention.target) {
      return { status: 'unknown-handle', handle: mention.handle }
    }
    const relaying = Boolean(mention?.target && mention.target.id !== sender.id)
    const recipient = relaying ? mention!.target! : sender
    const payload = relaying
      ? formatBotToBotMessage({ fromBot: sender, body: mention!.body })
      : body

    set((current) => ({ botSendInFlight: [...current.botSendInFlight, recipient.id] }))
    // Imported at call time, not at module scope: the delivery path reaches the agent
    // launcher, which imports the store this slice belongs to. A static edge there makes the
    // whole store module cycle and evaluate to undefined slice factories.
    const { deliverToBot, ensureProjectTeammateSessions } =
      await import('@/components/sidebar/bots/bot-chat-delivery')
    // Before delivering, not after: the coordinator's first act is to look for teammates, and
    // a roster that is not up yet reads to it as "nobody to delegate to".
    const startedTeammates = await ensureProjectTeammateSessions({
      bot: recipient,
      roster: get().bots
    })
    for (const started of startedTeammates) {
      void get().updateBot(started.botId, { chatPaneKey: started.paneKey })
    }
    const result = await deliverToBot({
      bot: recipient,
      text: payload,
      roster: get().bots
    })
    set((current) => ({
      botSendInFlight: current.botSendInFlight.filter((id) => id !== recipient.id)
    }))

    const at = Date.now()
    if (!result.ok) {
      set((current) => ({
        botChatLog: appendEntry(current.botChatLog, sender.id, {
          id: createBrowserUuid(),
          kind: 'error',
          text: body,
          at
        })
      }))
      return { status: 'failed', reason: result.reason, botId: recipient.id }
    }

    // The pane binding follows the bot, not the message: a relayed message opens the
    // RECIPIENT's conversation, so that is the bot whose binding moves.
    if (recipient.chatPaneKey !== result.paneKey) {
      void get().updateBot(recipient.id, { chatPaneKey: result.paneKey })
    }

    set((current) => {
      let log = appendEntry(current.botChatLog, sender.id, {
        id: createBrowserUuid(),
        kind: relaying ? 'relayed-out' : 'sent',
        text: relaying ? mention!.body : body,
        ...(relaying ? { counterpartBotId: recipient.id, counterpartName: recipient.name } : {}),
        at
      })
      if (relaying) {
        log = appendEntry(log, recipient.id, {
          id: createBrowserUuid(),
          kind: 'relayed-in',
          text: mention!.body,
          counterpartBotId: sender.id,
          counterpartName: sender.name,
          at
        })
      }
      return {
        botChatLog: log,
        unreadBotIds:
          relaying && current.selectedBotId !== recipient.id
            ? Array.from(new Set([...current.unreadBotIds, recipient.id]))
            : current.unreadBotIds
      }
    })

    return { status: 'delivered', targetBotId: recipient.id, launched: result.launched }
  },

  startBotSession: async (botId) => {
    const bot = get().bots.find((entry) => entry.id === botId)
    if (!bot) {
      return 'failed'
    }
    set((current) => ({ botSendInFlight: [...current.botSendInFlight, botId] }))
    const { startBotStandbySession } = await import('@/components/sidebar/bots/bot-chat-delivery')
    const paneKey = await startBotStandbySession(bot, get().bots)
    set((current) => ({
      botSendInFlight: current.botSendInFlight.filter((id) => id !== botId)
    }))
    if (!paneKey) {
      return 'failed'
    }
    await get().updateBot(botId, { chatPaneKey: paneKey })
    return 'started'
  },

  markBotChatRead: (botId) =>
    set((current) => ({ unreadBotIds: current.unreadBotIds.filter((id) => id !== botId) })),

  clearBotChat: (botId) =>
    set((current) => {
      const { [botId]: _removed, ...rest } = current.botChatLog
      return { botChatLog: rest, unreadBotIds: current.unreadBotIds.filter((id) => id !== botId) }
    })
})
