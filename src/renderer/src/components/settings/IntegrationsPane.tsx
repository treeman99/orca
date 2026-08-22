// Only GitHub is offered in this corporate fork: the fleet's code and issues live on the
// company GHES host, so the other providers are sign-in forms for services nobody can reach.
// The cards themselves are kept in source (source-control-integration-cards.tsx,
// task-tracker-integration-cards.tsx) so an upstream rebase does not conflict on deletions.
import { GitHubIntegrationCard } from './source-control-integration-cards'
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
            {translate('auto.components.settings.IntegrationsPane.298c65ecac', 'Review providers')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.1683acbac4',
              'Connect the source host Orca can use for pull requests, checks, and review status.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <GitHubIntegrationCard />
        </div>
      </section>

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
