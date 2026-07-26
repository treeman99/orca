// Settings surface for the self-hosted model endpoints an administrator provisions.
//
// The token is write-only from here: this pane can save, replace, or forget one, but
// `hasToken` is the only thing it ever learns back — the secret stays in main
// (src/main/enterprise/corporate-llm-token-store.ts), so there is nothing to reveal.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Lock, LockOpen, ServerCog } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  CorporateLlmEndpointStatus,
  CorporateLlmTokenSaveFailure,
  CorporateLlmTokenSaveResult
} from '../../../../shared/corporate-llm-endpoint-status'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

function describeSaveFailure(reason: CorporateLlmTokenSaveFailure): string {
  switch (reason) {
    case 'encryption-unavailable':
      return translate(
        'auto.components.settings.CorporateLlmEndpointsSection.encryptionUnavailable',
        'Not saved. Orca could not reach this device’s secure credential store, so the token could not be encrypted — and Orca will not write a token to disk in plain text. Sign in to your desktop session again, then try once more.'
      )
    case 'unknown-endpoint':
      return translate(
        'auto.components.settings.CorporateLlmEndpointsSection.unknownEndpoint',
        'Not saved. Your administrator’s policy no longer provisions this endpoint. Restart Orca to reload the policy file.'
      )
    case 'write-failed':
      return translate(
        'auto.components.settings.CorporateLlmEndpointsSection.writeFailed',
        'Not saved. Orca could not write to your profile folder. Check that it is writable and not blocked by security software, then try again.'
      )
  }
}

type CorporateLlmEndpointRowProps = {
  endpoint: CorporateLlmEndpointStatus
  onTokenStateChange: (endpointId: string, hasToken: boolean) => void
}

function CorporateLlmEndpointRow({
  endpoint,
  onTokenStateChange
}: CorporateLlmEndpointRowProps): React.JSX.Element {
  const [tokenDraft, setTokenDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<CorporateLlmTokenSaveFailure | null>(null)

  const runTokenAction = async (
    operation: () => Promise<CorporateLlmTokenSaveResult>
  ): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      const result = await operation()
      if (!result.ok) {
        setFailure(result.reason)
        return
      }
      setTokenDraft('')
      onTokenStateChange(endpoint.id, result.hasToken)
    } catch (error) {
      // A thrown error is a transport or argument fault, not a refused write, so it
      // must not be dressed up as one of the three renderable reasons.
      toast.error(
        translate(
          'auto.components.settings.CorporateLlmEndpointsSection.tokenActionFailed',
          'Endpoint token update failed.'
        ),
        { description: String((error as Error)?.message ?? error) }
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">{endpoint.label}</span>
        <Badge
          variant={endpoint.hasToken ? 'secondary' : 'outline'}
          className="h-5 shrink-0 gap-1 rounded-full px-2 text-[10px] font-medium text-muted-foreground"
        >
          {endpoint.hasToken ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
          {endpoint.hasToken
            ? translate(
                'auto.components.settings.CorporateLlmEndpointsSection.tokenSaved',
                'Token saved'
              )
            : translate(
                'auto.components.settings.CorporateLlmEndpointsSection.tokenNotSaved',
                'No token'
              )}
        </Badge>
      </div>
      {/* Why: the token is sent to whatever this host says, so show it before asking for one. */}
      <p className="truncate font-mono text-[11px] text-muted-foreground">{endpoint.baseUrl}</p>
      {endpoint.model ? (
        <p className="truncate text-[11px] text-muted-foreground">
          {translate(
            'auto.components.settings.CorporateLlmEndpointsSection.model',
            'Model: {{value0}}',
            { value0: endpoint.model }
          )}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Input
          type="password"
          value={tokenDraft}
          onChange={(event) => setTokenDraft(event.target.value)}
          placeholder={translate(
            'auto.components.settings.CorporateLlmEndpointsSection.tokenPlaceholder',
            'Paste your token for this endpoint'
          )}
          aria-label={translate(
            'auto.components.settings.CorporateLlmEndpointsSection.tokenInputLabel',
            'Token for {{value0}}',
            { value0: endpoint.label }
          )}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 text-xs"
        />
        <Button
          size="xs"
          onClick={() =>
            void runTokenAction(() =>
              window.api.corporateLlm.saveToken({
                endpointId: endpoint.id,
                token: tokenDraft.trim()
              })
            )
          }
          disabled={busy || !tokenDraft.trim()}
          className="h-7 shrink-0 text-xs"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {endpoint.hasToken
            ? translate('auto.components.settings.CorporateLlmEndpointsSection.replace', 'Replace')
            : translate('auto.components.settings.CorporateLlmEndpointsSection.save', 'Save')}
        </Button>
        {endpoint.hasToken ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              void runTokenAction(() =>
                window.api.corporateLlm.clearToken({ endpointId: endpoint.id })
              )
            }
            disabled={busy}
            className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            {translate(
              'auto.components.settings.CorporateLlmEndpointsSection.forget',
              'Forget token'
            )}
          </Button>
        ) : null}
      </div>
      {failure ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{describeSaveFailure(failure)}</span>
        </div>
      ) : null}
    </div>
  )
}

export function CorporateLlmEndpointsSection(): React.JSX.Element {
  const [endpoints, setEndpoints] = useState<CorporateLlmEndpointStatus[]>([])
  const [loading, setLoading] = useState(true)

  const loadEndpoints = useCallback(async (): Promise<void> => {
    try {
      setEndpoints(await window.api.corporateLlm.listEndpoints())
    } catch (error) {
      console.error('Failed to load corporate LLM endpoints:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEndpoints()
  }, [loadEndpoints])

  const applyTokenState = (endpointId: string, hasToken: boolean): void => {
    setEndpoints((current) =>
      current.map((endpoint) => (endpoint.id === endpointId ? { ...endpoint, hasToken } : endpoint))
    )
  }

  return (
    <section id="accounts-corporate-llm" className="space-y-4 scroll-mt-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ServerCog className="size-4" />
          {translate(
            'auto.components.settings.CorporateLlmEndpointsSection.heading',
            'Self-hosted models'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.CorporateLlmEndpointsSection.intro',
            'Your administrator provisions these endpoints. The token identifies you, so you enter it here: Orca encrypts it with this device’s credential store and never shows it again. You can replace it or forget it, but not read it back.'
          )}
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.settings.CorporateLlmEndpointsSection.loading', 'Loading…')}
        </p>
      ) : endpoints.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.CorporateLlmEndpointsSection.empty',
            'No self-hosted endpoints are provisioned. They come from your administrator’s corporate policy file, not from this screen — ask your administrator to add one, then restart Orca.'
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {endpoints.map((endpoint) => (
            <CorporateLlmEndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              onTokenStateChange={applyTokenState}
            />
          ))}
        </div>
      )}
    </section>
  )
}
