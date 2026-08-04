import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

const ModelManager = vi.hoisted(() => vi.fn())
const SttService = vi.hoisted(() => vi.fn())
vi.mock('./model-manager', () => ({ ModelManager }))
vi.mock('./stt-service', () => ({ SttService }))

import {
  getSpeechModelManager,
  getSpeechSttService,
  VOICE_DISABLED_BY_POLICY
} from './speech-runtime-service'

const store = { getSettings: () => ({}) }

describe('speech runtime under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    ModelManager.mockReset()
    SttService.mockReset()
  })

  // The model downloader reaches a CDN and the STT worker reaches the microphone;
  // neither may be constructed at all when the policy turns voice off.
  it('refuses to construct the model manager', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(() => getSpeechModelManager(store)).toThrow(VOICE_DISABLED_BY_POLICY)
    expect(ModelManager).not.toHaveBeenCalled()
  })

  it('refuses to construct the STT service', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(() => getSpeechSttService(store)).toThrow(VOICE_DISABLED_BY_POLICY)
    expect(SttService).not.toHaveBeenCalled()
  })

  it('builds both when no policy disables voice', () => {
    expect(getSpeechModelManager(store)).toBeInstanceOf(ModelManager)
    expect(getSpeechSttService(store)).toBeInstanceOf(SttService)
  })
})
