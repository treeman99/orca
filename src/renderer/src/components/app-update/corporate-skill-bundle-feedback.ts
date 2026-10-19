import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { runCorporateSkillBundleUpdate } from './corporate-skill-bundle-store'
import { describeCorporateSkillBundleFailure } from './corporate-skill-bundle-copy'

/** Run the update with one toast that goes from progress to the outcome. */
export async function updateCorporateSkillBundleWithFeedback(): Promise<void> {
  const id = toast.loading(
    translate('auto.components.appUpdate.skillBundle.feedback.updating', 'Updating skills…')
  )
  const result = await runCorporateSkillBundleUpdate()
  if (result?.ok) {
    toast.success(
      translate('auto.components.appUpdate.skillBundle.feedback.updated', 'Skills updated'),
      {
        id,
        description: translate(
          'auto.components.appUpdate.skillBundle.feedback.updatedDescription',
          'Installed {{value0}}. Agents that are already running keep the old copy until you restart them.',
          { value0: result.installedNames.join(', ') }
        )
      }
    )
    return
  }
  toast.error(
    translate('auto.components.appUpdate.skillBundle.feedback.failed', 'Skill update failed'),
    {
      id,
      description: result
        ? describeCorporateSkillBundleFailure(result.reason)
        : describeCorporateSkillBundleFailure('lookup-failed')
    }
  )
}
