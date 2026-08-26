// Section 4: reading the diff, committing, and opening a review.
//
// The spine is the Source Control panel's single primary button, whose label walks the whole
// flow (src/shared/source-control-primary-action-decision.ts). Every label below is quoted
// through that module's own catalog keys, including the provider-dependent PR/MR word — this
// fork ships to a GitLab-and-GHES fleet, so a hardcoded "Pull Request" would be wrong copy.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { FigureRow, PanelFigure } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'
import { GUIDE_SAMPLE } from './usage-guide-sample-values'

export function UsageGuideReviewSection(): React.JSX.Element {
  const sourceControlShortcut = useShortcutLabel('sidebar.sourceControl.toggle')
  const rightSidebarShortcut = useShortcutLabel('sidebar.right.toggle')
  const prLabel = translate('auto.i18n.hostedReview.copy.f0a4b8c2d1', 'PR')
  const mrLabel = translate('auto.i18n.hostedReview.copy.c4e8f1a2b9', 'MR')
  const createReviewLabel = translate(
    'auto.components.right.sidebar.source.control.primary.action.e7ffa46946',
    'Create {{value0}}',
    { value0: prLabel }
  )
  const commitLabel = translate(
    'auto.components.right.sidebar.source.control.primary.action.ed93b4f14f',
    'Commit'
  )
  const stageAllLabel = translate(
    'auto.components.right.sidebar.source.control.primary.action.18a0fca877',
    'Stage All'
  )
  const messageLabel = translate(
    'auto.components.right.sidebar.SourceControl.0d0a8359d3',
    'Message'
  )

  return (
    <>
      <p>
        {translate(
          'auto.components.sidebar.guide.review.intro',
          '에이전트가 무엇을 고쳤는지는 오른쪽 사이드바의 소스 컨트롤 패널에서 봅니다. 여는 단축키는 {{sourceControl}} 이고, 사이드바 자체를 접었다 펴는 것은 {{rightSidebar}} 입니다.',
          { sourceControl: sourceControlShortcut, rightSidebar: rightSidebarShortcut }
        )}
      </p>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.review.buttonHeading',
          '버튼 하나가 흐름 전체를 안내한다'
        )}
      </Subheading>

      <p>
        {translate(
          'auto.components.sidebar.guide.review.buttonIntro',
          '패널 아래의 주 버튼은 지금 상태에 따라 이름을 바꿉니다. 다음에 무엇을 해야 하는지 외울 필요 없이 그 버튼이 시키는 대로 따라가면 됩니다.'
        )}
      </p>

      <PanelFigure
        title={translate(
          'auto.components.sidebar.guide.review.figTitle',
          '소스 컨트롤 패널의 주 버튼'
        )}
        caption={translate(
          'auto.components.sidebar.guide.review.figCaption',
          '같은 자리의 같은 버튼입니다. 위에서 아래로, 작업이 진행되면서 이름이 이렇게 바뀝니다.'
        )}
      >
        <FigureRow
          glyph="1"
          label={stageAllLabel}
          detail={translate(
            'auto.components.sidebar.guide.review.figStage',
            '바뀐 파일은 있는데 아직 담은 것이 없을 때'
          )}
        />
        <FigureRow
          glyph="2"
          label={commitLabel}
          detail={translate(
            'auto.components.sidebar.guide.review.figCommit',
            '담긴 파일이 있고 메시지도 썼을 때 (메시지가 비면 눌리지 않음)'
          )}
        />
        <FigureRow
          glyph="3"
          label={translate(
            'auto.components.right.sidebar.source.control.primary.action.7b4d02e6b8',
            'Publish Branch'
          )}
          detail={translate(
            'auto.components.sidebar.guide.review.figPublish',
            '이 브랜치가 아직 원격에 없을 때'
          )}
        />
        <FigureRow
          glyph="4"
          label={translate(
            'auto.components.right.sidebar.source.control.primary.action.95550cff15',
            'Push'
          )}
          detail={GUIDE_SAMPLE.upstream}
        />
        <FigureRow
          glyph="5"
          label={createReviewLabel}
          detail={translate(
            'auto.components.sidebar.guide.review.figCreate',
            '원격과 같아졌고 리뷰를 열 수 있을 때'
          )}
        />
      </PanelFigure>

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.review.rule1',
            '파일 이름을 누르면 그 파일의 diff 가 열립니다. 한 줄씩 훑어보고 담을 파일만 담으십시오 — 에이전트가 손댄 파일이 곧 커밋할 파일은 아닙니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.review.rule2',
            'diff 를 한 화면에 겹쳐 볼지 좌우로 나눠 볼지는 설정에서 정합니다 — 5절에서 두 모습을 나란히 보여 줍니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.review.rule3',
            '커밋 메시지는 {{message}} 칸에 씁니다. 담긴 파일이 있어야 커밋 버튼이 살아납니다.',
            { message: messageLabel }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.review.rule4',
            '원격이 앞서 있으면 버튼이 {{pull}} 로, 양쪽이 갈라져 있으면 {{sync}} 로 바뀝니다. 이럴 때는 밀어 넣기 전에 먼저 받아 오라는 뜻입니다.',
            {
              pull: translate(
                'auto.components.right.sidebar.source.control.primary.action.d64292a938',
                'Pull'
              ),
              sync: translate(
                'auto.components.right.sidebar.source.control.primary.action.795f1509c5',
                'Sync'
              )
            }
          )}
        </Rule>
      </RuleList>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.review.providerHeading',
          '깃 제공자에 따라 달라지는 것'
        )}
      </Subheading>

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.review.providerRule1',
            'GitLab 저장소에서는 마지막 버튼이 {{mrCreate}} 로 나옵니다. GitHub·GitHub Enterprise·Bitbucket·Azure DevOps·Gitea 에서는 {{prCreate}} 입니다. 다른 것이 아니라 그 제공자가 부르는 이름을 따라간 것입니다.',
            {
              mrCreate: translate(
                'auto.components.right.sidebar.source.control.primary.action.e7ffa46946',
                'Create {{value0}}',
                { value0: mrLabel }
              ),
              prCreate: createReviewLabel
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.review.providerRule2',
            '사내 GitHub Enterprise 저장소도 GitHub 계열이므로 {{pr}} 로 표시됩니다. 사이드바 카드의 리뷰 표시도 같은 규칙을 씁니다.',
            { pr: prLabel }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.review.providerRule3',
            '리뷰를 만들 수 없는 상태면 마지막 버튼이 아예 나타나지 않습니다. 원격 저장소가 연결돼 있는지, 로그인이 돼 있는지부터 확인하십시오.'
          )}
        </Rule>
      </RuleList>
    </>
  )
}
