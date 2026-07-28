import { ModelManager } from './model-manager'
import { SttService } from './stt-service'
import type { VoiceSettings } from '../../shared/speech-types'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

type SpeechSettingsStore = {
  getSettings(): {
    voice?: VoiceSettings
  }
}

let modelManager: ModelManager | null = null
let sttService: SttService | null = null

export const VOICE_DISABLED_BY_POLICY = 'voice_disabled_by_policy'

// Why both getters and not the IPC layer alone: the STT worker and the model downloader
// are also reached from the mobile RPC lane in orca-runtime, and a phone can turn
// dictation on remotely. These two lazy singletons are what every path has to go through.
function assertVoiceAllowed(): void {
  if (getEnterprisePolicy().disableVoice) {
    throw new Error(VOICE_DISABLED_BY_POLICY)
  }
}

export function getSpeechModelManager(store: SpeechSettingsStore): ModelManager {
  assertVoiceAllowed()
  if (!modelManager) {
    const settings = store.getSettings()
    const customDir = settings.voice?.modelsDir || undefined
    modelManager = new ModelManager(customDir || undefined)
  }
  return modelManager
}

export function getSpeechSttService(store: SpeechSettingsStore): SttService {
  assertVoiceAllowed()
  if (!sttService) {
    sttService = new SttService(getSpeechModelManager(store))
  }
  return sttService
}
