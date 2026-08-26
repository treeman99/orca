// The guide's table of contents.
//
// A plain function, not a module constant: translate() has to run at render so the guide
// follows a language change instead of freezing whatever locale was loaded at import time.
// Sections 2-5 are appended here; nothing else in the dialog needs to change.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { UsageGuideAgentsSection } from './usage-guide-agents'
import { UsageGuideGettingStartedSection } from './usage-guide-getting-started'
import { UsageGuideReviewSection } from './usage-guide-review'
import { UsageGuideSettingsSection } from './usage-guide-settings'
import { UsageGuideTerminalsSection } from './usage-guide-terminals'

export type UsageGuideSection = {
  id: string
  label: string
  body: React.ReactNode
}

export function buildUsageGuideSections(): readonly UsageGuideSection[] {
  return [
    {
      id: 'getting-started',
      label: translate('auto.components.sidebar.guide.section.gettingStarted', '시작하기'),
      body: <UsageGuideGettingStartedSection />
    },
    {
      id: 'agents',
      label: translate('auto.components.sidebar.guide.section.agents', '세션과 에이전트'),
      body: <UsageGuideAgentsSection />
    },
    {
      id: 'terminals',
      label: translate('auto.components.sidebar.guide.section.terminals', '터미널'),
      body: <UsageGuideTerminalsSection />
    },
    {
      id: 'review',
      label: translate('auto.components.sidebar.guide.section.review', '변경 확인과 리뷰'),
      body: <UsageGuideReviewSection />
    },
    {
      id: 'settings',
      label: translate(
        'auto.components.sidebar.guide.section.settings',
        '설정: 바꾸면 뭐가 달라지나'
      ),
      body: <UsageGuideSettingsSection />
    }
  ]
}
