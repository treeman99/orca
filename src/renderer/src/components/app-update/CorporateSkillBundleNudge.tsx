import { useEffect, useRef } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  dismissCorporateSkillBundle,
  useCorporateSkillBundle
} from './corporate-skill-bundle-store'
import { updateCorporateSkillBundleWithFeedback } from './corporate-skill-bundle-feedback'

type ActiveNotice = { id: string | number; commitSha: string; recordDismissal: boolean }

/**
 * "The corporate skill bundle has a newer revision" — once per commit, until closed.
 *
 * Only an explicit close records the commit; quitting with the notice open lets it come
 * back next launch, and a push to the bundle's branch is a new commit that notifies again.
 */
export function CorporateSkillBundleNudge(): null {
  const { status } = useCorporateSkillBundle()
  const shownCommits = useRef(new Set<string>())
  const active = useRef<ActiveNotice | null>(null)

  useEffect(() => {
    const retract = (): void => {
      const notice = active.current
      if (notice) {
        // Stale presentation, not the user's decision: retract without recording it.
        notice.recordDismissal = false
        active.current = null
        toast.dismiss(notice.id)
      }
    }
    if (!status || status.state !== 'available' || status.dismissed) {
      retract()
      return
    }
    if (active.current?.commitSha === status.commitSha) {
      return
    }
    retract()
    if (shownCommits.current.has(status.commitSha)) {
      return
    }
    shownCommits.current.add(status.commitSha)
    const notice: ActiveNotice = { id: '', commitSha: status.commitSha, recordDismissal: true }
    notice.id = toast.info(
      translate(
        'auto.components.appUpdate.CorporateSkillBundleNudge.title',
        'A newer company skill bundle is available'
      ),
      {
        description: translate(
          'auto.components.appUpdate.CorporateSkillBundleNudge.description',
          '{{value0}} changed. Updating replaces every skill of the bundle in .agents and .claude together.',
          { value0: status.changedNames.join(', ') }
        ),
        duration: Number.POSITIVE_INFINITY,
        onDismiss: () => {
          if (notice.recordDismissal) {
            void dismissCorporateSkillBundle(notice.commitSha)
          }
          if (active.current === notice) {
            active.current = null
          }
        },
        action: {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Download className="size-3.5" />
              {translate(
                'auto.components.appUpdate.CorporateSkillBundleNudge.update',
                'Update skills'
              )}
            </span>
          ),
          onClick: () => {
            // Sonner closes action toasts without onDismiss; acting is not dismissing.
            notice.recordDismissal = false
            if (active.current === notice) {
              active.current = null
            }
            void updateCorporateSkillBundleWithFeedback()
          }
        }
      }
    )
    active.current = notice
  }, [status])

  return null
}
