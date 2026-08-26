// Section 2: which agent runs, and how to read what it is doing.
//
// Labels are quoted through the same catalog keys the real UI uses. The five activity-state
// names are the exception: StatusIndicator puts them in a `title` attribute as plain English
// literals (worktree-status.ts STATUS_LABELS), so the guide must print them untranslated or
// it names a tooltip the reader will never see.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { AppWindowFigure, FigureRow, FigureStatusDot } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'
import { GUIDE_SAMPLE, SIDEBAR_PROJECTS_TITLE } from './usage-guide-sample-values'

// Not translatable: `STATUS_LABELS` in src/renderer/src/lib/worktree-status.ts is a plain
// Record<string, string>, so the tooltip stays English in every locale.
const STATUS_TOOLTIP = {
  working: 'Working',
  permission: 'Needs permission',
  active: 'Active',
  done: 'Done',
  inactive: 'Inactive'
} as const

export function UsageGuideAgentsSection(): React.JSX.Element {
  const claudeLabel = translate('auto.lib.agent.catalog.0708ed89f1', 'Claude')
  const openCodeLabel = translate('auto.lib.agent.catalog.e7a4ca5103', 'OpenCode')

  return (
    <>
      <p>
        {translate(
          'auto.components.sidebar.guide.agents.intro',
          'Orca 는 에이전트 CLI 를 대신하지 않습니다. 워크스페이스마다 터미널을 띄우고 그 안에서 CLI 를 실행할 뿐이라, 프롬프트는 그냥 그 터미널에 칩니다. Orca 가 더해 주는 것은 여러 개를 동시에 돌려 놓고 어느 것이 지금 무엇을 하고 있는지 한눈에 보는 일입니다.'
        )}
      </p>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.agents.pickHeading',
          '어떤 에이전트를 고를 수 있나'
        )}
      </Subheading>

      <AppWindowFigure
        sidebarTitle={SIDEBAR_PROJECTS_TITLE}
        sidebar={
          <>
            <FigureRow
              glyph={<FigureStatusDot tone="live" />}
              label={GUIDE_SAMPLE.worktreeName}
              detail={translate(
                'auto.components.sidebar.guide.agents.figWorking',
                '스피너 · 에이전트가 일하는 중'
              )}
              trailing="◐"
            />
            <FigureRow
              glyph={<FigureStatusDot tone="live" />}
              label={GUIDE_SAMPLE.project}
              detail={translate(
                'auto.components.sidebar.guide.agents.figPermission',
                '물음표 · 승인을 기다리는 중'
              )}
              trailing="?"
            />
            <FigureRow
              glyph={<FigureStatusDot tone="idle" />}
              label={GUIDE_SAMPLE.folderWorkspaceName}
              detail={translate(
                'auto.components.sidebar.guide.agents.figInactive',
                '회색 점 · 살아 있는 터미널 없음'
              )}
            />
          </>
        }
        bodyTitle={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
        body={
          <>
            <FigureRow glyph="🤖" label={claudeLabel} detail={GUIDE_SAMPLE.agent} trailing="▾" />
            <FigureRow glyph="🤖" label={openCodeLabel} detail={GUIDE_SAMPLE.agentAlt} />
          </>
        }
        caption={translate(
          'auto.components.sidebar.guide.agents.figCaption',
          '사이드바 쪽은 워크스페이스마다의 활동 표시, Agents 쪽은 고를 수 있는 에이전트입니다. 사내 배포판에서 이 목록이 짧은 것은 정상입니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.pickRule1',
            '고를 수 있는 CLI 는 관리자 정책이 정합니다. 사내 배포판의 기본값은 {{claude}}({{claudeCmd}}) 와 {{opencode}}({{opencodeCmd}}) 둘뿐이고, 정책이 허용하지 않은 에이전트는 피커에 아예 나타나지 않습니다.',
            {
              claude: claudeLabel,
              claudeCmd: GUIDE_SAMPLE.agent,
              opencode: openCodeLabel,
              opencodeCmd: GUIDE_SAMPLE.agentAlt
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.pickRule2',
            '목록에 있어도 그 CLI 가 PC 에 설치돼 있어야 실제로 뜹니다. Orca 는 PATH 에서 찾을 뿐 대신 설치해 주지 않습니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.pickRule3',
            '이미 돌고 있던 에이전트는 정책이 나중에 그것을 숨기더라도 이름이 그대로 표시됩니다 — 이름 표시는 정책 필터를 거치지 않기 때문입니다.'
          )}
        </Rule>
      </RuleList>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.agents.statusHeading',
          '지금 무엇을 하고 있는지 읽기'
        )}
      </Subheading>

      <p>
        {translate(
          'auto.components.sidebar.guide.agents.statusIntro',
          '사이드바의 워크스페이스 한 줄마다 왼쪽에 활동 표시가 하나 붙습니다. 여기에 마우스를 올리면 상태 이름이 툴팁으로 뜹니다 — 이 이름만은 번역되지 않고 영어 그대로입니다.'
        )}
      </p>

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.statusRule1',
            '도는 스피너 = {{working}}. 에이전트가 지금 작업 중입니다.',
            { working: STATUS_TOOLTIP.working }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.statusRule2',
            '물음표 = {{permission}}. 에이전트가 승인을 기다리며 멈춰 있습니다. 이 표시는 나머지 전부를 제치고 뜨므로, 판이 여러 개라도 하나만 물어보면 워크스페이스 줄이 물음표가 됩니다.',
            { permission: STATUS_TOOLTIP.permission }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.statusRule3',
            '초록 점 = {{active}} 또는 {{done}}. 두 상태가 같은 색이라 점만 보고는 구분할 수 없습니다. 툴팁으로 확인하십시오.',
            { active: STATUS_TOOLTIP.active, done: STATUS_TOOLTIP.done }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.statusRule4',
            '회색 점 = {{inactive}}. 그 워크스페이스에 살아 있는 터미널이 하나도 없다는 뜻입니다. 대화 내용이 화면에 남아 있어도 프로세스는 없을 수 있습니다.',
            { inactive: STATUS_TOOLTIP.inactive }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.agents.statusRule5',
            '이 표시는 워크스페이스 전체를 합친 값입니다. 어느 판이 물어보고 있는지는 카드를 펼쳐 {{agents}} 목록에서 봅니다.',
            {
              agents: translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')
            }
          )}
        </Rule>
      </RuleList>
    </>
  )
}
