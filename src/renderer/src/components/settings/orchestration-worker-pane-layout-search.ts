import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getOrchestrationWorkerPaneLayoutSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate(
      'auto.components.settings.orchestration.worker.pane.search.title',
      'Split worker panes automatically'
    ),
    description: translate(
      'auto.components.settings.orchestration.worker.pane.search.description',
      'Open orchestration workers in a split column beside their coordinator terminal.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.orchestration.worker.pane.search.split',
        'split'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.orchestration.worker.pane.search.pane',
        'pane'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.orchestration.worker.pane.search.layout',
        'layout'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.orchestration.worker.pane.search.column',
        'column'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.orchestration.worker.pane.search.worker',
        'worker'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.orchestration.worker.pane.search.coordinator',
        'coordinator'
      )
    ]
  }
])
