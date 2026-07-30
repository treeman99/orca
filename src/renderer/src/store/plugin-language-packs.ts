import { useEffect } from 'react'
import { create } from 'zustand'
import { getEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import type { PluginLanguagePackRegistration } from '../../../shared/plugins/plugin-language-pack-artifact'

type PluginLanguagePackState = {
  packs: PluginLanguagePackRegistration[]
  loaded: boolean
  fetchPacks: () => Promise<void>
}

let requestGeneration = 0
let changeSubscriptionStarted = false

export const usePluginLanguagePackStore = create<PluginLanguagePackState>()((set) => ({
  packs: [],
  loaded: false,
  fetchPacks: async () => {
    const generation = ++requestGeneration
    // Same fail-soft branch under a locked-down policy: the channel is absent, so
    // the only outcome of calling it is a console error on every renderer load.
    const api = getEnterprisePolicyView().disablePlugins ? undefined : window.api?.plugins
    if (!api?.listLanguagePacks) {
      if (generation === requestGeneration) {
        set({ packs: [], loaded: true })
      }
      return
    }
    try {
      const packs = await api.listLanguagePacks()
      if (generation === requestGeneration) {
        set({ packs, loaded: true })
      }
    } catch {
      if (generation === requestGeneration) {
        set({ packs: [], loaded: true })
      }
    }
  }
}))

export function ensurePluginLanguagePacksLoaded(): void {
  const state = usePluginLanguagePackStore.getState()
  if (!state.loaded) {
    void state.fetchPacks()
  }
  if (!changeSubscriptionStarted && window.api?.plugins?.onChanged) {
    changeSubscriptionStarted = true
    window.api.plugins.onChanged((event) => {
      if (event?.contentPacksChanged ?? true) {
        void usePluginLanguagePackStore.getState().fetchPacks()
      }
    })
  }
}

export function usePluginLanguagePacks(): PluginLanguagePackRegistration[] {
  const packs = usePluginLanguagePackStore((state) => state.packs)
  useEffect(() => ensurePluginLanguagePacksLoaded(), [])
  return packs
}
