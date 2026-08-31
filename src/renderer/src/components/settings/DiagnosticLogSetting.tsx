import { useCallback, useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSwitch } from './SettingsFormControls'
import { getDiagnosticLogSearchEntries } from './diagnostic-log-search'

const LABEL_ID = 'diagnostic-log-enabled-label'
const FOLDER_LABEL_ID = 'diagnostic-log-folder-label'

/** Shown verbatim so the tag can be searched for in the file, or quoted in a report. */
const LOG_TAG = 'ORCA-DIAG'

export function DiagnosticLogSetting(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const enabled = settings?.diagnosticLogEnabled === true
  const [filePath, setFilePath] = useState<string | null>(null)

  const refreshPath = useCallback(async (): Promise<void> => {
    try {
      const status = await window.api.diagnosticLog?.status()
      setFilePath(status?.filePath ?? null)
    } catch {
      /* swallow — the row falls back to showing no path */
    }
  }, [])

  useEffect(() => {
    void refreshPath()
  }, [refreshPath, enabled, settings?.diagnosticLogDirectory])

  const chooseFolder = useCallback(async (): Promise<void> => {
    const defaultPath = settings?.diagnosticLogDirectory
    const picked = await window.api.shell.pickDirectory(defaultPath ? { defaultPath } : {})
    if (picked) {
      await updateSettings({ diagnosticLogDirectory: picked })
    }
  }, [settings?.diagnosticLogDirectory, updateSettings])

  const title = translate(
    'auto.components.settings.DiagnosticLogSetting.title',
    'Troubleshooting log'
  )

  return (
    <SearchableSetting
      title={title}
      description={translate(
        'auto.components.settings.DiagnosticLogSetting.description',
        'Write a plain-text log of internal decisions to help diagnose a problem. Off by default; nothing is sent anywhere.'
      )}
      keywords={getDiagnosticLogSearchEntries()[0].keywords}
      className="space-y-3 py-2"
      id="diagnostic-log"
    >
      <SettingsRow
        labelId={LABEL_ID}
        label={title}
        description={translate(
          'auto.components.settings.DiagnosticLogSetting.rowDescription',
          'Every line starts with {{tag}}, so you can find them all with one search. Turn this off again once you have captured the problem.',
          { tag: LOG_TAG }
        )}
        control={
          <SettingsSwitch
            checked={enabled}
            ariaLabelledBy={LABEL_ID}
            onChange={() => {
              void updateSettings({ diagnosticLogEnabled: !enabled })
            }}
          />
        }
      />
      {enabled ? (
        <SettingsRow
          labelId={FOLDER_LABEL_ID}
          label={translate('auto.components.settings.DiagnosticLogSetting.folderLabel', 'Log file')}
          description={
            filePath ??
            translate(
              'auto.components.settings.DiagnosticLogSetting.folderFallback',
              'Uses the app’s own logs folder until you choose one.'
            )
          }
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void chooseFolder()
              }}
            >
              <FolderOpen className="size-3.5 shrink-0" />
              {translate('auto.components.settings.DiagnosticLogSetting.chooseFolder', 'Choose…')}
            </Button>
          }
        />
      ) : null}
    </SearchableSetting>
  )
}
