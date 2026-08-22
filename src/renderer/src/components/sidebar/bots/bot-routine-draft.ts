// Pure: the bot detail's "add routine" form, and its translation into the ordinary
// automation create input.
//
// A routine IS an automation with a botId — there is no second scheduler and no second
// record. Building the input here (rather than reusing the full Automations composer)
// keeps the bot lane from having to open a page, while every field it does not expose
// simply takes the automation lane's own default.

import type {
  AutomationCreateInput,
  AutomationSchedulePreset
} from '../../../../../shared/automations-types'
import { buildAutomationRrule } from '../../../../../shared/automation-schedules'
import { getBotRoutineEligibility, type Bot } from '../../../../../shared/bot-types'

export type BotRoutinePreset = Exclude<AutomationSchedulePreset, 'custom'>

export type BotRoutineDraft = {
  name: string
  prompt: string
  preset: BotRoutinePreset
  /** 'HH:MM' local. Ignored for the hourly preset, which only uses the minute. */
  time: string
  dayOfWeek: number
}

export function createBotRoutineDraft(): BotRoutineDraft {
  return { name: '', prompt: '', preset: 'daily', time: '09:00', dayOfWeek: 1 }
}

// Why the blank check: `Number('')` is 0, so a cleared <input type="time"> would otherwise
// parse as a valid midnight and quietly schedule an unattended run at 00:00 instead of
// falling back to the default the form started with.
function parseTimePart(part: string | undefined, max: number, fallback: number): number {
  if (part === undefined || part.trim() === '') {
    return fallback
  }
  const value = Number(part)
  return Number.isInteger(value) && value >= 0 && value <= max ? value : fallback
}

export function parseRoutineTime(time: string): { hour: number; minute: number } {
  const [rawHour, rawMinute] = time.split(':')
  return {
    hour: parseTimePart(rawHour, 23, 9),
    minute: parseTimePart(rawMinute, 59, 0)
  }
}

export function isBotRoutineDraftComplete(draft: BotRoutineDraft): boolean {
  return draft.name.trim().length > 0 && draft.prompt.trim().length > 0
}

/**
 * The automation create input for this routine, or null when the bot cannot own one.
 *
 * Null rather than a thrown error: the caller already renders the reason from
 * getBotRoutineEligibility, and an unbound or folder-bound bot is a normal state, not a
 * fault.
 */
export function buildBotRoutineCreateInput(args: {
  bot: Bot
  draft: BotRoutineDraft
  timezone: string
  now: number
}): AutomationCreateInput | null {
  const eligibility = getBotRoutineEligibility(args.bot)
  if (!eligibility.ok || !isBotRoutineDraftComplete(args.draft)) {
    return null
  }
  const { hour, minute } = parseRoutineTime(args.draft.time)
  return {
    botId: args.bot.id,
    name: args.draft.name.trim(),
    prompt: args.draft.prompt.trim(),
    agentId: args.bot.agentId,
    projectId: eligibility.projectId,
    workspaceMode: 'existing',
    workspaceId: eligibility.worktreeId,
    // Why on: a routine is one long-running conversation with its bot, not a fresh session
    // every morning. The automation lane already reuses a live pane when it can.
    reuseSession: true,
    timezone: args.timezone,
    rrule: buildAutomationRrule({
      preset: args.draft.preset,
      hour,
      minute,
      dayOfWeek: args.draft.dayOfWeek
    }),
    dtstart: args.now,
    enabled: true
  }
}
