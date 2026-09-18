// One renderer-wide view of the update-check lane, shared by the dialog and the
// settings diagnostics section.
//
// Why a module store rather than a slice or a hook per consumer: the settings
// "Check now" button and the menu bar's "Check for Updates..." must produce the
// same presentation, and the component that presents it (the dialog at the app
// root) is not an ancestor of the button. One store also means one `onStatus`
// IPC listener for the process lifetime instead of one per mount.

import { useEffect, useSyncExternalStore } from 'react'
import type {
  AppUpdateCheckStatus,
  AppUpdateLookupTarget
} from '../../../../shared/app-update-check'

/** What a dialog should present right now, and what asked for it. */
export type AppUpdatePresentation = {
  source: 'background' | 'manual'
  status: AppUpdateCheckStatus
}

export type AppUpdateCheckSnapshot = {
  /** null until a well-formed status arrives — and forever where the lane is absent. */
  status: AppUpdateCheckStatus | null
  target: AppUpdateLookupTarget | null
  currentVersion: string | null
  checking: boolean
  pending: AppUpdatePresentation | null
}

const EMPTY: AppUpdateCheckSnapshot = {
  status: null,
  target: null,
  currentVersion: null,
  checking: false,
  pending: null
}

const STATES: readonly string[] = ['disabled', 'unknown', 'unavailable', 'up-to-date', 'available']

/**
 * The browser client answers every `window.api` call through a fallback proxy, so a
 * resolved value is not evidence the lane exists — only a real state is. Everything
 * that renders the lane gates on this, which is what keeps `pnpm dev:web` from
 * showing an update section wired to nothing.
 */
export function isAppUpdateCheckStatus(value: unknown): value is AppUpdateCheckStatus {
  if (typeof value !== 'object' || value === null || !('state' in value)) {
    return false
  }
  const { state } = value
  return typeof state === 'string' && STATES.includes(state)
}

export function isAppUpdateLookupTarget(value: unknown): value is AppUpdateLookupTarget {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('host' in value) || !('repository' in value)) {
    return false
  }
  const { host, repository } = value
  return (host === null || typeof host === 'string') && typeof repository === 'string'
}

/**
 * A scheduled check may only interrupt for a real, un-skipped upgrade. Surfacing
 * "you are up to date" or a lookup failure on the 6-hour timer would nag every
 * user twice a workday for something nobody asked about.
 */
export function resolveBackgroundPresentation(
  status: AppUpdateCheckStatus
): AppUpdatePresentation | null {
  return status.state === 'available' && !status.dismissed ? { source: 'background', status } : null
}

let snapshot: AppUpdateCheckSnapshot = EMPTY
const listeners = new Set<() => void>()
const laneUnsubscribes: (() => void)[] = []
let started = false

function getSnapshot(): AppUpdateCheckSnapshot {
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(changes: Partial<AppUpdateCheckSnapshot>): void {
  snapshot = { ...snapshot, ...changes }
  for (const listener of listeners) {
    listener()
  }
}

/**
 * Ingest a status main produced on its own schedule — the one read at startup and every
 * later push. A non-available outcome updates the diagnostics but opens nothing, and it
 * never clears a dialog the user is already reading.
 */
function acceptBackgroundStatus(value: unknown): void {
  if (!isAppUpdateCheckStatus(value)) {
    return
  }
  const pending = resolveBackgroundPresentation(value)
  emit(pending ? { status: value, pending } : { status: value })
}

/** Bootstraps the lane once per renderer. Safe to call from every consumer's mount. */
export function startAppUpdateCheckSync(): void {
  if (started) {
    return
  }
  started = true
  const api = window.api?.appUpdate
  if (!api) {
    return
  }
  void loadInitialLaneState(api)
  laneUnsubscribes.push(
    api.onStatus(acceptBackgroundStatus),
    api.onCheckRequested(() => void runManualAppUpdateCheck())
  )
}

// Why one try/catch around all three: a rebase can leave the main-process lane
// unregistered, and an unhandled rejection on the startup path lands in every crash
// report's breadcrumbs. None of the three is worth failing the app over.
async function loadInitialLaneState(api: Window['api']['appUpdate']): Promise<void> {
  try {
    // The startup read is a background outcome too: a renderer reload after main already
    // found an upgrade must still surface it, which no later push would do.
    acceptBackgroundStatus(await api.getStatus())
  } catch {
    // Lane absent or unregistered; the surfaces stay hidden.
  }
  try {
    const target = await api.getLookupTarget()
    if (isAppUpdateLookupTarget(target)) {
      emit({ target })
    }
  } catch {
    // The diagnostics row falls back to "not configured".
  }
  try {
    const currentVersion = await window.api?.app?.getVersion?.()
    if (typeof currentVersion === 'string') {
      emit({ currentVersion })
    }
  } catch {
    // The app bridge is the only version provider in this build; without it the row hides.
  }
}

/** The one check path: the menu item and the settings button both land here. */
export async function runManualAppUpdateCheck(): Promise<void> {
  const api = window.api?.appUpdate
  if (!api || snapshot.checking) {
    return
  }
  emit({ checking: true })
  let result: unknown
  try {
    result = await api.check()
  } catch {
    result = undefined
  }
  if (isAppUpdateCheckStatus(result)) {
    // A manual check answers even for a version the user skipped: they just asked.
    emit({ status: result, pending: { source: 'manual', status: result }, checking: false })
    return
  }
  // The lane itself did not answer. 'unknown' is the honest word for that, and it
  // still puts a dialog in front of the user who pressed the button.
  emit({ pending: { source: 'manual', status: { state: 'unknown' } }, checking: false })
}

export function dismissAppUpdatePresentation(): void {
  emit({ pending: null })
}

export async function skipAppUpdateVersion(version: string): Promise<void> {
  let next: unknown
  try {
    next = await window.api?.appUpdate?.dismissVersion({ version })
  } catch {
    next = undefined
  }
  emit(isAppUpdateCheckStatus(next) ? { status: next, pending: null } : { pending: null })
}

export function openAppUpdateReleasePage(): void {
  void window.api?.appUpdate?.openReleasePage()
}

export function useAppUpdateCheck(): AppUpdateCheckSnapshot {
  useEffect(startAppUpdateCheckSync, [])
  // The third arg keeps this usable under renderToString in tests.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function resetAppUpdateCheckStoreForTests(): void {
  for (const unsubscribe of laneUnsubscribes.splice(0)) {
    unsubscribe()
  }
  snapshot = EMPTY
  listeners.clear()
  started = false
}
