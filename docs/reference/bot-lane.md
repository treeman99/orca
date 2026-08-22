# 봇 레인 (Bots)

> 사내 포크 고유 기능입니다. upstream Orca에는 없습니다.
> 관련 문서: [`enterprise-policy.md`](./enterprise-policy.md) · [`external-integrations-audit.md`](./external-integrations-audit.md)

좌측 사이드바에 `Sessions | Bots` 탭을 추가하고, **봇**이라는 이름 아래 에이전트·워크스페이스·예약 실행을 묶습니다.
Nous Research의 [Hermes Agent Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode)가 참고 대상이고,
그쪽의 핵심 설계 제약 하나를 그대로 가져왔습니다.

## 1. 설계 원칙 — 봇은 런타임이 아니라 이름이다

Hermes Bot Mode가 "no core patches, no background daemons, no extra storage"로 성립한 이유는
봇을 **이미 있는 프리미티브에 붙인 이름**으로 정의했기 때문입니다. 이 포크도 같은 제약을 지킵니다.

```
봇 = 이름 + 아바타 + 역할 설명
    + 에이전트 선택 (TuiAgent)
    + 프로젝트 (repo) — 체크아웃은 Orca가 메인 워크트리로 해석
    + 고정된 대화 페인 1개 (PaneKey)          ← 봇 챗
    + 그 봇에 귀속된 자동화 N개 (= 루틴)
```

봇은 **자기 프로세스도, 자기 스케줄러도, 자기 대화 저장소도 갖지 않습니다.**
루틴 실행은 기존 `AutomationService` → `OrcaRuntimeService` 경로를 그대로 탑니다.
그 결과 SSH 실행 경계, 엔터프라이즈 게이트, 실행 이력, 사용량 회수가 **공짜로 상속**됩니다.

새 런타임을 만들었다면 그 셋을 전부 복제한 뒤 서로 어긋나게 두었을 것입니다.

## 2. 무엇이 어디에 있나

| 층 | 위치 | 성격 |
| --- | --- | --- |
| 봇 타입·순수 판정 | `src/shared/bot-types.ts` | 신규 (포크 소유) |
| 저장 | `src/main/persistence/rostering-bots/bot-roster-operations.ts`, `PersistedState.bots` | 신규 |
| Store 메서드 | `src/main/persistence/loading-store/store.ts`의 `// ── Bots ──` 절 | upstream 파일에 절 1개 |
| IPC | `src/main/ipc/bots.ts` + `register-core-handlers.ts` 1줄 | 신규 + 등록 1줄 |
| preload | `src/preload/api/bot-api.ts` + `index.ts`의 `bots:` 블록 | 신규 + 블록 1개 |
| 렌더러 상태 | `store/slices/bots.ts`, `store/slices/bot-chat.ts`, `store/slices/left-sidebar-lane.ts` | 신규 슬라이스 3개 |
| 대화 해석·전달 | `components/sidebar/bots/bot-chat-session.ts`, `bot-chat-delivery.ts` | 신규 |
| 봇 간 라우팅 | `components/sidebar/bots/bot-message-routing.ts` | 신규 |
| 사이드바 탭 | `components/sidebar/SidebarLaneSwitch.tsx`, `components/sidebar/index.tsx` | 신규 + 조립 1곳 |
| 봇 UI | `components/sidebar/bots/**` | 신규 |
| 프로젝트 해석 | `components/sidebar/bots/bot-project-options.ts` | 신규 — 사용자는 프로젝트를 고르고, 체크아웃은 여기서 정해집니다(메인 워크트리 우선) |
| 정책 게이트 | `src/main/enterprise/unattended-agent-run-guard.ts` | 신규 가드 모듈 |

fork sync 원칙대로 **로직은 전부 신규 파일**이고, upstream 파일 접촉은 등록/조립 수준으로 묶었습니다.
`orca-runtime.ts`에는 아무것도 넣지 않았습니다.

## 3. 루틴 = `botId`가 붙은 자동화

`Automation.botId`(optional) 하나가 전부입니다. 스케줄러는 이 필드를 **읽지 않습니다** — 순수한 라벨입니다.

- 봇 상세의 "새 루틴"은 `automations:create`를 그대로 호출합니다 (`bot-routine-draft.ts`가 입력을 조립).
- `reuseSession: true`가 기본입니다. 루틴은 매일 새 대화가 아니라 그 봇과의 한 대화라는 의미입니다.
  ⚠️ 다만 세션 재사용 판정은 현재 **렌더러에만** 있고 "그 pane이 아직 살아 있는가"로 판단합니다 —
  헤드리스(`orca serve`) 실행과 앱 재시작을 넘기지 못합니다(§5의 봇 챗도 같은 한계를 공유합니다).
- 봇을 삭제해도 **루틴은 지워지지 않습니다.** `botId`만 `null`로 떨어지고 자동화 페이지에 남습니다.
  예약된 에이전트 실행을 로스터 정리 때문에 조용히 취소하면 안 되기 때문입니다.

### 폴더 워크스페이스는 명시적으로 거부합니다

`src/main/automations/`는 폴더 워크스페이스를 전혀 다루지 않습니다(참조 0건). 실행 대상 해석이 워크트리 id를 전제하므로,
폴더에 바인딩된 봇의 루틴은 **만들어지고 나서 영원히 skip**됩니다.

그래서 `getBotRoutineEligibility()`가 앞단에서 거부하고 UI가 이유를 표시합니다.
폴더 워크스페이스를 피커에서 **숨기지 않는** 이유는, 숨기면 사용자가 자기 워크스페이스가 왜 없는지 알 수 없기 때문입니다.

## 4. 엔터프라이즈 게이트

`disableUnattendedAgentRuns` — Orca 자신의 스케줄러를 거부합니다. 자세한 내용은
[`enterprise-policy.md` §3](./enterprise-policy.md)의 스키마 표를 보세요. 요점만:

- 게이트는 `AutomationService.requestDispatch` **한 곳**이고, 60초 틱과 헤드리스 디스패처를 함께 덮습니다.
- 거부된 실행은 `skipped_policy` 상태로 기록됩니다 — 관리자가 정책이 실제로 동작하는지 확인할 수 있어야 합니다.
- **"지금 실행"은 막지 않습니다.** 이 스위치의 축은 "사람 없이 시작되는가"입니다.
- 봇 루틴과 일반 자동화가 같은 서비스를 타므로 스위치 하나가 둘 다 덮습니다.

## 4-1. 역할·설명이 에이전트에 도달하는 경로

봇의 **역할(title)과 설명(description)**은 UI 표시용이 아니라 **에이전트에게 전달되는
지시문**입니다. 설명은 "이 저장소에서만 찾아라", "이 문서를 먼저 읽어라" 같은 **범위**를
적는 자리이므로, 소개글이 아니라 **상시 지시(standing instructions)**로 프레이밍해서 보냅니다.

| 경로 | 무엇이 들어가나 |
| --- | --- |
| 대화 첫 메시지 | 역할 블록(이름·핸들·역할·설명) + 팀메이트 절 |
| 대기(standby) 기동 | 위와 동일 + "대기하라" |
| **루틴(예약 실행)** | **역할 블록이 프롬프트에 함께 저장됩니다** |
| 대화 후속 메시지 | 없음 — 세션 컨텍스트에 이미 있습니다 |

⚠️ **루틴은 생성 시점의 역할·설명을 프롬프트에 굽습니다.** 루틴이 데몬이 살려 두지 못한
세션에 떨어질 수 있고, 자기가 누구인지 들은 적 없는 새 에이전트는 그 프롬프트를 일반
어시스턴트로 실행하면서 사용자가 적은 범위를 통째로 무시하기 때문입니다.
대가로 **나중에 설명을 고쳐도 기존 루틴의 프롬프트는 바뀌지 않습니다** — 자동화 페이지에서
프롬프트를 직접 고칠 수 있습니다(사용자가 그 프롬프트를 이미 손봤을 수 있으므로 자동으로
덮어쓰지 않습니다).

⚠️ 후속 메시지마다 역할을 다시 보내지는 않습니다. 매 턴 재주입은 컨텍스트를 태우고,
세션이 유지되는 동안은 첫 프롬프트가 그대로 남아 있습니다. 반대로 세션이 compact되거나
초기화되면 역할이 옅어질 수 있습니다 — 그때는 새 대화를 여는 편이 확실합니다.

## 5. 봇 챗 — 봇에게 말 걸기

봇 상세의 **대화** 절에서 봇에게 직접 지시합니다. Enter로 전송, Shift+Enter로 줄바꿈.

Hermes는 프로필마다 갈라지지 않는 정본 대화를 고정합니다. Orca에는 대화 저장소가 없으므로
(전사의 저자는 에이전트 CLI다) 등가 프리미티브를 **고정된 페인**으로 잡았습니다.

- `Bot.chatPaneKey`가 그 봇의 대화 페인을 `tabId:leafId`로 붙듭니다. PTY id가 아니라 **페인 키**라서
  PTY가 재시작돼도 같은 대화로 되돌아옵니다.
- **제목으로 복구합니다.** 앱을 재시작하면 탭 id가 새로 생겨 저장된 페인 키가 죽습니다.
  그때는 그 워크스페이스에서 `bot:<handle>` 제목을 가진 살아 있는 세션을 찾아 다시 붙듭니다 —
  사용자 눈앞에 돌고 있는 세션을 잃고 옆에 중복을 여는 일이 없어야 합니다.
  복구된 키는 즉시 저장되어 다음부터는 다시 찾지 않습니다.
  이 제목은 팀메이트가 서로를 찾는 키와 **같은 것**이라 복구와 발견이 어긋날 수 없습니다.
- 첫 메시지는 `launchAgentBackgroundSession`으로 **백그라운드 탭**을 띄웁니다 — 봇이 답하느라
  사용자의 현재 탭을 빼앗으면 안 됩니다. 세션 제목은 `bot:<handle>`입니다(§6의 발견 수단).
- 이후 메시지는 `submitPromptToAgentPty`로 같은 페인에 들어갑니다.
- 봇이 작업 중이어도 보낼 수 있습니다. 사람이 턴 중간에 후속 지시를 넣는 것은 정상입니다 —
  예약 실행과 달리 채팅은 그 판정을 막지 않고 상태만 표시합니다.
- 헤더의 ↗ 버튼이 그 페인을 본 화면에 띄웁니다. 전체 대화는 거기(에이전트 자신의 화면)에 있습니다.

사이드바가 보여 주는 것은 **Orca가 라우팅한 것**(내가 보낸 것, 다른 봇이 넘긴 것)과
에이전트 상태에서 읽은 **가장 최근 답변 한 개**입니다. 이건 대화의 사본이 아니라 인덱스입니다 —
사본을 두면 에이전트의 전사와 어긋납니다.

⚠️ **앱을 재시작하면 대화가 끊길 수 있습니다.** 데몬이 PTY를 살려 두면 이어지고, 아니면 다음
메시지가 새 세션을 엽니다. 사이드바의 라우팅 로그는 세션 한정이라 재시작 시 사라집니다.

## 6. 봇 ↔ 봇 — 일 넘기기

두 갈래입니다. 둘 다 이미 존재하는 경로 위에 있고, 새 RPC도 와이어 변경도 없습니다.

**전제: 팀메이트를 Orca가 미리 띄웁니다.** 봇에게 메시지를 보내면, 델리버리 **직전에**
같은 프로젝트의 봇 중 세션이 없는 것들을 대기 상태(standby)로 띄웁니다
(`ensureProjectTeammateSessions`). 코디네이터가 가장 먼저 하는 일이 팀메이트 조회이고,
로스터가 아직 올라와 있지 않으면 그건 코디네이터에게 "위임할 대상 없음"으로 읽히기 때문입니다.
한 번에 최대 6개까지만 띄웁니다 — 하나하나가 사용자 쿼터를 쓰는 실제 에이전트 프로세스입니다.
대기 세션의 첫 프롬프트는 로스터 프리앰블 + "대기하라"입니다. 그게 없으면 자동으로 뜬 봇이
자기가 봇인 줄도 모르고 빈 프롬프트 앞에 앉아 있게 됩니다.

**(a) 사용자가 넘기기 — `@handle`**

봇 A의 입력창에 `@code-reviewer PR 3 좀 봐줘`처럼 **맨 앞에** 멘션을 두면 그 메시지는 봇 B의
대화로 갑니다. 보낸 쪽 정보가 앞에 붙습니다:

```
Message from 🤖 Release Checker (@release-checker):

PR 3 좀 봐줘
```

- 이 attribution은 장식이 아닙니다. 없으면 받는 에이전트가 사용자가 쓴 것으로 읽고 엉뚱한 쪽에 답합니다.
- **맨 앞의 멘션만** 라우팅합니다. 문장 중간의 `@이름`은 지금 보고 있는 봇에게 읽히라고 쓴 산문입니다.
- 없는 핸들이면 보내지 않고 그렇게 말합니다 — 산문으로 흘려보내면 메시지가 사라집니다.
- 받은 봇은 로스터에 **읽지 않음 점**이 붙고, `Sessions | Bots` 탭에도 개수가 뜹니다.

**(b) 봇이 스스로 넘기기 — 팀메이트 명부**

봇의 대화가 처음 열릴 때 팀메이트 명부가 프리앰블로 주입됩니다. 각 봇 세션의 터미널 제목이
`bot:<handle>`이라, 에이전트는 이미 있는 CLI만으로 팀메이트를 찾아 보낼 수 있습니다:

```bash
orca terminal list --json                 # 팀메이트는 bot:<handle> 제목으로 떠 있습니다
# 목록에 없으면 = 아직 한 번도 메시지를 받지 않은 봇입니다. 같은 제목으로 직접 띄웁니다:
orca terminal create --worktree active --title "bot:<handle>" --command "<agent>" --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json
orca terminal send --terminal <handle> --text "<메시지>" --enter --json
```

⚠️ **`create` 단계가 프리앰블에 반드시 있어야 합니다.** 봇은 누군가 메시지를 보내야 터미널이
생기므로, 새로 만든 로스터에서는 팀메이트 대부분이 **떠 있지 않습니다.** 첫 버전은 `list`와 `send`만
알려 줬고, 코디네이터 봇은 정확하게 "위임할 대상이 없으니 제가 직접 하겠습니다"로 결론냈습니다.
제목이 정확해야 Orca가 그 터미널을 **그 봇의 대화로 채택**합니다(§5의 제목 복구와 같은 키).

새 RPC를 만들지 않은 이유가 여기 있습니다 — 새 메서드는 capability 협상 없이는 페어링된
구버전 클라이언트에 닿지 않습니다([remote-wire-compatibility.md](./remote-wire-compatibility.md)).

⚠️ 이건 **Hermes의 `message_agent` 툴이 아닙니다.** 에이전트가 명부를 읽고 스스로 명령을 실행할
때만 동작하며, 강제되지 않습니다. 확실한 인계는 (a) 쪽입니다.

## 7. 의도적으로 만들지 않은 것

| 기능 | 왜 없나 |
| --- | --- |
| 메신저 게이트웨이 (Telegram/Slack/Discord) | 사내 소스가 사외로 나가는 레인이고, 자식 프로세스로 붙이면 `enforceNetworkAllowlist`가 구조적으로 보지 못합니다. 감사 등록부 #28 참고 |
| 그룹챗 (여러 봇이 한 방에서 토론) | 현재 그룹 주소는 send 시점에 살아 있는 터미널에서 파생됩니다. 멤버 명부를 가진 영속 방이 아닙니다. Hermes의 3라운드·10메시지 상한 같은 폭주 방지도 함께 설계해야 합니다 |
| 재시작을 넘기는 정본 대화 | 대화의 저자가 에이전트 CLI라 Orca에 쓰기 경로가 없습니다. 페인이 죽으면 새 세션입니다 |
| 봇별 자격증명 | 계정 자격증명이 "전역 활성 슬롯 → `~/.claude`로 materialize" 구조라 봇마다 다른 계정으로 동시 실행할 수 없습니다 |
| 봇의 원격(SSH) 상시 실행 | SSH 모델의 오케스트레이션 제어평면은 클라이언트에 거주합니다. 노트북을 닫으면 원격 봇이 보고할 통로가 없습니다 — `orca serve` peer 모델이 맞습니다 |
| 폴더 워크스페이스 봇의 대화·루틴 | 실행 대상 해석이 워크트리 id 전제입니다. 앞단에서 명시적으로 거부합니다 |

## 8. Windows에서 상시성을 약속하지 마세요

봇은 "항상 켜져 있는 것"이 아니라 **"예정대로 실행하고 결과를 남기는 것"**입니다.

`docs/reference/windows-daemon-session-survival.md`가 적는 대로, 데몬 레인이 실패·열화하면 터미널이 로컬 PTY로 뜨고
앱 종료 시 함께 죽습니다. 이 폴백은 **사용자에게 아무것도 보여 주지 않습니다.**
사내 배포가 Windows이므로 봇 UI는 이 사실과 모순되는 표현("항상 대기 중", "24시간")을 쓰지 않습니다.

## 9. 확인 방법

```bash
pnpm test src/shared/bot-types.test.ts
pnpm test src/main/persistence-bots.test.ts
pnpm test src/main/automations/service-enterprise-policy.test.ts
pnpm test src/renderer/src/components/sidebar/bots
pnpm test src/renderer/src/components/sidebar/Sidebar.test.tsx
pnpm test src/renderer/src/store/slices/bot-chat.test.ts
```

수동 확인(개발 실행):

1. `pnpm dev` → 좌측 사이드바 상단에 `Sessions | Bots` 스트립이 보입니다.
2. `Sessions`가 기본이고, 워크스페이스 목록은 **이전과 동일**해야 합니다.
3. `Bots` → `+` → 이름/역할/에이전트/워크스페이스를 채워 저장.
4. 봇을 열고 **대화** 입력창에 지시를 보냅니다 → 백그라운드 탭이 뜨고 상태 점이 "작업 중"으로 바뀝니다.
   헤더 ↗ 로 그 세션을 본 화면에서 확인합니다. 같은 봇에 다시 보내면 **같은 세션**으로 들어가야 합니다.
5. 봇을 하나 더 만들고, 첫 봇의 입력창에 `@<두번째-핸들> 확인해줘`를 보냅니다 → 두 번째 봇의 세션이 뜨고,
   첫 봇 스레드에는 "…에게 넘김", 두 번째 봇 스레드에는 "…에게서"가 남습니다. 로스터에 읽지 않음 점이 붙습니다.
6. 봇을 열고 `Routines`의 `+`로 루틴을 만든 뒤, 자동화 페이지에 같은 항목이 보이는지 확인합니다 (같은 레코드입니다).
7. 정책 확인: `ORCA_ENTERPRISE_POLICY`로 `{"lockdown": true}` 파일을 가리키고 재기동하면
   봇 상세의 `+`가 사라지고 정책 안내가 뜹니다. 예약된 루틴은 목록에 남되 실행되지 않고,
   실행 기록에 `Blocked by policy`가 남습니다.
