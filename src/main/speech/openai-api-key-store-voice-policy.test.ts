import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type * as EnterprisePolicyFileModule from '../enterprise/enterprise-policy-file'

// v1.4.237 opened a second way to save the OpenAI speech key — the `speech.openAiKey.set` RPC and
// `orca speech openai-key set` — beside the desktop IPC that is unregistered under disableVoice.

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))
let tempHome = ''

async function loadStoreModule() {
  vi.resetModules()
  vi.doMock('../enterprise/enterprise-policy-file', async (importOriginal) => ({
    ...(await importOriginal<typeof EnterprisePolicyFileModule>()),
    getEnterprisePolicy: mocks.getEnterprisePolicy
  }))
  vi.doMock('os', async () => {
    const actual = await vi.importActual<typeof Os>('os')
    return { ...actual, homedir: () => tempHome }
  })
  const { setSecretStore } = await import('../../shared/secret-store')
  setSecretStore({
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value),
    isEncryptionAvailable: () => true,
    describeProtectionGap: () => null
  })
  return import('./openai-api-key-store')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-openai-key-voice-policy-'))
  mocks.getEnterprisePolicy.mockReset()
})

describe('OpenAI speech key save under disableVoice', () => {
  it('refuses to store the key when the policy disables voice', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ disableVoice: true }))
    const store = await loadStoreModule()

    expect(() => store.saveOpenAiSpeechApiKey('sk-test')).toThrow('voice_disabled_by_policy')
    expect(existsSync(store.getOpenAiKeyPath())).toBe(false)
  })

  it('stores the key on an upstream build with no policy file', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({}))
    const store = await loadStoreModule()

    store.saveOpenAiSpeechApiKey('sk-test')
    expect(store.hasOpenAiSpeechApiKey()).toBe(true)
  })
})
