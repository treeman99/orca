// Section 5, part 2: the two settings that decide what the review surfaces look like.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { ComparisonFigure, FigureDiffLines, FigureRow } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'

// Not translatable: sample code and paths the reader matches against their own diff.
const DIFF_BEFORE = 'retries = 1'
const DIFF_AFTER = 'retries = 3'
const DIFF_CONTEXT = 'function withRetry(fn) {'
const TREE_FOLDER = 'src/payment'
const TREE_FILE = 'retry.ts'
const TREE_TEST = 'retry.test.ts'
const LIST_FILE = 'src/payment/retry.ts'
const LIST_TEST = 'src/payment/retry.test.ts'

export function UsageGuideSettingsReviewPart(): React.JSX.Element {
  const inlineLabel = translate(
    'auto.components.settings.GeneralEditorSettingsSection.05b6df93b3',
    'Inline'
  )
  const sideBySideLabel = translate(
    'auto.components.settings.GeneralEditorSettingsSection.12cbc0d0d6',
    'Side-by-side'
  )

  return (
    <>
      <Subheading>
        {translate(
          'auto.components.sidebar.guide.settings.diffHeading',
          '{{setting}} — 고친 자리를 겹쳐 볼까 나란히 볼까',
          {
            setting: translate(
              'auto.components.settings.GeneralEditorSettingsSection.7311f67ee7',
              'Default Diff View'
            )
          }
        )}
      </Subheading>

      <ComparisonFigure
        leftLabel={inlineLabel}
        rightLabel={sideBySideLabel}
        left={
          <FigureDiffLines
            columns={[
              [
                { text: `  ${DIFF_CONTEXT}`, tone: 'context' },
                { text: `- ${DIFF_BEFORE}`, tone: 'removed' },
                { text: `+ ${DIFF_AFTER}`, tone: 'added' }
              ]
            ]}
          />
        }
        right={
          <FigureDiffLines
            columns={[
              [
                { text: DIFF_CONTEXT, tone: 'context' },
                { text: DIFF_BEFORE, tone: 'removed' }
              ],
              [
                { text: DIFF_CONTEXT, tone: 'context' },
                { text: DIFF_AFTER, tone: 'added' }
              ]
            ]}
          />
        }
        caption={translate(
          'auto.components.sidebar.guide.settings.diffCaption',
          'Inline 은 지운 줄과 넣은 줄을 한 흐름에 섞어 보여 주고, Side-by-side 는 고치기 전과 후를 각각 한 칸씩 차지하게 둡니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.diffRule1',
            '한 줄만 바뀐 변경은 {{inline}} 가 읽기 쉽고, 함수 하나를 통째로 갈아엎은 변경은 {{side}} 가 낫습니다.',
            { inline: inlineLabel, side: sideBySideLabel }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.diffRule2',
            '이건 새로 여는 diff 의 기본값일 뿐이라, 보고 있는 diff 안에서 그때그때 바꿀 수도 있습니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.diffRule3',
            '창이 좁으면 나란히 두 칸이 각각 너무 좁아집니다. 사이드바에서 diff 를 볼 일이 많다면 겹쳐 보기 쪽이 무난합니다.'
          )}
        </Rule>
      </RuleList>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.settings.treeHeading',
          '{{listSetting}} / {{treeSetting}} — 바뀐 파일 목록의 모양',
          {
            listSetting: translate(
              'auto.components.right.sidebar.SourceControl.a91f8e2b01',
              'View as list'
            ),
            treeSetting: translate(
              'auto.components.right.sidebar.SourceControl.b82e9f3c12',
              'View as tree'
            )
          }
        )}
      </Subheading>

      <ComparisonFigure
        leftLabel={translate(
          'auto.components.right.sidebar.SourceControl.a91f8e2b01',
          'View as list'
        )}
        rightLabel={translate(
          'auto.components.right.sidebar.SourceControl.b82e9f3c12',
          'View as tree'
        )}
        left={
          <>
            <FigureRow glyph="M" label={LIST_FILE} />
            <FigureRow glyph="A" label={LIST_TEST} />
          </>
        }
        right={
          <>
            <FigureRow glyph="▾" label={TREE_FOLDER} />
            <FigureRow glyph="M" label={TREE_FILE} indent={1} />
            <FigureRow glyph="A" label={TREE_TEST} indent={1} />
          </>
        }
        caption={translate(
          'auto.components.sidebar.guide.settings.treeCaption',
          '같은 두 파일입니다. 목록은 경로를 통째로 한 줄에 적고, 트리는 폴더로 묶어 파일 이름만 남깁니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.treeRule1',
            '한 폴더 안에서 여러 파일이 바뀌었을 때 트리 쪽이 훨씬 짧아집니다. 반대로 파일이 두세 개뿐이면 목록이 빠릅니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.treeRule2',
            '소스 컨트롤 패널 오른쪽 위의 “더 보기” 메뉴에서 바꾸며, 워크스페이스마다가 아니라 사용자 단위로 기억됩니다.'
          )}
        </Rule>
      </RuleList>
    </>
  )
}
