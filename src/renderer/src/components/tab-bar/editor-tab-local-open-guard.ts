import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { isLocalPathOpenBlocked } from '@/lib/local-path-open-guard'
import { settingsForRuntimeOwner } from '@/runtime/runtime-client-target'

export function shouldBlockEditorTabLocalOpen(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  fileRuntimeEnvironmentId: string | null | undefined,
  connectionId: string | null | undefined
): boolean {
  return isLocalPathOpenBlocked(settingsForRuntimeOwner(settings, fileRuntimeEnvironmentId), {
    connectionId
  })
}
