// Section 5, part 1: two Appearance settings whose whole effect is what the sidebar looks like.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { ComparisonFigure, FigureRow } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'
import { GUIDE_SAMPLE } from './usage-guide-sample-values'

export function UsageGuideSettingsSidebarPart(): React.JSX.Element {
  const detailedLabel = translate(
    'auto.components.sidebar.SidebarWorkspaceOptionsMenu.cc17bd443b',
    'Detailed'
  )
  const compactLabel = translate(
    'auto.components.sidebar.SidebarWorkspaceOptionsMenu.25105b28cb',
    'Compact'
  )
  const showTasksLabel = translate(
    'auto.components.settings.AppearancePane.cf81907069',
    'Show Tasks Button'
  )
  const tasksRowLabel = translate('auto.components.sidebar.SidebarNav.fee535205b', 'Tasks')
  const searchRowLabel = translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')

  return (
    <>
      <Subheading>
        {translate(
          'auto.components.sidebar.guide.settings.cardHeading',
          '{{setting}} — 워크스페이스 한 줄에 얼마나 담을까',
          {
            setting: translate(
              'auto.components.settings.appearance.search.workspaceCardLayout.title',
              'Workspace Card Layout'
            )
          }
        )}
      </Subheading>

      <ComparisonFigure
        leftLabel={detailedLabel}
        rightLabel={compactLabel}
        left={
          <>
            <FigureRow
              glyph="●"
              label={GUIDE_SAMPLE.worktreeName}
              detail={GUIDE_SAMPLE.worktreeBranch}
            />
            <FigureRow glyph="●" label={GUIDE_SAMPLE.project} detail={GUIDE_SAMPLE.baseBranch} />
          </>
        }
        right={
          <>
            <FigureRow glyph="●" label={GUIDE_SAMPLE.worktreeName} trailing="2" />
            <FigureRow glyph="●" label={GUIDE_SAMPLE.project} trailing="1" />
          </>
        }
        caption={translate(
          'auto.components.sidebar.guide.settings.cardCaption',
          '같은 두 워크스페이스입니다. Detailed 는 브랜치·포트 같은 것이 둘째 줄에 따로 붙고, Compact 는 그 줄을 없애고 제목 줄에 작은 표시로 접습니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.cardRule1',
            '워크스페이스가 스무 개를 넘어가면 {{compact}} 쪽이 한 화면에 훨씬 많이 들어옵니다. 대신 브랜치 이름을 보려면 마우스를 올려야 합니다.',
            { compact: compactLabel }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.cardRule2',
            '설정 → 외형에도 있고, 사이드바 위쪽 옵션 메뉴에서도 바로 바꿀 수 있습니다.'
          )}
        </Rule>
      </RuleList>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.settings.tasksHeading',
          '{{setting}} — 사이드바 버튼 줄이기',
          { setting: showTasksLabel }
        )}
      </Subheading>

      <ComparisonFigure
        leftLabel={translate('auto.components.sidebar.guide.settings.off', '끄면')}
        rightLabel={translate('auto.components.sidebar.guide.settings.on', '켜면')}
        left={
          <>
            <FigureRow glyph="🔍" label={searchRowLabel} />
            <FigureRow glyph="📁" label={GUIDE_SAMPLE.project} />
          </>
        }
        right={
          <>
            <FigureRow glyph="🔍" label={searchRowLabel} />
            <FigureRow glyph="🗒" label={tasksRowLabel} active />
            <FigureRow glyph="📁" label={GUIDE_SAMPLE.project} />
          </>
        }
        caption={translate(
          'auto.components.sidebar.guide.settings.tasksCaption',
          '버튼 한 줄이 통째로 사라집니다. 키보드 이동 순서에서도 빠집니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.tasksRule1',
            '기능이 없어지는 것이 아니라 사이드바 바로가기만 사라집니다. 안 쓰는 버튼을 정리하는 용도입니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.tasksRule2',
            '같은 자리에 자동화·스킬 버튼을 켜고 끄는 항목도 나란히 있습니다.'
          )}
        </Rule>
      </RuleList>
    </>
  )
}
