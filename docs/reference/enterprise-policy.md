# 엔터프라이즈 정책 파일 레퍼런스 (관리자용)

기준: **v1.4.155** (브랜치 `enterprise/samsungds`).
대상: 이 포크를 사내 다수 PC에 배포·운영하는 관리자. 배포 대상은 **Windows x64**입니다. 정책 파일 하나로 벤더 phone-home을 끄고 사내 GHES 호스트를 지정합니다.

관련 문서: 외부 연동 목록과 정책이 덮지 못하는 항목은 [외부 연동 감사](./external-integrations-audit.md), Windows 설치 파일 제작은 [Windows 사내 빌드 가이드](./windows-corporate-build.md).

---

## 1. 왜 환경변수가 아니라 파일인가

Orca가 `process.env`에서 읽는 값은 **Orca가 스폰하는 프로세스가 그대로 상속**합니다 — 에이전트 CLI(claude/codex/…)를 띄우는 PTY, `gh`/`glab`/`git` 서브프로세스(예: `src/main/github/client.ts:239-243`은 `env` 옵션 없이 실행하므로 `process.env`를 통째로 물려받습니다), 그리고 릴레이까지 (설계 근거는 `src/shared/enterprise-policy.ts:4-8` 주석). 잠금 스위치를 환경변수로 두면 같은 머신의 무관한 도구까지 `ORCA_*` 변수로 오염되고, Windows에서는 `setx`로 심은 값이 **사용자 프로파일 단위**라 다른 계정·서비스 계정·새로 만든 프로파일은 그대로 풀린 상태로 남습니다.

그래서 이 포크는 **런타임 환경변수를 딱 하나만 추가**하고, 나머지 스위치는 전부 관리자 소유 JSON 파일 안에 둡니다 (`src/shared/enterprise-policy.ts:4-8`, `src/main/enterprise/enterprise-policy-file.ts:4-11`).

### 이 포크가 추가하는 런타임 환경변수 (전부)

| 환경변수 | 값 | 패키징 빌드(사용자 PC에 설치된 `.exe`) | 비패키징(`pnpm dev`·vitest) |
| --- | --- | --- | --- |
| `ORCA_ENTERPRISE_POLICY` | 정책 파일 절대경로 | 후보 목록에 **끼워 넣기만** 합니다 — 순서는 머신 전역 → 이 경로 → 사용자별. **머신 전역이 여전히 1순위** | 그 경로 **하나만** 후보로 삼음 (2·3순위 탐색 안 함) |
| `ORCA_ENTERPRISE_POLICY` | `off` / `none` / `disabled` / `false` / `0` (대소문자 무관) | **무시됩니다.** 머신 전역 파일이 있으면 그대로 적용 | 탐색 자체를 무력화. 정책 미적용 |

구현: `enterprise-policy-file.ts:23`(변수명), `:28`(무력화 값), `:59-83`(후보 목록 조립 — `allowEnvOverride`가 `false`면 무력화 값을 버리고 명시 경로를 머신 전역 **뒤로** 강등), `:163-171`(`app.isPackaged !== true`로 패키징 여부 판정), `:185-190`(호출부).

> 🔒 **이것이 보안 경계입니다.** Windows에서는 표준 사용자도 관리자 권한 없이 자기 계정의 환경변수를 만들 수 있습니다(`setx ORCA_ENTERPRISE_POLICY off` 한 줄). 환경변수 무력화가 무조건 통했다면 사내 잠금이 **명령어 하나로 우회**됐을 것입니다. 그래서 패키징 빌드에서는 환경변수가 후보를 **추가**만 할 수 있고, 관리자가 배포한 머신 전역 파일에서 **다른 곳으로 돌리거나 그것을 끄지 못합니다** (`enterprise-policy-file.ts:49-58` 주석). 판정 신호로 `app.isPackaged`를 쓰는 이유도 같습니다 — 표준 사용자가 바꿀 수 없는 유일한 신호입니다 (`:163-164` 주석).

비패키징에서 옛 동작을 남겨 둔 것은 개발·테스트 때문입니다. `config/vitest-enterprise-policy-isolation.ts:6`이 `ORCA_ENTERPRISE_POLICY=off`를 박아, 이 포크를 빌드하는 사내 머신(머신 전역 정책 파일이 이미 깔려 있는 PC)에서 vitest가 lockdown 상태로 돌지 않게 합니다. 테스트 러너는 패키징 빌드가 아니므로 이 값이 그대로 듣습니다.

### 더 이상 존재하지 않는 환경변수

아래는 초기 설계에 있었으나 **코드에서 완전히 제거**됐습니다. 배포 스크립트·GPO에 남아 있다면 지우세요. 설정해도 아무 효과가 없습니다.

```
ORCA_ENTERPRISE_LOCKDOWN      ORCA_DISABLE_AUTO_UPDATE
ORCA_DISABLE_STAR_NAG         ORCA_DISABLE_TELEMETRY
ORCA_GITHUB_ENTERPRISE_HOST
```

### 여전히 유효한 환경변수 (우리가 만든 게 아니라서)

| 환경변수 | 소유자 | 역할 |
| --- | --- | --- |
| `GH_HOST` | `gh` CLI | `githubEnterpriseHost`가 비었을 때의 폴백 (`src/shared/enterprise-policy.ts:203`) |
| `DO_NOT_TRACK` | 커뮤니티 표준 | 텔레메트리 차단, 최우선 (`src/main/telemetry/consent.ts:79-81`) |
| `ORCA_TELEMETRY_DISABLED` | 업스트림 Orca | 텔레메트리 차단 (`consent.ts:83-85`) |
| `ORCA_DIAGNOSTICS_DISABLED` | 업스트림 Orca | 로컬 진단 파일까지 포함해 진단 레인 전체 off (`src/main/observability/index.ts:102, 113-119`) |

**빌드 시점 전용**(빌드 셸에서만 쓰이고 앱 런타임 환경에는 들어가지 않음): `ORCA_WIN_PUBLISHER_NAME`(`config/electron-builder.config.cjs:201`), `ORCA_DISABLE_PUBLISH_TARGET`(`:405-413`), 업스트림의 `ORCA_MAC_RELEASE`(`:16`), electron-builder 고유의 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`.

---

## 2. 탐색 순서 — 먼저 발견된 파일이 이긴다

순서는 빌드가 패키징됐는지에 따라 갈립니다 (`enterprise-policy-file.ts:59-83`).

**패키징 빌드 — 사용자 PC에 설치된 `.exe`. 플릿에서 유일하게 의미 있는 열입니다.**

| 순위 | 위치 | 비고 |
| --- | --- | --- |
| 1 | **머신 전역** — `%ProgramData%\Orca\enterprise-policy.json` | `ProgramData` 또는 `PROGRAMDATA` 환경변수 기준. 둘 다 없으면 후보 없음 (`enterprise-policy-file.ts:39-41`) |
| 2 | `ORCA_ENTERPRISE_POLICY`가 가리키는 경로 | 무력화 값(`off` 등)이면 후보에서 빠질 뿐, 위 1순위는 그대로 남습니다 |
| 3 | **사용자별** — `%APPDATA%\Orca\enterprise-policy.json` | `:76-78` |

**비패키징(`pnpm dev`·vitest)**

| 순위 | 위치 | 비고 |
| --- | --- | --- |
| 1 | `ORCA_ENTERPRISE_POLICY`가 가리키는 경로 | 이 값이 있으면 아래를 아예 보지 않음. 무력화 값이면 후보 없음(정책 미적용) |
| 2 | 머신 전역 (위와 동일) | |
| 3 | 사용자별 — `<userData>/enterprise-policy.json` | |

> **다른 OS 각주.** 이 배포는 Windows x64 전용이라 위 표는 Windows 경로만 싣지만 **코드는 세 OS를 그대로 지원합니다**: 머신 전역 경로가 macOS는 `/Library/Application Support/Orca/enterprise-policy.json`(`enterprise-policy-file.ts:43-44`), Linux는 `/etc/orca/enterprise-policy.json`(`:46`)이고, 3순위의 `<userData>`는 Electron 규약대로 Windows `%APPDATA%\Orca`, macOS `~/Library/Application Support/Orca`, Linux `~/.config/Orca`입니다. 배치 절차는 §6-2.

앱 이름은 `app.setName('Orca')`(`src/main/index.ts:1796` → `src/main/startup/dev-instance-identity.ts:57-58`). `pnpm dev`로 띄운 개발 인스턴스만 `Orca Dev`를 씁니다(`dev-instance-identity.ts:83`).

**먼저 발견된 파일이 그대로 끝입니다** (`enterprise-policy-file.ts:59-83`, `:119-152`). 병합하지 않습니다. 즉 **사용자별 파일로 머신 전역 정책을 완화할 수 없습니다** — 사용자가 자기 `%APPDATA%\Orca\enterprise-policy.json`에 `{"lockdown": false}`를 써도, `C:\ProgramData\Orca\enterprise-policy.json`이 존재하는 한 읽히지 않습니다.

> **이 순서가 재설계의 핵심입니다.** 예전 방식(`setx ORCA_ENTERPRISE_LOCKDOWN 1`)은 **HKCU에 쓰는 사용자별 상태**였습니다. 같은 PC의 다른 로그인 계정, 서비스 계정, 그리고 그 뒤에 새로 만들어진 프로파일은 전부 잠금이 걸리지 않았습니다. `%ProgramData%`에 놓인 파일 하나는 그 PC의 **모든 계정**에 동일하게 적용됩니다.

> 🔒 **환경변수는 패키징 빌드에서 머신 전역 정책을 못 이깁니다.** §1의 이유 그대로입니다 — Windows에서 표준 사용자가 자기 환경변수를 만드는 데는 권한이 필요 없으므로, 무조건 듣는 옵트아웃은 명령어 하나짜리 우회 통로가 됩니다. 그래서 패키징 빌드에서는 `ORCA_ENTERPRISE_POLICY`가 **1순위를 뺏지 못하고 2순위로 강등**되며 무력화 값은 통째로 무시됩니다 (`enterprise-policy-file.ts:68-82`).
>
> **배포상의 결론: 정책 파일은 위 표의 머신 전역 기본 경로에 두고, 사용자가 쓰지 못하도록 ACL을 거세요**(§6). 환경변수로 커스텀 경로를 지정하는 방식은 **개발·검증용이지 플릿용이 아닙니다** — 패키징 빌드에서는 어차피 2순위라 머신 전역 파일이 있으면 읽히지도 않습니다.

읽기는 프로세스당 1회이며 캐시됩니다(`enterprise-policy-file.ts:173`, `:180-199`). **파일을 바꿨으면 앱을 재시작해야 반영됩니다.** 앱은 이 파일에 절대 쓰지 않습니다(`readFileSync`만).

---

## 3. 스키마

JSONC입니다 — `//` 주석과 후행 쉼표를 허용합니다 (`enterprise-policy-file.ts:142-144`, `jsonc-parser`). 자동 탐색 경로에서의 파일명은 `enterprise-policy.json`으로 고정이고(`:24`), `ORCA_ENTERPRISE_POLICY`로 직접 지정할 때는 이름이 무엇이든 무관합니다.

| 키 | 타입 | 기본값 | 실제로 끄는 것 (게이트 위치) |
| --- | --- | --- | --- |
| `lockdown` | boolean | `false` | 마스터 스위치. 아래 7개 스위치의 **기본값**이 됩니다 (`src/shared/enterprise-policy.ts:52-60`, `:196-200`). 그 자체로 직접 끄는 기능은 없습니다 |
| `githubEnterpriseHost` | string | `GH_HOST` → 없으면 `null` | 해당 호스트를 GitHub로 인식시켜 **Gitea 오폴백**(`<host>/api/v1/...` 직접 fetch)을 막습니다 (`src/main/gitea/repository-ref.ts:91-99`). 허용목록에도 자동 추가 (`enterprise-policy.ts:204-207`) |
| `disableTelemetry` | boolean | `lockdown` | PostHog 레인 (`src/main/telemetry/consent.ts:88-90`) **및** 진단/크래시 번들 업로드 — 컨센트 계산은 `src/main/observability/index.ts:103, 120-134`이고 실제 거부는 메인의 IPC 게이트(`src/main/ipc/diagnostics.ts:221`(수집), `:253`·`:263`(업로드))와 크래시 피드백 첨부(`src/main/crash-reporting/crash-feedback-diagnostic-bundle.ts:33`)에서 일어납니다. 번들 목적지는 `https://www.onorca.dev/v1/feedback`, 폴백 `https://api.onorca.dev/v1/feedback` (`src/main/ipc/feedback.ts:10-11`). **로컬 NDJSON 로깅은 그대로 유지됩니다** (`observability/index.ts:129-133`) |
| `disableAutoUpdate` | boolean | `lockdown` | `runBackgroundUpdateCheck()` 초크포인트 (`src/main/updater.ts:1179`), 메뉴의 수동 체크 `checkForUpdatesFromMenu()` (`:1251`), `setupAutoUpdater()` (`:1458`). 세 번째가 핵심 — 넛지 스케줄러(`:1536-1537`)와 `powerMonitor`/포커스 리스너(`:1556-1557`)가 **아예 등록되지 않습니다** |
| `disableStarNag` | boolean | `lockdown` | `checkOrcaStarred()`는 "이미 star함"으로 응답(`src/main/github/client.ts:234-236`), `starOrca()`는 실패로 응답(`:401-403`). 도달 경로 4개를 모두 덮습니다 — `star-nag/service.ts:121`, `star-nag/agent-value-moment.ts:46`, `star-nag/direct-star-attempt.ts:9`, `ipc/github.ts:1174-1175`(랜딩/설정 화면) |
| `disableCloudRelay` | boolean | `lockdown` | `getOrcaCloudAuthConfig()`가 not-configured를 반환 (`src/main/orca-profiles/profile-cloud-auth-config.ts:73-78`). 결과로 Orca Cloud 로그인, **모바일 페어링 릴레이 미기동**(`src/main/index.ts:2427-2455`), `orcaProfiles:connectCurrent` / `createCloudLinked` / `selectOrg` 3개 IPC가 한 번에 `unconfigured` (`profile-cloud-service.ts:68, 152, 207`) |
| `disableUsagePolling` | boolean | `lockdown` | AI 벤더 사용량/rate-limit 폴링. 게이트 1곳(`src/main/rate-limits/service.ts:734-735`)을 진입점 전부에서 호출 — `start()`(`:310`), `fetchAll()`(`:895`), `fetchCodexOnly()`(`:960`), `fetchClaudeOnly()`(`:1022`), `fetchGrokOnly()`(`:1087`), 계정 스위처 프리뷰 2개(`fetchInactiveClaudeAccountsOnOpen` `:500`, `fetchInactiveCodexAccountsOnOpen` `:580`), Codex 리셋 크레딧 POST(`:426`, 에러 throw), 상태칩은 `unavailable`로 고정(`:1463`) |
| `disableManagedClaudeAccounts` | boolean | `lockdown` | 관리형 Claude 계정의 **런타임 효과 전체** — `platform.claude.com` 토큰 회전, 활성 계정 선택, 에이전트 환경변수 재작성. 설정 UI에서 계정을 추가·선택하는 것 자체는 막지 않습니다(`claudeAccounts:add`/`select` IPC에 게이트 없음). §3-1 참고 |
| `disableSpellcheck` | boolean | `lockdown` | Chromium 맞춤법 검사기. Electron 기본값이 on이라 Windows/Linux에서 Google CDN으로 hunspell 사전을 받습니다. 메인 윈도(`src/main/window/createMainWindow.ts:253`)와 `will-attach-webview` 게스트 하드닝(`:425`) 양쪽 |
| `enforceNetworkAllowlist` | boolean | **`false`** (lockdown을 상속하지 **않음**) | §5 참고. `src/shared/enterprise-policy.ts:212-214`에 이유가 주석으로 박혀 있습니다 |
| `allowedNetworkHosts` | string[] | `[]` (+ `githubEnterpriseHost` 자동 포함) | `enforceNetworkAllowlist: true`일 때만 의미가 있습니다 |
| `$schema` | string | — | 알려진 키라 경고가 나지 않습니다. 에디터 편의용 (`enterprise-policy.ts:65`) |

### 3-1. `disableManagedClaudeAccounts` — Bedrock 플릿에서는 필수입니다

Orca에는 Claude 계정을 앱이 직접 보관·전환하는 **관리형 계정 스위처**가 있습니다. 이 스위치는 그 기능의 런타임 동작을 끕니다. 계약은 `src/shared/enterprise-policy.ts:26-32`에 정의되어 있고, 나머지 `disable*`와 똑같이 `lockdown`을 상속합니다 (`:52-60`).

게이트는 프로덕션 코드에 **정확히 세 곳**입니다 — `oauth-refresh.ts:131`, `runtime-auth-service.ts:613`, `environment.ts:22`. 설정 UI와 `claudeAccounts:*` IPC에는 게이트가 없으므로 **계정을 추가·선택하는 화면 자체는 그대로 보입니다.** 끄는 것은 그 선택이 런타임에 만들어 내던 효과입니다.

끄는 대상은 두 가지이며, **Bedrock 배포에서는 각각 성격이 다릅니다.**

**1. `platform.claude.com`으로 나가는 OAuth 토큰 회전 → egress 문제**

`refreshClaudeOauthCredentials()`가 저장된 refresh_token으로 `https://platform.claude.com/v1/oauth/token`에 POST합니다 (`src/main/claude-accounts/oauth-refresh.ts:10`, `:125`, 실제 전송은 `:149`의 `net.fetch`). 게이트는 **그 함수 진입부**에 있어 호출자를 가리지 않습니다 — `disableManagedClaudeAccounts`면 소켓을 열기 전에 `null`을 반환합니다 (`:131-133`). `null`은 원래 "기존 자격증명 유지"라 예외가 나지 않습니다.

호출 지점은 두 곳이고 둘 다 이 게이트를 지납니다: 에이전트 스폰 직전의 런타임 인증 준비(`src/main/claude-accounts/runtime-auth-service.ts:1054`, `:1057`)와 사용량 페처(`src/main/rate-limits/claude-fetcher.ts:1204-1205` — 여기는 `disableUsagePolling`도 이미 덮습니다).

**2. 에이전트 PTY로 가는 환경변수 재작성 → 기능 장애 위험**

관리형 계정이 활성화되면 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`**, 그리고 인증처럼 보이는 `ANTHROPIC_CUSTOM_HEADERS`를 삭제합니다 (`src/main/claude-accounts/environment.ts:3-8`, `:22-29`). 게이트는 두 겹입니다.

- **원천** — 인증 준비 단계에서 활성 계정 자체를 `null`로 만들어 스트립을 요구하지 않게 합니다 (`src/main/claude-accounts/runtime-auth-service.ts:613-616`). 호스트 세션의 `stripAuthEnv`는 활성 계정 유무에서 유도되므로 자동으로 `false`가 됩니다 (`:667`).
- **최후 방어선** — `stripAuthEnv: true`를 하드코딩해 넘기는 호출자가 있어도 삭제를 건너뜁니다 (`environment.ts:22`). 적용부는 `src/main/rate-limits/claude-pty.ts:244-247`과 `src/main/text-generation/commit-message-agent-environment.ts:127-128`입니다.

특히 이 두 번째는 **WSL에서 더 셌습니다.** WSL 런타임을 고른 세션은 관리형 계정을 하나도 등록하지 않아도 스트립이 켜졌고(`runtime-auth-service.ts:647`, `:657` — 각각 WSL 홈을 찾은 경우와 못 찾은 경우), 그 상태에서 런치 환경에 위 변수 중 하나라도 있으면 PTY 스폰이 **에러로 하드 실패**했습니다 (`src/main/ipc/pty.ts:2955-2959`, `:4013-4017`).

```
This Claude launch defines explicit Anthropic auth environment variables. Remove those overrides before using a managed Claude account.
```

지금은 두 WSL 분기의 `stripAuthEnv`가 `!managedAccountsDisabled`이므로(`:647`, `:657`) 스위치가 켜져 있으면 하드 실패 조건 자체가 성립하지 않습니다. Windows 호스트 세션은 원래도 관리형 계정을 **선택한 동안에만** 스트립됐습니다 (`:667`).

**따라서 Bedrock 플릿에서 이 값은 사실상 필수입니다 — `true`(= `lockdown: true`면 자동).** 권장이 아니라 필수인 이유는 위 두 번째 항목입니다: 이 스위치가 없으면 WSL 런타임을 고른 세션은 관리형 계정을 하나도 등록하지 않아도 스트립이 켜지고, 런치 환경에 Bedrock 계열 변수가 하나라도 있으면 PTY 스폰이 하드 실패합니다. Bedrock 인증은 Claude Code CLI가 AWS 기본 자격증명 체인으로 처리하므로 관리형 계정은 필요가 없고, 켜 두면 egress 한 줄과 WSL 스폰 실패 한 줄을 동시에 없앱니다. 반대로 이 기능을 실제로 쓰는 배포라면 `"disableManagedClaudeAccounts": false`로 명시해 되살리세요.

> ⚠️ **이 스위치가 WSL 게스트에 AWS 설정을 넣어 주지는 않습니다.** 이 스위치가 없애는 것은 "지우는 동작"뿐입니다. `wsl.exe`는 `WSLENV`에 등록된 변수만 게스트로 넘기는데, Orca가 등록하는 것은 `ORCA_*`와 워크트리 경로 변수(`src/main/pty/wsl-orca-env.ts:58-76` → `:32-42`의 `CONDUCTOR_ROOT_PATH`/`GHOSTX_ROOT_PATH` 포함), 그리고 에이전트 홈 경로(`CODEX_HOME`·`CLAUDE_CONFIG_DIR` — `src/main/providers/local-pty-provider.ts:710`, `:731`)뿐입니다. **어느 등록 지점에도 `AWS_*`는 없습니다** (배경은 `src/main/rate-limits/claude-pty.ts:273-274` 주석). WSL 안에서 Bedrock을 쓰려면 게스트 배포판에 자체 자격증명·리전 설정이 따로 있어야 합니다.

### 값 해석 규칙

- **boolean 키**는 진짜 boolean 외에 문자열 `"true"/"yes"/"on"/"1"`, `"false"/"no"/"off"/"0"`도 받습니다 (`enterprise-policy.ts:73-74`, `:95-103`).
- **인식할 수 없는 값은 "부재"로 처리**되어 `lockdown`을 상속하고, stderr에 경고가 나갑니다 (`:104-105`). 절대 "off"로 읽지 않습니다 — 관리자의 오타가 조용히 잠금을 푸는 사고를 막기 위한 설계입니다 (`:80-82` 주석).
- **호스트 문자열**은 스킴·경로·자격증명·포트를 벗겨내고 소문자로 정규화됩니다 (`:110-123`). `https://github.samsungds.net/`, `git@github.samsungds.net:8443` 모두 `github.samsungds.net`이 됩니다.
- **모르는 키**는 무시되고 경고만 나갑니다 (`:190-194`). 오타난 키(`disableStarNagg`)는 곧 "그 스위치는 부재" = `lockdown` 상속입니다.
- **문법이 깨진 파일은 통째로 거부**합니다 (`enterprise-policy-file.ts:145-148`). 절반만 적용되는 상태는 만들지 않습니다 — 다만 그 결과가 "잠금 강화"가 아니라 **"정책 미적용"**이라는 점을 §7-4에서 반드시 확인하세요.

---

## 4. 예제

### 4-1. 이 배포에 그대로 쓸 수 있는 전체 예제

`github.samsungds.net` 사내 배포용. 일곱 개 스위치는 `lockdown: true`면 생략해도 같은 결과지만, **감사 담당자가 상속 규칙을 모르고 읽어도 되도록 전부 명시**했습니다.

```jsonc
{
  // Orca 사내 배포 정책 — 관리자 소유. 사용자가 수정할 수 없어야 합니다.
  // 배치 위치: %ProgramData%\Orca\  (다른 OS는 §2 각주)
  // 파일명: enterprise-policy.json  (변경 시 앱 재시작 필요)

  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",

  // lockdown에서 상속되는 값들 — 감사를 위해 명시
  "disableTelemetry": true,    // PostHog + 진단/크래시 번들 업로드 (로컬 로그는 유지)
  "disableAutoUpdate": true,   // 업데이트 피드 + onorca.dev 넛지 폴링 + 메뉴의 수동 체크
  "disableStarNag": true,      // github.com SaaS로 나가는 star 조회/쓰기
  "disableCloudRelay": true,   // Orca Cloud 로그인 + 모바일 페어링 릴레이
  "disableUsagePolling": true, // AI 벤더 사용량/rate-limit 폴링
  "disableManagedClaudeAccounts": true, // platform.claude.com OAuth 회전 + Bedrock 자격증명 스트립 (§3-1)
  "disableSpellcheck": true,   // Chromium 사전 CDN 다운로드

  // 하드 허용목록은 옵트인입니다. 켜기 전에 반드시 §5를 읽으세요.
  "enforceNetworkAllowlist": false,
  "allowedNetworkHosts": []
}
```

### 4-2. 최소 예제

```jsonc
{ "lockdown": true }
```

일곱 개 스위치가 전부 켜집니다. `githubEnterpriseHost`가 없으므로 GHES 호스트는 `gh`의 `GH_HOST`에서 폴백을 시도하고, 그것도 없으면 Gitea 오폴백 방지가 동작하지 않습니다 — 사내 GHES를 쓴다면 §4-1처럼 반드시 명시하세요.

### 4-3. 잠그되 업데이트만 예외로 허용

명시적 `false`가 상속을 이깁니다 (`enterprise-policy.ts:199`).

```jsonc
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",
  // 나머지 여섯 개는 lockdown을 상속해 계속 꺼짐
  "disableAutoUpdate": false
}
```

⚠️ 이 예외의 실제 의미를 알고 켜세요. 업데이트 피드는 `config/electron-builder.config.cjs:405-413`에 **`provider: 'github', owner: 'stablyai', repo: 'orca'`**로 고정입니다. 즉 다시 켠다는 건 사내 미러가 아니라 **벤더 저장소(github.com)와 `onorca.dev` 넛지 폴링(30분 주기 — `src/main/updater.ts:63`, 스케줄러 `:1397-1405`)으로 트래픽이 되살아난다**는 뜻입니다. 게다가 사내 빌드를 `ORCA_DISABLE_PUBLISH_TARGET=1`로 만들었다면 업데이터 메타데이터(`app-update.yml`) 자체가 없어, 다시 켜도 얻는 것은 실패한 조회뿐입니다.

---

## 5. `enforceNetworkAllowlist` — 옵트인 하드 허용목록

**`lockdown: true`여도 자동으로 켜지지 않습니다.** 잘못된 허용목록은 다른 스위치들이 만들 수 없는 방식으로 배포를 망가뜨릴 수 있어서, 관리자가 명시적으로 켜도록 되어 있습니다 (`src/shared/enterprise-policy.ts:212-214`, `src/main/enterprise/enterprise-network-guard.ts:15-16`).

### 무엇을 덮는가

| 레인 | 구현 | 차단 방식 |
| --- | --- | --- |
| 렌더러/세션 요청 | `session.defaultSession.webRequest.onBeforeRequest` (`enterprise-network-guard.ts:87-97`) | `callback({ cancel: true })` — 조용히 취소 |
| 메인 프로세스 global `fetch` | 전역 `fetch` 래퍼 (`:99-122`) | Promise reject + 에러 메시지 |

설치 시점은 `src/main/index.ts:1857`(프록시 설정 적용 직후, `:1853`). 그 이전에 발생한 요청은 덮지 않습니다.

### 무엇을 덮지 않는가 (중요)

- **서브프로세스 트래픽 전부가 이 밖에 있습니다** — `gh`, `glab`, `git`, 에이전트 CLI(claude/codex/…), SSH 릴레이, agent-browser 헬퍼. 이들은 Electron 세션도, 메인 프로세스의 `fetch`도 쓰지 않습니다. 이 스위치는 **"Orca 자체 트래픽 통제"**이지 사내망 통제가 아닙니다. 망 차원 통제는 방화벽/프록시로 별도 수행해야 합니다.
- **임베디드 브라우저**는 설계상 예외입니다. `persist:` 파티션에서 돌고 그 자리의 `onBeforeRequest` 슬롯은 인증서 게이트가 이미 소유하고 있어, 여기에 두 번째 리스너를 걸면 그 게이트를 조용히 대체하게 됩니다 (`enterprise-network-guard.ts:9-13`).
- 루프백(`localhost`, `*.localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`)은 항상 통과 (`:47-55`). `http`/`https`가 아닌 스킴과 파싱 불가 URL도 통과 (`:58-71`).

### 매칭 규칙

`allowed.has(host)` — **정확한 호스트 문자열 일치입니다** (`:74-77`). 와일드카드도, 서브도메인 자동 포함도 없습니다. `example.com`을 올려도 `www.example.com`은 차단됩니다. 포트는 정규화 단계에서 제거되므로 매칭에 쓰이지 않습니다 (`enterprise-policy.ts:121`). `githubEnterpriseHost`는 자동으로 목록에 들어갑니다 (`:204-207`).

### 아바타·에셋 호스트를 빠뜨리고 켜면 깨지는 것

- **저장소/에이전트 카탈로그 파비콘**: `www.google.com` (`src/renderer/src/lib/agent-catalog.tsx:370`, `src/renderer/src/lib/open-in-app-catalog.tsx:66`) → 아이콘이 전부 깨집니다.
- **PR/이슈 아바타**: 이미지 URL은 provider 응답에서 옵니다. GHES 배포라면 아바타도 GHES 호스트라 자동 허용되지만, github.com 리모트가 섞여 있으면 `avatars.githubusercontent.com`이 필요합니다.
- **티켓(Linear/Jira) 인라인 첨부**: signed URL의 호스트를 올리지 않으면 이미지가 뜨지 않습니다.

렌더러 요청은 **조용히 취소**되므로 증상이 "아이콘/이미지만 안 뜸"으로 나타나고, 메인 프로세스 `fetch`는 다음 메시지로 실패합니다.

```
Enterprise network allowlist blocked a request to <host>. Add it to "allowedNetworkHosts" in the Orca enterprise policy file.
```

두 레인 모두 stderr에 **호스트당 한 줄씩** 기록합니다(요청마다가 아님, 최대 256개 — `:30, :36-45`).

```
[enterprise-network] blocked renderer request to <host>: not in allowedNetworkHosts
[enterprise-network] blocked main-process fetch to <host>: not in allowedNetworkHosts
```

### 권장 롤아웃

스위치가 `false`인 동안에는 가드 자체가 설치되지 않아 **차단 로그도 남지 않습니다**(`:128-132`). 따라서 "먼저 로그만 모으기"는 불가능합니다. 파일럿 PC 몇 대에 `true` + 최소 목록으로 켜고 §7-3의 리디렉션 방법으로 stderr를 파일로 받아 필요한 호스트를 모은 뒤, 확정된 목록으로 플릿에 배포하세요.

> ⚠️ 위 `[enterprise-network]` 두 줄은 **정책 로더의 경고와 달리 트레이스 파일에 남지 않습니다.** 가드는 `process.stderr.write`를 직접 호출할 뿐(`:42-44`) §7-2의 `enterprise.policy` 스팬 버퍼를 거치지 않습니다. `main.trace.ndjson`을 뒤져도 나오지 않으니, 허용목록 튜닝만큼은 §7-3의 리디렉션이 유일한 수집 경로입니다.

---

## 6. 플릿 배포

**이제 배포 대상은 파일 하나입니다.** 환경변수 열 몇 개를 계정마다 심고 검증하는 것보다 배포도, 감사도(해시 비교 한 번) 훨씬 단순합니다.

### 6-1. Windows

배치 경로: `C:\ProgramData\Orca\enterprise-policy.json`

**GPO — 파일 기본 설정(권장)**
`컴퓨터 구성 → 기본 설정 → Windows 설정 → 파일` 에 항목 추가:
- 작업: `바꾸기`(Replace) — 내용이 바뀌면 매번 덮어씀
- 원본: `\\<파일서버>\netlogon\orca\enterprise-policy.json`
- 대상: `%ProgramData%\Orca\enterprise-policy.json`

**GPO — 컴퓨터 시작 스크립트**
`컴퓨터 구성 → 정책 → Windows 설정 → 스크립트 → 시작`. SYSTEM 권한으로 실행되므로 `%ProgramData%`에 쓸 수 있습니다.

> ⚠️ **사용자 로그온 스크립트는 쓰지 마세요.** 로그온 스크립트는 사용자 권한으로 돌아서, 아래 ACL을 적용한 뒤에는 `%ProgramData%\Orca`에 쓰지 못합니다. 그리고 사용자 권한으로 쓸 수 있는 정책 파일은 애초에 정책이 아닙니다.

**Intune**
- `장치 → 스크립트 및 재구성 → 플랫폼 스크립트`에 PowerShell 등록. **"로그온한 자격 증명을 사용하여 이 스크립트 실행 = 아니요"**(시스템 컨텍스트), 64비트 PowerShell 사용.
- 또는 Win32 앱(`.intunewin`)으로 패키징해 **시스템 설치 컨텍스트**로 배포. 검색 규칙을 `파일 존재 + 해시`로 잡으면 준수 여부가 Intune 콘솔에서 그대로 보입니다.

**배치 + 권한 (locale 무관하도록 SID 사용)**

```powershell
$dir = "$env:ProgramData\Orca"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item ".\enterprise-policy.json" "$dir\enterprise-policy.json" -Force

# 소유자를 Administrators로 되돌린 뒤(아래 주의) 상속 제거:
# SYSTEM/Administrators = 전체, Users = 읽기+실행만
icacls $dir /setowner "*S-1-5-32-544" /T /C
icacls $dir /inheritance:r `
  /grant "*S-1-5-18:(OI)(CI)F" `
  /grant "*S-1-5-32-544:(OI)(CI)F" `
  /grant "*S-1-5-32-545:(OI)(CI)RX"
```

`*S-1-5-18`=SYSTEM, `*S-1-5-32-544`=Administrators, `*S-1-5-32-545`=Users. 한국어 Windows의 현지화된 그룹명 문제를 피하려고 SID로 씁니다.

> ⚠️ **`/setowner`를 빼지 마세요.** `%ProgramData%` 루트는 표준 사용자도 새 폴더를 만들 수 있어, 배포 스크립트가 아직 돌지 않은 머신에서는 사용자가 `Orca` 폴더를 **먼저 만들어 자기가 소유자**가 될 수 있습니다. `/inheritance:r`은 상속된 ACE만 걷어내고 소유권은 건드리지 않는데, 소유자는 언제든 ACL을 되돌릴 수 있습니다. *(Windows ACL 동작이며 이 저장소 코드의 사실은 아닙니다.)*

### 6-2. macOS / Linux (이 배포 대상 아님 — 코드가 지원하므로 참고용으로만 남깁니다)

**macOS** 배치 경로: `/Library/Application Support/Orca/enterprise-policy.json`

```bash
sudo /usr/bin/install -d -o root -g wheel -m 755 "/Library/Application Support/Orca"
sudo /usr/bin/install -o root -g wheel -m 644 enterprise-policy.json \
  "/Library/Application Support/Orca/enterprise-policy.json"
```

MDM으로는 **구성 프로파일로 임의 파일을 놓을 수 없습니다.** 서명된 `.pkg`(payload로 파일 포함) 또는 Jamf/Kandji의 스크립트 정책을 쓰세요. `~/Library/...`가 아니라 최상위 `/Library/...`인 점에 주의하세요 — 사용자 홈의 같은 이름 경로는 탐색 대상이 아닙니다.

**Linux** 배치 경로: `/etc/orca/enterprise-policy.json`

```bash
sudo install -d -o root -g root -m 755 /etc/orca
sudo install -o root -g root -m 644 enterprise-policy.json /etc/orca/enterprise-policy.json
```

Ansible/Puppet/Salt의 file 리소스로 관리하거나, 사내 `.deb`/`.rpm`에 포함해 패키지 업데이트로 배포하는 편이 감사에 유리합니다.

### 6-3. 권한 요약

| OS | 디렉터리 | 파일 | 소유자 |
| --- | --- | --- | --- |
| **Windows** (배포 대상) | 상속 제거 + Users는 `RX` | 동일(상속) | SYSTEM / Administrators |
| macOS (참고) | `755` | `644` | `root:wheel` |
| Linux (참고) | `755` | `644` | `root:root` |

핵심은 **사용자가 쓸 수 없어야 한다**는 것입니다. 사용자가 수정할 수 있으면 정책이 아니라 기본값에 불과합니다. 앱은 이 파일을 읽기만 하므로 쓰기 권한을 줄 이유가 없습니다.

---

## 7. 검증과 문제 해결

### 7-1. 앱 동작으로 확인하기 (빠른 점검)

패키징된 앱의 stderr는 보기 어렵습니다(§7-3). 아래는 대체로 UI/동작만으로 확인하는 방법입니다 — 스위치가 실제로 어떤 값으로 해석됐는지 확정하는 것은 §7-2의 `enterprise.policy` 스팬이고, 이 표는 그 전의 빠른 점검용입니다.

| 확인 대상 | 방법 | 기대 결과 |
| --- | --- | --- |
| `disableCloudRelay` | 설정에서 Orca Cloud 프로필 연결 시도 | 토스트 `Orca Cloud sign-in is not configured` + 설명 **`Orca Cloud sign-in is disabled by an enterprise policy.`** (`profile-cloud-auth-config.ts:76` → `src/renderer/src/store/slices/orca-profiles-auth-actions.ts:89-98`) |
| `disableAutoUpdate` | 메뉴의 `Check for Updates` | 조회 없이 즉시 "최신"으로 종료 (`updater.ts:1251-1254`) + 로그에 브레드크럼(§7-2) |
| `disableTelemetry` | 설정 → Privacy | 진단 비활성 안내 박스 표시 (`src/renderer/src/components/settings/PrivacyDiagnosticsSection.tsx:240-241`) |
| `disableUsagePolling` | 상태바 사용량 칩 | 영구 스피너 없이 `unavailable` 상태 (`rate-limits/service.ts:1461-1463`) |
| `disableSpellcheck` | 입력창에 오타 입력 | 빨간 물결 밑줄이 생기지 않음 (`createMainWindow.ts:253`) |
| `disableStarNag` | 앱을 한동안 사용 | star 요청 카드/토스트가 뜨지 않음 (`github/client.ts:234-236`) |
| `disableManagedClaudeAccounts` | WSL 런타임으로 Claude 세션 스폰 | **UI로는 확인할 수 없습니다** — 계정 스위처 화면은 그대로 뜹니다. 관측 가능한 신호는 WSL Claude 세션이 `AWS_BEARER_TOKEN_BEDROCK` 등을 이유로 스폰 실패하던 증상이 사라지는 것(`ipc/pty.ts:2955-2959`, `:4013-4017`)과, §7-2의 `enterprise.policy` 스팬에 찍힌 스위치 값입니다 |
| `githubEnterpriseHost` | GHES 리모트 저장소에서 PR 목록 열기 | 정상 조회. `<host>/api/v1/...`(Gitea API)로 나가는 요청이 없어야 함 (`gitea/repository-ref.ts:91-99`) |

> Privacy 안내 박스는 정책 파일이 사유일 때 **`An enterprise policy file disables diagnostics on this machine.`** 를 표시합니다. 사유 코드 `enterprise_policy`(`observability/index.ts:128`)에 대응하는 전용 분기가 `PrivacyDiagnosticsSection.tsx:306-310`에 있습니다. 이 문구가 보이면 정책 파일이 적용된 것입니다 — 환경변수를 찾아볼 필요가 없습니다.

### 7-2. 로컬 로그로 확인하기

`disableTelemetry`가 켜져도 **로컬 NDJSON 로깅은 유지**되므로(`observability/index.ts:120-133`) 잠금 상태에서도 이 확인은 동작합니다. 단 §1의 `ORCA_DIAGNOSTICS_DISABLED`를 배포에 심으면 로컬 파일 기록까지 꺼져(`:113-119`) **이 절의 확인 수단이 통째로 사라집니다** — 그 변수는 이 검증과 양립하지 않습니다.

- 파일: `%APPDATA%\Orca\logs\main.trace.ndjson` — 즉 `<userData>/logs/main.trace.ndjson` (`src/main/observability/logs-directory.ts:27-29`, `:32-34`). macOS는 `~/Library/Application Support/Orca/logs/`, Linux는 `~/.config/Orca/logs/` 아래 같은 파일명입니다.
- **정책 해석 결과 자체가 이 파일에 스팬 하나로 남습니다.** 스팬 이름은 `enterprise.policy`이고, `initObservability()` 직후에 딱 한 번 기록됩니다 (`src/main/enterprise/enterprise-policy-trace.ts:33`, 호출부 `src/main/index.ts:1895`). 속성에 실제로 적용된 파일 경로(`enterprise.policy.source_path` — 못 찾았으면 `(none found)`, `enterprise-policy-trace.ts:18`), 탐색한 후보 목록(`…searched_paths`), `…lockdown`, 7개 스위치(`…switches`), `…github_enterprise_host`, `…enforce_network_allowlist`, `…allowed_network_hosts`, 그리고 §7-3의 경고 원문 전부(`…warnings`)가 들어갑니다 (`:36-45`).
- `disableAutoUpdate`가 적용되면 `updater_auto_update_disabled_by_policy` 브레드크럼도 이 파일에 남습니다 (`updater.ts:1459-1463` → `src/main/updater-lifecycle-diagnostics.ts:4-14` → `src/main/crash-reporting/durable-crash-breadcrumb.ts:10-39`).

```powershell
# 어떤 정책 파일이 적용됐고 어떤 스위치가 켜졌는지 — 플릿 검증의 1차 수단
Select-String -Path "$env:APPDATA\Orca\logs\main.trace.ndjson" -Pattern "enterprise.policy"

Select-String -Path "$env:APPDATA\Orca\logs\main.trace.ndjson" -Pattern "auto_update_disabled_by_policy"
```

### 7-3. stderr 메시지 원문

정책 로더의 모든 출력은 `process.stderr`에 `[enterprise-policy] ` 접두사로, 한 줄씩 나갑니다 (`enterprise-policy-file.ts:98-103`). 같은 메시지가 최대 32개까지 버퍼링되어(`:89`, `:100-102`) §7-2의 `enterprise.policy` 스팬 `…warnings` 속성으로도 나가므로, **아래 표는 "무슨 메시지가 있는가"의 목록이고 실제로 읽는 곳은 트레이스 파일입니다.**

| 상황 | 정확한 출력 | 구현 |
| --- | --- | --- |
| 파일을 열 수 없음 (ENOENT 제외 — 권한/마운트 등) | `[enterprise-policy] could not read <경로>: <에러 문자열>` | `:134` |
| 파일 문법 오류 | `[enterprise-policy] <경로> is not valid JSON; ignoring it.` | `:145-148` |
| 최상위가 객체가 아님 | `[enterprise-policy] <경로>: Policy file must contain a JSON object; ignoring its contents.` | `enterprise-policy.ts:187` |
| 모르는 키 | `[enterprise-policy] <경로>: Unknown policy key "<키>" ignored.` | `:192` |
| boolean 자리에 이상한 값 | `[enterprise-policy] <경로>: "<키>" must be true or false; ignoring <값>.` | `:104` |
| 호스트 자리에 문자열이 아닌 값 | `[enterprise-policy] <경로>: "<키>" must be a string hostname; ignoring <값>.` | `:135` |
| 호스트가 빈 문자열 | `[enterprise-policy] <경로>: "<키>" is blank; ignoring it.` | `:141` |
| `allowedNetworkHosts`가 배열이 아님 | `[enterprise-policy] <경로>: "<키>" must be an array of hostnames; ignoring <값>.` | `:155` |
| 배열 원소가 호스트가 아님 | `[enterprise-policy] <경로>: "<키>" entry <값> is not a hostname; ignoring it.` | `:164` |

파일을 아예 못 찾은 경우 경로 자리에는 `(no file)`이 들어갑니다 (`enterprise-policy-file.ts:195`).

**Windows에서 이 메시지를 stderr로 직접 보는 방법 — 솔직하게 말하면 어렵습니다.** 패키징된 Orca는 GUI 서브시스템 앱이라 콘솔이 붙지 않고, 시작 메뉴로 띄운 프로세스는 fd 2에 내용 없는 스텁을 받아 이 줄들이 통째로 사라집니다 (`enterprise-policy-file.ts:94-97` 주석). **바로 그래서 §7-2의 스팬이 있습니다 — 정상적인 확인 경로는 그쪽입니다.** stderr를 굳이 원본 그대로 봐야 한다면 **cmd에서 파일로 리디렉션**해 띄우는 방법뿐입니다(자식 프로세스가 리디렉션된 핸들을 상속합니다).

```bat
"%LOCALAPPDATA%\Programs\<설치폴더>\Orca.exe" > "%TEMP%\orca-stderr.log" 2>&1
```

실행 파일 이름은 `Orca.exe`이고(`config/electron-builder.config.cjs:195`), `nsis` 블록에 `oneClick`/`perMachine`/`installDirectory`를 지정하지 않아(`:226-235`) electron-builder 기본값인 per-user 원클릭 설치가 적용되므로 설치 위치는 `%LOCALAPPDATA%\Programs\` 하위입니다 — 정확한 폴더명은 바탕화면 바로가기 속성에서 확인하세요([Windows 사내 빌드 가이드](./windows-corporate-build.md) 참고). 앱을 종료한 뒤 `%TEMP%\orca-stderr.log`를 확인하세요. 이 방식은 진단용 1회성이며, 플릿 검증에는 부적합합니다. **플릿 검증의 실질적 수단은 §7-2의 `enterprise.policy` 스팬과 §7-1의 동작 확인**이고, 배포 검증은 §6의 파일 해시 비교(Intune 검색 규칙 등)로 하는 것이 맞습니다.

### 7-4. 자주 밟는 함정

| 증상 | 원인 | 대처 |
| --- | --- | --- |
| 아무 잠금도 안 걸림, 경고도 없음 | 경로 오타/파일 없음. **ENOENT는 경고를 내지 않습니다** (`enterprise-policy-file.ts:130-136`) — 비기업 설치의 정상 경로이기 때문 | §7-2 스팬의 `…source_path`가 `(none found)`인지, `…searched_paths`에 어떤 경로를 뒤졌는지 확인. 그다음 경로를 문자 그대로 대조 (`%ProgramData%`는 보통 `C:\ProgramData`) |
| **머신 전역 파일이 있는데 플릿 전체가 풀림** | 그 파일의 JSON 문법 오류. 파싱 실패 시 `readPolicyDocument`가 즉시 `null`을 반환하고 **사용자별 후보로 폴백하지도 않습니다** (`:145-148`) → 정책 전체 미적용 | 배포 전 문법 검증을 파이프라인에 넣으세요. 쉼표 하나가 플릿 전체를 풉니다. 검증 도구는 **JSONC를 이해하는 것**을 쓰세요 — 엄격한 JSON 파서는 주석과 후행 쉼표를 오류로 잡지만 앱은 둘 다 허용합니다 |
| 특정 스위치만 안 먹음 | 키 오타 또는 값 오타. 둘 다 "부재"로 처리되어 `lockdown`을 상속 (`enterprise-policy.ts:104`, `:192`) | §7-2 스팬의 `…warnings`에서 경고 확인(원문은 §7-3). `lockdown: true`면 상속 덕에 결과적으로는 켜져 있습니다 |
| `enforceNetworkAllowlist: true`인데 안 막힘 | 루프백/비 http(s) 요청이거나, 서브프로세스 트래픽이거나, 임베디드 브라우저 | §5의 범위 표 확인 |
| 파일을 고쳤는데 그대로임 | 프로세스당 1회 읽고 캐시 (`enterprise-policy-file.ts:180-199`) | 앱 재시작 |
| 사용자가 자기 파일로 풀어버림? | 불가능. 머신 전역이 먼저 발견되면 사용자 파일은 읽히지 않음 (`:59-83`) | — |
| **사용자가 `setx ORCA_ENTERPRISE_POLICY off`로 풀어버림?** | 패키징 빌드에서는 불가능. 환경변수는 후보를 추가만 하고 머신 전역 파일은 항상 먼저 탐색됩니다 (`:68-82`, `:163-171`) | 단, **`pnpm dev`로 띄운 비패키징 인스턴스에는 그대로 듣습니다.** 사용자 PC에 개발 체크아웃을 두지 마세요 |
| 개발 인스턴스로 커스텀 경로를 지정했는데 무시됨 | 패키징 빌드로 시험했기 때문. 머신 전역 파일이 있으면 환경변수 경로는 2순위라 읽히지 않습니다 (§2) | 커스텀 경로는 비패키징에서만 1순위입니다. 플릿에서는 머신 전역 기본 경로를 쓰세요 |
| 테스트/CI에서 정책이 안 먹음 | 의도된 동작. `config/vitest-enterprise-policy-isolation.ts:6`이 `ORCA_ENTERPRISE_POLICY=off` 설정. 테스트 러너는 비패키징이라 이 값이 유효합니다 | — |

---

## 8. 정책 파일이 덮지 않는 것

과신하지 마세요. 아래는 §3의 **기능 스위치로는 막히지 않습니다**. 일부는 옵트인 `enforceNetworkAllowlist`(§5)로만 막히고, 나머지는 정책 파일의 사정 범위 밖입니다.

- **서브프로세스 트래픽 전부** — `gh`, `glab`, `git`, 에이전트 CLI, SSH 릴레이. 정책은 Orca 프로세스 안에서만 동작하므로 허용목록으로도 막히지 않습니다. 이들은 프록시(`HTTPS_PROXY`/`NO_PROXY`)·사내 CA(`NODE_EXTRA_CA_CERTS`)·방화벽으로 다뤄야 합니다.
- **Claude Code CLI 자체의 Bedrock 트래픽** — Orca가 스폰한 CLI가 `bedrock-runtime.<region>.amazonaws.com`으로 나가는 것은 서브프로세스 트래픽이며 정책 파일 밖입니다. 이것은 의도된 정상 경로입니다.
- **받아쓰기(STT) → `api.openai.com`** (엔드포인트 `src/main/speech/openai-transcription-client.ts:8`, 전송은 `:118`) — 전용 스위치가 없습니다. 메인 프로세스의 global `fetch`라서 `enforceNetworkAllowlist`를 켜면 그 레인에서는 막히지만, 기본 상태가 3중 옵트인(`voice.enabled: false` + 모델 미선택 + API 키 미설정)이라 켜지 않는 편이 확실합니다([외부 연동 감사](./external-integrations-audit.md) §4).
- **렌더러의 외부 이미지** — 파비콘(`www.google.com`), 아바타, 티켓 첨부. `enforceNetworkAllowlist`를 켜야만 차단됩니다(§5).
- **임베디드 브라우저** — 설계상 허용목록 예외 (`enterprise-network-guard.ts:9-13`).
- **앱 설정(사용자 설정)** — 사이드바 카드의 PR/CI 백그라운드 갱신처럼 사용자 설정으로 켜지는 조회는 정책 파일이 강제하지 않습니다([외부 연동 감사](./external-integrations-audit.md) §1, §7 레벨 1).
- **빌드 시점 phone-home** — `ORCA_DISABLE_PUBLISH_TARGET=1`은 빌드 셸의 문제이며 정책 파일과 무관합니다 (`config/electron-builder.config.cjs:405-413`).

> **정정 — `platform.claude.com` OAuth 토큰 회전은 이제 이 목록에 없습니다.** 예전 판은 "전용 스위치가 없고, 관리형 Claude 계정을 안 쓰면 발생하지 않으니 코드로 막지 않았다"고 적었습니다. `disableManagedClaudeAccounts`(§3-1)가 그 구멍을 닫았습니다 — 회전(`src/main/claude-accounts/oauth-refresh.ts:131-133`에서 조기 차단)과, 관리형 계정이 Bedrock 자격증명을 PTY로 가는 길에 지우는 동작(`src/main/claude-accounts/environment.ts:22`, `src/main/claude-accounts/runtime-auth-service.ts:613-616`)이 같은 스위치로 함께 꺼집니다. `lockdown: true`면 자동입니다.

> 반대로 **오해하지 말 것**: Gemini/MiniMax/OpenCode/Kimi 사용량 조회는 "기본 옵트인"이지만 **`disableUsagePolling`이 확실히 덮습니다.** 이들의 fetcher는 `runFetchAllCycle`(`src/main/rate-limits/service.ts:1480`) 안의 한 곳(`:1579-1592`)에서만 호출되고, 그 사이클로 들어가는 경로(`:913`, `:985`, `:1050`, `:1112`)가 전부 §3의 게이트를 지납니다.

전체 외부 연동 목록, 각 항목의 발동 조건과 전송 내용, 그리고 여기서 다루지 않은 잔여 리스크는 [외부 연동 감사](./external-integrations-audit.md)에 있습니다.
