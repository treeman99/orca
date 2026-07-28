// What GitHub host is this machine actually talking to?
//
// Separate from the host *input* above it on purpose: the field is what a sign-in
// targets, this is where requests go, and on a corporate machine those can differ —
// `GH_HOST` outranks both, and a workspace whose remote points elsewhere overrides
// everything. Showing the source is what makes the number trustworthy.

import { Building2, Globe } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type {
  EffectiveGitHubHostSource,
  GithubEnterpriseAuthStatus
} from '../../../../shared/github-enterprise-auth'

function describeSource(source: EffectiveGitHubHostSource): string {
  switch (source) {
    case 'repository-remote':
      return translate(
        'auto.components.settings.GitHubEnterpriseHostReadout.sourceRemote',
        'from this workspace’s git remote'
      )
    case 'gh-host-env':
      return translate(
        'auto.components.settings.GitHubEnterpriseHostReadout.sourceEnv',
        'from the GH_HOST environment variable'
      )
    case 'user-setting':
      return translate(
        'auto.components.settings.GitHubEnterpriseHostReadout.sourceUser',
        'from the host you saved here'
      )
    case 'enterprise-policy':
      return translate(
        'auto.components.settings.GitHubEnterpriseHostReadout.sourcePolicy',
        'from your organization’s Orca policy'
      )
    case 'default':
      return translate(
        'auto.components.settings.GitHubEnterpriseHostReadout.sourceDefault',
        'the gh default — no corporate host is configured'
      )
  }
}

export function GitHubEnterpriseHostReadout({
  status
}: {
  status: GithubEnterpriseAuthStatus | null
}): React.JSX.Element | null {
  if (!status) {
    return null
  }
  const isVendorHost = status.effectiveHost === 'github.com'
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      {isVendorHost ? (
        <Globe className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.GitHubEnterpriseHostReadout.label',
            'GitHub requests go to'
          )}
        </p>
        <p className="truncate font-mono text-sm">{status.effectiveHost}</p>
        <p className="text-[11px] text-muted-foreground">
          {describeSource(status.effectiveHostSource)}
        </p>
        {/* Why say this out loud: a per-repository remote silently wins over every value
            above, and a user comparing this pane with a failing request needs to know. */}
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'auto.components.settings.GitHubEnterpriseHostReadout.remoteNote',
            'A workspace whose git remote points at another host uses that host instead.'
          )}
        </p>
      </div>
    </div>
  )
}
