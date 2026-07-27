// Fetches the renderer-visible enterprise policy once at startup and caches it, so
// both the pure agent catalog and React panes can gate the provider surfaces on the
// same value.
//
// Mirrors corporate-llm-endpoint-sync: a build without the corporate IPC surface (or
// with no policy file) simply stays unrestricted — allowedAgents null — which is the
// upstream behavior. The value only ever narrows what the UI offers, never widens it.

import { useSyncExternalStore } from 'react'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

const UNRESTRICTED: EnterprisePolicyView = { allowedAgents: null, lockdown: false }

let current: EnterprisePolicyView = UNRESTRICTED
const listeners = new Set<() => void>()

function getSnapshot(): EnterprisePolicyView {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The agent-restriction list, or null when unrestricted. Safe to read outside React. */
export function getPolicyAllowedAgents(): readonly string[] | null {
  return current.allowedAgents
}

/** React-reactive view of the cached policy; re-renders when it loads at startup. */
export function useEnterprisePolicyView(): EnterprisePolicyView {
  // The third arg (server snapshot) keeps this usable under renderToString in tests.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export async function syncEnterprisePolicy(): Promise<void> {
  try {
    const view = await window.api?.enterprisePolicy?.get?.()
    if (view) {
      current = view
      for (const listener of listeners) {
        listener()
      }
    }
  } catch {
    // A build without the corporate IPC surface stays unrestricted.
  }
}

export function startEnterprisePolicySync(): void {
  void syncEnterprisePolicy()
}
