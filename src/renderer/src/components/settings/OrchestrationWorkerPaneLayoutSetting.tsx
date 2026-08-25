import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import {
  ORCHESTRATION_WORKER_PANE_MAX_GROUP_CHOICES,
  resolveOrchestrationWorkerPaneMaxGroups
} from '../../../../shared/terminal-pane-placement'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSegmentedControl, SettingsSwitch } from './SettingsFormControls'
import { getOrchestrationWorkerPaneLayoutSearchEntries } from './orchestration-worker-pane-layout-search'

const LABEL_ID = 'orchestration-auto-split-worker-panes-label'
const MAX_PANES_LABEL_ID = 'orchestration-max-worker-panes-label'

export function OrchestrationWorkerPaneLayoutSetting(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const enabled = settings?.autoSplitOrchestrationWorkerPanes === true
  const maxPanes = resolveOrchestrationWorkerPaneMaxGroups(settings?.orchestrationMaxWorkerPanes)

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
          'Workers started in the coordinator’s own worktree open in a column to its right; once the column is full, later workers become tabs, filling those panes from the top down. Workers dispatched to another worktree are unaffected.'
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
      {enabled ? (
        <SettingsRow
          labelId={MAX_PANES_LABEL_ID}
          label={translate(
            'auto.components.settings.OrchestrationWorkerPaneLayoutSetting.maxPanesLabel',
            'Maximum panes'
          )}
          description={translate(
            'auto.components.settings.OrchestrationWorkerPaneLayoutSetting.maxPanesDescription',
            'How tall the column may grow before workers start sharing panes. Every extra pane leaves each agent fewer rows — below roughly 20 a TUI reflows and gets hard to read.'
          )}
          control={
            <SettingsSegmentedControl
              value={maxPanes}
              onChange={(next) => {
                void updateSettings({ orchestrationMaxWorkerPanes: next })
              }}
              options={ORCHESTRATION_WORKER_PANE_MAX_GROUP_CHOICES.map((count) => ({
                value: count,
                label: String(count)
              }))}
              ariaLabel={translate(
                'auto.components.settings.OrchestrationWorkerPaneLayoutSetting.maxPanesAriaLabel',
                'Maximum worker panes'
              )}
              size="sm"
            />
          }
        />
      ) : null}
    </SearchableSetting>
  )
}
