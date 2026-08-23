import type { Bot, BotCreateInput, BotUpdateInput } from '../../shared/bot-types'
import type {
  BotGroupChat,
  BotGroupChatCreateInput,
  BotGroupChatUpdateInput
} from '../../shared/bot-group-chat-types'

export type BotsApi = {
  list: () => Promise<Bot[]>
  create: (input: BotCreateInput) => Promise<Bot>
  update: (args: { id: string; updates: BotUpdateInput }) => Promise<Bot>
  delete: (args: { id: string }) => Promise<void>
}

export type BotGroupChatsApi = {
  list: () => Promise<BotGroupChat[]>
  create: (input: BotGroupChatCreateInput) => Promise<BotGroupChat>
  update: (args: { id: string; updates: BotGroupChatUpdateInput }) => Promise<BotGroupChat>
  delete: (args: { id: string }) => Promise<void>
}
