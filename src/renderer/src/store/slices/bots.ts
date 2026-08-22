import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { Bot, BotCreateInput, BotUpdateInput } from '../../../../shared/bot-types'
import type { Automation, AutomationRun } from '../../../../shared/automations-types'
import type { AppState } from '../types'

export type BotsSlice = {
  bots: Bot[]
  botsLoaded: boolean
  botsLoading: boolean
  /** Roster selection. Null shows the empty state, not the first bot: a bot detail pane
   *  that opens on its own steals the sidebar from whatever the user was doing. */
  selectedBotId: string | null
  botRoutines: Automation[]
  botRoutineRuns: AutomationRun[]
  fetchBots: () => Promise<void>
  fetchBotRoutines: () => Promise<void>
  createBot: (input: BotCreateInput) => Promise<Bot | null>
  updateBot: (id: string, updates: BotUpdateInput) => Promise<Bot | null>
  deleteBot: (id: string) => Promise<void>
  setSelectedBotId: (id: string | null) => void
  /** Collapsed project groups in the roster. Session-only; a view preference, not data. */
  collapsedBotProjectIds: string[]
  toggleBotProjectCollapsed: (projectKey: string) => void
}

function reportBotFailure(error: unknown): void {
  toast.error(
    translate('auto.store.slices.bots.f1c0a4e7b2', 'Could not save the bot.'),
    error instanceof Error ? { description: error.message } : undefined
  )
}

export const createBotsSlice: StateCreator<AppState, [], [], BotsSlice> = (set, get) => ({
  bots: [],
  botsLoaded: false,
  botsLoading: false,
  selectedBotId: null,
  collapsedBotProjectIds: [],
  botRoutines: [],
  botRoutineRuns: [],

  fetchBots: async () => {
    set({ botsLoading: true })
    try {
      const bots = await window.api.bots.list()
      set({ bots, botsLoaded: true, botsLoading: false })
    } catch {
      // A build without the bot IPC surface simply shows an empty roster.
      set({ bots: [], botsLoaded: true, botsLoading: false })
    }
  },

  // Routines are ordinary automations tagged with a botId, so the bot lane reads the
  // automation store rather than keeping a second copy that could disagree with it.
  fetchBotRoutines: async () => {
    try {
      const [automations, runs] = await Promise.all([
        window.api.automations.list(),
        window.api.automations.listRuns()
      ])
      const routines = automations.filter((automation) => Boolean(automation.botId))
      const routineIds = new Set(routines.map((routine) => routine.id))
      set({
        botRoutines: routines,
        // Bounded on purpose: listRuns() returns every automation's history, and the bot
        // lane only ever shows the latest run per routine.
        botRoutineRuns: runs.filter((run) => routineIds.has(run.automationId))
      })
    } catch {
      set({ botRoutines: [], botRoutineRuns: [] })
    }
  },

  createBot: async (input) => {
    try {
      const bot = await window.api.bots.create(input)
      set((state) => ({
        bots: [...state.bots, bot].sort((left, right) => left.name.localeCompare(right.name)),
        selectedBotId: bot.id
      }))
      return bot
    } catch (error) {
      reportBotFailure(error)
      return null
    }
  },

  updateBot: async (id, updates) => {
    try {
      const bot = await window.api.bots.update({ id, updates })
      set((state) => ({
        bots: state.bots
          .map((entry) => (entry.id === bot.id ? bot : entry))
          .sort((left, right) => left.name.localeCompare(right.name))
      }))
      return bot
    } catch (error) {
      reportBotFailure(error)
      return null
    }
  },

  deleteBot: async (id) => {
    try {
      await window.api.bots.delete({ id })
    } catch (error) {
      reportBotFailure(error)
      return
    }
    set((state) => ({
      bots: state.bots.filter((entry) => entry.id !== id),
      selectedBotId: state.selectedBotId === id ? null : state.selectedBotId,
      // Detached, not deleted: the routines keep running and move to the Automations page.
      botRoutines: state.botRoutines.filter((routine) => routine.botId !== id)
    }))
    void get().fetchBotRoutines()
  },

  setSelectedBotId: (id) => set({ selectedBotId: id }),

  toggleBotProjectCollapsed: (projectKey) =>
    set((state) => ({
      collapsedBotProjectIds: state.collapsedBotProjectIds.includes(projectKey)
        ? state.collapsedBotProjectIds.filter((id) => id !== projectKey)
        : [...state.collapsedBotProjectIds, projectKey]
    }))
})
