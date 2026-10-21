import type { GlobalSettings } from '../../../shared/global-settings-types'
import { PROTECTED_SECRET_SLOT } from '../../protected-secret-persistence'
import { updateSettings, type SettingsMutationOperations } from './settings-update'

/**
 * Upstream's settings update, plus dropping the fork's retained Confluence token when it is
 * cleared. Out of settings-update.ts because upstream fills that file to its max-lines cap; the
 * retained blob is in-memory until the scheduled save, so clearing it after the update is the same.
 */
export function updateSettingsClearingConfluenceToken(
  operations: SettingsMutationOperations,
  updates: Partial<GlobalSettings>,
  options?: Parameters<typeof updateSettings>[2]
): GlobalSettings {
  const settings = updateSettings(operations, updates, options)
  if ('confluenceApiToken' in updates && !updates.confluenceApiToken) {
    operations.removeRetainedBlob(PROTECTED_SECRET_SLOT.confluenceApiToken)
  }
  return settings
}
