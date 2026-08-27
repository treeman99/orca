import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

// Upstream v1.4.190 made this module construct through injected factories so a headless
// host can load it without Electron; the gate still has to sit above them.
const ModelManagerMock = vi.hoisted(() => vi.fn())
const SttServiceMock = vi.hoisted(() => vi.fn())

import {
  getSpeechModelManager,
  getSpeechSttService,
  setSpeechServiceFactories,
  VOICE_DISABLED_BY_POLICY
} from './speech-runtime-service'
import type { ModelManager } from './model-manager'
import type { SttService } from './stt-service'

const store = { getSettings: () => ({}) }

describe('speech runtime under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    ModelManagerMock.mockReset()
    SttServiceMock.mockReset()
    // Also clears the cached singletons, so each case starts from an unbuilt runtime.
    setSpeechServiceFactories({
      createModelManager: (dir) => new ModelManagerMock(dir) as unknown as ModelManager,
      createSttService: (models) => new SttServiceMock(models) as unknown as SttService
    })
  })

  // The model downloader reaches a CDN and the STT worker reaches the microphone;
  // neither may be constructed at all when the policy turns voice off.
  it('refuses to construct the model manager', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(() => getSpeechModelManager(store)).toThrow(VOICE_DISABLED_BY_POLICY)
    expect(ModelManagerMock).not.toHaveBeenCalled()
  })

  it('refuses to construct the STT service', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(() => getSpeechSttService(store)).toThrow(VOICE_DISABLED_BY_POLICY)
    expect(SttServiceMock).not.toHaveBeenCalled()
  })

  it('builds both when no policy disables voice', () => {
    expect(getSpeechModelManager(store)).toBeInstanceOf(ModelManagerMock)
    expect(getSpeechSttService(store)).toBeInstanceOf(SttServiceMock)
  })
})
