// "Is the update check working on this machine?" — answered without waiting six hours.
//
// This build has no in-app updater: it reads a release tag off the corporate host and
// says whether a newer one exists. When nothing is wrong, nothing happens, which is
// indistinguishable from a broken lane — so the coordinate it reads is shown before any
// check runs, and a failure names the reason instead of going quiet.

import type React from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type {
  AppUpdateCheckStatus,
  AppUpdateLookupTarget
} from '../../../../shared/app-update-check'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSubsectionHeader } from './SettingsFormControls'
import { getGeneralAppUpdateSearchEntry } from './general-app-update-search'
import {
  appUpdateCheckedAt,
  appUpdateLatestVersion,
  appUpdateStatusTarget,
  describeAppUpdateLookupHost,
  describeAppUpdateLookupRepository,
  describeAppUpdateStatus
} from '../app-update/app-update-status-copy'
import {
  openAppUpdateReleasePage,
  runManualAppUpdateCheck,
  useAppUpdateCheck
} from '../app-update/app-update-check-store'

/**
 * Whether this client has an update lane at all.
 *
 * The pane needs the same answer the section does: it draws a Separator above every
 * visible section, so a section that self-hides after the pane already committed to one
 * leaves a stray rule behind — the orphaned-header trap wearing a different hat.
 */
export function useAppUpdateLaneAvailable(): boolean {
  return useAppUpdateCheck().status !== null
}

export function AppUpdateSettingsSection(): React.JSX.Element | null {
  const { status, target, currentVersion, checking } = useAppUpdateCheck()

  // No lane here: the browser client answers every api call through a fallback proxy, so
  // only a well-formed status proves the lane exists. Return before the header, not after
  // it, or `pnpm dev:web` grows an "Updates" heading with nothing under it.
  if (!status) {
    return null
  }

  return (
    <section className="space-y-4">
      <SettingsSubsectionHeader
        title={translate('auto.components.settings.AppUpdateSettingsSection.title', 'Updates')}
      />
      {status.state === 'disabled' ? (
        <AppUpdatePolicyNotice />
      ) : (
        <AppUpdateDiagnostics
          status={status}
          lookupTarget={appUpdateStatusTarget(status) ?? target}
          currentVersion={currentVersion}
          checking={checking}
        />
      )}
    </section>
  )
}

function AppUpdatePolicyNotice(): React.JSX.Element {
  const entry = getGeneralAppUpdateSearchEntry()
  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
      className="space-y-2"
    >
      <Label>{entry.title}</Label>
      <p className="text-xs text-muted-foreground">
        {describeAppUpdateStatus({ state: 'disabled' })}
      </p>
    </SearchableSetting>
  )
}

type AppUpdateDiagnosticsProps = {
  status: Exclude<AppUpdateCheckStatus, { state: 'disabled' }>
  lookupTarget: AppUpdateLookupTarget | null
  currentVersion: string | null
  checking: boolean
}

function AppUpdateDiagnostics({
  status,
  lookupTarget,
  currentVersion,
  checking
}: AppUpdateDiagnosticsProps): React.JSX.Element {
  const entry = getGeneralAppUpdateSearchEntry()
  const checkedAt = appUpdateCheckedAt(status)
  const latestVersion = appUpdateLatestVersion(status)

  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
      className="space-y-3"
    >
      <div className="space-y-0.5">
        <Label>{entry.title}</Label>
        <p className="text-xs text-muted-foreground">{entry.description}</p>
      </div>
      <dl className="space-y-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
        <AppUpdateDiagnosticsRow
          term={translate(
            'auto.components.settings.AppUpdateSettingsSection.currentVersion',
            'Installed version'
          )}
          value={currentVersion}
        />
        <AppUpdateDiagnosticsRow
          term={translate(
            'auto.components.settings.AppUpdateSettingsSection.latestVersion',
            'Latest on the release page'
          )}
          value={latestVersion}
        />
        <AppUpdateDiagnosticsRow
          term={translate('auto.components.settings.AppUpdateSettingsSection.host', 'Checked host')}
          value={describeAppUpdateLookupHost(lookupTarget)}
        />
        <AppUpdateDiagnosticsRow
          term={translate(
            'auto.components.settings.AppUpdateSettingsSection.repository',
            'Checked repository'
          )}
          value={describeAppUpdateLookupRepository(lookupTarget)}
        />
        <AppUpdateDiagnosticsRow
          term={translate(
            'auto.components.settings.AppUpdateSettingsSection.lastChecked',
            'Last checked'
          )}
          value={checkedAt === null ? null : new Date(checkedAt).toLocaleString()}
        />
      </dl>
      {status.state === 'unavailable' ? (
        <p className="text-xs text-muted-foreground" role="status">
          {describeAppUpdateStatus(status)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={checking}
          onClick={() => void runManualAppUpdateCheck()}
        >
          {checking ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden="true" />
          )}
          {checking
            ? translate(
                'auto.components.settings.AppUpdateSettingsSection.checking',
                'Checking for updates…'
              )
            : translate(
                'auto.components.settings.AppUpdateSettingsSection.checkNow',
                'Check for updates'
              )}
        </Button>
        {status.state === 'available' ? (
          <Button type="button" variant="outline" size="sm" onClick={openAppUpdateReleasePage}>
            {translate(
              'auto.components.settings.AppUpdateSettingsSection.openReleasePage',
              'Open release page'
            )}
          </Button>
        ) : null}
      </div>
    </SearchableSetting>
  )
}

function AppUpdateDiagnosticsRow({
  term,
  value
}: {
  term: string
  value: string | null
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 truncate font-mono">
        {value ??
          translate(
            'auto.components.settings.AppUpdateSettingsSection.unknownValue',
            'Not yet known'
          )}
      </dd>
    </div>
  )
}
