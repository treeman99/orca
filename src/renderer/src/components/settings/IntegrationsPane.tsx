// Two connections, both to hosts this fleet can actually reach: the company GHES, and the
// company Confluence.
//
// The generic "review providers" card is gone. On a GHES fleet it was a second, competing
// place to sign in to the same host — the Company GitHub section below already owns that, and
// two sign-in surfaces for one host is how a user ends up authenticated in neither.
//
// The cards themselves stay in source (source-control-integration-cards.tsx,
// task-tracker-integration-cards.tsx) so an upstream rebase does not conflict on deletions.
import { useIntegrationProviderStatusRefresh } from './use-integration-provider-status-refresh'
import { GitHubEnterpriseSection } from './GitHubEnterpriseSection'
import { ConfluenceIntegrationCard } from './confluence-integration-card'
import { translate } from '@/i18n/i18n'
export { getIntegrationsPaneSearchEntries } from './integrations-search'

export function IntegrationsPane(): React.JSX.Element {
  useIntegrationProviderStatusRefresh()

  return (
    <div className="space-y-5">
      <GitHubEnterpriseSection />

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('auto.components.settings.IntegrationsPane.knowledge', 'Knowledge base')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.knowledgeDescription',
              'The company wiki bots can read from.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <ConfluenceIntegrationCard />
        </div>
      </section>
    </div>
  )
}
