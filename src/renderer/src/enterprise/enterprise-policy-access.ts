// Fetches the renderer-visible enterprise policy once at startup and caches it, so
// both the pure agent catalog and React panes can gate the provider surfaces on the
// same value.
//
// Mirrors corporate-llm-endpoint-sync: a build without the corporate IPC surface (or
// with no policy file) simply stays unrestricted — allowedAgents null — which is the
// upstream behavior. The value only ever narrows what the UI offers, never widens it.

import { useSyncExternalStore } from 'react'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

const UNRESTRICTED: EnterprisePolicyView = {
  allowedAgents: null,
  lockdown: false,
  disableAutoUpdate: false,
  disableMobilePairing: false,
  disableMobileEmulator: false,
  disableExternalAutomations: false,
  disableAgentInstallSuggestions: false,
  disableUsagePolling: false,
  disableVendorProviderAccounts: false,
  disableRemoteOrcaServer: false,
  disableVoice: false,
  disablePlugins: false,
  requireComputerUseApproval: false
}

// Read at module evaluation, synchronously, before anything can memoize an answer.
//
// Why this is not just an optimization: several gates are module-scope constants or live
// inside builders memoized on their first call (the localized catalogs). Waiting for the
// async IPC leaves those frozen at UNRESTRICTED for the process lifetime — a gate that
// passes its tests and hides nothing. The async sync() below still runs, so a build with
// only the async channel (or neither) keeps working.
function readPolicySync(): EnterprisePolicyView {
  try {
    return window.api?.enterprisePolicy?.getSync?.() ?? UNRESTRICTED
  } catch {
    // The web client has no such channel; it stays unrestricted, which is why the real
    // refusals live in main.
    return UNRESTRICTED
  }
}

let current: EnterprisePolicyView = readPolicySync()
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

/** The cached policy, for the pure search catalogs that cannot call a hook. */
export function getEnterprisePolicyView(): EnterprisePolicyView {
  return current
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
