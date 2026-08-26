// The in-app usage guide, opened from the sidebar's ? menu.
//
// Written in the app rather than linked out: a locked fleet may not reach an external doc,
// and this build's behavior is not upstream's anyway. Wide with a section rail because the
// later sections compare settings side by side, which a single narrow column cannot show.

import React, { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Section } from './usage-guide-section'
import { UsageGuideRail } from './usage-guide-rail'
import { buildUsageGuideSections } from './usage-guide-sections'
import { useUsageGuideActiveSection } from './use-usage-guide-active-section'

export type UsageGuideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UsageGuideDialog({ open, onOpenChange }: UsageGuideDialogProps): React.JSX.Element {
  const sections = useMemo(() => buildUsageGuideSections(), [])
  const { activeId, selectSection, registerSection, registerScrollContainer } =
    useUsageGuideActiveSection(sections[0]?.id ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] w-[92vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border/60 p-4 pr-12">
          <DialogTitle>
            {translate('auto.components.sidebar.guide.title', 'Orca 사용 가이드')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.guide.subtitle',
              '사내 배포판 기준으로 쓴 안내서입니다. 관리자 정책에 따라 여기 적힌 화면 중 일부는 보이지 않을 수 있습니다.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <UsageGuideRail
            ariaLabel={translate('auto.components.sidebar.guide.railLabel', '가이드 목차')}
            items={sections.map((section) => ({ id: section.id, label: section.label }))}
            activeId={activeId}
            onSelect={selectSection}
          />
          <div
            ref={registerScrollContainer}
            className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
          >
            <div className="flex flex-col gap-8 p-5">
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  data-usage-guide-section={section.id}
                  ref={registerSection(section.id)}
                >
                  <Section title={`${index + 1}. ${section.label}`}>{section.body}</Section>
                </section>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default UsageGuideDialog
