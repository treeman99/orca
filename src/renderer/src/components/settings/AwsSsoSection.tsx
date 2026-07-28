// Settings surface for signing the AWS CLI into the company's SSO portal.
//
// Bedrock-backed Claude authenticates through the AWS credential chain, which means a
// live `aws sso login` session. That login is a browser round trip, so this section runs
// it for the profile the user picks and shows what the CLI prints (the authorization URL,
// and the device code when that flow is in play). The token lands in the AWS CLI's own
// cache — Orca reads only its expiry, never the token, and stores nothing itself.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, ExternalLink, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  AwsSsoLoginProgress,
  AwsSsoLoginResult,
  AwsSsoProfileStatus,
  AwsSsoStatus
} from '../../../../shared/aws-sso-auth'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'

function describeLoginFailure(result: Extract<AwsSsoLoginResult, { ok: false }>): string {
  switch (result.reason) {
    case 'no-profile':
      return translate(
        'auto.components.settings.AwsSsoSection.errorNoProfile',
        'Pick an AWS profile first.'
      )
    case 'aws-unavailable':
      return translate(
        'auto.components.settings.AwsSsoSection.errorAwsUnavailable',
        'Orca could not run the AWS CLI. Confirm `aws --version` works in a terminal, then try again.'
      )
    case 'pty-unavailable':
      return translate(
        'auto.components.settings.AwsSsoSection.errorPtyUnavailable',
        'Orca could not start a terminal to run the AWS CLI. Restart Orca, then try again.'
      )
    case 'timeout':
      return translate(
        'auto.components.settings.AwsSsoSection.errorTimeout',
        'Sign-in timed out before it completed in the browser. Try again.'
      )
    case 'cancelled':
      return translate(
        'auto.components.settings.AwsSsoSection.errorCancelled',
        'Sign-in was cancelled.'
      )
    case 'failed':
      return (
        result.message ??
        translate(
          'auto.components.settings.AwsSsoSection.errorFailed',
          'Sign-in failed. Check the profile and your network, then try again.'
        )
      )
  }
}

function formatExpiry(expiresAt: string): string {
  const parsed = new Date(expiresAt)
  return Number.isNaN(parsed.getTime()) ? expiresAt : parsed.toLocaleString()
}

/** The signed-in / expired / never-signed-in badge for the selected profile. */
function ProfileStateBadge({ profile }: { profile: AwsSsoProfileStatus }): React.JSX.Element {
  if (profile.active) {
    return (
      <Badge
        variant="secondary"
        className="h-5 shrink-0 gap-1 rounded-full px-2 text-[10px] font-medium"
      >
        <CheckCircle2 className="size-3" />
        {profile.expiresAt
          ? translate(
              'auto.components.settings.AwsSsoSection.signedInUntil',
              'Signed in — valid until {{value0}}',
              { value0: formatExpiry(profile.expiresAt) }
            )
          : translate('auto.components.settings.AwsSsoSection.signedIn', 'Signed in')}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="h-5 shrink-0 rounded-full px-2 text-[10px] font-medium text-muted-foreground"
    >
      {profile.expiresAt
        ? translate('auto.components.settings.AwsSsoSection.expired', 'Session expired')
        : translate('auto.components.settings.AwsSsoSection.notSignedIn', 'Not signed in')}
    </Badge>
  )
}

export function AwsSsoSection(): React.JSX.Element {
  const [status, setStatus] = useState<AwsSsoStatus | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [useDeviceCode, setUseDeviceCode] = useState(false)
  const [progress, setProgress] = useState<AwsSsoLoginProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.awsSso.getStatus()
      setStatus(next)
      setSelected((current) => current ?? next.selectedProfile)
    } catch (loadError) {
      console.error('Failed to load AWS SSO status:', loadError)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const activeProfile =
    status?.profiles.find((profile) => profile.name === selected) ?? status?.profiles[0] ?? null

  const handleSelectProfile = async (profile: string): Promise<void> => {
    setSelected(profile)
    setError(null)
    try {
      setStatus(await window.api.awsSso.setProfile({ profile }))
    } catch (saveError) {
      toast.error(
        translate(
          'auto.components.settings.AwsSsoSection.profileSaveFailed',
          'Could not save the profile.'
        ),
        { description: String((saveError as Error)?.message ?? saveError) }
      )
    }
  }

  const handleLogin = async (): Promise<void> => {
    if (!activeProfile) {
      return
    }
    setSigningIn(true)
    setError(null)
    setProgress(null)
    const unsubscribe = window.api.awsSso.onLoginProgress(setProgress)
    try {
      const result = await window.api.awsSso.login({
        profile: activeProfile.name,
        useDeviceCode
      })
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
    void window.api.awsSso.cancelLogin()
  }

  const handleLogout = async (): Promise<void> => {
    if (!activeProfile) {
      return
    }
    try {
      await window.api.awsSso.logout({ profile: activeProfile.name })
      await refreshStatus()
    } catch (logoutError) {
      toast.error(
        translate('auto.components.settings.AwsSsoSection.logoutFailed', 'Could not sign out.'),
        { description: String((logoutError as Error)?.message ?? logoutError) }
      )
    }
  }

  const profiles = status?.profiles ?? []

  return (
    <section id="accounts-aws-sso" className="space-y-3 scroll-mt-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Cloud className="size-4" />
          {translate('auto.components.settings.AwsSsoSection.heading', 'AWS SSO sign-in')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.AwsSsoSection.intro',
            'Claude on Bedrock authenticates through the AWS credential chain, which needs a live SSO session. This runs `aws sso login` for the profile you pick and lets the AWS CLI open your browser. The token stays in the CLI’s own cache — Orca reads only when it expires.'
          )}
        </p>
      </div>

      {status && !status.awsAvailable ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {translate(
              'auto.components.settings.AwsSsoSection.awsMissing',
              'Orca could not run the AWS CLI. If `aws --version` works in a terminal, restart Orca so it picks up the current PATH; otherwise install AWS CLI v2 first.'
            )}
          </span>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        {profiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.AwsSsoSection.noProfiles',
              'No SSO profiles in your AWS config. Run `aws configure sso` once to create one, then reopen this pane.'
            )}
          </p>
        ) : (
          <>
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="aws-sso-profile-select"
            >
              {translate('auto.components.settings.AwsSsoSection.profileLabel', 'AWS profile')}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="aws-sso-profile-select"
                value={activeProfile?.name ?? ''}
                onChange={(event) => void handleSelectProfile(event.target.value)}
                disabled={signingIn}
                className="h-8 min-w-48 rounded-md border border-input bg-background px-2 font-mono text-xs"
              >
                {profiles.map((profile) => (
                  <option key={profile.name} value={profile.name}>
                    {profile.name}
                  </option>
                ))}
              </select>
              {activeProfile ? <ProfileStateBadge profile={activeProfile} /> : null}
            </div>

            {activeProfile ? (
              <p className="font-mono text-[11px] break-all text-muted-foreground">
                {[
                  activeProfile.startUrl,
                  activeProfile.accountId,
                  activeProfile.roleName,
                  activeProfile.ssoRegion
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="xs"
                onClick={() => void handleLogin()}
                disabled={signingIn || !activeProfile}
                className="h-7 shrink-0 gap-1 text-xs"
              >
                {signingIn ? <Loader2 className="size-3 animate-spin" /> : null}
                {activeProfile?.active
                  ? translate('auto.components.settings.AwsSsoSection.signInAgain', 'Sign in again')
                  : translate(
                      'auto.components.settings.AwsSsoSection.signIn',
                      'Sign in with browser'
                    )}
              </Button>

              {signingIn ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCancel}
                  className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  {translate('auto.components.settings.AwsSsoSection.cancel', 'Cancel')}
                </Button>
              ) : null}

              {activeProfile?.active && !signingIn ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void handleLogout()}
                  className="h-7 shrink-0 gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="size-3" />
                  {translate('auto.components.settings.AwsSsoSection.signOut', 'Sign out')}
                </Button>
              ) : null}
            </div>

            <label className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground">
              <Checkbox
                checked={useDeviceCode}
                onCheckedChange={(checked) => setUseDeviceCode(checked === true)}
                disabled={signingIn}
                className="mt-px size-3.5"
              />
              <span>
                {translate(
                  'auto.components.settings.AwsSsoSection.deviceCodeLabel',
                  'Use the device-code flow. Pick this when the default sign-in cannot come back to this machine — a browser on another device, or a desktop that blocks the CLI’s local callback.'
                )}
              </span>
            </label>
          </>
        )}

        {signingIn ? (
          <div className="space-y-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {progress?.userCode
                ? translate(
                    'auto.components.settings.AwsSsoSection.enterCodePrompt',
                    'A browser should have opened. Enter this code to authorize:'
                  )
                : translate(
                    'auto.components.settings.AwsSsoSection.browserPrompt',
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
                  'auto.components.settings.AwsSsoSection.openAuthPage',
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

        {status?.configPath ? (
          <p className="font-mono text-[10px] break-all text-muted-foreground/70">
            {status.configPath}
          </p>
        ) : null}
      </div>
    </section>
  )
}
