// Section 5, part 3: a terminal setting whose whole effect is one character on screen.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { ComparisonFigure, FigureMonoLines } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'

// Not translatable: a shell prompt and a command the reader types verbatim, plus the two cursor
// glyphs themselves — the whole point of the figure is the shape of that last character.
const PROMPT_LINE = '$ pnpm test'
const BAR_CURSOR_LINE = '$ ▏'
const BLOCK_CURSOR_LINE = '$ █'

export function UsageGuideSettingsTerminalPart(): React.JSX.Element {
  const barLabel = translate('auto.components.settings.TerminalAppearanceSection.e070e8aeba', 'Bar')
  const blockLabel = translate(
    'auto.components.settings.TerminalAppearanceSection.52854a5608',
    'Block'
  )
  const underlineLabel = translate(
    'auto.components.settings.TerminalAppearanceSection.2e5aec3cf6',
    'Underline'
  )

  return (
    <>
      <Subheading>
        {translate(
          'auto.components.sidebar.guide.settings.cursorHeading',
          '{{setting}} — 커서가 어디 있는지 눈에 띄게',
          {
            setting: translate(
              'auto.components.settings.TerminalAppearanceSection.db270cc9a9',
              'Cursor Shape'
            )
          }
        )}
      </Subheading>

      <ComparisonFigure
        leftLabel={barLabel}
        rightLabel={blockLabel}
        left={<FigureMonoLines lines={[PROMPT_LINE, BAR_CURSOR_LINE]} />}
        right={<FigureMonoLines lines={[PROMPT_LINE, BLOCK_CURSOR_LINE]} />}
        caption={translate(
          'auto.components.sidebar.guide.settings.cursorCaption',
          '같은 프롬프트입니다. Bar 는 글자 사이의 가는 막대, Block 은 글자 한 칸을 통째로 채운 사각형입니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.cursorRule1',
            '{{underline}} 까지 세 가지가 있습니다. 에이전트가 화면을 빠르게 다시 그리는 동안 커서를 놓치기 쉬우면 {{block}} 이 가장 잘 보입니다.',
            { underline: underlineLabel, block: blockLabel }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.cursorRule2',
            '바로 아래 깜빡임 항목은 모양을 바꾸는 게 아니라, 고른 모양을 깜빡이게 할지만 정합니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.settings.cursorRule3',
            '판이 여러 개일 때, 포커스가 없는 판에서는 {{block}} 만 속이 빈 테두리로 바뀝니다. {{bar}} 와 {{underline}} 은 모양 그대로 남습니다 — 가는 선을 테두리로 바꾸면 획만 늘어 보이기 때문입니다.',
            { block: blockLabel, bar: barLabel, underline: underlineLabel }
          )}
        </Rule>
      </RuleList>
    </>
  )
}
