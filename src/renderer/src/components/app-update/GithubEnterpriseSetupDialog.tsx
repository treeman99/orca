import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

// Commands, not prose: they stay the same in every language.
function ghSetupCommands(host: string): string {
  return [`gh auth login --hostname ${host}`, `gh auth setup-git --hostname ${host}`].join('\n')
}

function readNoticeHost(value: unknown): string | null {
  // The browser client answers every window.api call through a fallback proxy.
  if (typeof value !== 'object' || value === null || !('host' in value)) {
    return null
  }
  return typeof value.host === 'string' && value.host ? value.host : null
}

/**
 * The company host gh still has to be signed in to, asked once per launch.
 *
 * "Later" only closes it for this run: the README already carried these steps and was
 * skipped, so the warning returns every launch until gh holds a login for the host.
 */
export function useGithubEnterpriseSetupNotice(): { host: string | null; close: () => void } {
  const [host, setHost] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.api?.githubEnterprise
      ?.getSetupNotice?.()
      .then((notice) => {
        if (!cancelled) {
          setHost(readNoticeHost(notice))
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to check the company GitHub sign-in:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])
  const close = useCallback(() => setHost(null), [])
  return { host, close }
}

export function GithubEnterpriseSetupDialog({
  host,
  onClose
}: {
  host: string
  onClose: () => void
}): React.JSX.Element | null {
  const activeModal = useAppStore((state) => state.activeModal)
  // Waits its turn like a scheduled update notice: nobody asked for it.
  if (activeModal !== 'none') {
    return null
  }
  const openSignIn = (): void => {
    onClose()
    const store = useAppStore.getState()
    store.openSettingsPage()
    // The company GitHub sign-in is the first section of this pane.
    store.openSettingsTarget({ pane: 'integrations', repoId: null })
  }
  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {/* Plain wrapper: the icon row's gap belongs here, not on the primitive. */}
            <span className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-muted-foreground" aria-hidden="true" />
              {translate(
                'auto.components.appUpdate.GithubEnterpriseSetupDialog.title',
                'Sign gh in to the company GitHub'
              )}
            </span>
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.appUpdate.GithubEnterpriseSetupDialog.description',
              'For security when you use Orca at work, install the GitHub CLI (gh) and sign it in to {{value0}} instead of github.com. gh on this computer is not signed in to {{value0}} yet.',
              { value0: host }
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.appUpdate.GithubEnterpriseSetupDialog.commandsLabel',
              'After installing gh, run in a terminal:'
            )}
          </p>
          <pre className="select-text overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
            {ghSetupCommands(host)}
          </pre>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {translate('auto.components.appUpdate.GithubEnterpriseSetupDialog.later', 'Later')}
          </Button>
          <Button type="button" size="sm" autoFocus onClick={openSignIn}>
            {translate(
              'auto.components.appUpdate.GithubEnterpriseSetupDialog.openSettings',
              'Sign in from Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
