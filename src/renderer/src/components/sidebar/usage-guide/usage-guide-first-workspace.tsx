// Section 1, third part: the create-workspace composer itself.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { getScreenSubmitShortcutLabel } from '@/lib/screen-submit-shortcut'
import { FigureRow, PanelFigure } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'
import { GUIDE_SAMPLE } from './usage-guide-sample-values'

export function UsageGuideFirstWorkspacePart(): React.JSX.Element {
  const createWorkspaceShortcut = useShortcutLabel('workspace.create')
  const submitShortcut = getScreenSubmitShortcutLabel()
  const newWorkspaceLabel = translate(
    'auto.components.sidebar.SidebarHeader.92154beb7e',
    'New workspace'
  )
  const createWorktreeLabel = translate(
    'auto.components.NewWorkspaceComposerModal.createWorktree',
    'Create worktree'
  )

  return (
    <>
      <Subheading>
        {translate('auto.components.sidebar.guide.start.firstHeading', '첫 워크스페이스 만들기')}
      </Subheading>

      <PanelFigure
        title={createWorktreeLabel}
        caption={translate(
          'auto.components.sidebar.guide.start.firstCaption',
          '이름은 비워 둬도 됩니다. Git 프로젝트에서는 같은 칸이 기준 브랜치를 고르는 칸을 겸합니다.'
        )}
      >
        <FigureRow
          glyph="📦"
          label={translate('auto.components.NewWorkspaceComposerCard.969a8bff66', 'Project')}
          detail={GUIDE_SAMPLE.project}
        />
        <FigureRow
          glyph="✏️"
          label={translate(
            'auto.components.NewWorkspaceComposerCard.ac3748dcda',
            "Name or 'Create From'"
          )}
          detail={translate('auto.components.NewWorkspaceComposerCard.0c5d6a479c', '[Optional]')}
        />
        <FigureRow glyph="🤖" label={GUIDE_SAMPLE.agent} trailing="▾" />
        <FigureRow glyph="▶" label={createWorktreeLabel} trailing={submitShortcut} />
      </PanelFigure>

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.firstRule1',
            '사이드바 맨 위 줄의 ＋ 버튼(툴팁 {{newWorkspace}}) 또는 단축키 {{shortcut}} 로 엽니다.',
            { newWorkspace: newWorkspaceLabel, shortcut: createWorkspaceShortcut }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.firstRule2',
            '프로젝트를 고르고, 이름은 원하면 적습니다 — 라벨에 {{optional}} 이 붙어 있듯 비워 두면 Orca 가 대신 짓습니다.',
            {
              optional: translate(
                'auto.components.NewWorkspaceComposerCard.0c5d6a479c',
                '[Optional]'
              )
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.firstRule3',
            '에이전트를 고르면 워크스페이스가 만들어지자마자 그 CLI 가 터미널에 떠 있습니다. 고를 수 있는 목록은 관리자 정책이 정합니다 — 사내 배포판의 기본값은 claude 와 opencode 둘뿐입니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.firstRule4',
            '만들기는 창 아래 버튼이나 {{submit}} 입니다.',
            { submit: submitShortcut }
          )}
        </Rule>
      </RuleList>
      <p>
        {translate(
          'auto.components.sidebar.guide.start.outro',
          '여기까지 하면 사이드바에 워크스페이스 한 줄이 생기고, 그 줄을 누르면 오른쪽에 터미널과 에디터가 붙습니다.'
        )}
      </p>
    </>
  )
}
