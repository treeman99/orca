import type { ModelManager } from './model-manager'
import type { SttService } from './stt-service'
import type { VoiceSettings } from '../../shared/speech-types'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

/**
 * Lazy accessors for the speech services.
 *
 * Why the construction is injected: `ModelManager` downloads models through Electron's
 * streaming `net.request` — byte-range resume, progress events, a manual idle timeout —
 * and `SttService` resolves paths inside the packaged app. Importing either for its
 * *type* is free; constructing one is what pulls Electron in.
 *
 * The desktop installs the factories. A host without them rejects per call rather than
 * returning a stub that silently does nothing: speech is a desktop feature, and a
 * headless host saying so is more useful than one that appears to transcribe.
 */

type SpeechSettingsStore = {
  getSettings(): {
    voice?: VoiceSettings
  }
}

export type SpeechServiceFactories = {
  createModelManager(customModelsDir: string | undefined): ModelManager
  createSttService(models: ModelManager): SttService
}

let factories: SpeechServiceFactories | null = null
let modelManager: ModelManager | null = null
let sttService: SttService | null = null

export function setSpeechServiceFactories(next: SpeechServiceFactories | null): void {
  factories = next
  modelManager = null
  sttService = null
}

function requireFactories(): SpeechServiceFactories {
  if (!factories) {
    throw new Error('speech_unavailable: this host has no speech services')
  }
  return factories
}

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
    modelManager = requireFactories().createModelManager(customDir || undefined)
  }
  return modelManager
}

export function getSpeechSttService(store: SpeechSettingsStore): SttService {
  assertVoiceAllowed()
  if (!sttService) {
    sttService = requireFactories().createSttService(getSpeechModelManager(store))
  }
  return sttService
}
