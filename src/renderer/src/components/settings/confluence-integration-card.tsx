// Self-hosted Confluence (Server / Data Center) only.
//
// Atlassian Cloud is deliberately absent: this fleet's wiki is a self-hosted mirror, and
// Cloud needs a different API path (`/wiki/rest/api`) and a different auth header (Basic with
// an email). Offering both would be two code paths for a host nobody here can reach.
//
// URL and token, nothing else. The pane's job is to hold the credential; what a bot does with
// a page is the bot's business.

import { useEffect, useState } from 'react'
import { BookText, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { IntegrationCardShell } from './integration-card-shell'
import {
  describeConfluenceBaseUrl,
  isConfluenceConfigured,
  normalizeConfluenceBaseUrl
} from '../../../../shared/confluence-connection'

const TOKEN_PLACEHOLDER = '••••••••••••••••'

export function ConfluenceIntegrationCard(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const savedUrl = settings?.confluenceBaseUrl ?? ''
  const hasToken = Boolean(settings?.confluenceApiToken)
  const configured = isConfluenceConfigured({
    confluenceBaseUrl: savedUrl,
    confluenceApiToken: settings?.confluenceApiToken ?? ''
  })

  const [url, setUrl] = useState(savedUrl)
  // The saved token is never shown back. An empty field means "keep what is stored"; the
  // Disconnect button is the only way to clear it, so a stray focus cannot wipe a credential.
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setUrl(savedUrl)
  }, [savedUrl])

  const urlProblem = describeConfluenceBaseUrl(url)
  const dirty = url.trim() !== savedUrl || token.trim().length > 0
  const canSave = dirty && !urlProblem

  const save = (): void => {
    if (!canSave) {
      return
    }
    updateSettings({
      confluenceBaseUrl: normalizeConfluenceBaseUrl(url),
      ...(token.trim() ? { confluenceApiToken: token.trim() } : {})
    })
    setToken('')
    setSaved(true)
  }

  const disconnect = (): void => {
    updateSettings({ confluenceBaseUrl: '', confluenceApiToken: '' })
    setToken('')
    setSaved(false)
  }

  return (
    <IntegrationCardShell
      icon={<BookText className="size-4" aria-hidden="true" />}
      name={translate('auto.components.settings.confluence.title', 'Confluence')}
      description={translate(
        'auto.components.settings.confluence.description',
        'Self-hosted Confluence (Server / Data Center). Bots read pages from here.'
      )}
      statusLabel={
        configured
          ? translate('auto.components.settings.confluence.connected', 'Configured')
          : translate('auto.components.settings.confluence.notConnected', 'Not configured')
      }
      statusTone={configured ? 'connected' : 'neutral'}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confluence-url">
            {translate('auto.components.settings.confluence.urlLabel', 'Base URL')}
          </Label>
          <Input
            id="confluence-url"
            value={url}
            spellCheck={false}
            autoComplete="off"
            placeholder={translate(
              'auto.components.settings.confluence.urlPlaceholder',
              'https://confluence-mirror.samsungds.net'
            )}
            onChange={(event) => {
              setUrl(event.target.value)
              setSaved(false)
            }}
          />
          {urlProblem ? <p className="text-[11px] text-destructive">{urlProblem}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confluence-token">
            {translate('auto.components.settings.confluence.tokenLabel', 'Personal access token')}
          </Label>
          <Input
            id="confluence-token"
            type="password"
            value={token}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              hasToken
                ? TOKEN_PLACEHOLDER
                : translate(
                    'auto.components.settings.confluence.tokenPlaceholder',
                    'Paste a token from Confluence → Profile → Personal Access Tokens'
                  )
            }
            onChange={(event) => {
              setToken(event.target.value)
              setSaved(false)
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            {hasToken
              ? translate(
                  'auto.components.settings.confluence.tokenStored',
                  'A token is stored. Leave this empty to keep it, or paste a new one to replace it.'
                )
              : translate(
                  'auto.components.settings.confluence.tokenHelp',
                  'Sent as a bearer token. Stored on this machine and encrypted where the OS supports it.'
                )}
          </p>
        </div>

        {/* Stated up front rather than discovered on a failed run: the mirror is expected to
            reject writes, so nobody should build a routine around editing a page. */}
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <TriangleAlert className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />
          {translate(
            'auto.components.settings.confluence.readOnly',
            'Read-only. This mirror is not expected to accept writes, so page creation and edits are not offered — treat Confluence as a source, not a destination.'
          )}
        </p>

        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!canSave} onClick={save}>
            {translate('auto.components.settings.confluence.save', 'Save')}
          </Button>
          {savedUrl || hasToken ? (
            <Button size="sm" variant="ghost" onClick={disconnect}>
              {translate('auto.components.settings.confluence.disconnect', 'Disconnect')}
            </Button>
          ) : null}
          {saved && !dirty ? (
            <span className="text-[11px] text-muted-foreground">
              {translate('auto.components.settings.confluence.savedNote', 'Saved.')}
            </span>
          ) : null}
        </div>
      </div>
    </IntegrationCardShell>
  )
}
