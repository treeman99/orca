import type { Bot, BotCreateInput, BotUpdateInput } from '../../shared/bot-types'

export type BotsApi = {
  list: () => Promise<Bot[]>
  create: (input: BotCreateInput) => Promise<Bot>
  update: (args: { id: string; updates: BotUpdateInput }) => Promise<Bot>
  delete: (args: { id: string }) => Promise<void>
}
