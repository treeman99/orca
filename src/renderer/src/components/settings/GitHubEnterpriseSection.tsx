// Settings surface for signing gh into the company's GitHub Enterprise (GHES) host.
//
// At many companies `gh` cannot reach github.com, so a user must point gh at the
// internal host and complete its browser (device) flow. This section collects the
// host and runs `gh auth login --web` for it; the credential lands in gh's own
// keyring, so every existing gh-backed feature (PRs, checks, review status) then works.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ExternalLink, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  GithubEnterpriseAuthStatus,
  GithubEnterpriseLoginProgress,
  GithubEnterpriseLoginResult
} from '../../../../shared/github-enterprise-auth'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { GitHubEnterpriseHostReadout } from './GitHubEnterpriseHostReadout'

function describeLoginFailure(result: Extract<GithubEnterpriseLoginResult, { ok: false }>): string {
  switch (result.reason) {
    case 'no-host':
      return translate(
        'auto.components.settings.GitHubEnterpriseSection.errorNoHost',
        'Enter your company GitHub host first.'
      )
    case 'gh-unavailable':
      return translate(
        'auto.components.settings.GitHubEnterpriseSection.errorGhUnavailable',
        'The GitHub CLI (gh) was not found on your PATH. Install it, then try again.'
      )
    case 'timeout':
      return translate(
        'auto.components.settings.GitHubEnterpriseSection.errorTimeout',
        'Sign-in timed out before it completed in the browser. Try again.'
      )
    case 'cancelled':
      return translate(
        'auto.components.settings.GitHubEnterpriseSection.errorCancelled',
        'Sign-in was cancelled.'
      )
    case 'failed':
      return translate(
        'auto.components.settings.GitHubEnterpriseSection.errorFailed',
        'Sign-in failed. Check the host and your network, then try again.'
      )
  }
}

export function GitHubEnterpriseSection(): React.JSX.Element {
  const [status, setStatus] = useState<GithubEnterpriseAuthStatus | null>(null)
  const [hostDraft, setHostDraft] = useState('')
  const [savingHost, setSavingHost] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [progress, setProgress] = useState<GithubEnterpriseLoginProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Keep the last host the user typed so the field survives a status refresh.
  const hostTouchedRef = useRef(false)

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.githubEnterprise.getStatus()
      setStatus(next)
      if (!hostTouchedRef.current) {
        setHostDraft(next.host ?? '')
      }
    } catch (loadError) {
      console.error('Failed to load GitHub Enterprise status:', loadError)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const handleSaveHost = async (): Promise<void> => {
    setSavingHost(true)
    setError(null)
    try {
      const next = await window.api.githubEnterprise.setHost({ host: hostDraft.trim() })
      setStatus(next)
      await refreshStatus()
    } catch (saveError) {
      toast.error(
        translate(
          'auto.components.settings.GitHubEnterpriseSection.hostSaveFailed',
          'Could not save the host.'
        ),
        { description: String((saveError as Error)?.message ?? saveError) }
      )
    } finally {
      setSavingHost(false)
    }
  }

  const handleLogin = async (): Promise<void> => {
    setSigningIn(true)
    setError(null)
    setProgress(null)
    const unsubscribe = window.api.githubEnterprise.onLoginProgress(setProgress)
    try {
      const result = await window.api.githubEnterprise.login({ host: hostDraft.trim() })
      if (result.ok) {
        await refreshStatus()
      } else {
        setError(describeLoginFailure(result))
      }
    } catch (loginError) {
      setError(String((loginError as Error)?.message ?? loginError))
    } finally {
      unsubscribe()
      setSigningIn(false)
      setProgress(null)
    }
  }

  const handleTokenLogin = async (): Promise<void> => {
    setSigningIn(true)
    setError(null)
    setProgress(null)
    try {
      const result = await window.api.githubEnterprise.loginWithToken({
        host: hostDraft.trim(),
        token: tokenDraft.trim()
      })
      if (result.ok) {
        setTokenDraft('')
        await refreshStatus()
      } else {
        setError(describeLoginFailure(result))
      }
    } catch (loginError) {
      setError(String((loginError as Error)?.message ?? loginError))
    } finally {
      setSigningIn(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    if (!status?.host) {
      return
    }
    try {
      await window.api.githubEnterprise.logout({ host: status.host })
      await refreshStatus()
    } catch (logoutError) {
      toast.error(
        translate(
          'auto.components.settings.GitHubEnterpriseSection.logoutFailed',
          'Could not sign out.'
        ),
        { description: String((logoutError as Error)?.message ?? logoutError) }
      )
    }
  }

  const trimmedHost = hostDraft.trim()
  const hostChanged = trimmedHost !== (status?.host ?? '')
  const ghUnavailable = status?.ghAvailable === false

  return (
    <section id="integrations-github-enterprise" className="space-y-3 scroll-mt-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4" />
          {translate(
            'auto.components.settings.GitHubEnterpriseSection.heading',
            'Company GitHub (Enterprise)'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.GitHubEnterpriseSection.intro',
            'If gh cannot reach github.com at your company, enter your internal GitHub Enterprise host and sign in through the browser. Orca stores nothing — the login goes into the gh CLI’s own keyring, so pull requests, checks, and review status start working.'
          )}
        </p>
      </div>

      <GitHubEnterpriseHostReadout status={status} />

      {ghUnavailable ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {translate(
              'auto.components.settings.GitHubEnterpriseSection.ghMissing',
              'The GitHub CLI (gh) is not installed or not on your PATH. Install gh first, then sign in here.'
            )}
          </span>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="github-enterprise-host"
        >
          {translate('auto.components.settings.GitHubEnterpriseSection.hostLabel', 'GitHub host')}
        </label>
        <div className="flex gap-2">
          <Input
            id="github-enterprise-host"
            value={hostDraft}
            onChange={(event) => {
              hostTouchedRef.current = true
              setHostDraft(event.target.value)
            }}
            placeholder={translate(
              'auto.components.settings.GitHubEnterpriseSection.hostPlaceholder',
              'github.your-company.com'
            )}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 font-mono text-xs"
          />
          <Button
            size="xs"
            variant="secondary"
            onClick={() => void handleSaveHost()}
            disabled={savingHost || !hostChanged}
            className="h-7 shrink-0 text-xs"
          >
            {savingHost ? <Loader2 className="size-3 animate-spin" /> : null}
            {translate('auto.components.settings.GitHubEnterpriseSection.saveHost', 'Save')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {status?.authenticated ? (
            <Badge
              variant="secondary"
              className="h-5 shrink-0 gap-1 rounded-full px-2 text-[10px] font-medium"
            >
              <CheckCircle2 className="size-3" />
              {status.account
                ? translate(
                    'auto.components.settings.GitHubEnterpriseSection.signedInAs',
                    'Signed in as {{value0}}',
                    { value0: status.account }
                  )
                : translate(
                    'auto.components.settings.GitHubEnterpriseSection.signedIn',
                    'Signed in'
                  )}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="h-5 shrink-0 rounded-full px-2 text-[10px] font-medium text-muted-foreground"
            >
              {translate(
                'auto.components.settings.GitHubEnterpriseSection.notSignedIn',
                'Not signed in'
              )}
            </Badge>
          )}

          <Button
            size="xs"
            onClick={() => void handleLogin()}
            disabled={signingIn || !trimmedHost}
            className="h-7 shrink-0 text-xs"
          >
            {signingIn ? <Loader2 className="size-3 animate-spin" /> : null}
            {status?.authenticated
              ? translate(
                  'auto.components.settings.GitHubEnterpriseSection.signInAgain',
                  'Sign in again'
                )
              : translate(
                  'auto.components.settings.GitHubEnterpriseSection.signInBrowser',
                  'Sign in with browser'
                )}
          </Button>

          {status?.authenticated ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void handleLogout()}
              disabled={signingIn}
              className="h-7 shrink-0 gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3" />
              {translate('auto.components.settings.GitHubEnterpriseSection.signOut', 'Sign out')}
            </Button>
          ) : null}
        </div>

        <div className="space-y-1 border-t border-border/50 pt-2">
          <p className="text-[11px] text-muted-foreground">
            {translate(
              'auto.components.settings.GitHubEnterpriseSection.tokenHint',
              'If the browser flow is blocked, paste a personal access token instead.'
            )}
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder={translate(
                'auto.components.settings.GitHubEnterpriseSection.tokenPlaceholder',
                'Personal access token'
              )}
              aria-label={translate(
                'auto.components.settings.GitHubEnterpriseSection.tokenInputLabel',
                'GitHub personal access token'
              )}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 text-xs"
            />
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void handleTokenLogin()}
              disabled={signingIn || !trimmedHost || !tokenDraft.trim()}
              className="h-7 shrink-0 text-xs"
            >
              {translate(
                'auto.components.settings.GitHubEnterpriseSection.connectWithToken',
                'Connect with token'
              )}
            </Button>
          </div>
        </div>

        {signingIn && progress?.oneTimeCode ? (
          <div className="space-y-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.GitHubEnterpriseSection.enterCodePrompt',
                'A browser should have opened. Enter this one-time code to authorize:'
              )}
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold tracking-widest">
                {progress.oneTimeCode}
              </code>
              {progress.verificationUrl ? (
                <Button
                  variant="link"
                  size="xs"
                  onClick={() =>
                    progress.verificationUrl &&
                    void window.api.shell.openUrl(progress.verificationUrl)
                  }
                  className="h-6 gap-1 px-1 text-xs"
                >
                  <ExternalLink className="size-3" />
                  {translate(
                    'auto.components.settings.GitHubEnterpriseSection.openVerification',
                    'Open verification page'
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
