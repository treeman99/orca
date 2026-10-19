// The words for the corporate skill bundle lane, shared by the notice and the settings
// section so the two never describe the same state differently.

import type {
  CorporateSkillBundleStatus,
  CorporateSkillBundleUnavailableReason,
  CorporateSkillBundleUpdateFailure,
  CorporateSkillPlacementState
} from '../../../../shared/corporate-skill-bundle'
import { translate } from '@/i18n/i18n'

export function describeCorporateSkillBundleUnavailable(
  reason: CorporateSkillBundleUnavailableReason
): string {
  switch (reason) {
    case 'no-enterprise-host':
      return translate(
        'auto.components.appUpdate.skillBundle.unavailable.noEnterpriseHost',
        'No corporate GitHub Enterprise host is configured, so there is no skill repository to check.'
      )
    case 'lookup-failed':
      return translate(
        'auto.components.appUpdate.skillBundle.unavailable.lookupFailed',
        'The skill repository could not be read. Check that the gh CLI is signed in to the corporate host (gh auth status) and that your account can open the repository.'
      )
    case 'no-bundle':
      return translate(
        'auto.components.appUpdate.skillBundle.unavailable.noBundle',
        'The repository has no develop branch, or that branch has no skills folder Orca can install.'
      )
  }
}

export function describeCorporateSkillBundleStatus(status: CorporateSkillBundleStatus): string {
  switch (status.state) {
    case 'disabled':
      return translate(
        'auto.components.appUpdate.skillBundle.status.disabled',
        'Your administrator turned the skill bundle update off for this machine.'
      )
    case 'unknown':
      return translate(
        'auto.components.appUpdate.skillBundle.status.unknown',
        'Not checked yet in this session.'
      )
    case 'unavailable':
      return describeCorporateSkillBundleUnavailable(status.reason)
    case 'not-installed':
      return translate(
        'auto.components.appUpdate.skillBundle.status.notInstalled',
        'None of the bundle skills are installed yet. Installing writes every skill of the bundle.'
      )
    case 'up-to-date':
      return translate(
        'auto.components.appUpdate.skillBundle.status.upToDate',
        'Every installed copy matches the repository.'
      )
    case 'available':
      return translate(
        'auto.components.appUpdate.skillBundle.status.available',
        'A newer revision is available for {{value0}}. Updating replaces every skill of the bundle together.',
        { value0: status.changedNames.join(', ') }
      )
  }
}

export function describeCorporateSkillPlacement(state: CorporateSkillPlacementState): string {
  switch (state) {
    case 'current':
      return translate('auto.components.appUpdate.skillBundle.placement.current', 'up to date')
    case 'outdated':
      return translate('auto.components.appUpdate.skillBundle.placement.outdated', 'out of date')
    case 'missing':
      return translate('auto.components.appUpdate.skillBundle.placement.missing', 'not installed')
    case 'link':
      return translate('auto.components.appUpdate.skillBundle.placement.link', 'link — left alone')
    case 'blocked':
      return translate(
        'auto.components.appUpdate.skillBundle.placement.blocked',
        'not a folder — left alone'
      )
  }
}

export function describeCorporateSkillBundleFailure(
  reason: CorporateSkillBundleUpdateFailure
): string {
  switch (reason) {
    case 'disabled':
      return describeCorporateSkillBundleStatus({ state: 'disabled' })
    case 'busy':
      return translate(
        'auto.components.appUpdate.skillBundle.failure.busy',
        'An update is already running.'
      )
    case 'lookup-failed':
      return describeCorporateSkillBundleUnavailable('lookup-failed')
    case 'download-failed':
      return translate(
        'auto.components.appUpdate.skillBundle.failure.downloadFailed',
        'The bundle could not be downloaded, or a file did not match the repository. Nothing was changed.'
      )
    case 'write-failed':
      return translate(
        'auto.components.appUpdate.skillBundle.failure.writeFailed',
        'Some skill folders could not be replaced. Close agents that hold them open and try again.'
      )
  }
}
