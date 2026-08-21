import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSwitch } from './SettingsFormControls'
import { getOrchestrationWorkerPaneLayoutSearchEntries } from './orchestration-worker-pane-layout-search'

const LABEL_ID = 'orchestration-auto-split-worker-panes-label'

export function OrchestrationWorkerPaneLayoutSetting(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const enabled = settings?.autoSplitOrchestrationWorkerPanes === true

  const title = translate(
    'auto.components.settings.OrchestrationWorkerPaneLayoutSetting.title',
    'Split worker panes automatically'
  )

  return (
    <SearchableSetting
      title={title}
      description={translate(
        'auto.components.settings.OrchestrationWorkerPaneLayoutSetting.description',
        'Lay dispatched workers out beside the coordinator instead of stacking them as tabs.'
      )}
      keywords={getOrchestrationWorkerPaneLayoutSearchEntries()[0].keywords}
      className="space-y-3 py-2"
      id="orchestration-auto-split-worker-panes"
    >
      <SettingsRow
        labelId={LABEL_ID}
        label={title}
        description={translate(
          'auto.components.settings.OrchestrationWorkerPaneLayoutSetting.rowDescription',
          'Workers started in the coordinator’s own worktree open in a column to its right, stacking downward for up to three panes; later workers become tabs in the last one. Workers dispatched to another worktree are unaffected.'
        )}
        control={
          <SettingsSwitch
            checked={enabled}
            ariaLabelledBy={LABEL_ID}
            onChange={() => {
              void updateSettings({ autoSplitOrchestrationWorkerPanes: !enabled })
            }}
          />
        }
      />
    </SearchableSetting>
  )
}
