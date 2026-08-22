import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { Bot, BotCreateInput, BotUpdateInput } from '../../shared/bot-types'

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
}
