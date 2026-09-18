// The words for every check outcome, shared by the result dialog and the settings
// diagnostics so the menu bar and the "Check now" button never disagree.
//
// The unavailable reasons are written so a user can tell a misconfigured fleet from a
// network problem without opening a log: an IT desk gets a usable report either way.

import type {
  AppUpdateCheckStatus,
  AppUpdateLookupTarget,
  AppUpdateUnavailableReason
} from '../../../../shared/app-update-check'
import { translate } from '@/i18n/i18n'

export function describeAppUpdateUnavailableReason(reason: AppUpdateUnavailableReason): string {
  switch (reason) {
    case 'no-enterprise-host':
      return translate(
        'auto.components.appUpdate.unavailable.noEnterpriseHost',
        'No corporate GitHub Enterprise host is configured, so there is nothing to check against. This is a configuration gap, not a network problem — ask IT for the enterprise host policy, or sign in to the corporate host with the gh CLI.'
      )
    case 'lookup-failed':
      return translate(
        'auto.components.appUpdate.unavailable.lookupFailed',
        'The corporate host did not answer, or the gh CLI is missing or signed out. Check your connection to the host below, then run gh auth status.'
      )
    case 'no-release':
      return translate(
        'auto.components.appUpdate.unavailable.noRelease',
        'The repository answered, but it publishes no release tag yet. Nothing is wrong with this machine.'
      )
  }
}

/** One line for every outcome, used as the result dialog's body. */
export function describeAppUpdateStatus(status: AppUpdateCheckStatus): string {
  switch (status.state) {
    case 'disabled':
      return translate(
        'auto.components.appUpdate.result.disabled',
        'Your administrator turned update checks off for this machine. Orca will not look for a newer build.'
      )
    case 'unknown':
      return translate(
        'auto.components.appUpdate.result.unknown',
        'Orca could not run the check. The update lane did not answer — restart Orca, and report it if it keeps happening.'
      )
    case 'unavailable':
      return describeAppUpdateUnavailableReason(status.reason)
    case 'up-to-date':
      return translate(
        'auto.components.appUpdate.result.upToDate',
        'You are on the newest build the company release page lists ({{value0}}).',
        { value0: status.latestVersion }
      )
    case 'available':
      return translate(
        'auto.components.appUpdate.result.available',
        'A newer build is on the company release page.'
      )
  }
}

/** Only outcomes with nothing to offer reach this — an upgrade has its own dialog. */
export function appUpdateResultTitle(
  status: Exclude<AppUpdateCheckStatus, { state: 'available' }>
): string {
  switch (status.state) {
    case 'up-to-date':
      return translate('auto.components.appUpdate.title.upToDate', 'Orca is up to date')
    case 'disabled':
      return translate('auto.components.appUpdate.title.disabled', 'Update checks are turned off')
    case 'unavailable':
    case 'unknown':
      return translate('auto.components.appUpdate.title.noAnswer', 'No update information')
  }
}

/**
 * The coordinate a status was produced against, which outranks the standalone read: the
 * two differ after a policy change, and the outcome on screen belongs to the older one.
 */
export function appUpdateStatusTarget(
  status: AppUpdateCheckStatus | null
): AppUpdateLookupTarget | null {
  if (!status || status.state === 'disabled' || status.state === 'unknown') {
    return null
  }
  return status.target
}

/** `host` is null on a machine with no corporate host — say so rather than showing a blank. */
export function describeAppUpdateLookupHost(target: AppUpdateLookupTarget | null): string {
  return target?.host ?? translate('auto.components.appUpdate.target.hostUnset', 'Not configured')
}

export function describeAppUpdateLookupRepository(target: AppUpdateLookupTarget | null): string {
  return (
    target?.repository ||
    translate('auto.components.appUpdate.target.repositoryUnset', 'Not configured')
  )
}

/** The `checkedAt` of the last status that came from an actual check, if there is one. */
export function appUpdateCheckedAt(status: AppUpdateCheckStatus | null): number | null {
  if (!status || status.state === 'disabled' || status.state === 'unknown') {
    return null
  }
  return status.checkedAt
}

export function appUpdateLatestVersion(status: AppUpdateCheckStatus | null): string | null {
  return status?.state === 'up-to-date' || status?.state === 'available'
    ? status.latestVersion
    : null
}
