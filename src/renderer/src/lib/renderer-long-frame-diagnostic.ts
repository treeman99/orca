/**
 * Opt-in renderer long-frame evidence for the troubleshooting log (topic `freeze-renderer`).
 *
 * Why: a "whole app froze" report is either this thread, main's loop (`freeze-main`), or neither,
 * and only a line on the user's Windows machine can say which. Long Animation Frame entries name
 * the script and its invoker (keydown handler, IPC callback, timer); `longtask` is the fallback
 * where LoAF is missing and only carries a duration.
 */
import { formatDiagnosticClockTime } from '../../../shared/diagnostic-clock-time'

export const RENDERER_LONG_FRAME_THRESHOLD_MS = 200
export const RENDERER_LONG_FRAME_TOPIC = 'freeze-renderer'

type LongFrameScript = {
  duration?: number
  invoker?: string
  invokerType?: string
  sourceURL?: string
  sourceFunctionName?: string
  sourceCharPosition?: number
  forcedStyleAndLayoutDuration?: number
}

export type LongFrameEntry = {
  entryType: string
  startTime: number
  duration: number
  blockingDuration?: number
  renderStart?: number
  scripts?: readonly LongFrameScript[]
  attribution?: readonly { name?: string; containerType?: string }[]
}

export type DiagnosticFields = Record<string, string | number | boolean>

/** Last path segment only — source URLs carry the install path, which carries the user name. */
function lastSegment(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const withoutQuery = value.split(/[?#]/)[0] ?? value
  return withoutQuery.split(/[\\/]/).pop() || undefined
}

function compact(fields: Record<string, string | number | boolean | undefined>): DiagnosticFields {
  const out: DiagnosticFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') {
      out[key] = value
    }
  }
  return out
}

/**
 * One log line's fields, or null below the threshold. `anchor` is read in the observer callback
 * so the entry's monotonic start converts to the same wall clock main stamps with.
 */
export function describeLongFrameEntry(
  entry: LongFrameEntry,
  anchor: { wallNow: number; perfNow: number },
  hidden: boolean
): DiagnosticFields | null {
  if (entry.duration < RENDERER_LONG_FRAME_THRESHOLD_MS) {
    return null
  }
  const base = {
    kind: entry.entryType === 'long-animation-frame' ? 'loaf' : entry.entryType,
    start: formatDiagnosticClockTime(anchor.wallNow - (anchor.perfNow - entry.startTime)),
    ms: Math.round(entry.duration),
    hidden
  }
  if (entry.entryType !== 'long-animation-frame') {
    const attribution = entry.attribution?.[0]
    return compact({ ...base, container: attribution?.containerType })
  }
  const scripts = entry.scripts ?? []
  let top: LongFrameScript | undefined
  let layoutMs = 0
  for (const script of scripts) {
    layoutMs += script.forcedStyleAndLayoutDuration ?? 0
    if (!top || (script.duration ?? 0) > (top.duration ?? 0)) {
      top = script
    }
  }
  const source = lastSegment(top?.sourceURL)
  return compact({
    ...base,
    blockMs: entry.blockingDuration === undefined ? undefined : Math.round(entry.blockingDuration),
    // Why render time apart from script time: style/layout/paint of a huge DOM freezes with no script to blame.
    renderMs: entry.renderStart
      ? Math.round(entry.startTime + entry.duration - entry.renderStart)
      : undefined,
    layoutMs: Math.round(layoutMs),
    // Why no script count: main keeps the first twelve fields, and `fn` is worth more.
    scriptMs: top?.duration === undefined ? undefined : Math.round(top.duration),
    // Why last segment for invoker too: a classic-script invoker is the script's full URL.
    invoker: lastSegment(top?.invoker),
    via: top?.invokerType,
    src:
      source && top?.sourceCharPosition !== undefined && top.sourceCharPosition >= 0
        ? `${source}:${top.sourceCharPosition}`
        : source,
    fn: top?.sourceFunctionName
  })
}

type ObserverHandle = { disconnect: () => void }

export type RendererLongFrameDiagnosticDeps = {
  supportedEntryTypes: readonly string[]
  observe: (type: string, onEntries: (entries: readonly LongFrameEntry[]) => void) => ObserverHandle
  isEnabled: () => boolean
  subscribeEnabled: (listener: () => void) => () => void
  write: (topic: string, fields: DiagnosticFields) => void
  wallNow: () => number
  perfNow: () => number
  isHidden: () => boolean
}

/** Observes only while the log is on; returns a disposer for tests and HMR. */
export function startRendererLongFrameDiagnostic(
  deps: RendererLongFrameDiagnosticDeps
): () => void {
  const entryType = deps.supportedEntryTypes.includes('long-animation-frame')
    ? 'long-animation-frame'
    : deps.supportedEntryTypes.includes('longtask')
      ? 'longtask'
      : null
  if (!entryType) {
    return () => {}
  }
  let observer: ObserverHandle | null = null
  const onEntries = (entries: readonly LongFrameEntry[]): void => {
    const anchor = { wallNow: deps.wallNow(), perfNow: deps.perfNow() }
    const hidden = deps.isHidden()
    for (const entry of entries) {
      const fields = describeLongFrameEntry(entry, anchor, hidden)
      if (fields) {
        deps.write(RENDERER_LONG_FRAME_TOPIC, fields)
      }
    }
  }
  const sync = (): void => {
    const enabled = deps.isEnabled()
    if (enabled && !observer) {
      observer = deps.observe(entryType, onEntries)
    } else if (!enabled && observer) {
      observer.disconnect()
      observer = null
    }
  }
  const unsubscribe = deps.subscribeEnabled(sync)
  sync()
  return () => {
    unsubscribe()
    observer?.disconnect()
    observer = null
  }
}
