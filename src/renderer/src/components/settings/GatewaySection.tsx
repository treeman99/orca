// Settings surface for signing into the company's gateway.
//
// `gateway-cli login` takes no arguments: it runs an OIDC browser round trip and provisions
// a virtual key on its own, so there is no profile to pick and no AWS credential to manage.
// Orca only starts the CLI, shows what it prints, and asks `gateway-cli verify` whether a
// usable session exists — the credential stays with the CLI and no environment variable is
// injected. This replaced the AWS SSO lane.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type {
  GatewayLoginProgress,
  GatewayLoginResult,
  GatewayStatus
} from '../../../../shared/gateway-auth'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

function describeLoginFailure(result: Extract<GatewayLoginResult, { ok: false }>): string {
  switch (result.reason) {
    case 'gateway-unavailable':
      return translate(
        'auto.components.settings.GatewaySection.errorGatewayUnavailable',
        'Orca could not run `gateway-cli`. Confirm `gateway-cli --version` works in a terminal, then try again.'
      )
    case 'pty-unavailable':
      return translate(
        'auto.components.settings.GatewaySection.errorPtyUnavailable',
        'Orca could not start a terminal to run `gateway-cli`. Restart Orca, then try again.'
      )
    case 'timeout':
      return translate(
        'auto.components.settings.GatewaySection.errorTimeout',
        'Sign-in timed out before it completed in the browser. Try again.'
      )
    case 'cancelled':
      return translate(
        'auto.components.settings.GatewaySection.errorCancelled',
        'Sign-in was cancelled.'
      )
    case 'failed':
      return (
        result.message ??
        translate(
          'auto.components.settings.GatewaySection.errorFailed',
          'Sign-in failed. Check your network, then try again.'
        )
      )
  }
}

function formatExpiry(expiresAt: string): string {
  const parsed = new Date(expiresAt)
  return Number.isNaN(parsed.getTime()) ? expiresAt : parsed.toLocaleString()
}

function SessionStateBadge({ status }: { status: GatewayStatus }): React.JSX.Element {
  if (status.signedIn) {
    return (
      <Badge
        variant="secondary"
        className="h-5 shrink-0 gap-1 rounded-full px-2 text-[10px] font-medium"
      >
        <CheckCircle2 className="size-3" />
        {status.expiresAt
          ? translate(
              'auto.components.settings.GatewaySection.signedInUntil',
              'Signed in — valid until {{value0}}',
              { value0: formatExpiry(status.expiresAt) }
            )
          : translate('auto.components.settings.GatewaySection.signedIn', 'Signed in')}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="h-5 shrink-0 rounded-full px-2 text-[10px] font-medium text-muted-foreground"
    >
      {status.expiresAt
        ? translate('auto.components.settings.GatewaySection.expired', 'Session expired')
        : translate('auto.components.settings.GatewaySection.notSignedIn', 'Not signed in')}
    </Badge>
  )
}

export function GatewaySection(): React.JSX.Element {
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [progress, setProgress] = useState<GatewayLoginProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      setStatus(await window.api.gateway.getStatus())
    } catch (loadError) {
      console.error('Failed to load gateway status:', loadError)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const handleLogin = async (): Promise<void> => {
    setSigningIn(true)
    setError(null)
    setProgress(null)
    const unsubscribe = window.api.gateway.onLoginProgress(setProgress)
    try {
      const result = await window.api.gateway.login()
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

  const handleCancel = (): void => {
    void window.api.gateway.cancelLogin()
  }

  return (
    <section id="accounts-gateway" className="space-y-3 scroll-mt-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" />
          {translate(
            'auto.components.settings.GatewaySection.heading',
            'Corporate gateway sign-in'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.GatewaySection.intro',
            'Signing in opens an OIDC round trip in your browser, and the gateway issues a virtual key on its own — there is no AWS profile or credential to manage here. `gateway-cli` keeps that credential; Orca neither stores it nor passes it on.'
          )}
        </p>
      </div>

      {status && !status.gatewayAvailable ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {translate(
              'auto.components.settings.GatewaySection.gatewayMissing',
              'Orca could not run `gateway-cli`. If `gateway-cli --version` works in a terminal, restart Orca so it picks up the current PATH.'
            )}
          </span>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {status ? <SessionStateBadge status={status} /> : null}
          {status?.version ? (
            <span className="font-mono text-[10px] text-muted-foreground/70">{status.version}</span>
          ) : null}
        </div>

        {status?.identity ? (
          <p className="font-mono text-[11px] break-all text-muted-foreground">{status.identity}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="xs"
            onClick={() => void handleLogin()}
            disabled={signingIn}
            className="h-7 shrink-0 gap-1 text-xs"
          >
            {signingIn ? <Loader2 className="size-3 animate-spin" /> : null}
            {status?.signedIn
              ? translate('auto.components.settings.GatewaySection.signInAgain', 'Sign in again')
              : translate('auto.components.settings.GatewaySection.signIn', 'Sign in with browser')}
          </Button>

          {signingIn ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleCancel}
              className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              {translate('auto.components.settings.GatewaySection.cancel', 'Cancel')}
            </Button>
          ) : null}
        </div>

        {signingIn ? (
          <div className="space-y-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {progress?.userCode
                ? translate(
                    'auto.components.settings.GatewaySection.enterCodePrompt',
                    'A browser should have opened. Enter this code to authorize:'
                  )
                : translate(
                    'auto.components.settings.GatewaySection.browserPrompt',
                    'A browser should have opened. Finish the authorization there — this waits for it.'
                  )}
            </p>
            {progress?.userCode ? (
              <code className="inline-block rounded bg-muted px-2 py-1 font-mono text-sm font-semibold tracking-widest">
                {progress.userCode}
              </code>
            ) : null}
            {progress?.verificationUrl ? (
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
                  'auto.components.settings.GatewaySection.openAuthPage',
                  'Open authorization page'
                )}
              </Button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {status?.detail ? (
          <p className="font-mono text-[10px] break-all text-muted-foreground/70">
            {status.detail}
          </p>
        ) : null}
      </div>
    </section>
  )
}
