// Settings surface for the company's self-hosted model endpoints.
//
// Endpoints come from two places: an administrator provisions some in the policy file
// (read-only URL here), and a user can add their own by entering a URL + protocol. In
// both cases the token is write-only from this pane: it can save, replace, or forget
// one, but `hasToken` is all it ever learns back — the secret stays in main
// (src/main/enterprise/corporate-llm-token-store.ts).

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Lock, LockOpen, Plus, ServerCog, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  CorporateLlmEndpointStatus,
  CorporateLlmTokenSaveFailure,
  CorporateLlmTokenSaveResult
} from '../../../../shared/corporate-llm-endpoint-status'
import type { EnterpriseLlmApi } from '../../../../shared/enterprise-llm-endpoints'
import { syncCorporateLlmEndpoints } from '@/enterprise/corporate-llm-endpoint-sync'
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
  onRemove: (endpointId: string) => void
}

function CorporateLlmEndpointRow({
  endpoint,
  onTokenStateChange,
  onRemove
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
        {endpoint.userManaged ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onRemove(endpoint.id)}
            disabled={busy}
            className="ml-auto h-6 shrink-0 gap-1 px-1 text-xs text-muted-foreground hover:text-destructive"
            aria-label={translate(
              'auto.components.settings.CorporateLlmEndpointsSection.removeEndpoint',
              'Remove endpoint'
            )}
          >
            <Trash2 className="size-3" />
          </Button>
        ) : null}
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

const EMPTY_FORM = {
  label: '',
  baseUrl: '',
  api: 'openai' as EnterpriseLlmApi,
  model: '',
  token: ''
}

function AddCorporateLlmEndpointForm({ onAdded }: { onAdded: () => void }): React.JSX.Element {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.corporateLlm.addUserEndpoint({
        label: form.label.trim(),
        baseUrl: form.baseUrl.trim(),
        api: form.api,
        model: form.model.trim() || null
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      // The endpoint exists now; save the token against its new id if one was entered.
      if (form.token.trim()) {
        const saved = await window.api.corporateLlm.saveToken({
          endpointId: result.endpoint.id,
          token: form.token.trim()
        })
        if (!saved.ok) {
          setError(describeSaveFailure(saved.reason))
        }
      }
      setForm(EMPTY_FORM)
      onAdded()
    } catch (addError) {
      setError(String((addError as Error)?.message ?? addError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border/70 p-3">
      <p className="text-xs font-medium">
        {translate(
          'auto.components.settings.CorporateLlmEndpointsSection.addHeading',
          'Add a self-hosted model'
        )}
      </p>
      <Input
        value={form.label}
        onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
        placeholder={translate(
          'auto.components.settings.CorporateLlmEndpointsSection.addLabelPlaceholder',
          'Display name (e.g. Company LLM)'
        )}
        className="text-xs"
      />
      <div className="flex gap-2">
        <Input
          value={form.baseUrl}
          onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
          placeholder={translate(
            'auto.components.settings.CorporateLlmEndpointsSection.addUrlPlaceholder',
            'https://llm.your-company.com/v1'
          )}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 font-mono text-xs"
        />
        <select
          value={form.api}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, api: event.target.value as EnterpriseLlmApi }))
          }
          aria-label={translate(
            'auto.components.settings.CorporateLlmEndpointsSection.addApiLabel',
            'API protocol'
          )}
          className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="openai">
            {translate('auto.components.settings.CorporateLlmEndpointsSection.apiOpenai', 'OpenAI')}
          </option>
          <option value="anthropic">
            {translate(
              'auto.components.settings.CorporateLlmEndpointsSection.apiAnthropic',
              'Anthropic'
            )}
          </option>
        </select>
      </div>
      <Input
        value={form.model}
        onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
        placeholder={translate(
          'auto.components.settings.CorporateLlmEndpointsSection.addModelPlaceholder',
          'Model id (optional)'
        )}
        autoComplete="off"
        spellCheck={false}
        className="text-xs"
      />
      <div className="flex gap-2">
        <Input
          type="password"
          value={form.token}
          onChange={(event) => setForm((prev) => ({ ...prev, token: event.target.value }))}
          placeholder={translate(
            'auto.components.settings.CorporateLlmEndpointsSection.addTokenPlaceholder',
            'Token (optional — you can add it later)'
          )}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 text-xs"
        />
        <Button
          size="xs"
          onClick={() => void handleAdd()}
          disabled={busy || !form.baseUrl.trim()}
          className="h-8 shrink-0 gap-1 text-xs"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {translate('auto.components.settings.CorporateLlmEndpointsSection.add', 'Add')}
        </Button>
      </div>
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
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

  // Re-list and re-publish into the model picker after any change.
  const refreshAndSync = useCallback(async (): Promise<void> => {
    await loadEndpoints()
    void syncCorporateLlmEndpoints()
  }, [loadEndpoints])

  const applyTokenState = (endpointId: string, hasToken: boolean): void => {
    setEndpoints((current) =>
      current.map((endpoint) => (endpoint.id === endpointId ? { ...endpoint, hasToken } : endpoint))
    )
    void syncCorporateLlmEndpoints()
  }

  const handleRemove = async (endpointId: string): Promise<void> => {
    try {
      await window.api.corporateLlm.removeUserEndpoint({ endpointId })
      await refreshAndSync()
    } catch (error) {
      toast.error(
        translate(
          'auto.components.settings.CorporateLlmEndpointsSection.removeFailed',
          'Could not remove the endpoint.'
        ),
        { description: String((error as Error)?.message ?? error) }
      )
    }
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
            'Connect the company’s own model by entering its URL and your token. Your administrator may also provision endpoints centrally. The token identifies you, so Orca encrypts it with this device’s credential store and never shows it again — you can replace it or forget it, but not read it back.'
          )}
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.settings.CorporateLlmEndpointsSection.loading', 'Loading…')}
        </p>
      ) : (
        <div className="space-y-2">
          {endpoints.map((endpoint) => (
            <CorporateLlmEndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              onTokenStateChange={applyTokenState}
              onRemove={(id) => void handleRemove(id)}
            />
          ))}
        </div>
      )}

      <AddCorporateLlmEndpointForm onAdded={() => void refreshAndSync()} />
    </section>
  )
}
