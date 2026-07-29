// "Which Git server does this actually talk to?" answered inside Git & Source Control.
//
// The same readout lives in Integrations next to the host field that configures it, but
// that pairing is why people miss it: someone auditing where their code goes opens this
// pane, not the sign-in one. Read-only here on purpose — one editable host field.

import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { GithubEnterpriseAuthStatus } from '../../../../shared/github-enterprise-auth'
import { Label } from '../ui/label'
import { GitHubEnterpriseHostReadout } from './GitHubEnterpriseHostReadout'
import { SearchableSetting } from './SearchableSetting'
import { matchesSettingsSearch } from './settings-search'
import { searchKeywords } from './settings-search-keywords'

// Localized, not a plain array: someone on a Korean UI types "git 주소", and an
// English-only keyword list silently hides the section they were looking for.
function getEffectiveGitHubHostKeywords(): string[] {
  return searchKeywords([
    { key: 'auto.components.settings.git.search.gitHost', fallback: 'git host' },
    { key: 'auto.components.settings.git.search.githubHost', fallback: 'github host' },
    { key: 'auto.components.settings.git.search.gitAddress', fallback: 'git address' },
    { key: 'auto.components.settings.git.search.gitUrl', fallback: 'git url' },
    { key: 'auto.components.settings.git.search.remoteHost', fallback: 'remote host' },
    { key: 'auto.components.settings.git.search.enterprise', fallback: 'enterprise' },
    { key: 'auto.components.settings.git.search.ghes', fallback: 'ghes' },
    { key: 'auto.components.settings.git.search.ghHostEnv', fallback: 'gh_host' },
    { key: 'auto.components.settings.git.search.githubCom', fallback: 'github.com' },
    { key: 'auto.components.settings.git.search.sourceControl', fallback: 'source control' },
    { key: 'auto.components.settings.git.search.whereRequestsGo', fallback: 'where requests go' }
  ])
}

function getEffectiveGitHubHostTitle(): string {
  return translate('auto.components.settings.GitPane.effectiveGitHubHostTitle', 'Git Host')
}

function getEffectiveGitHubHostDescription(): string {
  return translate(
    'auto.components.settings.GitPane.effectiveGitHubHostDescription',
    'The GitHub host Orca sends pull request, check, and review requests to. Change it under Integrations → Company GitHub (Enterprise).'
  )
}

export function effectiveGitHubHostMatchesSearch(searchQuery: string): boolean {
  return matchesSettingsSearch(searchQuery, {
    title: getEffectiveGitHubHostTitle(),
    description: getEffectiveGitHubHostDescription(),
    keywords: getEffectiveGitHubHostKeywords()
  })
}

export function EffectiveGitHubHostSetting(): React.JSX.Element {
  const [status, setStatus] = useState<GithubEnterpriseAuthStatus | null>(null)
  const title = getEffectiveGitHubHostTitle()
  const description = getEffectiveGitHubHostDescription()

  useEffect(() => {
    let cancelled = false
    void window.api.githubEnterprise
      .getStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load the effective GitHub host:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={getEffectiveGitHubHostKeywords()}
      className="space-y-2"
    >
      <div className="space-y-0.5">
        <Label>{title}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {status ? (
        <GitHubEnterpriseHostReadout status={status} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.settings.GitPane.effectiveGitHubHostLoading', 'Checking…')}
        </p>
      )}
    </SearchableSetting>
  )
}
