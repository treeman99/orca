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
    + 워크스페이스 바인딩 (WorkspaceKey)
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
| 렌더러 상태 | `store/slices/bots.ts`, `store/slices/left-sidebar-lane.ts` | 신규 슬라이스 2개 |
| 사이드바 탭 | `components/sidebar/SidebarLaneSwitch.tsx`, `components/sidebar/index.tsx` | 신규 + 조립 1곳 |
| 봇 UI | `components/sidebar/bots/**` | 신규 |
| 정책 게이트 | `src/main/enterprise/unattended-agent-run-guard.ts` | 신규 가드 모듈 |

fork sync 원칙대로 **로직은 전부 신규 파일**이고, upstream 파일 접촉은 등록/조립 수준으로 묶었습니다.
`orca-runtime.ts`에는 아무것도 넣지 않았습니다.

## 3. 루틴 = `botId`가 붙은 자동화

`Automation.botId`(optional) 하나가 전부입니다. 스케줄러는 이 필드를 **읽지 않습니다** — 순수한 라벨입니다.

- 봇 상세의 "새 루틴"은 `automations:create`를 그대로 호출합니다 (`bot-routine-draft.ts`가 입력을 조립).
- `reuseSession: true`가 기본입니다. 루틴은 매일 새 대화가 아니라 그 봇과의 한 대화라는 의미입니다.
  ⚠️ 다만 세션 재사용 판정은 현재 **렌더러에만** 있고 "그 pane이 아직 살아 있는가"로 판단합니다 —
  헤드리스(`orca serve`) 실행과 앱 재시작을 넘기지 못합니다. 정본 대화(봇 챗)는 이 브랜치의 범위 밖입니다.
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

## 5. 의도적으로 만들지 않은 것

Hermes Bot Mode에는 있지만 이 브랜치에 **없는** 것과 그 이유입니다. 나중에 추가한다면 각각 독립 안건입니다.

| 기능 | 왜 없나 |
| --- | --- |
| 메신저 게이트웨이 (Telegram/Slack/Discord) | 사내 소스가 사외로 나가는 레인이고, 자식 프로세스로 붙이면 `enforceNetworkAllowlist`가 구조적으로 보지 못합니다. 감사 등록부 #28 참고 |
| 봇↔봇 메시징 (`@mention`, `message_agent`) | orchestration `messages` 테이블에 저장·스레드·팬아웃은 이미 있으나 주소가 터미널 핸들입니다. `bot:<id>` 의사 핸들과 **꺼진 봇을 깨우는 트리거**가 필요하고, 후자는 `live`/`unverifiable`/`exited` 판정 문제를 그대로 안고 있습니다 |
| 그룹챗 | 현재 그룹 주소는 send 시점에 살아 있는 터미널에서 파생됩니다. 멤버 명부를 가진 영속 방이 아닙니다 |
| 정본 봇 챗 (분기 불가 대화) | Orca가 소유하는 대화 저장소가 없습니다 — native-chat은 에이전트 CLI가 쓴 전사를 읽기만 합니다 |
| 봇별 자격증명 | 계정 자격증명이 "전역 활성 슬롯 → `~/.claude`로 materialize" 구조라 봇마다 다른 계정으로 동시 실행할 수 없습니다 |
| 봇의 원격(SSH) 상시 실행 | SSH 모델의 오케스트레이션 제어평면은 클라이언트에 거주합니다. 노트북을 닫으면 원격 봇이 보고할 통로가 없습니다 — `orca serve` peer 모델이 맞습니다 |

`@handle`은 이미 표시됩니다(`botHandle()`). 주소 체계를 붙일 때 이름을 다시 정하지 않아도 되도록 미리 노출해 둔 것이고,
현재는 **표시 전용**입니다. 핸들 충돌은 해소하지 않습니다.

## 6. Windows에서 상시성을 약속하지 마세요

봇은 "항상 켜져 있는 것"이 아니라 **"예정대로 실행하고 결과를 남기는 것"**입니다.

`docs/reference/windows-daemon-session-survival.md`가 적는 대로, 데몬 레인이 실패·열화하면 터미널이 로컬 PTY로 뜨고
앱 종료 시 함께 죽습니다. 이 폴백은 **사용자에게 아무것도 보여 주지 않습니다.**
사내 배포가 Windows이므로 봇 UI는 이 사실과 모순되는 표현("항상 대기 중", "24시간")을 쓰지 않습니다.

## 7. 확인 방법

```bash
pnpm test src/shared/bot-types.test.ts
pnpm test src/main/persistence-bots.test.ts
pnpm test src/main/automations/service-enterprise-policy.test.ts
pnpm test src/renderer/src/components/sidebar/bots
pnpm test src/renderer/src/components/sidebar/Sidebar.test.tsx
```

수동 확인(개발 실행):

1. `pnpm dev` → 좌측 사이드바 상단에 `Sessions | Bots` 스트립이 보입니다.
2. `Sessions`가 기본이고, 워크스페이스 목록은 **이전과 동일**해야 합니다.
3. `Bots` → `+` → 이름/역할/에이전트/워크스페이스를 채워 저장.
4. 봇을 열고 `Routines`의 `+`로 루틴을 만든 뒤, 자동화 페이지에 같은 항목이 보이는지 확인합니다 (같은 레코드입니다).
5. 정책 확인: `ORCA_ENTERPRISE_POLICY`로 `{"lockdown": true}` 파일을 가리키고 재기동하면
   봇 상세의 `+`가 사라지고 정책 안내가 뜹니다. 예약된 루틴은 목록에 남되 실행되지 않고,
   실행 기록에 `Blocked by policy`가 남습니다.
