// Section 3: tabs, splits, and the one thing about terminal survival that is easy to get wrong.
//
// The survival bullet is deliberately conditional. Sessions outlive a restart only when the PTY
// daemon owns them; when the daemon lane fails Orca falls back to an in-process PTY with no
// visible sign, and quitting kills it (docs/reference/windows-daemon-session-survival.md).
// Promising unconditional survival here would be a lie the reader only discovers after losing work.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { TabbedPanesFigure } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'
import { GUIDE_SAMPLE } from './usage-guide-sample-values'

// Not translatable: literal program output the reader matches against their own screen. A
// translated "ready in 206 ms" would stop being the line the dev server actually prints.
const SAMPLE_AGENT_OUTPUT = 'Searching…'
const SAMPLE_DEV_OUTPUT: readonly string[] = ['ready in 206 ms', 'http://127.0.0.1:5173/']

export function UsageGuideTerminalsSection(): React.JSX.Element {
  const newTerminalShortcut = useShortcutLabel('tab.newTerminal')
  const closeTabShortcut = useShortcutLabel('tab.close')
  const reopenTabShortcut = useShortcutLabel('tab.reopenClosed')
  const splitRightShortcut = useShortcutLabel('terminal.splitRight')
  const splitDownShortcut = useShortcutLabel('terminal.splitDown')

  return (
    <>
      <p>
        {translate(
          'auto.components.sidebar.guide.terminals.intro',
          '워크스페이스 하나는 터미널을 여러 개 가질 수 있습니다. 에이전트를 돌리는 탭, 개발 서버를 띄우는 탭, 직접 명령을 치는 탭을 따로 두는 것이 보통의 쓰임새입니다.'
        )}
      </p>

      <TabbedPanesFigure
        tabs={[GUIDE_SAMPLE.agent, GUIDE_SAMPLE.gitTab]}
        activeTab={0}
        panes={[
          {
            label: GUIDE_SAMPLE.agent,
            lines: [
              translate(
                'auto.components.sidebar.guide.terminals.figPrompt',
                '> src/payment 아래 재시도 로직을 찾아줘'
              ),
              SAMPLE_AGENT_OUTPUT
            ],
            active: true
          },
          { label: GUIDE_SAMPLE.devCommand, lines: SAMPLE_DEV_OUTPUT, active: false }
        ]}
        caption={translate(
          'auto.components.sidebar.guide.terminals.figCaption',
          '위쪽 줄이 탭, 그 아래 나란한 두 칸이 한 탭 안의 분할입니다. 흐리게 보이는 쪽이 지금 포커스가 없는 판입니다.'
        )}
      />

      <Subheading>
        {translate('auto.components.sidebar.guide.terminals.layoutHeading', '탭과 분할')}
      </Subheading>

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.layoutRule1',
            '새 터미널 탭은 {{newTab}}, 탭 닫기는 {{closeTab}}, 실수로 닫았으면 {{reopenTab}} 로 되돌립니다.',
            {
              newTab: newTerminalShortcut,
              closeTab: closeTabShortcut,
              reopenTab: reopenTabShortcut
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.layoutRule2',
            '탭 하나를 좌우로 쪼개려면 {{splitRight}}, 위아래로 쪼개려면 {{splitDown}} 입니다. 이 두 단축키는 OS 마다 기본값이 다르므로 여기 적힌 값은 이 PC 의 실제 설정입니다.',
            { splitRight: splitRightShortcut, splitDown: splitDownShortcut }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.layoutRule3',
            '단축키는 설정 → 키보드 단축키에서 모두 바꿀 수 있습니다. 위 값들은 바꾼 뒤에도 이 문서에 그대로 반영됩니다.'
          )}
        </Rule>
      </RuleList>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.terminals.survivalHeading',
          '앱을 껐다 켜면 터미널은 어떻게 되나'
        )}
      </Subheading>

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.survivalRule1',
            '설계상 터미널은 Orca 본체가 아니라 별도의 PTY 데몬이 소유합니다. 데몬이 들고 있으면 Orca 를 껐다 켜도 에이전트는 계속 돌고 있던 그 프로세스에 다시 붙습니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.survivalRule2',
            '다만 데몬 레인이 실패하면 Orca 는 조용히 앱 안쪽 터미널로 물러섭니다. 이때는 앱을 끄는 순간 그 프로세스들이 함께 죽습니다. 이 폴백은 화면에 아무 표시도 남기지 않고, 평소에는 차이가 전혀 없습니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.survivalRule3',
            '그래서 재시작 후 화면에 이전 대화가 그대로 보이는 것은 살아 있다는 증거가 아닙니다 — 그건 다시 그려진 스크롤백일 수 있습니다. 확실한 판정은 그 터미널에 한 줄 쳐 보는 것입니다: 에이전트가 받으면 살아 있는 것이고, 셸 프롬프트가 받으면 죽은 것입니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.survivalRule4',
            '죽어 있었다면 재부착이 실패한 것이 아니라 애초에 데몬이 그 세션을 갖고 있지 않았던 것입니다. 반복되면 관리자에게 알리십시오 — PC 쪽 실행 정책이나 백신이 데몬 실행을 막는 경우가 있습니다.'
          )}
        </Rule>
      </RuleList>

      <Subheading>
        {translate(
          'auto.components.sidebar.guide.terminals.sshHeading',
          'SSH 워크스페이스에서 다른 점'
        )}
      </Subheading>

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.sshRule1',
            'SSH 호스트의 워크스페이스는 터미널이 그 원격 호스트에서 돕니다. 붙들고 있는 것도 내 PC 가 아니라 원격에 올라간 Orca 릴레이입니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.sshRule2',
            '그래서 네트워크가 잠깐 끊겨도 릴레이가 유예 시간 동안 세션을 붙들고 있다가, 다시 접속하면 에이전트를 재시작하지 않고 그대로 이어 붙입니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.terminals.sshRule3',
            '유예 시간을 넘겨 되붙일 수 없게 되면 그 판에 안내가 뜹니다: “{{notice}}” 이 경우 그 판은 되살릴 수 없고 새 터미널을 열어야 합니다.',
            {
              notice: translate(
                'auto.components.terminal.pane.TerminalErrorToast.sessionUnavailable',
                "Orca couldn't reattach to this pane's terminal session on the host. Open a new terminal to continue."
              )
            }
          )}
        </Rule>
      </RuleList>
    </>
  )
}
