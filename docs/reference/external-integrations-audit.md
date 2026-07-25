# 외부 연동 감사 및 차단 계획 (사내 배포용)

기준: **v1.4.153** (브랜치 `enterprise/samsungds`).
목적: 사내(폐쇄망/보안) 환경에서 Orca를 배포할 때, 외부 인터넷으로 나가는 기능을 파악하고 필요 시 차단한다.

> **조사 방식**: 10개 카테고리를 병렬로 정적 분석(스윕) → 누락 항목 크리틱 → 항목별 적대적 검증(“실제로 소켓을 여는가 / 언제 발동하는가 / 끌 수 있는가”). 후보 103건 중 44건이 실제 외부 호출로 확정됐습니다.
>
> **⚠️ 표시는 미검증이거나 운영상 주의가 필요한 항목**입니다. 이 중 **코드로 확인하지 못한 것은 두 건뿐**입니다(§7 레벨 3의 `net.fetch` 경유 여부, §8의 DoH/컴포넌트 업데이터 실측). 나머지 ⚠️는 코드는 확인했으나 배포 시 조작이 필요한 항목입니다. 모든 `파일:라인` 인용은 해당 파일을 열어 확인했습니다. 이전 판에 있던 존재하지 않는 환경변수(`ORCA_DISABLE_UPDATES`)와 자기모순 서술은 제거했습니다.

---

## 0. 한눈에 보기 — 사내 배포 시 판단

| 분류 | 기본 상태 | 이 브랜치의 잠금 | 잔여 위험 |
| --- | --- | --- | --- |
| **프록시 / 사설 CA** | Orca가 지원 (Electron 세션 한정) | — | 🔴 Node `fetch`/`node:https` 경로는 프록시를 안 탐 (§5) |
| **텔레메트리 / 진단 / 크래시** | opt-in(기본 꺼짐) + 공식 빌드에서만 전송 | ✅ `disableTelemetry` | 없음 (로컬 NDJSON 로깅은 유지, 망 밖으로 안 나감) |
| **자동 업데이트 / 넛지 (onorca.dev, github.com)** | 로그인 무관하게 나감 | ✅ `disableAutoUpdate` | 없음 (3개 진입점 전부 차단, §3) |
| **star-nag (github.com SaaS 고정)** | 랜딩·설정 화면 진입, 에이전트 완료, 온보딩 완료, 스폰 임계치에서 발동 | ✅ `disableStarNag` | 없음 (`gh` 호출 함수 자체에서 차단, §1) |
| **Orca Cloud 로그인 / 모바일 페어링 릴레이** | 로그인 안 하면 안 나감 | ✅ `disableCloudRelay` | 없음 |
| **AI 벤더 사용량 폴링 (Claude/Codex/Grok/…)** | 🔴 **Orca 계정 연동과 무관 — 로컬 벤더 CLI 자격증명만 있으면 15분마다 폴링** | ✅ `disableUsagePolling` | 없음 (§4) |
| **Claude OAuth 토큰 회전 (platform.claude.com)** | Orca 관리 Claude 계정을 쓸 때만 | ✅ `disableManagedClaudeAccounts` | 없음 (§4) |
| **git 호스팅 (GitHub/GitLab/…)** | 사용자 열람 + 일부 자동 폴링 | ➖ `githubEnterpriseHost`는 **Gitea 오폴백만 차단**(호스트 전환도, 트래픽 차단도 아님) | `gh` 목적지는 여전히 `GH_HOST`/origin 리모트가 결정 (§1, §7 레벨 2) |
| **맞춤법 사전 다운로드 (Chromium)** | Windows/Linux에서 자동 | ✅ `disableSpellcheck` | 없음 (§8) |
| **렌더러 외부 이미지 (Google favicon / 아바타 / 마크다운 인라인)** | 아이콘·본문 표시 시 자동 | ➖ `enforceNetworkAllowlist` opt-in 시에만 | 기본값은 차단 안 됨 (§6) |
| **서브프로세스 (gh/glab/git/에이전트 CLI)** | 사용자 조작 | ❌ Orca 측 통제 수단 없음 | 🔴 프록시·방화벽으로만 통제 (§0.2) |
| **에셋 다운로드 (scrcpy, STT 모델)** | 사용자가 해당 기능을 켤 때만 | ❌ 코드 차단 없음 | 기능 미사용 시 미발생 (§0.2) |

**결론**: 이 브랜치의 정책 파일은 **벤더 SaaS로 나가는 Orca 자체 호출**(텔레메트리·업데이트·넛지·star-nag·클라우드·사용량 폴링·관리형 Claude 계정 OAuth 회전)을 코드 차원에서 차단합니다. 다만 **차단 범위는 Orca 프로세스가 직접 여는 소켓까지**입니다. 서브프로세스(`gh`/`glab`/`git`/에이전트 CLI), 렌더러 외부 이미지(기본값), SSH 릴레이의 원격 `npm install`, 그리고 `node:https`를 쓰는 다운로더는 정책 파일로 막히지 않습니다 — 이들은 §0.2의 잔여 위험 목록으로 관리하고 망 계층(프록시·방화벽)에서 통제해야 합니다.

### 0.1 ✅ 관리자 정책 파일 (`enterprise-policy.json`)

이 브랜치는 잠금 설정을 **환경변수가 아니라 관리자 소유 JSON 파일**로 관리합니다. 이유는 코드 주석에 그대로 있습니다 (`src/shared/enterprise-policy.ts:4-8`): Orca가 `env`에서 읽는 값은 **Orca가 스폰하는 모든 프로세스(에이전트 CLI, `gh`, `git`, 릴레이)에 그대로 상속**되고, 같은 머신의 무관한 도구까지 오염시킵니다. 실제로 agent-browser 서브프로세스는 `process.env` 전체를 상속합니다(`src/main/browser/agent-browser-bridge.ts:2670-2672`). 그래서 런타임 환경변수는 **딱 하나**만 둡니다.

#### 런타임 환경변수 (이 포크가 추가하는 것: 1개)

| 환경변수 | 값 | 패키징 빌드(배포된 `.exe`) | 비패키징(`pnpm dev`·vitest) |
| --- | --- | --- | --- |
| `ORCA_ENTERPRISE_POLICY` | 정책 파일 경로 (그대로 `readFileSync`에 넘어가므로 **절대경로 권장**) | 후보 목록에 **추가**만 됨 — 머신 전역 파일 **뒤** 순위 (`enterprise-policy-file.ts:79-82`) | 이 값이 있으면 아래 2·3번은 아예 후보에 오르지 않습니다 (`:68-74`) |
| `ORCA_ENTERPRISE_POLICY` | `off` / `none` / `disabled` / `false` / `0` (`:28`) | **무시됨** — 머신 전역 정책이 그대로 적용 | 탐색 자체를 무효화. 테스트 스위트가 이 값을 씁니다 (`config/vitest-enterprise-policy-isolation.ts:6`) |

> 🔒 **패키징 빌드에서 환경변수가 정책을 이길 수 없다는 것은 보안 속성입니다.** Windows에서 표준 사용자는 관리자 권한 없이 자기 계정 환경변수를 만들 수 있으므로, 무조건 듣는 옵트아웃이었다면 사내 잠금이 `setx ORCA_ENTERPRISE_POLICY off` **한 줄로 우회**됩니다. 그래서 패키징 빌드에서는 이 변수가 후보를 추가만 하고 머신 전역 파일을 대체하거나 끄지 못합니다 (`enterprise-policy-file.ts:49-58` 주석, 분기 `:68-82`). 판정은 `app.isPackaged`로 합니다 — 표준 사용자가 조작할 수 없는 유일한 신호입니다 (`:163-171`). 옛 무조건 옵트아웃은 개발·테스트를 위해 **비패키징에서만** 남아 있습니다.
>
> **배포 결론**: 정책 파일은 머신 전역 기본 경로에 두고 ACL로 사용자 쓰기를 막으세요. 환경변수 커스텀 경로는 **개발·검증용이지 플릿 배포 수단이 아닙니다.**

이 포크가 **추가하지 않는** 것 중 여전히 유효한 값:

- `GH_HOST` — `gh` CLI 자신의 변수. `githubEnterpriseHost`가 비었을 때 폴백으로 읽습니다 (`src/shared/enterprise-policy.ts:203`).
- `DO_NOT_TRACK`, `ORCA_TELEMETRY_DISABLED` — 업스트림 원래의 텔레메트리 킬스위치. 이 브랜치가 건드리지 않았습니다 (`src/main/telemetry/consent.ts:79,83`).
- `ORCA_DIAGNOSTICS_DISABLED` — 업스트림 변수. 위 둘보다 강해서 **로컬 NDJSON 기록까지** 끕니다 (`src/main/observability/index.ts:102,113-119`).

빌드 시점에만 쓰이는 값(이 포크가 추가한 `ORCA_WIN_PUBLISHER_NAME`(`config/electron-builder.config.cjs:201`)·`ORCA_DISABLE_PUBLISH_TARGET`(`:406`), 업스트림의 `ORCA_MAC_RELEASE`/`WIN_CSC_*`/`ORCA_POSTHOG_WRITE_KEY`/`ORCA_BUILD_IDENTITY`)은 **빌드 셸의 변수이며 앱 런타임 환경에는 들어가지 않습니다**. [윈도우 빌드 가이드](./windows-corporate-build.md) 참고.

#### 파일 탐색 순서 — **먼저 발견된 파일이 이깁니다**

`src/main/enterprise/enterprise-policy-file.ts:59-83`

**패키징 빌드 — 플릿에서 유일하게 의미 있는 순서**

1. **머신 전역**
   - Windows: `%ProgramData%\Orca\enterprise-policy.json`
   - macOS: `/Library/Application Support/Orca/enterprise-policy.json`
   - Linux: `/etc/orca/enterprise-policy.json`
2. `ORCA_ENTERPRISE_POLICY` 명시 경로 (무효화 값은 무시)
3. **사용자별**: `<userData>/enterprise-policy.json`

**비패키징(`pnpm dev`·vitest)** — 위 1과 2가 뒤바뀝니다. `ORCA_ENTERPRISE_POLICY`가 1순위이고, 무효화 값으로 탐색 전체를 끌 수 있습니다.

머신 전역을 먼저 보는 것이 이 재설계의 핵심입니다 (`enterprise-policy-file.ts:9-11`). Windows에서 `setx`는 **사용자별** 상태를 씁니다 — 즉 같은 PC의 다른 프로필, 서비스 계정, 새로 만든 프로필은 전부 잠기지 않은 채로 남습니다. 반대 방향도 막혀 있습니다: 사용자별 파일은 머신 전역 파일을 **완화할 수 없습니다**(먼저 찾은 파일에서 탐색이 끝나므로).

#### 스키마 (JSONC — `//` 주석과 후행 쉼표 허용)

파싱은 `jsonc-parser`로 하며(`enterprise-policy-file.ts:142-144`), **파싱 에러가 하나라도 있으면 파일 전체를 거부**합니다 — 절반만 적용되는 상태를 만들지 않습니다(`:145-148`).

> ⚠️ 거부는 **fail-open**입니다: 문법이 깨진 파일은 `null`을 반환하고 남은 후보 경로 탐색도 중단하며(`:146-147`), 그 `null`이 `:193`에서 "정책 없음"으로 해석되어 **`lockdown`이 `false`가 됩니다.** stderr에 `is not valid JSON; ignoring it.` 한 줄만 남으므로 **배포 스크립트가 이 경고를 확인하도록** 하세요. 아래의 "인식할 수 없는 *값*은 lockdown을 상속" 규칙은 파일이 파싱에 성공한 뒤에만 적용됩니다.

| 키 | 타입 | 기본값 | 효과와 **구현 위치** |
| --- | --- | --- | --- |
| `lockdown` | boolean | `false` | 마스터 스위치. 아래 7개 스위치의 기본값이 됩니다 (`src/shared/enterprise-policy.ts:52-60`, `:196-200`) |
| `githubEnterpriseHost` | string | `GH_HOST` 폴백 | 해당 호스트를 Gitea 후보에서 제외 → 오폴백 방지 (`src/main/gitea/repository-ref.ts:87-98`) + 허용목록에 자동 추가 (`enterprise-policy.ts:204-207`). **`gh`의 대상 호스트는 바꾸지 않습니다** (§7 레벨 2) |
| `disableTelemetry` | boolean | = `lockdown` | PostHog 레인 (`src/main/telemetry/consent.ts:88`) **및** 진단/크래시 번들 업로드 (`src/main/observability/index.ts:103,120-133`). 로컬 NDJSON 로깅은 유지(`localFileEnabled: true`, `:130`) |
| `disableAutoUpdate` | boolean | = `lockdown` | `runBackgroundUpdateCheck()` (`src/main/updater.ts:1173,1179`) + `checkForUpdatesFromMenu()` (`:1244,1251`) + `setupAutoUpdater()` (`:1415,1458`). 마지막 하나가 넛지 스케줄러(`:1537`)와 `powerMonitor` 리스너(`:1556`)의 무장 자체를 막습니다 |
| `disableStarNag` | boolean | = `lockdown` | `checkOrcaStarred()` (`src/main/github/client.ts:234`) / `starOrca()` (`:401`) |
| `disableCloudRelay` | boolean | = `lockdown` | `getOrcaCloudAuthConfig()`가 "미구성"을 반환 (`src/main/orca-profiles/profile-cloud-auth-config.ts:73`) → 이 한 함수에 의존하는 클라우드 경로 전부(로그인·프로필 연결·조직 멤버 IPC 5종)가 죽고, 모바일 페어링 릴레이는 `configured`일 때만 생성되므로 아예 기동하지 않습니다 (`src/main/index.ts:2420-2421`) |
| `disableUsagePolling` | boolean | = `lockdown` | `src/main/rate-limits/service.ts:733`의 술어를 `start()`(`:309`), `fetchAll`/`fetchCodexOnly`/`fetchClaudeOnly`/`fetchGrokOnly`(`:894,959,1021,1086`), 계정 스위처 프리뷰 2종(`:499,579`), Codex 리셋 크레딧 POST(`:425`)에서 검사 |
| `disableManagedClaudeAccounts` | boolean | = `lockdown` | Orca 관리형 Claude 계정. 게이트 3곳: `platform.claude.com` 회전 함수 진입부(`src/main/claude-accounts/oauth-refresh.ts:131-133`), 인증 준비에서 활성 계정을 `null`로 고정(`src/main/claude-accounts/runtime-auth-service.ts:613-616`), 환경 스트립 최후 방어선(`src/main/claude-accounts/environment.ts:22`) (§4) |
| `disableSpellcheck` | boolean | = `lockdown` | `webPreferences.spellcheck`를 끄는 지점 **5곳**: 메인 창(`src/main/window/createMainWindow.ts:253`), `will-attach-webview` 게스트(`:425`), 대시보드 팝아웃 창(`src/main/window/dashboard-popout-window.ts:176`), 오프스크린 브라우저 백엔드(`src/main/browser/offscreen-browser-backend.ts:45`), PDF 내보내기 WebContents(`src/main/lib/html-to-pdf.ts:46`) |
| `enforceNetworkAllowlist` | boolean | **`false`** (lockdown이어도) | 호스트 허용목록 하드 게이트 (`src/main/enterprise/enterprise-network-guard.ts`) |
| `allowedNetworkHosts` | string[] | `[]` + GHES 호스트 | 위 게이트가 켜졌을 때만 의미 있음 (`src/shared/enterprise-policy.ts:204-207`) |

동작 규칙:

- **개별 스위치가 마스터보다 우선합니다.** `"lockdown": true` + `"disableAutoUpdate": false` 조합으로 한 기능만 되살릴 수 있습니다.
- **인식할 수 없는 값은 “없음”으로 취급**되어 `lockdown`을 상속하며, 절대 “꺼짐”으로 읽지 않습니다 — 관리자 오타가 머신을 조용히 풀어버리는 것을 막기 위함입니다 (`src/shared/enterprise-policy.ts:80-106`). stderr에 경고를 냅니다.
- **모르는 키도 경고**를 냅니다 (`:190-194`).
- `enforceNetworkAllowlist`만 `lockdown` 상속에서 제외됩니다 (`:212-214`). 하드 허용목록은 기능 스위치와 달리 배포를 통째로 망가뜨릴 수 있어 관리자가 명시적으로 켜야 합니다.

정책은 프로세스당 한 번만 읽고 캐시합니다 (`enterprise-policy-file.ts:180-199`). 세션 도중 파일을 바꿔도 반영되지 않습니다 — 앱 재시작이 필요합니다.

예시 (`/etc/orca/enterprise-policy.json` 또는 `%ProgramData%\Orca\enterprise-policy.json`):

```jsonc
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",
  // 사내 미러가 GitHub 릴리스를 대신 제공하면 업데이트만 되살릴 수 있음
  // "disableAutoUpdate": false,
  "enforceNetworkAllowlist": false,
  "allowedNetworkHosts": ["github.samsungds.net"]
}
```

관련 모듈:

| 파일 | 역할 |
| --- | --- |
| `src/shared/enterprise-policy.ts` | 순수 리졸버 + 타입 (I/O 없음, 단위 테스트 가능) |
| `src/main/enterprise/enterprise-policy-file.ts` | 탐색 / 파싱 / 캐시 |
| `src/main/enterprise/enterprise-network-guard.ts` | opt-in 허용목록 |
| `src/main/enterprise/enterprise-policy-fixture.ts` | 테스트 전용 픽스처 (`makeEnterprisePolicy` / `makeLockdownPolicy`) |
| `config/vitest-enterprise-policy-isolation.ts` | 빌드 머신의 머신 전역 파일이 테스트 스위트를 잠그지 않도록 무효화 |

### 0.2 🔴 이 브랜치의 잠금이 덮지 **않는** 것 (잔여 위험 등록부)

보안 검토자는 이 표 하나로 경계선을 판단할 수 있어야 합니다. **정책 파일은 Orca 메인 프로세스가 직접 여는 소켓과 렌더러의 기본 세션까지만 통제합니다.**

| # | 나가는 트래픽 | 목적지 | 발동 조건 | 왜 잠금이 못 막나 | 확인 위치 |
| --- | --- | --- | --- | --- | --- |
| 1 | **서브프로세스 전체** (`gh`, `glab`, `git`, 에이전트 CLI, agent-browser) | 각 도구의 목적지 | 사용자 조작 / 에이전트 실행 | Electron 세션 밖에서 자체 소켓을 엽니다. `enforceNetworkAllowlist`는 `session.defaultSession`과 메인 프로세스 global `fetch`만 감쌉니다 | `enterprise-network-guard.ts:87-122` |
| 2 | **렌더러 외부 이미지 — 에이전트 카탈로그 아이콘** | `www.google.com/s2/favicons` | 에이전트 목록 표시 시 자동 | 기본값에는 게이트가 없습니다. `enforceNetworkAllowlist`를 켜야 막힙니다 | `src/renderer/src/lib/agent-catalog.tsx:370` |
| 3 | **렌더러 외부 이미지 — "다른 앱으로 열기" 아이콘** | `www.google.com/s2/favicons` | 앱 프리셋 표시 시 자동 | 동일 | `src/renderer/src/lib/open-in-app-catalog.tsx:66` |
| 4 | **렌더러 외부 이미지 — 저장소 아이콘 자동감지** | `www.google.com/s2/favicons` | 저장소 웹사이트 URL이 있을 때 | 동일 | `src/shared/repo-icon.ts:15-30` |
| 5 | **렌더러 외부 이미지 — GitHub 아바타** | `avatars.githubusercontent.com` 또는 **GHES 호스트** | PR/이슈/프로젝트 렌더 시 | 동일. 단 저장소 아이콘용 아바타는 GHES 호스트를 따라가므로(`repo-icon.ts:33-42`) 사내 호스트로만 나갈 수 있음 | `src/renderer/src/components/github/github-user-avatar.tsx:35,78` |
| 6 | **마크다운 본문의 인라인 이미지** (`variant="document"`) | 본문에 적힌 임의의 http(s) URL — GitHub/Jira 첨부 등 | PR·이슈·Jira 설명 본문 렌더 시 | 동일. `document` 변형만 원격 `src`를 그대로 `<img>`로 로드합니다 | `src/renderer/src/components/sidebar/comment-markdown-element-renderers.tsx:258,274` / 호출측 `JiraIssueWorkspace.tsx:674-676` |
| 6b | **Linear/Jira 사용자 아바타** | 각 벤더 아바타 CDN | 이슈·코멘트 목록 렌더 시 | 동일 (렌더러 `<img>`) | `src/renderer/src/components/LinearIssueWorkspace.tsx:101`, `JiraIssueWorkspace.tsx:591,740` |
| 7 | **SSH 릴레이의 원격 `npm install`** | 원격 호스트의 npm 레지스트리 (기본 `registry.npmjs.org`) | 원격 호스트 최초 연결 시 | 릴레이 번들은 SCP로 보내지만 `node-pty`/`@parcel/watcher`는 네이티브 애드온이라 **원격에서 설치**합니다. 정책 파일은 원격 머신에 없습니다 | `src/main/ssh/ssh-relay-deploy.ts:683-684,725,737` |
| 8 | **Node `fetch` / `node:https` 프록시 우회** | 아래 §5 목록 | 해당 기능 사용 시 | `proxy-settings.ts`는 **Electron 세션에만** 프록시를 겁니다 | `src/main/network/proxy-settings.ts:41-79` |
| 9 | **scrcpy 서버 jar 다운로드** | `github.com/Genymobile/scrcpy/releases` | Android 에뮬레이터 스트리밍 최초 사용 | `node:https`의 `get`을 직접 씁니다 — 세션 프록시도, global `fetch` 래퍼도 안 탑니다 | `src/main/emulator/android/scrcpy-server-download.ts:4,14` |
| 10 | **STT(sherpa-onnx) 모델 다운로드** | `github.com/k2-fsa/sherpa-onnx/releases` | 사용자가 로컬 받아쓰기 모델을 명시적으로 내려받을 때 | 코드 차단 없음. 다만 Electron `net.request`를 쓰므로 §5 프록시는 탑니다 | `src/main/speech/model-catalog.ts:16`, `model-manager.ts:2,751` |
| ~~11~~ | ~~**Claude OAuth 토큰 회전**~~ | ~~`platform.claude.com`~~ | — | **해소됨**: `disableManagedClaudeAccounts`가 덮습니다 (§4). 이전 판의 "정책 스위치 없음"은 더 이상 사실이 아닙니다 | 게이트 `src/main/claude-accounts/oauth-refresh.ts:131-133` |
| 12 | **임베디드 브라우저** | 사용자가 방문하는 임의의 사이트 | 사용자 조작 | 허용목록은 `persist:` 파티션을 의도적으로 제외합니다 — 그 슬롯은 인증서 게이트가 이미 점유 중이고, 임의 사이트 열람이 이 기능의 목적이기 때문 | `enterprise-network-guard.ts:9-13` |
| 13 | **Gitea/Forgejo 폴백 직접 fetch** | origin 리모트에서 동적 유도된 호스트 | 미지정 git 호스트를 쓸 때 | `githubEnterpriseHost`를 지정하면 GHES는 제외되지만, **그 외 모든 미지정 호스트는 여전히 Gitea로 간주**됩니다 (§1) | `src/main/gitea/repository-ref.ts:87-98`, `client.ts:91` |

**#2~#6b는 `enforceNetworkAllowlist: true`로 닫을 수 있습니다** — 메인 창은 파티션을 지정하지 않아 `session.defaultSession`을 쓰므로 렌더러 `<img>` 요청이 가드의 `onBeforeRequest`를 지나갑니다. #1, #7은 어떤 Orca 측 스위치로도 닫히지 않으며 망 계층에서만 통제됩니다.

---

## 1. Git 호스팅 (GitHub / GitLab / Bitbucket / Azure DevOps / Gitea)

### GitHub — `gh` CLI 서브프로세스 (직접 fetch 아님)

- **호스트**: `api.github.com`, `github.com`, 설정 시 사내 GHES(`github.samsungds.net`)
- **발동**: 대부분 사용자 조작(PR/이슈 열람). **일부 자동**: 사이드바에 보이는 워크트리 행의 PR/CI 백그라운드 갱신, 그리고 star-nag. star-nag 서비스는 부팅 시 기동하지만(`src/main/index.ts:2151`) `start()`는 스폰 카운터 리스너만 등록할 뿐 즉시 네트워크를 쓰지 않습니다(`src/main/star-nag/service.ts:65-70`) — 실제 `gh` 호출 시점은 아래 4개 경로입니다.
- **전송**: repo owner/name, 브랜치, 커밋 SHA, PR/이슈 번호·제목·본문, 리뷰 코멘트, CI 로그. 인증 토큰은 `gh`가 보관하고 **Orca 프로세스를 통과하지 않음** (긍정적).
- **GHES 지원**: 이미 있음. origin 리모트에서 호스트를 유도하거나 `GH_HOST`/`options.host`로 `gh api --hostname <host>`를 주입합니다 (`src/main/git/runner.ts:1291-1303`, 레이트리밋 스코프도 같은 호스트를 따름 `:1368-1376`). **github.com 하드코딩 아님.**

### ⚠️ 주의 1: GHES 감지가 `gh auth status`에 의존

사내 GHES가 `gh`에 로그인돼 있지 않으면 GHES 감지(`src/main/github/github-enterprise-repository.ts:151`)가 실패하고 **Gitea 폴백 경로로 떨어질 수 있습니다**. → 배포 시 `gh auth login --hostname github.samsungds.net`을 선행하세요. 정책 파일의 `githubEnterpriseHost`는 Gitea 오폴백을 별도로 막아 주지만(아래), `gh` 로그인 자체를 대신하지는 않습니다.

### ✅ 주의 2 (해결됨): star-nag의 github.com 고정 호출 — 게이트는 `gh` 호출 함수 자체에 있음

`src/main/github/client.ts:125` — `const ORCA_REPO = 'stablyai/orca'`
`:234` — `checkOrcaStarred()`: `disableStarNag`면 `true` 반환 후 즉시 종료. 이후 `gh api --include user/starred/stablyai/orca` (읽기)
`:401` — `starOrca()`: `disableStarNag`면 `false` 반환 후 즉시 종료. 이후 `gh api -X PUT user/starred/stablyai/orca` (쓰기)

이 경로는 공용 러너(`ghExecFileAsync`)를 우회하는 **raw `execFileAsync`**라 `--hostname` 주입도, GHES 라우팅도 타지 않습니다. **github.com SaaS로 고정된 호출입니다.**

이전 판은 이 게이트가 `StarNagService.start()`에 있고 “에이전트 스폰 임계치”가 유일한 발동 경로라고 적었는데, **둘 다 틀렸습니다.** 게이트는 `src/main/github/client.ts`로 옮겨졌고, 이 함수들에 도달하는 경로는 **4개**입니다. star-nag 서비스는 그중 1개(내부 트리거 2종)에 불과합니다:

| # | 경로 | 진입점 |
| --- | --- | --- |
| 1 | `gh:checkOrcaStarred` / `gh:starOrca` IPC — 랜딩 화면 | `src/main/ipc/github.ts:1174-1175` ← `src/renderer/src/components/Landing.tsx:41,82` |
| 2 | 같은 IPC — 설정 → Support 섹션 | 같은 IPC ← `src/renderer/src/components/settings/GeneralSupportSection.tsx:43,71` |
| 3 | 에이전트 완료 “value moment” 트리거 | `src/main/star-nag/agent-value-moment.ts:46` |
| 4 | star-nag 서비스: 스폰 임계치(`service.ts:105`)와 온보딩 완료(`:240`) → `maybeShow()` (`:121`) | `src/main/star-nag/service.ts` |

`starOrca()` 쓰기 경로는 위 1·2번 IPC 외에 `src/main/star-nag/direct-star-attempt.ts:9`에서도 호출됩니다. 게이트를 `client.ts`의 두 함수에 둔 덕분에 이 호출 지점 전부가 한 번에 막힙니다 — `StarNagService.start()`에만 걸었다면 1·2·3번은 그대로 github.com으로 나갔습니다.

### 다른 provider

| Provider | 방식 | 호스트 | 폴백 위험 |
| --- | --- | --- | --- |
| **GitLab** | `glab` CLI 서브프로세스 | `gitlab.com` / self-hosted | 자체 self-hosted 감지 있음 |
| **Bitbucket** | Orca **직접 fetch** (global fetch) | `api.bitbucket.org` | — |
| **Azure DevOps** | Orca **직접 fetch** (global fetch) | `dev.azure.com`, `*.visualstudio.com` | `ORCA_AZURE_DEVOPS_API_BASE_URL`로 지정 가능 |
| 🔴 **Gitea/Forgejo** | Orca **직접 fetch** (global fetch, `src/main/gitea/client.ts:91`) | **origin 리모트에서 동적 유도** | **미지정 호스트 전부의 폴백 provider** |

**🔴 Gitea 폴백이 핵심 리스크**: `KNOWN_NON_GITEA_HOSTS`(`github.com`/`gitlab.com`/`bitbucket.org`/`dev.azure.com`/`ssh.dev.azure.com` — `repository-ref.ts:17-23`), `*.visualstudio.com`(`:96`), 그리고 **정책 파일의 `githubEnterpriseHost`**만 제외하고, **그 외 모든 리모트 호스트를 Gitea로 간주**해 `<host>/api/v1/...`로 직접 fetch합니다 (`src/main/gitea/repository-ref.ts:87-98`, API 베이스 조립은 `:81-82`). 즉 사내 git 호스트가 GitHub로 인식되지 못하면 Orca가 `github.samsungds.net/api/v1/...`(Gitea API)로 요청을 쏩니다. `ORCA_GITEA_TOKEN`(`client.ts:58`)이 없어도 무인증 GET은 그대로 나갑니다. → **정책 파일에 `githubEnterpriseHost`를 반드시 지정**하는 것이 이 폴백을 막는 방법입니다. 다만 GHES 외의 다른 사내 git 호스트가 있다면 그쪽은 여전히 Gitea로 오인됩니다.

---

## 2. 텔레메트리 / 진단 / 크래시 리포트

| 기능 | 호스트 | 기본 상태 |
| --- | --- | --- |
| PostHog 제품 텔레메트리 | `us.i.posthog.com` | **opt-in(기본 꺼짐)** + 공식 CI 빌드에서만 키 주입 |
| 진단 번들 업로드 (설정 → Privacy) | `www.onorca.dev/v1/feedback` (폴백 `api.onorca.dev`) | 사용자 명시적 클릭 |
| 크래시 리포트 + 인앱 피드백 | 동일 (`src/main/ipc/feedback.ts:9-10`) | 사용자 명시적 제출 |
| star-nag 프롬프트 텔레메트리 | `us.i.posthog.com` | 위 PostHog 게이트에 종속 |

**게이트는 두 레인 모두에 있습니다.**

PostHog 레인 (`src/main/telemetry/consent.ts:77-96`):
1. `DO_NOT_TRACK` truthy → 무조건 차단 (최우선, `:79`)
2. `ORCA_TELEMETRY_DISABLED` truthy → 차단 (`:83`)
3. **정책 파일 `disableTelemetry` → 차단** (`:88`)
4. CI 환경변수 존재 → 차단 (`:94`, 값이 빈 문자열만 아니면 됨)
5. 사용자 opt-in 배너에 동의하지 않으면 기본 **미전송**

진단/크래시 번들 레인 (`src/main/observability/index.ts:97-140`): `disableTelemetry`가 켜지면 `bundleEnabled: false`로 **망 전송만 차단**하고 `localFileEnabled: true`는 유지합니다 (`:120-133`). 로컬 NDJSON 트레이스는 머신을 떠나지 않으므로 그대로 두는 설계이며, 소비자는 `src/main/ipc/diagnostics.ts:221,253,263`과 `src/main/crash-reporting/crash-feedback-diagnostic-bundle.ts:33`입니다.

게다가 전송 키(`ORCA_POSTHOG_WRITE_KEY`)는 **공식 CI 릴리스 빌드에만 컴파일타임에 주입**되고, 사내에서 직접 빌드한 exe는 이 값이 리터럴 `null`로 접히므로 애초에 전송 경로가 죽습니다 (`electron.vite.config.ts:26-31,210`).

**→ 사내 조치**: 정책 파일 `"lockdown": true`(또는 `"disableTelemetry": true`)로 봉인. 업스트림 `ORCA_TELEMETRY_DISABLED=1`을 병행해도 되지만 필수는 아닙니다.

---

## 3. 자동 업데이트 / 넛지 (✅ 정책 파일로 차단됨)

| 기능 | 호스트 | 주기 | 차단 |
| --- | --- | --- | --- |
| electron-updater 자동 업데이트 피드 | `github.com`, `objects.githubusercontent.com` (`publish.provider: 'github'`, `config/electron-builder.config.cjs:409-412`) | 24시간 주기 + 실패 시 1시간에서 최대 6시간까지 배수 증가하는 재시도 (`src/main/updater.ts:59-62`) + 절전복귀 | ✅ `disableAutoUpdate` |
| 업데이트 넛지(강제 업데이트 체크) | `onorca.dev/whats-new/nudge.json` (`src/main/updater-nudge.ts:12`) | **30분마다** (`src/main/updater.ts:63`) + 창 포커스/절전복귀 | ✅ `disableAutoUpdate` |
| 릴리스 매니페스트/프리릴리스 피드 | `github.com/stablyai/orca/releases/download` (`src/main/updater-prerelease-feed.ts:6`) | 체크 시 | ✅ `disableAutoUpdate` |
| 변경사항("what's new") fetch | `onorca.dev/whats-new/changelog.json` (`src/main/updater-changelog.ts:45`) | 업데이트 이벤트 시 | ✅ `disableAutoUpdate` (업데이트 체크가 죽으면 이벤트가 발생하지 않음) |

**차단 지점은 3곳이며, 세 번째가 가장 중요합니다** (`src/main/updater.ts`):

| 함수 | 게이트 라인 | 막는 것 |
| --- | --- | --- |
| `runBackgroundUpdateCheck()` (`:1173`) | `:1179` | 피드에 도달하는 모든 체크가 통과하는 **단일 초크포인트** — 24시간/재시도 타이머, 절전복귀/포커스, 넛지, 외부 노출 `checkForUpdates` |
| `checkForUpdatesFromMenu()` (`:1244`) | `:1251` | 메뉴의 수동 "Check for Updates" |
| `setupAutoUpdater()` (`:1415`) | `:1458` | **피드 URL 설정 전에 조기 반환**하므로 넛지 스케줄러(`:1537`)와 `powerMonitor.on('resume')` 리스너(`:1556`)가 **아예 무장되지 않습니다** |

즉 “넛지 폴링 타이머가 계속 돌아 30분마다 `onorca.dev`로 나간다”는 문제는 이 브랜치에서 해소되었습니다. `setupAutoUpdater()`의 조기 반환은 `recordUpdaterLifecycle('auto_update_disabled_by_policy', ...)`로 로컬 로그에 흔적을 남깁니다.

**추가 방어 (선택)**:
1. **빌드 시**: 빌드 셸에 `ORCA_DISABLE_PUBLISH_TARGET=1`. 코드 수정이 필요 없습니다 — 설정이 이미 이 값을 보고 `publish`를 `null`로 떨어뜨립니다 (`config/electron-builder.config.cjs:405-407`). 그러면 업데이터 메타(`latest.yml`, `app-update.yml`)가 생성되지 않아 electron-updater가 피드를 조회할 수 없습니다.
2. **망 차원**: `onorca.dev` / `github.com` 릴리스 에셋을 사내 방화벽에서 차단(git 기능과 충돌 주의).

빌드 단계의 phone-home(electron-builder가 github에 업로드 시도)은 [윈도우 빌드 가이드 §5](./windows-corporate-build.md)에서 `--publish never`로 이미 다룹니다.

---

## 4. AI 벤더 사용량/인증 (Orca 자체 호출)

Orca가 스폰하는 에이전트 CLI(claude/codex/…)의 트래픽이 아니라, **Orca가 직접 거는 호출**입니다.

| 기능 | 호스트 | 기본 상태 | 정책 차단 |
| --- | --- | --- | --- |
| 🔴 **Claude 사용량/rate-limit 폴링** | **`api.anthropic.com/api/oauth/usage`** | **기본 켜짐.** 부팅 시 서비스 시작(`src/main/index.ts:1188`), 창이 보이고 포커스된 동안 **15분 주기**(`src/main/rate-limits/service.ts:74,769-778`) | ✅ `disableUsagePolling` |
| 🔴 **Claude OAuth 리프레시 토큰 회전** | `platform.claude.com/v1/oauth/token` | Orca 관리 Claude 계정을 추가하지 않으면 안 나감 | ✅ `disableManagedClaudeAccounts` |
| 🔴 **Codex 사용량** | `chatgpt.com/backend-api/wham/usage` (`src/main/rate-limits/codex-fetcher.ts:518`) | Claude와 동일 구조 — 로컬 `~/.codex/auth.json`(또는 `CODEX_HOME`)만 있으면 발생 (`:190,336`) | ✅ `disableUsagePolling` |
| 🔴 **Grok 사용량** | `cli-chat-proxy.grok.com` (`src/main/rate-limits/grok-fetcher.ts:17`) | 로컬 `<GROK_HOME>/auth.json`만 있으면 발생 (`src/main/rate-limits/grok-auth.ts:11`) | ✅ `disableUsagePolling` |
| 🔴 **Kimi 사용량** | `api.kimi.com/coding/v1` (`src/main/rate-limits/kimi-fetcher.ts:15`) | 로컬 `<KIMI_HOME>/credentials/kimi-code.json`만 있으면 발생 (`:27-28,55-59`) | ✅ `disableUsagePolling` |
| Gemini CLI 쿼터 + Google OAuth 갱신 | `cloudcode-pa.googleapis.com`, `oauth2.googleapis.com` (`src/main/rate-limits/gemini-usage-fetcher.ts:19`, `gemini-oauth-sources.ts:9-10`) | **기본 꺼짐** — `geminiCliOAuthEnabled: false` (opt-in, `src/shared/constants.ts:317`) | ✅ `disableUsagePolling` |
| MiniMax 사용량 | `platform.minimax.io` (`src/main/rate-limits/minimax-request-context.ts:4`) | **기본 꺼짐** — 세션 쿠키 미설정 시 무전송 | ✅ `disableUsagePolling` |
| OpenCode 사용량 | `opencode.ai/_server` (`src/main/rate-limits/opencode-go-usage-fetcher.ts:12`) | **기본 꺼짐** — 세션 쿠키 필요 | ✅ `disableUsagePolling` |
| 🔴 **받아쓰기(STT) → OpenAI** | `api.openai.com` (`src/main/speech/openai-transcription-client.ts:118`, global fetch) | **기본 꺼짐** — `voice.enabled: false` + 모델 미선택 + API 키 미설정, 3중 게이트 | ❌ 코드 차단 없음 (기능을 켜지 않으면 됨) |

### 🔴 정정: 사용량 폴링은 “Orca 계정 연동에 종속”되지 않습니다

이전 판은 사용량 폴링이 Orca 관리 Claude 계정 연동에 종속된다고 적었으나 **사실이 아닙니다.** Claude가 가장 위험하지만, Codex·Grok·Kimi도 **읽는 파일만 다를 뿐 구조가 같습니다** — 전부 사용자의 로컬 벤더 CLI 자격증명을 직접 읽습니다.

- 목적지는 `platform.claude.com`이 아니라 **`https://api.anthropic.com/api/oauth/usage`** 입니다 (`src/main/rate-limits/claude-fetcher.ts:46`, 호출은 `:355`). 이 호스트는 이전 판 어디에도 등장하지 않았습니다 — **방화벽 허용목록에서 빠지기 쉬운 지점입니다.**
- 자격증명은 Orca 계정이 아니라 **사용자의 기존 Claude CLI 자격증명**에서 읽습니다: macOS Keychain을 먼저 보고, 없으면 **`~/.claude/.credentials.json`** 으로 폴백합니다 (`claude-fetcher.ts:193-201`, 순서는 `:207-233`).
- 즉 **사내 개발자가 Claude Code CLI에 이미 로그인해 있기만 하면**, Orca에 아무 계정도 추가하지 않아도 창이 포커스된 동안 15분마다 `api.anthropic.com`으로 나갑니다.

이 경로는 `disableUsagePolling`으로 닫힙니다. 게이트 술어는 `src/main/rate-limits/service.ts:733`이고, 9개 진입점에서 검사합니다(`함수 선언줄` / `게이트줄`): `start()` `:307`/`:309` — 폴링 타이머 자체를 무장하지 않음, `fetchAll()` `:893`/`:894`, `fetchCodexOnly()` `:958`/`:959`, `fetchClaudeOnly()` `:1020`/`:1021`, `fetchGrokOnly()` `:1085`/`:1086`, 계정 스위처 프리뷰 `fetchInactiveClaudeAccountsOnOpen()` `:499`, `fetchInactiveCodexAccountsOnOpen()` `:579`, Codex 리셋 크레딧 POST `:425`, UI 상태 표기 `:1462`.

**Gemini/OpenCode/Kimi/MiniMax도 같은 게이트에 덮입니다.** 이 네 페처는 모두 `runFetchAllCycle()`(`:1479`) 안의 단일 `Promise.allSettled` 배치에서 호출되고(`:1578-1590`), `runFetchAllCycle`의 호출자는 위에 나열한 4개 게이트 메서드뿐입니다(`:912,984,1049,1111`). 즉 별도 페처 경로가 아니라 전부 하나의 초크포인트 아래에 있습니다.

### ✅ 정정(해소됨): Claude OAuth 토큰 회전 — `disableManagedClaudeAccounts`

`refreshClaudeOauthCredentials()` (`src/main/claude-accounts/oauth-refresh.ts:125`)는 사용자의 refresh_token으로 `platform.claude.com/v1/oauth/token`에 POST합니다 (`:10`, 전송은 `:149`). 호출 지점은 두 곳입니다: 사용량 페처(`src/main/rate-limits/claude-fetcher.ts:1204-1205` — `disableUsagePolling`이 위에서 이미 막음)와 **에이전트 스폰 시 런타임 인증 준비**(`src/main/claude-accounts/runtime-auth-service.ts:1054,1057`).

**이전 판은 두 번째 경로에 "차단 설정 없음"이라고 적었습니다. 더 이상 사실이 아닙니다** — 정책 파일에 `disableManagedClaudeAccounts`가 추가됐고, 다른 `disable*`와 같이 `lockdown`을 상속합니다 (`src/shared/enterprise-policy.ts:26-32`, `:52-60`).

이 스위치는 관리형 계정 기능을 통째로 끄므로 **두 가지가 함께 닫힙니다.**

1. **egress** — 위의 `platform.claude.com` 토큰 회전. 게이트가 **함수 진입부**(`oauth-refresh.ts:131-133`)에 있어 호출자를 가리지 않고, 소켓을 열기 전에 `null`을 반환합니다. `null`은 원래 "기존 자격증명 유지"라 예외가 나지 않습니다.
2. **에이전트 환경 재작성** — 관리형 계정이 활성일 때 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`** 및 인증성 `ANTHROPIC_CUSTOM_HEADERS`를 삭제하는 동작 (`src/main/claude-accounts/environment.ts:3-8,22-29`, 적용부 `src/main/rate-limits/claude-pty.ts:244-247`, `src/main/text-generation/commit-message-agent-environment.ts:127-128`). 게이트는 두 겹입니다 — 인증 준비에서 활성 계정을 `null`로 고정(`src/main/claude-accounts/runtime-auth-service.ts:613-616`, 호스트 세션의 `stripAuthEnv`는 여기서 유도되므로 `:667`이 자동으로 `false`)하고, `stripAuthEnv: true`를 하드코딩해 넘기는 호출자에 대비해 `environment.ts:22`에서 한 번 더 막습니다.

두 번째는 **Bedrock 플릿에서 egress가 아니라 기능 장애로 나타납니다.** WSL 런타임을 고른 세션은 관리형 계정이 하나도 없어도 스트립이 켜졌고(`src/main/claude-accounts/runtime-auth-service.ts:647,657` — WSL 홈을 찾은 경우와 못 찾은 경우), 그 상태에서 런치 환경에 위 변수가 있으면 PTY 스폰이 에러로 **하드 실패**했습니다 (`src/main/ipc/pty.ts:2955-2959`, `:4013-4017`). 지금은 두 분기의 `stripAuthEnv`가 `!managedAccountsDisabled`라 스위치가 켜져 있으면 실패 조건 자체가 성립하지 않습니다. Windows 호스트 세션은 원래도 관리형 계정을 선택한 동안에만 스트립됐습니다 (`:667`).

**요점**: 손봐야 하는 건 **로컬 CLI 자격증명만으로 발동하는 사용량 폴링 4종(Claude·Codex·Grok·Kimi → `disableUsagePolling`)** 과 **관리형 Claude 계정(→ `disableManagedClaudeAccounts`)** 이며, `lockdown: true` 하나로 둘 다 켜집니다. Gemini/MiniMax/OpenCode/Kimi는 기본 opt-in이라 켜지 않으면 나가지 않고, **켜더라도 `disableUsagePolling`이 덮습니다** — 이들의 fetcher는 `runFetchAllCycle` 안에서만 호출되고 그 사이클로 들어가는 경로가 전부 게이트를 지납니다. 정책 스위치가 없는 것은 받아쓰기(STT → `api.openai.com`)뿐이며, 이쪽은 3중 opt-in이라 설정하지 않으면 발동하지 않습니다.

### AWS Bedrock으로 Claude를 쓰는 경우

사내가 Bedrock을 쓴다면 인증은 Orca가 스폰하는 **Claude Code CLI 자체**가 AWS로 처리합니다(`bedrock-runtime.<region>.amazonaws.com`). Orca는 셸/워크스페이스 환경변수를 PTY에 전달하므로, 아래를 사용자 셸 또는 per-workspace 환경에 넣으면 됩니다.

```
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION / AWS_PROFILE (또는 AWS_ACCESS_KEY_ID 등)
ANTHROPIC_MODEL=<Bedrock inference profile ARN 또는 모델 ID>
```

`platform.claude.com`으로 가는 OAuth 갱신은 **Orca 관리 Claude 계정을 추가하지 않는 한 발생하지 않지만, 그 "추가하지 않음"을 사용자 선의에 맡기지 말고 `disableManagedClaudeAccounts`로 못 박으세요.** Bedrock 플릿에서 이 스위치는 egress 차단인 동시에 **기능 안정화**입니다 — 위 절에서 본 대로 관리형 계정의 환경 스트립은 `AWS_BEARER_TOKEN_BEDROCK`을 지우고, WSL 세션에서는 관리형 계정 없이도 켜져 Claude 스폰을 하드 실패시킵니다.

**`api.anthropic.com` 사용량 폴링은 별개 경로**이며 Bedrock 사용 여부와 무관하게 로컬 Claude CLI 자격증명만 있으면 발생하므로, `disableUsagePolling`도 함께 켜야 합니다. 둘 다 `lockdown: true`에 포함됩니다. AWS 자격증명이 프록시/사설 CA를 타야 하면 §5의 환경변수를 함께 설정하세요.

---

## 5. 사내 프록시 / 사설 CA (⚠️ 부분 지원 — 전 경로를 덮지 않음)

- **프록시**: 부팅 시 호출되는 것은 `applyElectronProxySettings(store.getSettings())`입니다 (`src/main/index.ts:1849`). Dock/런치패드 실행은 셸 env를 못 물려받으므로 **앱 내 프록시 설정값이 우선**이고(`proxy-settings.ts:90-113`), 설정이 비었을 때만 `ensureElectronProxyFromEnvironment`로 폴백해 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`/`NO_PROXY`(소문자 변형 포함)를 읽습니다 (`:92-97,119-124`, 이름 목록은 `src/shared/network-proxy.ts:14-21`). 단, 시스템 프록시가 이미 잡혀 있으면(`resolveProxy !== 'DIRECT'`) env는 무시됩니다 (`proxy-settings.ts:54-57`).
- **앱 내 프록시 설정은 자식 프로세스로 전파됩니다**: PTY로 스폰되는 에이전트 CLI의 환경에 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY`(대·소문자 6+2종)를 주입합니다 (`src/shared/network-proxy.ts:94-116` ← `src/main/ipc/pty.ts:982`, `src/main/rate-limits/claude-pty.ts:253`). **env에서 유도한 프록시는 이 주입 대상이 아닙니다** — 그 경우 자식은 부모 셸의 env를 그대로 상속할 뿐입니다.
- **사설 CA / TLS 검사**: 임베디드 브라우저에 인증서 신뢰 컨트롤러 존재(`browser-certificate-trust-controller.ts`). Node 계층은 표준 `NODE_EXTRA_CA_CERTS`를 따르므로 사내 루트 CA를 이 환경변수로 주입(Electron `net`은 이 변수가 아니라 OS 신뢰 저장소를 씁니다).

### 🔴 한계: 프록시는 **Electron 세션에만** 적용됩니다

두 진입점 모두 `proxySession.setProxy(...)`를 호출할 뿐이고, 대상은 기본적으로 `session.defaultSession`입니다 (`proxy-settings.ts:53,68-72` 및 `:89,102-106`). 따라서 **Electron `net.fetch`/`net.request`는 프록시를 타지만, Node의 global `fetch`(undici)와 `node:https`는 타지 않습니다.**

메인 프로세스의 global `fetch` 호출 지점은 `src/main/global-fetch-call-site-audit.test.ts:17-36`에 전수 열거되어 있습니다(이 테스트는 원래 undici의 미소비 응답 바디 크래시를 막으려고 만든 것이지만, 프록시 우회 목록으로도 그대로 쓸 수 있습니다). 실제 HTTP를 거는 항목은 다음과 같습니다:

| 파일 | 목적지 |
| --- | --- |
| `main/azure-devops/azure-devops-api-request.ts` | Azure DevOps |
| `main/bitbucket/client.ts` | Bitbucket |
| `main/gitea/client.ts` | Gitea/Forgejo (§1 폴백 포함) |
| `main/orca-profiles/profile-cloud-client.ts` | Orca Cloud |
| `main/orca-profiles/profile-cloud-org-members-client.ts` | Orca Cloud |
| `main/rate-limits/codex-fetcher.ts` | Codex 사용량 |
| `main/runtime/relay/relay-http-client.ts` | SSH 릴레이 HTTP |
| `main/source-control/hosted-review-api-request.ts` | 호스팅형 리뷰 API |
| `main/speech/openai-transcription-client.ts` | `api.openai.com` |

(같은 표의 나머지 항목 — `main/amp/hook-service.ts`, `main/opencode/hook-service.ts`, `main/pi/agent-status-extension-source.ts`, `main/ipc/worktree-remote.ts`, `relay/git-handler.ts`, `main/ipc/feedback.ts` — 은 주입 스크립트 문자열 / `git fetch` 식별자 / 주석이라 실제 HTTP 호출이 아닙니다.)

`node:https`를 직접 쓰는 다운로더도 프록시를 우회합니다:

- `src/main/emulator/android/scrcpy-server-download.ts:4,14` — `github.com`에서 scrcpy 서버 jar 다운로드
- `src/main/observability/diagnostic-upload-http.ts:1-2` — 진단 번들 업로드 (단 `disableTelemetry`로 차단됨)

**사내 조치**: 아래를 설정하되, 위 경로들은 **프록시가 아니라 방화벽/라우팅 또는 `enforceNetworkAllowlist`로 통제**해야 한다는 점을 전제하세요.

```
HTTPS_PROXY / HTTP_PROXY / NO_PROXY
NODE_EXTRA_CA_CERTS=C:\path\to\corp-root-ca.pem
```

⚠️ 스폰되는 에이전트 CLI와 `gh`/`glab`도 이 env를 물려받아야 하니, 사용자 셸 프로파일 또는 per-workspace env에 반영하세요(앱 내 프록시 설정을 쓰면 PTY 자식에게는 자동 주입됩니다 — 위 참고).

---

## 6. 이미지 / 아이콘 (렌더러 직접 로드)

| 기능 | 호스트 | 발동 | 파일 |
| --- | --- | --- | --- |
| GitHub 아바타 | `avatars.githubusercontent.com` (저장소 아이콘은 GHES 호스트를 따름) | PR/이슈/프로젝트 렌더 시 | `src/renderer/src/components/github/github-user-avatar.tsx:35,78`, `src/shared/repo-icon.ts:33-62` |
| 저장소 아이콘 자동감지 | `www.google.com/s2/favicons` | 저장소 웹사이트 URL이 있을 때 | `src/shared/repo-icon.ts:15-30` |
| 에이전트 카탈로그 아이콘 | `www.google.com/s2/favicons` | 에이전트 목록 표시 | `src/renderer/src/lib/agent-catalog.tsx:370` |
| "다른 앱으로 열기" 아이콘 | `www.google.com/s2/favicons` | 앱 프리셋 표시 | `src/renderer/src/lib/open-in-app-catalog.tsx:66` |
| 마크다운 본문의 인라인 이미지 | 본문에 적힌 임의의 http(s) URL | PR·이슈·Jira 설명 렌더 시 (`variant="document"`) | `src/renderer/src/components/sidebar/comment-markdown-element-renderers.tsx:258,274` |
| Linear/Jira 사용자 아바타 | 각 벤더 아바타 CDN | 이슈·코멘트 목록 렌더 시 | `src/renderer/src/components/LinearIssueWorkspace.tsx:101`, `JiraIssueWorkspace.tsx:591,740` |

렌더러 `<img>`가 직접 로드하며, **기본 정책(`lockdown: true`만 켠 상태)으로는 차단되지 않습니다.** 폐쇄망에서 로드 실패 시 아이콘만 깨지고 기능은 동작합니다.

마크다운 이미지는 변형에 따라 동작이 다릅니다: `compact` 변형(기본값 — 사이드바 카드, Linear 코멘트 `LinearIssueWorkspace.tsx:916` 등)은 `blob:`/`data:image` 외의 `src`를 **이미지가 아니라 텍스트 링크로** 렌더해 자동 요청을 내지 않습니다 (`comment-markdown-element-renderers.tsx:16-24,143-158`). 원격 이미지를 실제로 가져오는 것은 `document` 변형뿐입니다.

완전 차단이 필요하면 `"enforceNetworkAllowlist": true` + `allowedNetworkHosts`를 지정하세요 (§7 레벨 3). 저장소 아이콘의 GitHub 아바타는 GHES 호스트를 따라가므로(`repo-icon.ts:44-62`), 허용목록에 GHES 호스트만 넣어도 그 항목은 살아남습니다.

---

## 7. 통합 차단(kill-switch) — 현재 구현 상태

### 레벨 1 — 정책 파일 (코드 수정 없음, 권장 기본안)

머신 전역 경로에 아래 파일을 배치합니다 (§0.1).

```jsonc
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net"
}
```

이것으로 §2(텔레메트리·진단), §3(자동 업데이트·넛지), §1(star-nag), Orca Cloud/모바일 릴레이, §4(사용량 폴링 + 관리형 Claude 계정/`platform.claude.com` OAuth 회전), 맞춤법 사전 다운로드가 한 번에 닫히고, Gitea 오폴백이 방지됩니다.

추가로:
- 사이드바 워크트리 카드 속성에서 `pr`/`ci`(신형 카드 스타일이면 `status`) 제거 → PR/리뷰 백그라운드 갱신 중단(명시적 열람은 유지). 단 **`groupBy`가 `pr-status`이거나 우측 사이드바가 PR 데이터를 보이면 카드 속성과 무관하게 계속 갱신**됩니다 (`src/renderer/src/store/slices/github.ts:4270-4275`).
- Gemini/MiniMax/OpenCode/받아쓰기는 기본 꺼짐이라 **켜지 않으면 됨**.

### 레벨 2 — 환경변수 (정책 파일과 별개로 여전히 유효한 것)

```
GH_HOST=github.samsungds.net       # gh 자신의 변수. 정책 파일이 대체하지 못함 — 아래 참고
HTTPS_PROXY / HTTP_PROXY / NO_PROXY # 프록시 (§5, Electron 세션 한정)
NODE_EXTRA_CA_CERTS=<corp-ca.pem>  # 사설 CA (§5)
```

⚠️ **`githubEnterpriseHost`는 `GH_HOST`를 대체하지 않습니다.** 저장소 전체에서 이 정책 값을 읽는 곳은 `src/main/gitea/repository-ref.ts:91`(Gitea 오폴백 제외)과 `src/shared/enterprise-policy.ts:204-207`(허용목록에 자동 추가) 두 곳뿐입니다. `gh`가 어느 호스트로 나갈지는 여전히 origin 리모트에서 유도한 `options.host` 또는 `GH_HOST`가 정합니다 (`src/main/git/runner.ts:1297-1303,1370-1376`). 의존 방향은 오히려 반대입니다 — `githubEnterpriseHost`가 비어 있을 때 `GH_HOST`를 폴백으로 읽습니다 (`src/shared/enterprise-policy.ts:203`).

### 레벨 3 — 허용목록 하드 게이트 (opt-in)

`"enforceNetworkAllowlist": true`. 구현은 `src/main/enterprise/enterprise-network-guard.ts`이며 두 레인을 덮습니다:

1. `session.defaultSession.webRequest.onBeforeRequest` — 렌더러 요청 (`:87-97`)
2. 메인 프로세스 global `fetch` 래퍼 — §5의 undici 호출 지점 (`:99-122`)

허용목록에 없는 호스트는 호스트당 한 줄씩 stderr에 기록되고 차단됩니다 (`:36-45`). 로그는 256개 호스트에서 멈추지만(`:30,37`) **차단 자체에는 상한이 없습니다** — 로그가 끊겨도 요청은 계속 막힙니다. 루프백과 non-http 스킴은 항상 통과합니다 (`:47-71`).

**덮지 않는 것** (§0.2와 동일): 서브프로세스(`gh`/`glab`/에이전트 CLI), `node:https` 다운로더, 임베디드 브라우저의 `persist:` 파티션(`:9-13` — 그 슬롯은 인증서 게이트가 점유). ⚠️ Electron `net.fetch`/`net.request`가 `defaultSession`의 `webRequest` 리스너를 타는지는 테스트로 확인되지 않았습니다(`enterprise-network-guard.test.ts`는 렌더러 요청과 global fetch만 검증).

### 레벨 4 — 망 차원 (가장 견고)

서브프로세스 트래픽은 Electron 세션 밖이므로 방화벽/프록시 강제가 유일한 통제 수단입니다. 레벨 1 + 레벨 4 병행이 실질적인 완전형입니다.

### 레벨 5 — 빌드 설정

- 빌드 셸에 `ORCA_DISABLE_PUBLISH_TARGET=1` → `publish`가 `null`이 되어 업데이터 메타 미생성 (`config/electron-builder.config.cjs:405-407`, §3의 이중 방어). 빌드 업로드는 `--publish never`로 별도 처리.

---

## 8. 종결된 항목 및 남은 미검증(⚠️)

이전 판의 “미검증 5건” 중 **4건이 완전히 종결**되었고, 나머지 1건(Electron 기본 동작)은 맞춤법 사전만 종결되고 DNS-over-HTTPS·컴포넌트 업데이터가 남았습니다.

### ✅ 종결: Chromium 맞춤법 사전 다운로드 — 실재하며, 이제 차단됨

Electron은 `spellcheck`를 기본 켜며, **Windows/Linux에서 Chromium이 hunspell 사전을 Google CDN에서 내려받습니다** — 이 문장은 코드 주석에 그대로 있습니다(`src/main/window/createMainWindow.ts:252`). 주석은 macOS를 언급하지 않습니다(macOS가 OS 검사기를 쓴다는 것은 Electron 플랫폼 동작이며 이 저장소 코드로는 확인되지 않습니다). `disableSpellcheck`는 **자체 세션을 갖는 WebContents 5곳을 전부** 끕니다 — 메인 창(`:253`), `will-attach-webview` 게스트(`:425`, 게스트는 자체 세션이라 메인 창 설정이 안 미침 — `:424` 주석), 대시보드 팝아웃 창(`src/main/window/dashboard-popout-window.ts:176`), 오프스크린 브라우저 백엔드(`src/main/browser/offscreen-browser-backend.ts:45`), PDF 내보내기 WebContents(`src/main/lib/html-to-pdf.ts:46`). 한 곳이라도 켜져 있으면 그 세션이 hunspell 다운로드를 다시 무장시키기 때문입니다(`html-to-pdf.ts:45` 주석).

### ✅ 종결: 프로덕션 렌더러 CSP — **부재 확정**

`src/renderer/index.html`에는 CSP가 없습니다. 이전에 “electron-vite가 주입한다”고 적혀 있던 주석은 **거짓이었고 제거되었습니다**. 현재 주석은 사실대로 “어느 단계에서도 CSP는 주입되지 않으며, egress는 메인 프로세스의 `enterprise-network-guard.ts`에서 통제한다”고 명시합니다. 저장소 전체에서 `Content-Security-Policy`가 나오는 곳은 마크다운 내보내기 HTML 템플릿(`src/renderer/src/components/editor/markdown-export-html.ts:41`) 하나뿐이며, 이는 앱 렌더러와 무관합니다.

대체 통제 수단은 opt-in `enforceNetworkAllowlist`입니다. **덮는 것**: 렌더러의 모든 http(s) 요청(§6의 이미지 포함)과 메인 프로세스 global `fetch`. **덮지 않는 것**: 서브프로세스, `node:https`, 임베디드 브라우저 파티션 (§0.2·§7 레벨 3).

### ✅ 종결: SSH 릴레이의 원격 다운로드 — **npm install은 실재, ripgrep 다운로드는 사실무근**

- **실재**: 릴레이는 원격 호스트에서 `npm install`을 실행해 `node-pty`와 `@parcel/watcher`를 설치합니다 (`src/main/ssh/ssh-relay-deploy.ts:683-684,725,737`). 이 둘은 네이티브 애드온이라 esbuild 번들에 포함할 수 없습니다. Linux에서는 node-pty가 소스 컴파일되므로 C/C++ 툴체인까지 필요합니다(`:753-757`). **폐쇄망 원격 호스트에서는 최초 연결이 실패합니다** — 사내 npm 미러 또는 사전 설치가 필요합니다.
- **사실무근**: 릴레이가 ripgrep을 다운로드하지는 **않습니다.** `src/relay/fs-handler-install-rg.ts`는 배포판을 감지해 `sudo apt install ripgrep` 같은 **설치 안내 문자열만 생성**하며(`:11-45`), `:24`의 `github.com/BurntSushi/ripgrep` URL도 사용자에게 보여 주는 텍스트일 뿐 소켓을 열지 않습니다. rg가 없으면 git/readdir 폴백으로 degrade합니다(`fs-handler-git-fallback.ts`, `fs-handler-readdir-fallback.ts`).
- 릴레이 번들 자체는 SCP로 전송되며 다운로드하지 않습니다. 원격 Node가 없을 때도 안내 메시지만 냅니다(`src/main/ssh/ssh-remote-node-resolution.ts:301`).

### ✅ 종결: agent-browser 서브프로세스의 `process.env` 상속 — **전체 상속 확정**

`src/main/browser/agent-browser-bridge.ts:2670-2672` — `env: execOptions?.envOverrides ? { ...process.env, ...execOptions.envOverrides } : process.env`. **`process.env` 전체를 그대로 넘깁니다.** 이것이 이 브랜치가 잠금 설정을 환경변수에서 파일로 옮긴 이유를 그대로 뒷받침합니다 (§0.1).

### ✅ 종결: 로케일 카탈로그의 Google Translate — **빌드 스크립트 한정**

`config/scripts/bootstrap-locale-catalog.mjs:66`에서 `translate.googleapis.com/translate_a/single`을 호출합니다. 이는 **번역 카탈로그를 생성하는 개발용 스크립트**이며 앱 런타임 코드가 아닙니다(`src/` 아래 어디에도 이 호스트가 없음). 사내 배포 위험 아님.

### ⚠️ 남은 미검증

- **Chromium의 DNS-over-HTTPS 자동 업그레이드 / 컴포넌트 업데이터.** 이 브랜치는 어떤 관련 스위치도 걸지 않습니다 — `disable-features`에 들어가는 값은 `IntensiveWakeUpThrottling` 하나뿐이고(`src/main/startup/configure-process.ts:319-325`), 전체 `appendSwitch` 호출 10곳 어디에도 DoH/컴포넌트 관련 항목이 없습니다. **통제 수단이 없다는 것은 확인했으나, Electron 런타임이 실제로 DoH 프로브나 컴포넌트 업데이트 요청을 내는지는 패킷 캡처로 확인하지 못했습니다.** 배포 전 실측 권장.

---

## 부록: 확정 44건 요약

전체 원자료(호스트·파일·라인·차단 평가)는 조사 산출물에 있습니다. 여기서는 실제 외부 호출로 **확정된** 기능만 나열합니다.

git: GitHub REST/GraphQL·PR 백그라운드 폴링·아바타·star-nag / GitLab / Bitbucket / Azure DevOps / Gitea 폴백 / 일반 git fetch·push·clone / attribution 푸터.
이슈: Linear GraphQL·에이전트 write·첨부 signed URL / Jira REST / GitHub·GitLab 이슈 소스 / 본문 마크다운의 인라인 이미지·벤더 아바타.
AI: Claude 사용량(`api.anthropic.com`)·OAuth갱신(`platform.claude.com`) / Codex / Gemini / MiniMax / OpenCode / Grok / Kimi / 받아쓰기(OpenAI).
클라우드/업데이트: PostHog / 진단·크래시·피드백(`onorca.dev`) / electron-updater / 넛지·changelog / Orca Cloud 로그인 / 모바일 페어링 릴레이.
에셋: STT 모델(sherpa-onnx)·scrcpy(에뮬레이터) GitHub Releases 다운로드 / Google favicon·아바타 이미지 / SSH 릴레이의 원격 npm install.
