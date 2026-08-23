import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { Bot, BotCreateInput, BotUpdateInput } from '../../shared/bot-types'
import type {
  BotGroupChat,
  BotGroupChatCreateInput,
  BotGroupChatUpdateInput
} from '../../shared/bot-group-chat-types'

export function registerBotHandlers(store: Store): void {
  ipcMain.handle('bots:list', (): Bot[] => store.listBots())
  ipcMain.handle('bots:create', (_event, input: BotCreateInput): Bot => store.createBot(input))
  ipcMain.handle(
    'bots:update',
    (_event, args: { id: string; updates: BotUpdateInput }): Bot =>
      store.updateBot(args.id, args.updates)
  )
  ipcMain.handle('bots:delete', (_event, args: { id: string }): void => {
    store.deleteBot(args.id)
  })

  ipcMain.handle('botGroupChats:list', (): BotGroupChat[] => store.listBotGroupChats())
  ipcMain.handle(
    'botGroupChats:create',
    (_event, input: BotGroupChatCreateInput): BotGroupChat => store.createBotGroupChat(input)
  )
  ipcMain.handle(
    'botGroupChats:update',
    (_event, args: { id: string; updates: BotGroupChatUpdateInput }): BotGroupChat =>
      store.updateBotGroupChat(args.id, args.updates)
  )
  ipcMain.handle('botGroupChats:delete', (_event, args: { id: string }): void => {
    store.deleteBotGroupChat(args.id)
  })
}
