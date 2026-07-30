// @vitest-environment happy-dom
//
// Regression test for what a real `pnpm dev` run under a lockdown policy exposed: main no
// longer registers the plugin IPC channels, but these two stores fetch on renderer startup
// regardless of any UI gate — so every load logged
// `No handler registered for 'plugins:list'` and the panel store armed its retry timer.
//
// The assertion is therefore "the bridge is never called", not "the call fails gracefully".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({ disablePlugins: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: (): EnterprisePolicyView =>
    ({ disablePlugins: policyState.disablePlugins }) as EnterprisePolicyView
}))

import { usePluginPanelsStore } from './plugin-panels'
import { usePluginLanguagePackStore } from './plugin-language-packs'

const list = vi.fn()
const listLanguagePacks = vi.fn()

beforeEach(() => {
  policyState.disablePlugins = false
  list.mockReset().mockResolvedValue([])
  listLanguagePacks.mockReset().mockResolvedValue([])
  vi.stubGlobal('window', {
    ...window,
    api: { plugins: { list, listLanguagePacks } }
  })
})

afterEach(() => {
  usePluginPanelsStore.setState({ plugins: [], panelErrors: {}, fetchStatus: 'idle' })
  usePluginLanguagePackStore.setState({ packs: [], loaded: false })
  vi.unstubAllGlobals()
})

describe('plugin stores under disablePlugins', () => {
  it('calls the bridge when the policy permits plugins', async () => {
    await usePluginPanelsStore.getState().fetchPlugins()
    await usePluginLanguagePackStore.getState().fetchPacks()
    expect(list).toHaveBeenCalled()
    expect(listLanguagePacks).toHaveBeenCalled()
  })

  it('never touches the plugin bridge when the policy refuses it', async () => {
    policyState.disablePlugins = true

    await usePluginPanelsStore.getState().fetchPlugins()
    await usePluginLanguagePackStore.getState().fetchPacks()

    expect(list).not.toHaveBeenCalled()
    expect(listLanguagePacks).not.toHaveBeenCalled()
  })

  it('settles as an empty ready state, so no retry timer is armed', async () => {
    policyState.disablePlugins = true
    await usePluginPanelsStore.getState().fetchPlugins()

    // 'error' is the state that schedules the bounded retry; 'ready' with no plugins is
    // what "there are no plugins here" must look like.
    expect(usePluginPanelsStore.getState().fetchStatus).toBe('ready')
    expect(usePluginPanelsStore.getState().plugins).toEqual([])
    expect(usePluginLanguagePackStore.getState().packs).toEqual([])
  })
})
