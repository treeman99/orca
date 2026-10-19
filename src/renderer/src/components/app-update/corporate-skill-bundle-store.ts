// One renderer-wide view of the corporate skill bundle lane, shared by the notice and the
// settings section — a module store for the same reason as app-update-check-store.ts:
// the button in settings and the toast at the app root must agree about a running update.

import { useEffect, useSyncExternalStore } from 'react'
import type {
  CorporateSkillBundleStatus,
  CorporateSkillBundleUpdateResult
} from '../../../../shared/corporate-skill-bundle'
import { INSTALLED_AGENT_SKILLS_CHANGED_EVENT } from '@/hooks/installed-agent-skills-change-event'

export type CorporateSkillBundleSnapshot = {
  /** null until a well-formed status arrives — and forever where the lane is absent. */
  status: CorporateSkillBundleStatus | null
  checking: boolean
  updating: boolean
}

const EMPTY: CorporateSkillBundleSnapshot = { status: null, checking: false, updating: false }

const STATES: readonly string[] = [
  'disabled',
  'unknown',
  'unavailable',
  'not-installed',
  'up-to-date',
  'available'
]

/** The browser client answers every `window.api` call through a fallback proxy. */
export function isCorporateSkillBundleStatus(value: unknown): value is CorporateSkillBundleStatus {
  if (typeof value !== 'object' || value === null || !('state' in value)) {
    return false
  }
  const { state } = value
  return typeof state === 'string' && STATES.includes(state)
}

export function isCorporateSkillBundleUpdateResult(
  value: unknown
): value is CorporateSkillBundleUpdateResult {
  if (typeof value !== 'object' || value === null || !('ok' in value) || !('status' in value)) {
    return false
  }
  return typeof value.ok === 'boolean' && isCorporateSkillBundleStatus(value.status)
}

let snapshot: CorporateSkillBundleSnapshot = EMPTY
const listeners = new Set<() => void>()
const laneUnsubscribes: (() => void)[] = []
let started = false
let lastBundleSignature: string | null = null

function emit(changes: Partial<CorporateSkillBundleSnapshot>): void {
  snapshot = { ...snapshot, ...changes }
  for (const listener of listeners) {
    listener()
  }
}

function announceInstalledSkillsChanged(): void {
  window.dispatchEvent(new Event(INSTALLED_AGENT_SKILLS_CHANGED_EVENT))
}

function accept(value: unknown): void {
  if (!isCorporateSkillBundleStatus(value)) {
    return
  }
  emit({ status: value })
  if (!('commitSha' in value)) {
    return
  }
  // Why: main stops the build's own freshness check from judging the bundle's names once
  // it knows them, so a new name set must re-run that scan or its stale notice stays up.
  const signature = `${value.commitSha}:${value.skills.map((skill) => skill.name).join(',')}`
  if (signature !== lastBundleSignature) {
    lastBundleSignature = signature
    announceInstalledSkillsChanged()
  }
}

function laneApi(): Window['api']['appUpdate']['skillBundle'] | undefined {
  return window.api?.appUpdate?.skillBundle
}

/** Bootstraps the lane once per renderer. Safe to call from every consumer's mount. */
export function startCorporateSkillBundleSync(): void {
  if (started) {
    return
  }
  started = true
  const api = laneApi()
  if (!api) {
    return
  }
  void api
    .getStatus()
    .then(accept)
    .catch(() => undefined)
  try {
    laneUnsubscribes.push(api.onStatus(accept))
  } catch {
    // Lane absent or unregistered; the surfaces stay hidden.
  }
}

export async function runCorporateSkillBundleCheck(): Promise<void> {
  const api = laneApi()
  if (!api || snapshot.checking) {
    return
  }
  emit({ checking: true })
  try {
    accept(await api.check())
  } catch {
    // The status keeps its last value; the section still shows when it was taken.
  } finally {
    emit({ checking: false })
  }
}

/** Replace the whole bundle. Resolves null when the lane did not answer at all. */
export async function runCorporateSkillBundleUpdate(): Promise<CorporateSkillBundleUpdateResult | null> {
  const api = laneApi()
  if (!api || snapshot.updating) {
    return null
  }
  emit({ updating: true })
  try {
    const result: unknown = await api.update()
    if (!isCorporateSkillBundleUpdateResult(result)) {
      return null
    }
    accept(result.status)
    if (result.ok) {
      announceInstalledSkillsChanged()
    }
    return result
  } catch {
    return null
  } finally {
    emit({ updating: false })
  }
}

export async function dismissCorporateSkillBundle(commitSha: string): Promise<void> {
  try {
    accept(await laneApi()?.dismiss({ commitSha }))
  } catch {
    // A dismissal that did not reach main only means the notice may return next launch.
  }
}

export function useCorporateSkillBundle(): CorporateSkillBundleSnapshot {
  useEffect(startCorporateSkillBundleSync, [])
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
    () => snapshot
  )
}

export function resetCorporateSkillBundleStoreForTests(): void {
  for (const unsubscribe of laneUnsubscribes.splice(0)) {
    unsubscribe()
  }
  snapshot = EMPTY
  listeners.clear()
  started = false
  lastBundleSignature = null
}
