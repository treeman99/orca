// Section 5, assembled: settings shown as before/after rather than described.
//
// Every item below is a setting that exists today, changes something the reader can SEE, and
// lives in a pane the corporate policy leaves in place — the panes it removes (mobile, voice,
// plugins, servers, Orca account, usage stats, dev tools) are deliberately absent here, since a
// guide that walks a locked fleet through a hidden pane is worse than saying nothing.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Rule, RuleList } from './usage-guide-section'
import { UsageGuideSettingsReviewPart } from './usage-guide-settings-review'
import { UsageGuideSettingsSidebarPart } from './usage-guide-settings-sidebar'
import { UsageGuideSettingsTerminalPart } from './usage-guide-settings-terminal'

export function UsageGuideSettingsSection(): React.JSX.Element {
  return (
    <>
      <p>
        {translate(
          'auto.components.sidebar.guide.settings.intro',
          '설정 항목은 이름만 봐서는 무엇이 달라지는지 알기 어렵습니다. 그래서 이 절은 설명 대신 두 값의 모습을 나란히 놓았습니다. 두 칸은 고른 값만 다르고 나머지는 전부 같습니다. 창이 좁으면 두 칸이 위아래로 놓입니다.'
        )}
      </p>

      <UsageGuideSettingsSidebarPart />
      <UsageGuideSettingsReviewPart />
      <UsageGuideSettingsTerminalPart />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.closingRule1',
            '여기 실은 다섯 가지는 화면이 눈에 띄게 달라지는 것들만 고른 것입니다. 설정에는 이 밖에도 많은 항목이 있고, 대부분은 겉모습이 아니라 동작을 바꿉니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.closingRule2',
            '설정 창의 왼쪽 목록이 다른 자료에서 본 것보다 짧을 수 있습니다. 관리자 정책이 꺼 둔 팬은 목록에서 통째로 빠지기 때문입니다 — 고장이 아닙니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.closingRule3',
            '찾는 항목이 어느 팬에 있는지 모르겠으면 설정 창 위쪽 검색을 쓰십시오. 항목 이름뿐 아니라 설명과 관련 낱말까지 함께 찾습니다.'
          )}
        </Rule>
      </RuleList>
    </>
  )
}
