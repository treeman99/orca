# 외부 연동 감사 및 차단 계획 (사내 배포용)

기준: **v1.4.155** (브랜치 `enterprise/samsungds`).
목적: 사내(폐쇄망/보안) 환경에서 Orca를 배포할 때, 외부 인터넷으로 나가는 기능을 파악하고 필요 시 차단한다.

> **조사 방식**: 10개 카테고리를 병렬로 정적 분석(스윕) → 누락 항목 크리틱 → 항목별 적대적 검증(“실제로 소켓을 여는가 / 언제 발동하는가 / 끌 수 있는가”). 후보 103건 중 44건이 실제 외부 호출로 확정됐습니다.
>
> **⚠️ 표시는 미검증이거나 운영상 주의가 필요한 항목**입니다. 이 중 **코드로 확인하지 못한 것은 두 건뿐**입니다(§7 레벨 3의 `net.fetch` 경유 여부, §8의 컴포넌트 업데이터 실측). 나머지 ⚠️는 코드는 확인했으나 배포 시 조작이 필요한 항목입니다. 모든 `파일:라인` 인용은 **v1.4.155 리베이스 이후의 트리에서 해당 파일을 다시 열어** 확인했습니다. 이전 판에 있던 존재하지 않는 환경변수(`ORCA_DISABLE_UPDATES`)와 자기모순 서술은 제거했습니다.

---

## 0. 한눈에 보기 — 사내 배포 시 판단

| 분류 | 기본 상태 | 이 브랜치의 잠금 | 잔여 위험 |
| --- | --- | --- | --- |
| **정책 적용 자체 (배포 형태)** | 설치 프로그램이 기본 정책을 **내장**하므로 설치만으로 잠김 (§0.1) | ✅ 번들 정책 (`resources/enterprise-policy.json` → `<resourcesPath>`), `%ProgramData%` 배치는 이제 선택 | 🔴 per-user 설치라 설치 폴더가 사용자 소유 — 표준 사용자가 번들 파일을 지우면 그 PC는 풀립니다 (§0.2 #21) |
| **프록시 / 사설 CA** | Orca가 지원 (Electron 세션 한정) | — | 🔴 Node `fetch`/`node:https` 경로는 프록시를 안 탐 (§5) |
| **텔레메트리 / 진단 / 크래시** | opt-in(기본 꺼짐) + 공식 빌드에서만 전송 | ✅ `disableTelemetry` | 없음 (로컬 NDJSON 로깅은 유지, 망 밖으로 안 나감) |
| **자동 업데이트 / 넛지 (onorca.dev, github.com)** | 로그인 무관하게 나감 | ✅ `disableAutoUpdate` | 없음 (3개 진입점 전부 차단, §3) |
| **star-nag (github.com SaaS 고정)** | 랜딩·설정 화면 진입, 에이전트 완료, 온보딩 완료, 스폰 임계치에서 발동 | ✅ `disableStarNag` | 없음 (`gh` 호출 함수 자체에서 차단, §1) |
| **Orca Cloud 로그인 / 모바일 페어링 릴레이** | 로그인 안 하면 안 나감 | ✅ `disableCloudRelay` | **`disableCloudRelay`만으로는 모바일이 열려 있습니다** — 벤더 릴레이는 죽지만 LAN/Tailscale 페어링 QR은 정상 발급됩니다. `disableMobilePairing`으로 닫습니다 |
| **AI 벤더 사용량 폴링 (Claude/Codex/Grok/…)** | 🔴 **Orca 계정 연동과 무관 — 로컬 벤더 CLI 자격증명만 있으면 15분마다 폴링** | ✅ `disableUsagePolling` | 없음 (§4) |
| **Claude OAuth 토큰 회전 (platform.claude.com)** | Orca 관리 Claude 계정을 쓸 때만 | ✅ `disableManagedClaudeAccounts` | egress는 없음. 단 이 스위치는 **Bedrock 플릿에서 선택이 아니라 필수**입니다 — 끄면 WSL 세션이 관리형 계정 없이도 인증 env를 스트립하고, 런치 env에 `AWS_BEARER_TOKEN_BEDROCK` 등이 있으면 스폰이 하드 실패합니다 (§4) |
| **git 호스팅 (GitHub/GitLab/…)** | 사용자 열람 + 일부 자동 폴링 | ➖ `githubEnterpriseHost`는 **Gitea 폴백 오인만 차단**(호스트 전환도, 트래픽 차단도 아님) | `gh` 목적지는 여전히 `GH_HOST`/origin 리모트가 결정 (§1, §7 레벨 2) |
| **맞춤법 사전 다운로드 (Chromium)** | Windows/Linux에서 자동 | ✅ `disableSpellcheck` | 없음 (§8) |
| **DNS-over-HTTPS 자동 승격 (Chromium)** | 머신 리졸버가 알려진 DoH 제공자면 자동 | ✅ `lockdown` (OS 리졸버로 고정) | 없음 (§8). 개별 스위치 없이 `lockdown`에만 달려 있습니다 |
| **렌더러 외부 이미지 (Google favicon / 아바타 / 마크다운 인라인)** | 아이콘·본문 표시 시 자동 | ➖ `enforceNetworkAllowlist` opt-in 시에만 | 기본값은 차단 안 됨 (§6) |
| **서브프로세스 (gh/glab/git/에이전트 CLI)** | 사용자 조작 | ❌ Orca 측 통제 수단 없음 | 🔴 프록시·방화벽으로만 통제 (§0.2) |
| **플러그인 시스템 (v1.4.162 신규)** — 벤더 마켓플레이스 `git clone` + kill-list `fetch` | 사용자가 설정 → 플러그인을 켠 순간 (기본 꺼짐) | ✅ `disablePlugins` | **이 스위치가 없으면 통제 불가**였습니다 — clone은 `git` 자식 프로세스라 `enforceNetworkAllowlist`가 못 봅니다 (§0.2 #19) |
| **벤더 커뮤니티·문서 링크 (Discord, X, 공개 이슈 트래커, onorca.dev 문서)** | `?` 메뉴·피드백·에러 토스트 등에서 클릭 시 **기본 브라우저**로 나감 | ✅ `disableVendorLinks` | 표시 게이트를 못 단 설정 화면 링크 2곳이 **무반응 상태로 남습니다** (초크포인트가 막으므로 열리지는 않음, §0.2 #20) |
| **에셋 다운로드 — scrcpy 서버 jar** | 사용자가 Android 스트리밍을 켤 때만 | ✅ `lockdown` (직접 다운로드 거부 가드) | 없음 (§0.2 #9) |
| **에셋 다운로드 — STT(sherpa-onnx) 모델** | 사용자가 모델을 명시적으로 내려받을 때만 | ❌ 코드 차단 없음 | 기능 미사용 시 미발생 (§0.2 #10) |

**결론**: 이 브랜치의 정책 파일은 **벤더 SaaS로 나가는 Orca 자체 호출**(텔레메트리·업데이트·넛지·star-nag·클라우드·사용량 폴링·관리형 Claude 계정 OAuth 회전)을 코드 차원에서 차단합니다. 다만 **차단 범위는 Orca 프로세스가 직접 여는 소켓까지**입니다. 서브프로세스(`gh`/`glab`/`git`/에이전트 CLI), 렌더러 외부 이미지(기본값), SSH 릴레이의 원격 `npm install`, 그리고 STT 모델 다운로드는 정책 파일로 막히지 않습니다 — 이들은 §0.2의 잔여 위험 목록으로 관리하고 망 계층(프록시·방화벽)에서 통제해야 합니다. (`node:https` 다운로더 중 scrcpy jar 하나만 `lockdown`이 명시적으로 거부합니다 — §0.2 #9.)

### 0.1 ✅ 관리자 정책 파일 (`enterprise-policy.json`)

이 브랜치는 잠금 설정을 **환경변수가 아니라 관리자 소유 JSON 파일**로 관리합니다. 이유는 코드 주석에 그대로 있습니다 (`src/shared/enterprise-policy.ts:4-8`): Orca가 `env`에서 읽는 값은 **Orca가 스폰하는 모든 프로세스(에이전트 CLI, `gh`, `git`, 릴레이)에 그대로 상속**되고, 같은 머신의 무관한 도구까지 오염시킵니다. 실제로 agent-browser 서브프로세스는 `process.env` 전체를 상속합니다(`src/main/browser/agent-browser-bridge.ts:2670-2672`). 그래서 런타임 환경변수는 **딱 하나**만 둡니다.

#### 런타임 환경변수 (이 포크가 추가하는 것: 1개)

| 환경변수 | 값 | 패키징 빌드(배포된 `.exe`) | 비패키징(`pnpm dev`·vitest) |
| --- | --- | --- | --- |
| `ORCA_ENTERPRISE_POLICY` | 정책 파일 경로 (그대로 `readFileSync`에 넘어가므로 **절대경로 권장**) | 후보 목록에 **추가**만 됨 — 머신 전역 파일과 **번들 정책 뒤** 순위 (`enterprise-policy-file.ts:101-104`) | 이 값이 있으면 나머지는 아예 후보에 오르지 않습니다 (`:90-97`) |
| `ORCA_ENTERPRISE_POLICY` | `off` / `none` / `disabled` / `false` / `0` (`:36`) | **무시됨** — 머신 전역 또는 번들 정책이 그대로 적용 | 탐색 자체를 무효화. 테스트 스위트가 이 값을 씁니다 (`config/vitest-enterprise-policy-isolation.ts:6`) |

> 🔒 **패키징 빌드에서 환경변수가 정책을 이길 수 없다는 것은 보안 속성입니다.** Windows에서 표준 사용자는 관리자 권한 없이 자기 계정 환경변수를 만들 수 있으므로, 무조건 듣는 옵트아웃이었다면 사내 잠금이 `setx ORCA_ENTERPRISE_POLICY off` **한 줄로 우회**됩니다. 그래서 패키징 빌드에서는 이 변수가 후보를 추가만 하고 머신 전역 파일이나 번들 정책을 대체하거나 끄지 못합니다 (`enterprise-policy-file.ts:65-79` 주석, 분기 `:101-104`). 판정은 `app.isPackaged`로 합니다 — 표준 사용자가 조작할 수 없는 유일한 신호입니다 (`:191-197`). 옛 무조건 옵트아웃은 개발·테스트를 위해 **비패키징에서만** 남아 있습니다.
>
> **배포 결론**: 설치 프로그램의 번들 정책이 기본선이고, 값을 중앙에서 바꾸려면 머신 전역 기본 경로에 파일을 두고 ACL로 사용자 쓰기를 막으세요. 환경변수 커스텀 경로는 **개발·검증용이지 플릿 배포 수단이 아닙니다.**

이 포크가 **추가하지 않는** 것 중 여전히 유효한 값:

- `GH_HOST` — `gh` CLI 자신의 변수. `githubEnterpriseHost`가 비었을 때 폴백으로 읽습니다 (`src/shared/enterprise-policy.ts`).
- `GH_CONFIG_DIR` / `XDG_CONFIG_HOME` — `gh` CLI 자신의 변수. `GH_HOST`도 없을 때 **`gh`의 `hosts.yml` 위치**를 결정하고, 그 파일에 로그인된 호스트가 정확히 하나면 `githubEnterpriseHost`의 마지막 폴백이 됩니다 (`src/main/github/gh-config-host.ts`). 읽기 전용이며 이 포크가 설정하지 않습니다.
- `DO_NOT_TRACK`, `ORCA_TELEMETRY_DISABLED` — 업스트림 원래의 텔레메트리 킬스위치. 이 브랜치가 건드리지 않았습니다 (`src/main/telemetry/consent.ts:79,83`).
- `ORCA_DIAGNOSTICS_DISABLED` — 업스트림 변수. 위 둘보다 강해서 **로컬 NDJSON 기록까지** 끕니다 (`src/main/observability/index.ts:102,113-119`).

빌드 시점에만 쓰이는 값(이 포크가 추가한 `ORCA_WIN_PUBLISHER_NAME`(`config/electron-builder.config.cjs:207`)·`ORCA_DISABLE_PUBLISH_TARGET`(`:412`), 업스트림의 `ORCA_MAC_RELEASE`/`WIN_CSC_*`/`ORCA_POSTHOG_WRITE_KEY`/`ORCA_BUILD_IDENTITY`)은 **빌드 셸의 변수이며 앱 런타임 환경에는 들어가지 않습니다**. [윈도우 빌드 가이드](./windows-corporate-build.md) 참고.

#### 파일 탐색 순서 — **먼저 파싱에 성공한 파일이 이깁니다**

`src/main/enterprise/enterprise-policy-file.ts:80-105`

**패키징 빌드 — 플릿에서 유일하게 의미 있는 순서**

1. **머신 전역** — 이 배포의 대상인 **Windows: `%ProgramData%\Orca\enterprise-policy.json`** (`enterprise-policy-file.ts:55-57`). *(코드는 세 OS를 그대로 지원합니다 — macOS `/Library/Application Support/Orca/…`(`:59-61`), Linux `/etc/orca/…`(`:62`). 이 플릿에는 Mac이 없으므로 배포 대상은 Windows 경로뿐입니다.)*
2. **번들** — `<resourcesPath>/enterprise-policy.json` (`:199-207`). 설치 프로그램에 내장된 기본값이며, 저장소 원본은 `resources/enterprise-policy.json`, 실리는 지점은 `config/electron-builder.config.cjs`의 `commonExtraResources`(3 OS 공통)입니다.
3. `ORCA_ENTERPRISE_POLICY` 명시 경로 (무효화 값은 무시)
4. **사용자별**: `<userData>/enterprise-policy.json`

**비패키징(`pnpm dev`·vitest)** — `ORCA_ENTERPRISE_POLICY`가 1순위이고, 무효화 값으로 탐색 전체를 끌 수 있습니다. **번들 후보는 여기에 나타나지 않습니다** (`:101-102`) — 나타났다면 `config/vitest-enterprise-policy-isolation.ts`의 격리가 깨져 사내 빌드 머신의 테스트가 lockdown으로 돌았을 것입니다.

**2번이 3·4번보다 위인 것이 이 설계의 요점입니다.** 3번 아래였다면 표준 사용자가 `setx ORCA_ENTERPRISE_POLICY C:\Users\me\open.json` 한 줄로, 4번 아래였다면 `%APPDATA%\Orca\enterprise-policy.json`에 `{}` 하나로 사내 잠금을 통째로 풀 수 있습니다. 두 경로 모두 그 사용자가 쓸 수 있는 자리입니다. 1번을 위에 남긴 이유는 반대로, GPO/Intune으로 중앙에서 덮어쓰는 길을 막지 않기 위해서입니다.

머신 전역을 먼저 보는 것이 이 재설계의 핵심입니다 (`enterprise-policy-file.ts:9-11`). Windows에서 `setx`는 **사용자별** 상태를 씁니다 — 즉 같은 PC의 다른 프로필, 서비스 계정, 새로 만든 프로필은 전부 잠기지 않은 채로 남습니다. 반대 방향도 막혀 있습니다: 사용자별 파일은 머신 전역·번들 정책을 **완화할 수 없습니다**(먼저 파싱에 성공한 파일에서 탐색이 끝나므로).

> ✅ **해소됨 — 실기기에서 확인됐던 배포 격차.**
> 사내 테스트에서 "PC마다 모바일 항목이 보이기도 하고 안 보이기도 한다"는 증상의 **1차 원인은 정책 파일이 아예 배포되지 않은 것**이었습니다. 두 가지가 겹쳤습니다: ① 예전 `.exe` 인스톨러는 정책 파일을 싣지 않았고 GPO/SCCM/Intune 같은 별도 경로로 배포해야 했습니다. ② 1순위 경로 `C:\ProgramData\Orca\enterprise-policy.json`은 머신 전역이라 **per-user NSIS 인스톨러가 쓸 수 없습니다**(관리자 권한 없이 설치되므로). 따라서 앱만 설치한 PC는 정책 없이 = **업스트림 그대로** 동작했습니다.
>
> **지금은 위 2순위(번들)가 그 구멍을 메웁니다** — 설치 프로그램이 `resources/enterprise-policy.json`을 설치 폴더에 실어 나르고 앱이 `process.resourcesPath`에서 읽으므로, 아무 배포 작업을 하지 않은 PC도 잠긴 상태로 뜹니다. 다만 **`%ProgramData%` 배치가 무의미해진 것은 아닙니다** — 번들 파일은 사용자 소유 폴더에 있어 지울 수 있고(§0.2 #21), 중앙에서 값을 바꾸는 유일한 길도 1순위 경로입니다.
>
> **관리자 확인 방법**: 해당 PC의 `main.trace.ndjson`에서 `enterprise.policy` 스팬을 찾아 `enterprise.policy.source_path`를 봅니다. 잠긴 플릿에서 그 값이 `(none found)`이면 번들 파일까지 없어진 PC입니다 — 파일은 있는데 파싱에 실패한 경우와 구분됩니다(후자는 다음 후보의 경로가 찍히고 `…warnings`에 사유가 남습니다). 스팬 위치와 전체 속성 목록은 `docs/reference/enterprise-policy.md` §7-2를 보세요.

#### 스키마 (JSONC — `//` 주석과 후행 쉼표 허용)

파싱은 `jsonc-parser`로 하며(`enterprise-policy-file.ts:164-166`), **파싱 에러가 하나라도 있으면 그 파일을 통째로 거부**합니다 — 절반만 적용되는 상태를 만들지 않습니다(`:167-174`).

> ⚠️ 거부된 후보는 **다음 후보로 넘어갑니다**(`:173`) — 읽기 실패(ENOENT 외 권한/마운트 오류, `:152-158`)와 같은 처리입니다. 즉 GPO로 뿌린 파일에 오타가 있어도 아래의 번들 정책이 적용되므로 그 PC가 통째로 풀리지는 않습니다. **예전에는 여기서 탐색을 중단해 `lockdown`이 `false`가 되는 fail-open이었고, 그것이 번들 정책 도입과 함께 고쳐진 부분입니다.** 다만 관리자가 그 파일에 넣은 값(예외·엔드포인트·GHES 호스트)은 **조용히 사라진 채 잠긴 상태로** 돌게 되므로, stderr/트레이스의 `is not valid JSON; ignoring it.` 경고를 **배포 스크립트가 확인하도록** 하세요. 아래의 "인식할 수 없는 *값*은 lockdown을 상속" 규칙은 파일이 파싱에 성공한 뒤에만 적용됩니다.

| 키 | 타입 | 기본값 | 효과와 **구현 위치** |
| --- | --- | --- | --- |
| `lockdown` | boolean | `false` | 마스터 스위치. 아래 7개 스위치의 기본값이 됩니다 (`src/shared/enterprise-policy.ts:52-60`, `:196-200`) |
| `githubEnterpriseHost` | string | `GH_HOST` 폴백 | 해당 호스트를 Gitea 후보에서 제외 → 폴백 오인 방지 (`src/main/gitea/repository-ref.ts:87-98`) + 허용목록에 자동 추가 (`enterprise-policy.ts:204-207`). **`gh`의 대상 호스트는 바꾸지 않습니다** (§7 레벨 2) |
| `disableTelemetry` | boolean | = `lockdown` | PostHog 레인 (`src/main/telemetry/consent.ts:88`) **및** 진단/크래시 번들 업로드 (`src/main/observability/index.ts:103,120-133`). 로컬 NDJSON 로깅은 유지(`localFileEnabled: true`, `:130`) |
| `disableAutoUpdate` | boolean | = `lockdown` | `runBackgroundUpdateCheck()` (`src/main/updater.ts:1267,1273`) + `checkForUpdatesFromMenu()` (`:1342,1350`) + `quitAndInstall()` (`:1490`) + `setupAutoUpdater()` (`:1601,1644`) + `downloadUpdate()` (`:1769`). `setupAutoUpdater()`가 넛지 스케줄러(`:1572`)와 `powerMonitor` 리스너(`:1750`)의 무장 자체를 막습니다. v1.4.162의 macOS 로컬 빌드 교체 경로도 `checkForUpdatesFromMenu()` 게이트 뒤에 있습니다. v1.4.163의 릴리스 채널 빌드 선택기는 피드가 아닌 `api.github.com` REST를 쓰므로 별도 게이트가 `listReleaseBuilds()`(`src/main/updater-release-builds.ts`)에 있습니다 |
| `disableStarNag` | boolean | = `lockdown` | `checkOrcaStarred()` (`src/main/github/client.ts:233`) / `starOrca()` (`:419`) |
| `disableCloudRelay` | boolean | = `lockdown` | `getOrcaCloudAuthConfig()`가 "미구성"을 반환 (`src/main/orca-profiles/profile-cloud-auth-config.ts:73`) → 이 한 함수에 의존하는 클라우드 경로 전부(로그인·프로필 연결·조직 멤버 IPC 5종)가 죽고, 모바일 페어링 릴레이는 `configured`일 때만 생성되므로 아예 기동하지 않습니다 (`src/main/index.ts:2478-2479`). ⚠️ 릴레이가 없어도 LAN 전용 페어링은 계속 동작합니다 — 모바일 자체를 막는 건 `disableMobilePairing`입니다 |
| `disableUsagePolling` | boolean | = `lockdown` | `src/main/rate-limits/service.ts:760`의 술어를 `start()`(`:310`), `fetchAll`/`fetchCodexOnly`/`fetchClaudeOnly`/`fetchGrokOnly`(`:895,960,1022,1087`), 계정 스위처 프리뷰 2종(`:500,580`), Codex 리셋 크레딧 POST(`:428`)에서 검사 |
| `disableManagedClaudeAccounts` | boolean | = `lockdown` | Orca 관리형 Claude 계정. 게이트 3곳: `platform.claude.com` 회전 함수 진입부(`src/main/claude-accounts/oauth-refresh.ts:131-133`), 인증 준비에서 활성 계정을 `null`로 고정(`src/main/claude-accounts/runtime-auth-service.ts:613-616`), 환경 스트립 최후 방어선(`src/main/claude-accounts/environment.ts:22`) (§4) |
| `disableSpellcheck` | boolean | = `lockdown` | `webPreferences.spellcheck`를 끄는 지점 **5곳**: 메인 창(`src/main/window/createMainWindow.ts:299`), `will-attach-webview` 게스트(`:471`), 대시보드 팝아웃 창(`src/main/window/dashboard-popout-window.ts:176`), 오프스크린 브라우저 백엔드(`src/main/browser/offscreen-browser-backend.ts:45`), PDF 내보내기 WebContents(`src/main/lib/html-to-pdf.ts:46`) |
| `enforceNetworkAllowlist` | boolean | **`false`** (lockdown이어도) | 호스트 허용목록 하드 게이트 (`src/main/enterprise/enterprise-network-guard.ts`) |
| `allowedNetworkHosts` | string[] | `[]` + GHES 호스트 | 위 게이트가 켜졌을 때만 의미 있음 (`src/shared/enterprise-policy.ts:204-207`) |

동작 규칙:

- **개별 스위치가 마스터보다 우선합니다.** `"lockdown": true` + `"disableAutoUpdate": false` 조합으로 한 기능만 되살릴 수 있습니다.
- **인식할 수 없는 값은 “없음”으로 취급**되어 `lockdown`을 상속하며, 절대 “꺼짐”으로 읽지 않습니다 — 관리자 오타가 머신을 조용히 풀어버리는 것을 막기 위함입니다 (`src/shared/enterprise-policy.ts:80-106`). stderr에 경고를 냅니다.
- **모르는 키도 경고**를 냅니다 (`:190-194`).
- `enforceNetworkAllowlist`만 `lockdown` 상속에서 제외됩니다 (`:212-214`). 하드 허용목록은 기능 스위치와 달리 배포를 통째로 망가뜨릴 수 있어 관리자가 명시적으로 켜야 합니다.

정책은 프로세스당 한 번만 읽고 캐시합니다 (`enterprise-policy-file.ts:216-250`). 세션 도중 파일을 바꿔도 반영되지 않습니다 — 앱 재시작이 필요합니다.

예시 (`%ProgramData%\Orca\enterprise-policy.json`):

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
| `resources/enterprise-policy.json` | 설치 프로그램에 내장되는 기본 정책 (위 2순위 후보의 원본) |
| `config/scripts/verify-packaged-enterprise-policy.cjs` | `afterPack` 검사 — 번들 정책이 실제 산출물에 있고, JSONC로 파싱되며, `lockdown: true`인지. 아니면 패키징 실패 |

### 0.2 🔴 이 브랜치의 잠금이 덮지 **않는** 것 (잔여 위험 등록부)

보안 검토자는 이 표 하나로 경계선을 판단할 수 있어야 합니다. **정책 파일은 Orca 메인 프로세스가 직접 여는 소켓과 렌더러의 기본 세션까지만 통제합니다.**

| # | 나가는 트래픽 | 목적지 | 발동 조건 | 왜 잠금이 못 막나 | 확인 위치 |
| --- | --- | --- | --- | --- | --- |
| 1 | **서브프로세스 전체** (`gh`, `glab`, `git`, 에이전트 CLI, agent-browser) | 각 도구의 목적지 | 사용자 조작 / 에이전트 실행 | Electron 세션 밖에서 자체 소켓을 엽니다. `enforceNetworkAllowlist`는 `session.defaultSession`과 메인 프로세스 global `fetch`만 감쌉니다 | `enterprise-network-guard.ts:87-122` |
| 2 | **렌더러 외부 이미지 — 에이전트 카탈로그 아이콘** | `www.google.com/s2/favicons` | 에이전트 목록 표시 시 자동 | 기본값에는 게이트가 없습니다. `enforceNetworkAllowlist`를 켜야 막힙니다 | `src/renderer/src/lib/agent-catalog.tsx:390` |
| 3 | **렌더러 외부 이미지 — "다른 앱으로 열기" 아이콘** | `www.google.com/s2/favicons` | 앱 프리셋 표시 시 자동 | 동일 | `src/renderer/src/lib/open-in-app-catalog.tsx:66` |
| 4 | **렌더러 외부 이미지 — 저장소 아이콘 자동감지** | `www.google.com/s2/favicons` | 저장소 웹사이트 URL이 있을 때 | 동일 | `src/shared/repo-icon.ts:17-32` |
| 5 | **렌더러 외부 이미지 — GitHub 아바타** | `avatars.githubusercontent.com` 또는 **GHES 호스트** | PR/이슈/프로젝트 렌더 시 | 동일. 단 저장소 아이콘용 아바타는 GHES 호스트를 따라가므로(`repo-icon.ts:35-44`) 사내 호스트로만 나갈 수 있음 | `src/renderer/src/components/github/github-user-avatar.tsx:35,79` |
| 6 | **마크다운 본문의 인라인 이미지** (`variant="document"`) | 본문에 적힌 임의의 http(s) URL — GitHub/Jira 첨부 등 | PR·이슈·Jira 설명 본문 렌더 시 | 동일. `document` 변형만 원격 `src`를 그대로 `<img>`로 로드합니다 | `src/renderer/src/components/sidebar/comment-markdown-element-renderers.tsx:258,274` / 호출측 `JiraIssueWorkspace.tsx:674-676` |
| 6b | **Linear/Jira 사용자 아바타** | 각 벤더 아바타 CDN | 이슈·코멘트 목록 렌더 시 | 동일 (렌더러 `<img>`) | `src/renderer/src/components/LinearIssueWorkspace.tsx:101`, `JiraIssueWorkspace.tsx:591,740` |
| 7 | **SSH 릴레이의 원격 `npm install`** | 원격 호스트의 npm 레지스트리 (기본 `registry.npmjs.org`) | 원격 호스트 최초 연결 시 | 릴레이 번들은 SCP로 보내지만 `node-pty`/`@parcel/watcher`는 네이티브 애드온이라 **원격에서 설치**합니다. 정책 파일은 원격 머신에 없습니다 | `src/main/ssh/ssh-relay-deploy.ts:743-744,725,737` |
| 8 | **Node `fetch` / `node:https` 프록시 우회** | 아래 §5 목록 | 해당 기능 사용 시 | `proxy-settings.ts`는 **Electron 세션에만** 프록시를 겁니다 | `src/main/network/proxy-settings.ts:41-79` |
| ~~9~~ | ~~**scrcpy 서버 jar 다운로드**~~ | ~~`github.com/Genymobile/scrcpy/releases`~~ | — | **해소됨**: `node:https`를 직접 쓰는 것은 맞지만, 다운로드 직전에 `lockdown`(또는 허용목록 밖 호스트)이면 거부하고 `EmulatorError`를 던집니다. 관리자가 미리 배치한 jar은 그대로 씁니다 | 가드 `src/main/enterprise/enterprise-direct-download-guard.ts:17-32`, 적용부 `src/main/emulator/android/scrcpy-server-download.ts:42-46` |
| 10 | **STT(sherpa-onnx) 모델 다운로드** | `huggingface.co/<repo>/resolve/<revision>` (v1.4.159에서 GitHub Releases → Hugging Face로 이전) | 사용자가 로컬 받아쓰기 모델을 명시적으로 내려받을 때 | ✅ `disableVoice` — `getSpeechModelManager()`가 정책 확인 후 던지므로 `ModelManager` 자체가 생성되지 않습니다 (`src/main/speech/speech-runtime-service.ts`). 스위치를 끄면 여전히 가드가 없고, Electron `net.request`를 쓰므로 §5 프록시는 탑니다 | `src/main/speech/model-download-catalog.ts:12`(URL 조립), `model-manager.ts:2,778`(`net.request`) (가드 미사용) |
| ~~11~~ | ~~**Claude OAuth 토큰 회전**~~ | ~~`platform.claude.com`~~ | — | **해소됨**: `disableManagedClaudeAccounts`가 덮습니다 (§4). 이전 판의 "정책 스위치 없음"은 더 이상 사실이 아닙니다 | 게이트 `src/main/claude-accounts/oauth-refresh.ts:131-133` |
| 12 | **임베디드 브라우저** | 사용자가 방문하는 임의의 사이트 | 사용자 조작 | 허용목록은 `persist:` 파티션을 의도적으로 제외합니다 — 그 슬롯은 인증서 게이트가 이미 점유 중이고, 임의 사이트 열람이 이 기능의 목적이기 때문 | `enterprise-network-guard.ts:9-13` |
| 13 | **Gitea/Forgejo 폴백 직접 fetch** | origin 리모트에서 동적 유도된 호스트 | 미지정 git 호스트를 쓸 때 | `githubEnterpriseHost`를 지정하면 GHES는 제외되지만, **그 외 모든 미지정 호스트는 여전히 Gitea로 간주**됩니다 (§1) | `src/main/gitea/repository-ref.ts:87-98`, `client.ts:91` |
| 14 | **사내 LLM 엔드포인트로 가는 프롬프트·소스** | 관리자가 정책 파일에 배포한 사내 호스트 **또는 사용자가 설정에서 직접 추가한 임의의 https 호스트** | 사용자가 세션을 그 엔드포인트로 돌리고 토큰을 저장했을 때. **관리자 배포만이 아닙니다** — 설정 → AI 제공업체 계정 → "사내 자체 호스팅 모델"의 Add 폼(`corporateLlmEndpoints:addUserEndpoint`, 정책 확인 없음)으로 사용자가 URL·프로토콜·자기 토큰을 직접 등록하면 정책 엔드포인트와 **동일하게** 모델 피커에 오르고 스폰 시 env로 주입됩니다 | 목적지가 사내이든 아니든 **전송 주체가 에이전트 CLI(서브프로세스)** 라 Orca 측 통제 밖입니다(#1). 정책 파일은 전송 내용을 통제하지 않으므로 감사는 엔드포인트 서비스 쪽에서 해야 합니다 (§4). 🔴 **사용자 레인을 덮는 스위치가 없습니다** — `llmEndpoints`는 관리자 목록(데이터)일 뿐이고, `LOCKDOWN_INHERITING_KEYS` 17개 중 이 레인을 끄는 키가 없으며, 사용자 엔드포인트 저장소와 그 IPC 어디에도 `getEnterprisePolicy()` 호출이 없습니다. 인접 스위치도 명시적으로 비켜갑니다(`disableVendorProviderAccounts` 헤더: "corporate self-hosted endpoints … are never gated here"). 게다가 **정책 엔드포인트 호스트만** `allowedNetworkHosts`에 자동 추가되고 사용자 엔드포인트는 추가되지 않으며, Orca가 그 호스트를 자식 프로세스의 `NO_PROXY`에 병합하므로 **사내 프록시 가시성까지 함께 걷힙니다**. ⚠️ **권한 상승은 아닙니다**: 같은 사용자는 셸 rc나 설정 → 에이전트의 per-agent 환경변수로 `ANTHROPIC_BASE_URL`을 직접 넣어 같은 리다이렉션을 만들 수 있고(#1), 노출되는 토큰도 본인이 입력한 자기 토큰입니다 — 즉 새로 생긴 유출 경로가 아니라 **Orca가 공식 UI로 제공하고 잠금이 덮지 않는 레인**입니다. **부수**: 사용자 엔드포인트 파일은 **쓰기 시점에만** https가 검증되고 읽기 시점에는 `id`/`baseUrl`이 문자열인지만 봅니다 — 프로파일의 `corporate-llm-user-endpoints.json`을 손으로 고치면 `http://` 항목이 목록에 올라옵니다. 이것도 같은 사용자만 할 수 있어 새 경로는 아니지만, 파일 헤더 주석이 코드가 보장하는 것보다 강하게 쓰여 있습니다. 스위치를 만든다면 축은 "http 금지"가 아니라 "사용자가 엔드포인트를 추가할 수 있는가"(예: `disableUserLlmEndpoints`)이고, 초크포인트는 `getAllCorporateLlmEndpoints()`의 사용자 레인 한 곳입니다 | 주입·`NO_PROXY` `src/shared/corporate-llm-launch-env.ts:49-72`, 사용자 레인 `src/main/enterprise/corporate-llm-user-endpoints.ts:29-35`(읽기 재검증 없음)·`:64-75`(쓰기 검증), 병합 `corporate-llm-endpoint-registry.ts:11-18`, IPC `src/main/ipc/corporate-llm-endpoints.ts:167-170`, 허용목록 자동 추가는 정책 전용 `src/shared/enterprise-policy.ts:370-378` |

| 15 | **외부 자동화 CLI를 스케줄로 실행** (`hermes`, `openclaw`) | 해당 벤더가 정한 목적지 (Orca는 목적지를 모릅니다) | 자동화 페이지에서 외부 잡을 만들거나, 이미 등록된 잡의 크론 시각이 되었을 때 | ✅ `disableExternalAutomations`(또는 `allowedAgents`)가 **Orca 쪽 진입점**(발견·생성·수정·실행)을 전부 거부합니다 (`src/main/automations/external-manager.ts`). 🔴 **잔여**: Orca는 스케줄러가 아니라 조작 UI일 뿐이므로, 이미 `~/.hermes/cron`에 등록된 잡은 **Hermes 자신의 스케줄러로 계속 실행됩니다** — Orca를 잠근 뒤에도 남아 있는 잡은 `hermes cron rm`으로 직접 제거해야 하고, 잠근 뒤에는 앱 안에서 그 목록을 볼 수 없습니다. 로컬 읽기(`~/.hermes/cron/jobs.json`, `state.db`, 출력 마크다운)와 SSH 호스트별 릴레이 레인도 같은 게이트로 함께 닫힙니다 | 게이트 `external-manager.ts`의 `isExternalAutomationProviderAllowed`, 릴레이 레인 `src/relay/external-automations-handler.ts` |
| 16 | **사용량 통계를 X(구 Twitter)로 공유** | `x.com/intent/post` (사용자의 **기본 브라우저**로 열림) | 설정 → 통계 및 사용량에서 공유 버튼을 눌렀을 때 | ✅ **이중 차단**: `disableUsagePolling`이 그 팬을 없애 도달 불가로 만들고, `disableVendorLinks`가 버튼 자체를 숨기는 동시에 메인 프로세스 초크포인트에서 URL을 거부합니다 — 둘 중 하나만 켠 플릿에서도 닫힙니다. 기본 브라우저로 나가므로 `enforceNetworkAllowlist`가 **원리적으로 볼 수 없다는 점은 그대로**이고, 그래서 판정이 링크를 여는 시점(`shell:openUrl`)에 있어야 했습니다 | `ShareUsageButton.tsx`, 초크포인트 `src/main/ipc/shell-open-url.ts`, 규칙표 `src/main/enterprise/enterprise-vendor-link-guard.ts` |
| 17 | **에이전트 벤더 홈페이지 링크** | 각 에이전트 CLI의 홈페이지 | 설정 → 에이전트 / 온보딩에서 링크 클릭 | ✅ `disableAgentInstallSuggestions`가 "설치 가능" 목록과 온보딩 설치 안내를 없애 링크 수를 크게 줄입니다. 🔴 **잔여**: Orca가 에이전트 CLI를 직접 내려받는 코드는 없고 링크만 열지만, **감지된** 에이전트 행의 링크는 `Docs`로 남아 그대로 클릭 가능합니다. ⚠️ `disableVendorLinks`는 **이것을 막지 않습니다 — 의도적입니다**: 그 규칙표는 Orca가 스스로 광고하는 벤더 목적지(Discord/X/`github.com/stablyai`/`onorca.dev`)만 판정하고, 플릿이 실제로 실행하는 제3자 도구의 홈페이지(`cli.github.com` 등)는 정당한 도움말로 남깁니다. `npx skills add`(`src/shared/agent-feature-install-commands.ts`)는 별개 레인이고 어느 스위치도 덮지 않습니다 | `AgentsPane.tsx`(행의 `<a href>`), `src/main/window/privileged-window-navigation.ts` |
| 18 | **렌더러 게이트가 보이지 않는 클라이언트** | — (도달 범위 문제) | `pnpm dev:web`, `orca serve`의 브라우저 클라이언트 | 웹 preload에는 `enterprisePolicy` API가 **없어서** 정책 뷰가 항상 "제한 없음"으로 떨어집니다. `disableVoice`·`disableMobilePairing`·`disableRemoteOrcaServer`·`disableUsagePolling` 등 **표시 게이트 전부**가 그 클라이언트에서는 무효입니다 — 그래서 메인 쪽 거부(에이전트 탐지 필터, 에뮬레이터 RPC 거부, 외부 자동화 거부)가 belt-and-braces가 아니라 **유일한 방어선**입니다 | `src/renderer/src/web/web-preload-api.ts`(해당 키 없음), `src/renderer/src/enterprise/enterprise-policy-access.ts` |
| 19 | **플러그인 시스템** — 벤더 마켓플레이스 인덱스 `git clone` / 벤더 kill-list `fetch` / 플러그인 워커의 자체 트래픽 | `github.com/stablyai/orca-plugins.git`, `onorca.dev/plugins/kill-list.json`, 사용자가 등록한 임의 Git URL, 워커 코드가 여는 임의 목적지 | 사용자가 설정 → 플러그인을 켠 순간(첫 활성화 시 clone + fetch, 이후 패키지 빌드 매 시작마다 kill-list 갱신). 주기 폴링은 없음 | ✅ **해소됨**: `disablePlugins`가 네 겹으로 덮습니다 — 기능 플래그 대체(`isPluginSystemAllowed`), egress 초크포인트 `runPluginGit()`, `fetchPluginKillList()`, IPC/RPC 미등록. **egress 게이트가 별도로 필요한 이유**: `plugins:install`과 `plugins:refreshMarketplaces`는 기능 플래그를 보지 않고 Git에 도달하고, 그 clone은 자식 프로세스라 #1과 같은 사각지대에 있습니다. 🔴 **잔여**: `disablePlugins: false`로 되돌린 플릿에서는 플러그인 워커(평범한 자식 프로세스)의 트래픽을 어떤 Orca 측 스위치로도 못 막습니다 — 동의 다이얼로그가 이 사실을 사용자에게 명시합니다. 반면 **플러그인 패널은 CSP로 봉인**돼 있습니다(`default-src 'none'; connect-src 'none'; img-src data:`, `src/shared/plugins/plugin-panel-shell.ts:21-22`) 그리고 워커 환경변수는 화이트리스트 17개로 토큰을 상속하지 않습니다(`plugin-worker-env.ts`) | 게이트 `src/main/plugins/plugin-system-policy.ts`, `plugin-git-repository.ts:18`, `plugin-kill-list-service.ts:104`, `src/main/ipc/register-core-handlers.ts:203`, `src/main/index.ts:2447` |

| 20 | **벤더 커뮤니티·문서 링크** (`?` 메뉴의 Discord/X/Docs/Changelog/GitHub, 피드백 다이얼로그, 터미널 에러 토스트의 "file an issue", 프로젝트 뷰의 기능 요청, 첫 실행 배너의 개인정보 처리방침, 피처월 문서 링크) | `discord.gg`, `x.com/orca_build`, `x.com/intent/*`, `github.com/stablyai/*`, `onorca.dev` — 전부 사용자의 **기본 브라우저**로 열림 | 사용자가 해당 항목을 클릭할 때 | ✅ `disableVendorLinks`. 표시 게이트(JSX)와 **메인 프로세스 초크포인트 2곳**(`shell:openUrl` IPC 전체 + `setWindowOpenHandler`/`will-navigate`)을 함께 둡니다 — 후자가 없으면 #18의 웹 클라이언트에서 아무 방어가 없고, 생 `<a href>`는 IPC를 타지 않기 때문입니다. **그 2곳은 "OS 브라우저로 나가는" 레인만 덮습니다** — 판정 함수 `isEnterpriseBlockedVendorLink`의 호출부는 저장소 전체에서 정확히 그 둘입니다. **이것은 egress 차단이 아니라 유출·오지시 차단입니다**: 목적지가 OS 브라우저라 `enforceNetworkAllowlist`가 원리적으로 볼 수 없고, 위험은 트래픽 자체가 아니라 사용자가 공개 채널에 사내 맥락을 적는 것과 이 플릿에 맞지 않는 문서를 읽는 것입니다. 🔴 **잔여 4건**: ① **설정 → Privacy의 "Privacy policy"와 설정 → 일반의 GitHub 링크는 화면에 그대로 남습니다** — 초크포인트가 막으므로 눌러도 아무 일도 일어나지 않지만, 무반응 링크는 그 자체로 결함입니다(표시 게이트 미적용). ② **웹 필터가 아닙니다 — 의도된 범위입니다**(가드 헤더와 정책 타입 주석이 "Not a web filter"라고 못 박습니다). 내장 브라우저 주소창 직접 입력과 PR 본문 링크뿐 아니라, **사용자 설정 `openLinksInApp`이 켜진 플릿에서는 터미널 출력·마크다운 프리뷰·체크 패널에서 클릭한 벤더 링크도 `shell:openUrl` 대신 인앱 브라우저 탭으로 열려 두 초크포인트를 지나지 않습니다.** 기본값은 `false`이지만 첫 터미널 링크 클릭 시 뜨는 라우팅 다이얼로그의 autoFocus 기본 버튼이 "Open in Orca"라 사용자의 한 번의 선택으로 영구 전환됩니다. 목적지가 임베디드 브라우저라 #12의 의도된 예외와 같은 자리이지만, **이 스위치의 실효 범위가 정책 파일이 아니라 사용자 설정에 좌우된다**는 사실은 적어 둘 값이 있습니다. ③ 업데이터가 `net.fetch`로 가는 `github.com/stablyai/orca/releases`와 `onorca.dev` 넛지는 **이 스위치가 아니라 `disableAutoUpdate`**의 몫입니다(초크포인트는 OS 브라우저 레인에만 있습니다). ④ **정책을 보지 않는 세 번째 `shell.openExternal`이 있습니다** — 내장 브라우저 게스트의 `setWindowOpenHandler`(`browser-manager.ts:782`). 사용자가 이미 연 페이지의 **스크립트 팝업**(클릭 앵커가 아닌 `window.open`)이, 그 게스트가 브라우저 탭에 아직 또는 더 이상 등록되지 않은 좁은 상태(`browserTabId === null`)에서만 이 분기로 떨어집니다. 정상 등록 상태에서는 같은 URL이 OS 브라우저가 아니라 Orca 내부 origin-bar 팝업 창으로 열립니다. **Orca가 스스로 광고하는 벤더 링크는 이 레인을 하나도 지나가지 않으므로 통제 실패가 아니라 레인 일관성 문제**이지만, `grep shell.openExternal`을 돌리는 검토자가 반드시 마주치므로 "초크포인트 2곳"이라는 표현과 함께 여기 적어 둡니다(닫으려면 1줄 — 그 파일은 이미 `getEnterprisePolicy`를 import합니다) | 규칙표 `src/main/enterprise/enterprise-vendor-link-guard.ts`, 초크포인트 `src/main/ipc/shell-open-url.ts:28`·`src/main/window/privileged-window-navigation.ts:9`, 잔여 ① `settings/PrivacyPane.tsx:107`·`settings/GeneralSupportSection.tsx:62`, ② `src/renderer/src/lib/http-link-routing.ts:107-133`·`src/shared/constants.ts:264`·`link-routing-preference-dialog.tsx:234`, ④ `src/main/browser/browser-manager.ts:743-786` |

| 21 | **번들 정책 파일 자체의 변조·삭제** (egress가 아니라 **잠금의 무결성** 항목입니다) | — (로컬 파일) | 사용자가 설치 폴더의 `enterprise-policy.json`을 지우거나 내용을 바꿀 때 | 🔴 **막지 못합니다.** `nsis` 블록이 `perMachine`을 설정하지 않아 electron-builder 기본값인 **per-user 원클릭 설치**가 적용되고, 설치 위치가 `%LOCALAPPDATA%\Programs\…` — 즉 **그 사용자가 소유한 폴더**입니다. 표준 사용자가 관리자 권한 없이 그 안의 번들 정책을 삭제하거나 `{}`로 덮어쓸 수 있고, 그러면 그 PC는 다음 후보로 내려가 (`%ProgramData%` 파일도 없다면) **업스트림 그대로** 동작합니다. 코드로 닫을 수 있는 구멍이 아닙니다 — 정책 파일을 읽는 프로세스가 그 파일과 같은 신뢰 경계 안에 있기 때문입니다. **대응은 둘뿐입니다**: ① `%ProgramData%\Orca\enterprise-policy.json`에 ACL을 건 파일을 배포하면(§0.1 1순위) 번들이 지워져도 잠금이 남습니다 — 이 경우 GPO 배치는 여전히 필요합니다. ② `nsis.perMachine: true`로 전환해 설치 폴더를 관리자 소유로 만듭니다(설치에 관리자 권한이 필요해지므로 배포 채널이 바뀝니다). **탐지**: 잠긴 플릿의 `main.trace.ndjson`에서 `enterprise.policy.source_path`가 `(none found)`인 PC | `config/electron-builder.config.cjs`의 `nsis` 블록(`perMachine` 미설정), 후보 순서 `enterprise-policy-file.ts:101-104` |

| 22 | **인바운드 runtime-scope 페어링 토큰 발급** (상시 WebSocket 리스너 + `mobile:getRuntimePairingUrl` IPC) | — (나가는 트래픽이 아니라 **들어오는 접속을 여는** 항목입니다). 발급된 베어러 토큰은 이 PC의 `0.0.0.0:6768`(dev 6769, STA-1511 폴백 포트 포함)에 도달할 수 있는 기기에 **모바일 허용목록이 아니라 전체 RPC 표면**(`terminal.create`·`terminal.send` 포함)을 엽니다 | 데스크톱은 정책과 무관하게 리스너를 띄우고 이 IPC를 등록합니다. 완전 잠금 플릿에서 **GUI 생성 경로는 사라지지만**(생성·조회 UI가 `disableRemoteOrcaServer`로 언마운트되는 Remote Orca Servers 패널 안에 있음) 보기 메뉴의 개발자 도구(패키지 빌드에도 있는 `role: 'toggleDevTools'`) 콘솔에서 `window.api.mobile.getRuntimePairingUrl()` 한 줄이면 페어링 URL·웹 클라이언트 URL·엔드포인트가 반환됩니다 — 관리자 권한도 정책 파일 변조(#21)도 필요 없습니다. `disableMobilePairing`만 켜고 `disableRemoteOrcaServer`를 끈 **부분 잠금** 플릿에서는 그 패널이 살아 있어 GUI 클릭만으로 발급됩니다. `orca serve`는 `--no-pairing`이 없으면 기동 시 기본으로 runtime 오퍼를 만들어 readiness 출력에 싣습니다 | 🔴 **이 레인을 소유하는 스위치가 없습니다 — 게이트를 빠뜨린 것이 아니라 애초에 없는 것입니다.** 집행 지점 세 곳(오퍼 생성 거부, 요청별 거부, 메서드 허용목록)이 전부 `scope === 'mobile'` 조건이라 `disableMobilePairing`은 QR·폰 레인만 덮습니다. `disableRemoteOrcaServer`는 가드 헤더가 "OUTBOUND 전용 … 인바운드 `orca serve` 리스너는 별개 레인이고 의도적으로 건드리지 않는다"고 **소유권을 명시적으로 부인**하므로, 이것은 그 스위치가 커버한다고 주장한 적 없는 **범위(scope) 진술**입니다. 이 포크 자신의 행동 테스트도 "잠금에서도 runtime 오퍼는 계속 발급된다"를 계약으로 못 박고 있습니다 — CLI와 데스크톱 웹 클라이언트가 그 스코프로 붙기 때문입니다. **정직한 경계**: egress 통제 실패가 아니고, 실제 LAN 도달 여부는 호스트 방화벽에 달려 있습니다(Windows 인바운드 규칙 `Orca.MobilePairing`을 추가해 주는 헬퍼는 `disableMobilePairing`이 등록조차 하지 않습니다). **부수 결함**: 잠금에서도 발급·조회(`mobile:listRuntimeAccessGrants`)·취소(`mobile:revokeRuntimeAccess`) IPC는 모두 살아 있는데 이를 보여 주는 유일한 UI가 `servers` 섹션과 함께 사라져 **앱 안에서 발급된 토큰을 목록으로 보거나 취소할 수 없습니다.** 닫으려면 새 opt-in 스위치(예: `disableInboundRuntimePairing`, `enforceNetworkAllowlist`처럼 **`lockdown` 비상속** — 상속시키면 `orca serve` 헤드리스 배포와 위 계약이 함께 깨집니다)를 `createPairingOffer()`에 걸거나, 망 계층에서 그 포트를 막아야 합니다(#1·#7과 같은 답) | 무조건 등록 `src/main/ipc/mobile.ts:176-204`(`scope: 'runtime'`), 모바일 한정 게이트 `src/main/runtime/runtime-rpc.ts:683`·`:1420`·`:1426`, 리스너 `runtime-rpc.ts:1139-1152`(`host: '0.0.0.0'`)·`src/main/index.ts:2760`(`enableWebSocket: true`), `orca serve` 오퍼 `src/main/index.ts:1774-1784`, 스코프 선언 `src/main/enterprise/remote-orca-server-guard.ts:3-9`, 계약 테스트 `src/main/runtime/mobile-pairing-enterprise-policy.test.ts:100-107`, 전권 확인 `src/main/runtime/runtime-rpc.test.ts:3465`, 표시 게이트 `settings/Settings.tsx:1664` → `RuntimeEnvironmentsPane.tsx:1351` |

| 23 | **GitHub 레이트리밋 스냅샷 프로브** (`gh api rate_limit --hostname github.com`) | `api.github.com` — origin에서 유도하는 것이 아니라 **Orca 코드가 문자열로 고정**합니다 | 사이드바 워크트리 행의 **백그라운드** PR/CI 갱신에서, 그 저장소의 GitHub 신원이 확정되지 않았을 때(`getOriginGitHubApiRepository()`가 `null`) 자동으로 나갑니다. 즉 ① 사내 GHES에 `gh auth login`이 안 된 PC(§1 주의 1이 경고하는 바로 그 상태), ② 사내 GitLab·Gerrit·일반 git 서버 저장소, ③ origin 리모트가 없는 로컬 저장소나 폴더 워크스페이스. 후보 검증(`validateCandidate`)은 저장소가 GitHub인지 보지 않습니다. 빈도는 30초 캐시(실패도 30초 네거티브 캐시)가 상한 | 🔴 **스위치가 없습니다.** 신원 미확정(`repository === null`)을 github.com으로 읽는 `spendsSharedGitHubComQuota` 술어가 원인이고(`isDefaultGitHubHost(undefined) === true`), `src/main/github/`에서 정책을 읽는 곳은 `disableStarNag` 두 군데뿐입니다. `githubEnterpriseHost`는 트래픽 스위치가 아니며(§7 레벨 2), 여기서는 호스트가 코드에 고정돼 `GH_HOST`로도 우회되지 않습니다 — 그 고정은 프로세스 전역 `GH_HOST` 무력화를 **의도한** 것입니다. `gh`는 자식 프로세스라 `enforceNetworkAllowlist`가 원리적으로 못 봅니다(#1). **#1과 다른 점**은 목적지를 Orca가 고정하고 사용자 조작 없이 자동으로 나간다는 것이라 #1의 "각 도구의 목적지 / 사용자 조작" 서술로는 덮이지 않습니다. **정직한 경계**: 페이로드는 예산 수치뿐이고 저장소 정보는 실리지 않습니다. 다만 그 PC에 github.com 자격증명이 있으면 사용자의 토큰이 실린 인증 요청으로, 없으면 익명 요청으로 나갑니다. **의도된 범위가 아닙니다** — 같은 술어의 헤더 주석이 "이 스냅샷은 네이티브 github.com만 덮고 GHES·WSL은 스코프 브레이커가 보호한다"고 설계 의도를 밝히고 있고, 같은 술어를 쓰는 다른 호출부는 `null`을 술어 앞에서 걸러냅니다. **업스트림 결함이며 이 포크가 만든 것이 아닙니다.** 초크포인트는 `fetchRateLimitSnapshot()` 한 곳 — `githubEnterpriseHost`가 설정된 플릿이면 스폰하지 않고 실패-오픈(`{ ok: false }`)시키면 IPC·RPC·코디네이터·브레이커 네 경로가 함께 닫힙니다(게이트를 IPC에 두면 안 됩니다 — 살아 있는 경로는 IPC가 아닙니다) | 고정 `src/main/github/rate-limit.ts:298-306`, 술어 `rate-limit.ts:129-141` + `src/shared/github-repository-identity-key.ts:4-6`, 살아 있는 자동 경로 `src/main/github/pr-refresh-coordinator.ts:741-750`, 대조군(정상 처리) `src/main/github/client.ts:229-235`. `gh:rateLimit` IPC(`src/main/ipc/github.ts:1194`)와 원격 RPC(`src/main/runtime/rpc/methods/github.ts:343`)는 이 포크가 API Budget 팬을 지운 뒤 **렌더러 소비자가 없는 죽은 레인**이지만 게이트도 없어, 리베이스가 팬을 되살리면 조용히 부활합니다 |

**#2~#6b는 `enforceNetworkAllowlist: true`로 닫을 수 있습니다** — 메인 창은 파티션을 지정하지 않아 `session.defaultSession`을 쓰므로 렌더러 `<img>` 요청이 가드의 `onBeforeRequest`를 지나갑니다 (`createMainWindow.ts:295-301`에 `partition` 없음). #1, #7, #23은 어떤 Orca 측 스위치로도 닫히지 않으며 망 계층에서만 통제됩니다 — #23은 `gh` 자식 프로세스라 #1과 같은 사각지대이고, 유일한 코드 통제는 `fetchRateLimitSnapshot()` 한 곳에 게이트를 다는 것입니다. #22는 나가는 트래픽이 아니라 **들어오는 접속**을 여는 항목이라 허용목록의 대상이 아니며, 이 레인을 소유하는 스위치가 없으므로 통제는 망 계층(`6768`/dev `6769` 및 폴백 포트의 인바운드 차단)뿐입니다. #21은 네트워크 항목이 아니라 잠금 자체의 무결성 항목이며, 코드가 아니라 배포 형태(ACL 또는 perMachine 설치)로만 닫힙니다. #10은 Electron `net.request`를 쓰므로 허용목록이 덮는지 여부가 §7 레벨 3의 미검증 항목과 같습니다.

**#14·#20·#22·#23은 v1.4.167 머지가 만든 것이 아닙니다.** 네 항목 모두 머지 직전 커밋(`db999ab975`)에 이미 존재하며, 사용자 LLM 엔드포인트 레인(#14)을 뺀 셋은 업스트림 `v1.4.163`에도 그대로 있습니다. #14의 사용자 레인만 이 포크가 `0b6d420f35`에서 추가한 것이고, 그것도 머지 이전입니다.

---

## 1. Git 호스팅 (GitHub / GitLab / Bitbucket / Azure DevOps / Gitea)

### GitHub — `gh` CLI 서브프로세스 (직접 fetch 아님)

- **호스트**: `api.github.com`, `github.com`, 설정 시 사내 GHES(`github.samsungds.net`)
- **발동**: 대부분 사용자 조작(PR/이슈 열람). **일부 자동**: 사이드바에 보이는 워크트리 행의 PR/CI 백그라운드 갱신, 그리고 star-nag. star-nag 서비스는 부팅 시 기동하지만(`src/main/index.ts:2208-2209`) `start()`는 스폰 카운터 리스너만 등록할 뿐 즉시 네트워크를 쓰지 않습니다(`src/main/star-nag/service.ts:65-70`) — 실제 `gh` 호출 시점은 아래 4개 경로입니다.
- **전송**: repo owner/name, 브랜치, 커밋 SHA, PR/이슈 번호·제목·본문, 리뷰 코멘트, CI 로그. 인증 토큰은 `gh`가 보관하고 **Orca 프로세스를 통과하지 않음** (긍정적).
- **GHES 지원**: 이미 있음. origin 리모트에서 호스트를 유도하거나 `GH_HOST`/`options.host`로 `gh api --hostname <host>`를 주입합니다 (`src/main/git/runner.ts:1300-1312`, 레이트리밋 스코프도 같은 호스트를 따름 `:1377-1385`). **PR·이슈 열람 레인은 github.com 하드코딩이 아닙니다.** 다만 github.com으로 **고정된** `gh` 호출이 둘 있습니다: star-nag(아래 주의 2, `disableStarNag`로 닫힘)와 레이트리밋 스냅샷 프로브(`src/main/github/rate-limit.ts:305`, **스위치 없음** — §0.2 #23).

### ⚠️ 주의 1: GHES 감지가 `gh auth status`에 의존

사내 GHES가 `gh`에 로그인돼 있지 않으면 GHES 감지(`src/main/github/github-enterprise-repository.ts:156`)가 실패하고 **Gitea 폴백 경로로 떨어질 수 있습니다**. → 배포 시 `gh auth login --hostname github.samsungds.net`을 선행하세요. 정책 파일의 `githubEnterpriseHost`는 Gitea 폴백 오인을 별도로 막아 주지만(아래), `gh` 로그인 자체를 대신하지는 않습니다.

반대 방향도 정리됐습니다: **`gh`만 사내 호스트로 로그인하고 정책 파일은 없는 기계**에서, 이제 `githubEnterpriseHost`가 `gh`의 `hosts.yml`을 마지막 폴백으로 읽습니다(`src/main/github/gh-config-host.ts`). `gh auth login --hostname`은 환경변수가 아니라 그 파일에만 쓰고, GUI로 실행된 Electron 앱은 셸 rc의 `export GH_HOST`를 상속하지 않으므로 — 사내에서 가장 흔한 설치 순서에서 이 경로가 유일한 단서였습니다. 로그인된 호스트가 **둘 이상이면 채택하지 않습니다**(`gh` 자신의 `DefaultHost()`와 동일하게 `github.com`으로 떨어집니다). 확정적으로 못 박으려면 여전히 정책 파일에 `githubEnterpriseHost`를 적는 것이 유일한 방법입니다 — 추론에 의존하지 않기 때문입니다.

### ✅ 주의 2 (해결됨): star-nag의 github.com 고정 호출 — 게이트는 `gh` 호출 함수 자체에 있음

`src/main/github/client.ts:124` — `const ORCA_REPO = 'stablyai/orca'`
`:233` — `checkOrcaStarred()`: `disableStarNag`면 `true` 반환 후 즉시 종료. 이후 `gh api --include user/starred/stablyai/orca` (읽기)
`:419` — `starOrca()`: `disableStarNag`면 `false` 반환 후 즉시 종료. 이후 `gh api -X PUT user/starred/stablyai/orca` (쓰기)

이 경로는 공용 러너(`ghExecFileAsync`)를 우회하는 **raw `execFileAsync`**라 `--hostname` 주입도, GHES 라우팅도 타지 않습니다. **github.com SaaS로 고정된 호출입니다.**

이전 판은 이 게이트가 `StarNagService.start()`에 있고 “에이전트 스폰 임계치”가 유일한 발동 경로라고 적었는데, **둘 다 틀렸습니다.** 게이트는 `src/main/github/client.ts`로 옮겨졌고, 이 함수들에 도달하는 경로는 **4개**입니다. star-nag 서비스는 그중 1개(내부 트리거 2종)에 불과합니다:

| # | 경로 | 진입점 |
| --- | --- | --- |
| 1 | `gh:checkOrcaStarred` / `gh:starOrca` IPC — 랜딩 화면 | `src/main/ipc/github.ts:1174-1175` ← `src/renderer/src/components/Landing.tsx:42,82` |
| 2 | 같은 IPC — 설정 → Support 섹션 | 같은 IPC ← `src/renderer/src/components/settings/GeneralSupportSection.tsx:44,71` |
| 3 | 에이전트 완료 “value moment” 트리거 | `src/main/star-nag/agent-value-moment.ts:46` |
| 4 | star-nag 서비스: 스폰 임계치(`service.ts:105`)와 온보딩 완료(`:240`) → `maybeShow()` (선언 `:108`, `gh` 호출 `:121`) | `src/main/star-nag/service.ts` |

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
| 크래시 리포트 + 인앱 피드백 | 동일 (`src/main/ipc/feedback.ts:10`, v1.4.159에서 `api.onorca.dev` 폴백 삭제) | 사용자 명시적 제출 |
| star-nag 프롬프트 텔레메트리 | `us.i.posthog.com` | 위 PostHog 게이트에 종속 |

**게이트는 세 레인 모두에 있습니다.**

PostHog 레인 (`src/main/telemetry/consent.ts:77-96`):
1. `DO_NOT_TRACK` truthy → 무조건 차단 (최우선, `:79`)
2. `ORCA_TELEMETRY_DISABLED` truthy → 차단 (`:83`)
3. **정책 파일 `disableTelemetry` → 차단** (`:88`)
4. CI 환경변수 존재 → 차단 (`:94`, 값이 빈 문자열만 아니면 됨)
5. 사용자 opt-in 배너에 동의하지 않으면 기본 **미전송**

진단/크래시 번들 레인 (`src/main/observability/index.ts:97-140`): `disableTelemetry`가 켜지면 `bundleEnabled: false`로 **망 전송만 차단**하고 `localFileEnabled: true`는 유지합니다 (`:120-133`). 로컬 NDJSON 트레이스는 머신을 떠나지 않으므로 그대로 두는 설계이며, 소비자는 `src/main/ipc/diagnostics.ts:221,253,263`과 `src/main/crash-reporting/crash-feedback-diagnostic-bundle.ts:33`입니다.

피드백/크래시 **제출 본문** 레인: 위 번들 게이트는 첨부만 떼어 낼 뿐이라 사용자가 쓴 텍스트는 그대로 `onorca.dev`로 나갔습니다. 그래서 `disableTelemetry`가 `submitFeedback()` 진입부에서 제출 자체를 거부합니다 (`src/main/ipc/feedback.ts:254,262` ← `src/main/ipc/feedback-submission-policy.ts:13-17`, 근거 주석 `:1-5`). 렌더러의 `feedback:submit` 채널과 크래시 다이얼로그가 모두 이 함수를 지나므로 두 진입점이 한 번에 막힙니다.

게다가 전송 키(`ORCA_POSTHOG_WRITE_KEY`)는 **공식 CI 릴리스 빌드에만 컴파일타임에 주입**되고, 사내에서 직접 빌드한 exe는 이 값이 리터럴 `null`로 접히므로 애초에 전송 경로가 죽습니다 (`electron.vite.config.ts:26-30,210`).

**→ 사내 조치**: 정책 파일 `"lockdown": true`(또는 `"disableTelemetry": true`)로 봉인. 업스트림 `ORCA_TELEMETRY_DISABLED=1`을 병행해도 되지만 필수는 아닙니다.

---

## 3. 자동 업데이트 / 넛지 (✅ 정책 파일로 차단됨)

| 기능 | 호스트 | 주기 | 차단 |
| --- | --- | --- | --- |
| electron-updater 자동 업데이트 피드 | `github.com`, `objects.githubusercontent.com` (`publish.provider: 'github'`, `config/electron-builder.config.cjs:415-418`) | 24시간 주기 + 실패 시 1시간에서 최대 6시간까지 배수 증가하는 재시도 (`src/main/updater.ts:71-74`) + 절전복귀 | ✅ `disableAutoUpdate` |
| 업데이트 넛지(강제 업데이트 체크) | `onorca.dev/whats-new/nudge.json` (`src/main/updater-nudge.ts:12`) | **30분마다** (`src/main/updater.ts:75`) + 창 포커스/절전복귀 | ✅ `disableAutoUpdate` |
| 릴리스 매니페스트/프리릴리스 피드 | `github.com/stablyai/orca/releases/download` (`src/main/updater-prerelease-feed.ts:6`) | 체크 시 | ✅ `disableAutoUpdate` |
| 변경사항("what's new") fetch | `onorca.dev/whats-new/changelog.json` (`src/main/updater-changelog.ts:45`) | 업데이트 이벤트 시 | ✅ `disableAutoUpdate` (업데이트 체크가 죽으면 이벤트가 발생하지 않음) |
| 릴리스 채널 빌드 선택기 (v1.4.163 신규) | `api.github.com/repos/stablyai/orca{,-hourly}/releases` REST (`src/main/updater-release-builds.ts`) | 설정 → 릴리스 채널을 열어 목록을 요청할 때만 | ✅ `disableAutoUpdate` (`listReleaseBuilds()` 선두 — 이 레인의 유일한 `net.fetch`) |

피드 경로의 **차단 지점은 3곳이며, 세 번째가 가장 중요합니다** (`src/main/updater.ts`). 빌드 선택기는 피드를 쓰지 않으므로 아래 세 게이트가 덮지 못하며, 자체 게이트가 `listReleaseBuilds()`에 있습니다:

| 함수 | 게이트 라인 | 막는 것 |
| --- | --- | --- |
| `runBackgroundUpdateCheck()` (`:1173`) | `:1179` | 피드에 도달하는 모든 체크가 통과하는 **단일 초크포인트** — 24시간/재시도 타이머, 절전복귀/포커스, 넛지, 외부 노출 `checkForUpdates` |
| `checkForUpdatesFromMenu()` (`:1244`) | `:1251` | 메뉴의 수동 "Check for Updates" |
| `setupAutoUpdater()` (`:1415`) | `:1458` | **피드 URL 설정 전에 조기 반환**하므로 넛지 스케줄러(`:1537`)와 `powerMonitor.on('resume')` 리스너(`:1556`)가 **아예 무장되지 않습니다** |

즉 “넛지 폴링 타이머가 계속 돌아 30분마다 `onorca.dev`로 나간다”는 문제는 **`disableAutoUpdate`가 켜져 있는 동안** 해소됩니다(코드에서 타이머가 사라진 것이 아니라 무장되지 않는 것입니다). `setupAutoUpdater()`의 조기 반환은 `recordUpdaterLifecycle('auto_update_disabled_by_policy', ...)`로 로컬 로그에 흔적을 남깁니다.

**추가 방어 (선택)**:
1. **빌드 시**: 빌드 셸에 `ORCA_DISABLE_PUBLISH_TARGET=1`. 코드 수정이 필요 없습니다 — 설정이 이미 이 값을 보고 `publish`를 `null`로 떨어뜨립니다 (`config/electron-builder.config.cjs:411-413`). 그러면 업데이터 메타(`latest.yml`, `app-update.yml`)가 생성되지 않아 electron-updater가 피드를 조회할 수 없습니다.
2. **망 차원**: `onorca.dev` / `github.com` 릴리스 에셋을 사내 방화벽에서 차단(git 기능과 충돌 주의).

빌드 단계의 phone-home(electron-builder가 github에 업로드 시도)은 [윈도우 빌드 가이드 §5](./windows-corporate-build.md)에서 `--publish never`로 이미 다룹니다.

---

## 4. AI 벤더 사용량/인증 (Orca 자체 호출)

Orca가 스폰하는 에이전트 CLI(claude/codex/…)의 트래픽이 아니라, **Orca가 직접 거는 호출**입니다.

| 기능 | 호스트 | 기본 상태 | 정책 차단 |
| --- | --- | --- | --- |
| 🔴 **Claude 사용량/rate-limit 폴링** | **`api.anthropic.com/api/oauth/usage`** (Electron `net.fetch`, `claude-fetcher.ts:355`) | **기본 켜짐.** 창 생성 직후 서비스 시작(`src/main/index.ts:1212`), 창이 보이고 포커스된 동안 **15분 주기**(`src/main/rate-limits/service.ts:75`, 가시성 술어 `:756-805`) | ✅ `disableUsagePolling` |
| 🔴 **Claude OAuth 리프레시 토큰 회전** | `platform.claude.com/v1/oauth/token` (Electron `net.fetch`, `oauth-refresh.ts:10,149`) | Orca 관리 Claude 계정을 추가하지 않으면 안 나감 | ✅ `disableManagedClaudeAccounts` |
| 🔴 **Codex 사용량** | `chatgpt.com/backend-api/wham/usage` (`src/main/rate-limits/codex-fetcher.ts:524`) | Claude와 동일 구조 — 로컬 `~/.codex/auth.json`(또는 `CODEX_HOME`)만 있으면 발생 (`:190,336`) | ✅ `disableUsagePolling` |
| 🔴 **Grok 사용량** | `cli-chat-proxy.grok.com` (`src/main/rate-limits/grok-fetcher.ts:17`) | 로컬 `<GROK_HOME>/auth.json`만 있으면 발생 (`src/main/rate-limits/grok-auth.ts:11`) | ✅ `disableUsagePolling` |
| 🔴 **Kimi 사용량** | `api.kimi.com/coding/v1` (`src/main/rate-limits/kimi-fetcher.ts:15`) | 로컬 `<KIMI_HOME>/credentials/kimi-code.json`만 있으면 발생 (`:27-28,55-59`) | ✅ `disableUsagePolling` |
| Gemini CLI 쿼터 + Google OAuth 갱신 | `cloudcode-pa.googleapis.com`, `oauth2.googleapis.com` (`src/main/rate-limits/gemini-usage-fetcher.ts:19`, `gemini-oauth-sources.ts:9-10`) | **기본 꺼짐** — `geminiCliOAuthEnabled: false` (opt-in, `src/shared/constants.ts:323`) | ✅ `disableUsagePolling` |
| MiniMax 사용량 | `platform.minimax.io` (`src/main/rate-limits/minimax-request-context.ts:4`) | **기본 꺼짐** — 세션 쿠키 미설정 시 무전송 | ✅ `disableUsagePolling` |
| OpenCode 사용량 | `opencode.ai/_server` (`src/main/rate-limits/opencode-go-usage-fetcher.ts:12`) | **기본 꺼짐** — 세션 쿠키 필요 | ✅ `disableUsagePolling` |
| 🔴 **받아쓰기(STT) → OpenAI** | `api.openai.com` (`src/main/speech/openai-transcription-client.ts:118`, global fetch) | **기본 꺼짐** — `voice.enabled: false` + 모델 미선택 + API 키 미설정, 3중 게이트 | ✅ `disableVoice`. STT 런타임이 아예 생성되지 않고 `registerSpeechHandlers`도 등록되지 않습니다. global fetch라서 opt-in `enforceNetworkAllowlist`도 덮습니다 (§5 표) |

### 🔴 정정: 사용량 폴링은 “Orca 계정 연동에 종속”되지 않습니다

이전 판은 사용량 폴링이 Orca 관리 Claude 계정 연동에 종속된다고 적었으나 **사실이 아닙니다.** Claude가 가장 위험하지만, Codex·Grok·Kimi도 **읽는 파일만 다를 뿐 구조가 같습니다** — 전부 사용자의 로컬 벤더 CLI 자격증명을 직접 읽습니다.

- 목적지는 `platform.claude.com`이 아니라 **`https://api.anthropic.com/api/oauth/usage`** 입니다 (`src/main/rate-limits/claude-fetcher.ts:46`, 호출은 `:355`). 이 호스트는 이전 판 어디에도 등장하지 않았습니다 — **방화벽 허용목록에서 빠지기 쉬운 지점입니다.**
- 자격증명은 Orca 계정이 아니라 **사용자의 기존 Claude CLI 자격증명**에서 읽습니다: macOS Keychain을 먼저 보고, 없으면 **`~/.claude/.credentials.json`** 으로 폴백합니다 (`claude-fetcher.ts:193-201`, 경로 조립은 `:194`, 순서는 `:207-233`).
- 즉 **사내 개발자가 Claude Code CLI에 이미 로그인해 있기만 하면**, Orca에 아무 계정도 추가하지 않아도 창이 포커스된 동안 15분마다 `api.anthropic.com`으로 나갑니다.

이 경로는 `disableUsagePolling`으로 닫힙니다. 게이트 술어는 `isUsagePollingDisabled()` (`src/main/rate-limits/service.ts:760`)이고, 9개 진입점에서 검사합니다(`함수 선언줄` / `게이트줄`): `start()` `:308`/`:310` — 폴링 타이머 자체를 무장하지 않음, `fetchAll()` `:920`/`:921`, `fetchCodexOnly()` `:976`/`:986`, `fetchClaudeOnly()` `:1047`/`:1048`, `fetchGrokOnly()` `:1112`/`:1113`, 계정 스위처 프리뷰 `fetchInactiveClaudeAccountsOnOpen()` `:496`/`:497`, `fetchInactiveCodexAccountsOnOpen()` `:605`/`:606`, Codex 리셋 크레딧 POST `:426`/`:428`, UI 상태 표기 `:1461`.

**Gemini/OpenCode/Kimi/MiniMax도 같은 게이트에 덮입니다.** 이 네 페처는 모두 `runFetchAllCycle()`(`:1554`) 안의 단일 `Promise.allSettled` 배치에서 호출되고(`:1637-1667`, 네 페처는 `:1579,1580,1585,1588`), `runFetchAllCycle`의 호출자는 위에 나열한 4개 게이트 메서드뿐입니다(`:913,985,1050,1112`). 즉 별도 페처 경로가 아니라 전부 하나의 초크포인트 아래에 있습니다.

### ✅ 정정(해소됨): Claude OAuth 토큰 회전 — `disableManagedClaudeAccounts`

`refreshClaudeOauthCredentials()` (`src/main/claude-accounts/oauth-refresh.ts:125`)는 사용자의 refresh_token으로 `platform.claude.com/v1/oauth/token`에 POST합니다 (`:10`, 전송은 `:149`). 호출 지점은 두 곳입니다: 사용량 페처(`src/main/rate-limits/claude-fetcher.ts:1204-1205` — `disableUsagePolling`이 위에서 이미 막음)와 **에이전트 스폰 시 런타임 인증 준비**(`src/main/claude-accounts/runtime-auth-service.ts:1054,1057`).

**이전 판은 두 번째 경로에 "차단 설정 없음"이라고 적었습니다. 더 이상 사실이 아닙니다** — 정책 파일에 `disableManagedClaudeAccounts`가 추가됐고, 다른 `disable*`와 같이 `lockdown`을 상속합니다 (`src/shared/enterprise-policy.ts:26-32`, `:52-60`).

이 스위치는 관리형 계정 기능을 통째로 끄므로 **두 가지가 함께 닫힙니다.**

1. **egress** — 위의 `platform.claude.com` 토큰 회전. 게이트가 **함수 진입부**(`oauth-refresh.ts:131-133`)에 있어 호출자를 가리지 않고, 소켓을 열기 전에 `null`을 반환합니다. `null`은 원래 "기존 자격증명 유지"라 예외가 나지 않습니다.
2. **에이전트 환경 재작성** — 관리형 계정이 활성일 때 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`** 및 인증성 `ANTHROPIC_CUSTOM_HEADERS`를 삭제하는 동작 (`src/main/claude-accounts/environment.ts:3-8,22-29`, 적용부 `src/main/rate-limits/claude-pty.ts:244-247`, `src/main/text-generation/commit-message-agent-environment.ts:127-128`). 게이트는 두 겹입니다 — 인증 준비에서 활성 계정을 `null`로 고정(`src/main/claude-accounts/runtime-auth-service.ts:613-616`, 호스트 세션의 `stripAuthEnv`는 여기서 유도되므로 `:667`이 자동으로 `false`)하고, `stripAuthEnv: true`를 하드코딩해 넘기는 호출자에 대비해 `environment.ts:22`에서 한 번 더 막습니다.

두 번째는 **Bedrock 플릿에서 egress가 아니라 기능 장애로 나타납니다.** WSL 런타임을 고른 세션은 **관리형 계정이 하나도 없어도** 스트립이 켜집니다 — 두 분기의 값이 `stripAuthEnv: !managedAccountsDisabled`이기 때문입니다 (`src/main/claude-accounts/runtime-auth-service.ts:647,657` — WSL 홈을 찾은 경우와 못 찾은 경우). 그 상태에서 런치 환경에 위 변수가 있으면 PTY 스폰이 에러로 **하드 실패**합니다 (`src/main/ipc/pty.ts:3189-3163`, `:4250-4233`).

> 🔴 **읽는 방향을 헷갈리지 마세요.** 이 실패 조건은 코드에서 사라진 것이 아니라 **`disableManagedClaudeAccounts`가 켜져 있을 때만** 성립하지 않습니다. 스위치를 끄면(또는 `lockdown` 없이 배포하면) WSL Claude 세션은 예전 그대로 하드 실패합니다. **그래서 Bedrock + WSL 플릿에서 이 스위치는 권장이 아니라 필수입니다.** Windows 호스트 세션은 원래도 관리형 계정을 선택한 동안에만 스트립됩니다 (`:689`).

**요점**: 손봐야 하는 건 **로컬 CLI 자격증명만으로 발동하는 사용량 폴링 4종(Claude·Codex·Grok·Kimi → `disableUsagePolling`)** 과 **관리형 Claude 계정(→ `disableManagedClaudeAccounts`)** 이며, `lockdown: true` 하나로 둘 다 켜집니다. Gemini/MiniMax/OpenCode/Kimi는 기본 opt-in이라 켜지 않으면 나가지 않고, **켜더라도 `disableUsagePolling`이 덮습니다** — 이들의 fetcher는 `runFetchAllCycle` 안에서만 호출되고 그 사이클로 들어가는 경로가 전부 게이트를 지납니다. **받아쓰기 계열 두 경로**(전사 `api.openai.com`, 로컬 모델 다운로드 `huggingface.co` — §0.2 #10)는 이제 `disableVoice`가 덮습니다. 두 경로 모두 STT 런타임/모델 매니저를 거치는데, `disableVoice`면 그 두 게터가 생성 전에 던지기 때문입니다.

### ✅ 신규: 사내에서 직접 서비스하는 모델 (`llmEndpoints`)

이 브랜치는 Bedrock 외에 **사내 자체 호스팅 모델**을 두 번째 승인 백엔드로 지원합니다. 보안 검토에서 중요한 구분은 **호출 주체**입니다.

| | |
| --- | --- |
| 목적지 | 관리자가 정책 파일에 배포한 **사내 호스트**, 그리고 **사용자가 설정에서 직접 추가한 호스트**(`corporateLlmEndpoints:addUserEndpoint`, 정책 확인 없음 — §0.2 #14). 양쪽 모두 `https` 강제(루프백만 예외, `src/shared/enterprise-llm-endpoints.ts:40-46`)이나, 그 검증은 **쓰기 시점에만** 걸립니다 |
| 호출 주체 | **에이전트 CLI(서브프로세스)**. Orca 자신은 이 엔드포인트로 아무 요청도 보내지 않습니다 |
| 적용되는 통제 | 프록시(`NO_PROXY`에 호스트 자동 병합, `src/shared/corporate-llm-launch-env.ts:28-40`), 사내 CA(`NODE_EXTRA_CA_CERTS`), 방화벽 |
| 적용되지 **않는** 통제 | `enforceNetworkAllowlist` — 서브프로세스 트래픽을 덮지 않습니다. 엔드포인트 호스트가 `allowedNetworkHosts`에 자동 추가되지만(`src/shared/enterprise-policy.ts:220-226`), 그것은 Orca 측 요청에만 의미가 있습니다 |

#### 토큰 — 디스크에 저장되는 새 비밀

| | |
| --- | --- |
| 위치 | `%APPDATA%\Orca\corporate-llm-tokens\<id>.token` (`src/main/enterprise/corporate-llm-token-store.ts:17`, `:28`) |
| 보호 | Electron `safeStorage` = Windows **DPAPI**, 파일 모드 `0600` (`:94`). 사용자 계정에 묶이므로 같은 PC의 다른 프로필은 파일에 접근해도 복호화 불가 |
| 암호화 불가 시 | **저장 거부** (`:87-90`). 평문으로 기록하지 않습니다 |
| 배포 주체 | 관리자가 아니라 **사용자 본인**. 정책 파일은 머신 전역이라 모든 계정이 읽을 수 있어 토큰을 두기에 부적합합니다 |

**검증하고 정리된 유출 경로** — 각각 코드로 확인했습니다.

- **렌더러에 도달하지 않음** — IPC는 `hasToken` 불리언만 반환합니다 (`src/main/ipc/corporate-llm-endpoints.ts`). UI는 토큰을 되읽을 수 없고 교체/삭제만 가능합니다.
- **영속 설정에 저장되지 않음** — 저장되는 것은 비밀이 아닌 `ORCA_CORPORATE_LLM_ENDPOINT=<id>`뿐입니다. 이렇게 나눈 이유가 바로 `SleepingAgentLaunchConfig`가 에이전트 환경을 **평문으로 디스크에 저장**하기 때문입니다 (`src/shared/sleeping-agent-launch-config.ts:12-16`). 토큰은 스폰 시점에 main이 암호화 저장소에서 꺼내 합칩니다 (`src/main/enterprise/corporate-llm-launch-injection.ts`).
- **트레이스/진단에 실리지 않음** — 관측 redactor가 키 이름 기준으로 `ANTHROPIC_AUTH_TOKEN`과 `OPENAI_API_KEY`를 드롭합니다 (`src/main/observability/redactor.ts:83-84`의 normalized 분기). `ANTHROPIC_BASE_URL`은 비밀이 아니라 통과합니다 — 의도된 동작입니다.

#### 잔여 위험 — 정직하게

**프롬프트와 소스 코드는 에이전트 CLI가 이 엔드포인트로 보내며, Orca의 어떤 네트워크 통제도 관여하지 않습니다.** 정책 파일이 통제하는 것은 **어느 엔드포인트가 목록에 오르는지**까지이고, 사용자가 유효한 토큰을 가지면 그 엔드포인트로 소스를 보낼 수 있습니다. 전송 내용에 대한 통제는 엔드포인트 쪽 서비스의 로깅·감사에서 해야 합니다. 사용자가 임의의 URL을 스스로 추가할 수 **있다는** 점(설정 → AI 제공업체 계정의 Add 폼, 정책 스위치 없음)이 이 위험의 실제 경계입니다 — 목록은 관리자 소유가 아니라 **관리자 배포분 + 사용자 추가분의 합집합**입니다. 다만 같은 사용자는 셸 rc나 per-agent 환경변수로도 같은 리다이렉션을 만들 수 있으므로(§0.2 #1), 이 레인을 없앤다고 리다이렉션 자체가 막히지는 않습니다. 실질 통제는 망 계층(프록시 강제·방화벽·TLS 검사)과 엔드포인트 서비스 쪽 감사입니다.

### AWS Bedrock으로 Claude를 쓰는 경우

사내가 Bedrock을 쓴다면 인증은 Orca가 스폰하는 **Claude Code CLI 자체**가 AWS로 처리합니다(`bedrock-runtime.<region>.amazonaws.com`). Orca는 셸/워크스페이스 환경변수를 PTY에 전달하므로, 아래를 사용자 셸 또는 per-workspace 환경에 넣으면 됩니다.

```
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION
ANTHROPIC_MODEL=<Bedrock inference profile ARN 또는 모델 ID>
```

> 사내 플릿은 SSO를 쓰고 `AWS_PROFILE`을 설정하지 않습니다. 그래도 문제는 없습니다 — **Orca 프로덕션 코드는 `AWS_PROFILE`을 어디서도 읽지 않습니다**(저장소 전체에서 이 이름이 나오는 곳은 테스트 픽스처 `src/main/claude-accounts/environment.test.ts:13,72`뿐). PTY 스폰 경로에는 env 허용목록이 없어 셸 환경이 그대로 상속되고, Orca가 삭제하는 유일한 AWS 변수는 `AWS_BEARER_TOKEN_BEDROCK`입니다 (`src/main/claude-accounts/environment.ts:3-8`).

`platform.claude.com`으로 가는 OAuth 갱신은 **Orca 관리 Claude 계정을 추가하지 않는 한 발생하지 않지만, 그 "추가하지 않음"을 사용자 선의에 맡기지 말고 `disableManagedClaudeAccounts`로 못 박으세요.** Bedrock 플릿에서 이 스위치는 egress 차단인 동시에 **기능 안정화**입니다 — 위 절에서 본 대로 관리형 계정의 환경 스트립은 `AWS_BEARER_TOKEN_BEDROCK`을 지우고, WSL 세션에서는 관리형 계정 없이도 켜져 Claude 스폰을 하드 실패시킵니다.

**`api.anthropic.com` 사용량 폴링은 별개 경로**이며 Bedrock 사용 여부와 무관하게 로컬 Claude CLI 자격증명만 있으면 발생하므로, `disableUsagePolling`도 함께 켜야 합니다. 둘 다 `lockdown: true`에 포함됩니다. AWS 자격증명이 프록시/사설 CA를 타야 하면 §5의 환경변수를 함께 설정하세요.

#### ⚠️ 이 플릿에서 실측으로 확인된 운영 결함 4건

egress가 아니라 **환경변수가 에이전트까지 도달하는 경로**의 문제입니다. 배포 검토자는 네 건 모두 알고 있어야 합니다.

| # | 증상 | 원인 | 확인 위치 | 대응 |
| --- | --- | --- | --- | --- |
| 1 | `setx`로 `AWS_REGION` 등을 넣었는데 **에이전트에는 안 보임** | 상주 PTY 데몬은 앱 재시작을 넘어 살아남고 **fork 시점의 `process.env`를 계속 씁니다.** 매 스폰마다 레지스트리에서 다시 읽는 값은 **`PATH` 하나뿐**입니다 | 데몬이 자기 `process.env`를 권위로 삼음 `src/main/daemon/pty-subprocess.ts:102`, 스폰 env 조립 `:563` / `PATH`만 재병합 `src/main/ipc/pty.ts:1003` ← `src/main/pty/windows-environment-path.ts:11-14`(레지스트리 키 2개) | `setx` 뒤에 **데몬 재시작 또는 재로그온**. 앱만 재시작하는 것으로는 부족 |
| 2 | 설정에서 만든 per-agent 환경변수의 **값을 비워 두면 OS 값까지 사라짐** | 빈 문자열이 정상 값으로 저장되고(`nextEnv[key] = raw`) 스폰 시 OS 값 위에 덮어써서 **빈 문자열로 가려집니다** | 정규화 `src/shared/tui-agent-launch-defaults.ts:62-68`(빈 문자열을 거르지 않음), 해석 `:96-104` → 스폰 플랜의 `env`로 전달 `src/shared/tui-agent-startup.ts:94` → 병합 `src/main/daemon/pty-subprocess.ts:563`(`opts.env`가 `process.env`를 덮음) | 쓰지 않을 변수는 **값을 비우지 말고 행 자체를 삭제** |
| 3 | WSL Claude 세션이 **스폰 즉시 에러로 종료** | `disableManagedClaudeAccounts`가 꺼져 있으면 WSL 분기가 관리형 계정 없이도 `stripAuthEnv`를 켜고, 런치 env에 인증 변수가 있으면 하드 실패 | `src/main/claude-accounts/runtime-auth-service.ts:647,657` → `src/main/ipc/pty.ts:3189-3163`, `:4250-4233` | `disableManagedClaudeAccounts: true` (= `lockdown: true`). **필수** |
| 4 | Windows에서 설정한 `AWS_*`가 **WSL 게스트 안에서 안 보임** | `wsl.exe`는 `WSLENV`에 이름이 적힌 변수만 넘기는데, Orca가 등록하는 목록에 `AWS_*`가 **하나도 없습니다**(`ORCA_*`·`CODEX_HOME`·`CLAUDE_CONFIG_DIR` 계열뿐) | `src/main/pty/wsl-orca-env.ts:58-84`, 추가 등록 지점 `src/main/providers/local-pty-provider.ts:707,727,731,735` | 게스트 배포판 안에서 별도 설정(`~/.bashrc`, `/etc/environment`, WSL 쪽 AWS 프로필) |

---

## 5. 사내 프록시 / 사설 CA (⚠️ 부분 지원 — 전 경로를 덮지 않음)

- **프록시**: 부팅 시 호출되는 것은 `applyElectronProxySettings(store.getSettings())`입니다 (`src/main/index.ts:1904`). Dock/런치패드 실행은 셸 env를 못 물려받으므로 **앱 내 프록시 설정값이 우선**이고(`proxy-settings.ts:90-113`), 설정이 비었을 때만 `ensureElectronProxyFromEnvironment`로 폴백해 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`/`NO_PROXY`(소문자 변형 포함)를 읽습니다 (`:92-97,119-124`, 이름 목록은 `src/shared/network-proxy.ts:13-21`). 단, 시스템 프록시가 이미 잡혀 있으면(`resolveProxy !== 'DIRECT'`) env는 무시됩니다 (`proxy-settings.ts:54-57`).
- **앱 내 프록시 설정은 자식 프로세스로 전파됩니다**: PTY로 스폰되는 에이전트 CLI의 환경에 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY`(대·소문자 6+2종)를 주입합니다 (`src/shared/network-proxy.ts:115-140`, 변수 목록은 `:123-137` ← `src/main/ipc/pty.ts:1004`, `src/main/rate-limits/claude-pty.ts:253`). **env에서 유도한 프록시는 이 주입 대상이 아닙니다** — 그 경우 자식은 부모 셸의 env를 그대로 상속할 뿐입니다.
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

`node:https`를 직접 쓰는 다운로더도 프록시를 우회합니다. **두 곳뿐이며, 둘 다 정책으로 닫힙니다**:

- `src/main/emulator/android/scrcpy-server-download.ts:4,15` — `github.com`에서 scrcpy 서버 jar 다운로드. `lockdown`이면 소켓을 열기 전에 거부합니다 (`enterprise-direct-download-guard.ts:17-32` ← `scrcpy-server-download.ts:42-46`). 가드의 근거 주석(`:1-7`)이 이 절과 같은 사실을 적고 있습니다 — 프록시 우회 + 허용목록 비가시 + Node 자체 CA 번들 사용.
- `src/main/observability/diagnostic-upload-http.ts:1-2` — 진단 번들 업로드 (`disableTelemetry`로 차단됨)

⚠️ 이 가드는 **scrcpy 한 곳에만 배선**돼 있습니다. §0.2 #10의 STT 모델 다운로드는 Electron `net.request`라 프록시는 타지만 정책 게이트는 없습니다.

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
| GitHub 아바타 | `avatars.githubusercontent.com` (저장소 아이콘은 GHES 호스트를 따름) | PR/이슈/프로젝트 렌더 시 | `src/renderer/src/components/github/github-user-avatar.tsx:35,79`, `src/shared/repo-icon.ts:35-64` |
| 저장소 아이콘 자동감지 | `www.google.com/s2/favicons` | 저장소 웹사이트 URL이 있을 때 | `src/shared/repo-icon.ts:17-32` |
| 에이전트 카탈로그 아이콘 | `www.google.com/s2/favicons` | 에이전트 목록 표시 | `src/renderer/src/lib/agent-catalog.tsx:390` |
| "다른 앱으로 열기" 아이콘 | `www.google.com/s2/favicons` | 앱 프리셋 표시 | `src/renderer/src/lib/open-in-app-catalog.tsx:66` |
| 마크다운 본문의 인라인 이미지 | 본문에 적힌 임의의 http(s) URL | PR·이슈·Jira 설명 렌더 시 (`variant="document"`) | `src/renderer/src/components/sidebar/comment-markdown-element-renderers.tsx:258,274` |
| Linear/Jira 사용자 아바타 | 각 벤더 아바타 CDN | 이슈·코멘트 목록 렌더 시 | `src/renderer/src/components/LinearIssueWorkspace.tsx:101`, `JiraIssueWorkspace.tsx:591,740` |

렌더러 `<img>`가 직접 로드하며, **기본 정책(`lockdown: true`만 켠 상태)으로는 차단되지 않습니다.** 폐쇄망에서 로드 실패 시 아이콘만 깨지고 기능은 동작합니다.

마크다운 이미지는 변형에 따라 동작이 다릅니다: `compact` 변형(기본값 — 사이드바 카드, Linear 코멘트 `LinearIssueWorkspace.tsx:916` 등)은 `blob:`/`data:image` 외의 `src`를 **이미지가 아니라 텍스트 링크로** 렌더해 자동 요청을 내지 않습니다 (`comment-markdown-element-renderers.tsx:16-24,143-158`). 원격 이미지를 실제로 가져오는 것은 `document` 변형뿐입니다.

완전 차단이 필요하면 `"enforceNetworkAllowlist": true` + `allowedNetworkHosts`를 지정하세요 (§7 레벨 3). 저장소 아이콘의 GitHub 아바타는 GHES 호스트를 따라가므로(`repo-icon.ts:46-64`), 허용목록에 GHES 호스트만 넣어도 그 항목은 살아남습니다.

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

이것으로 §2(텔레메트리·진단·피드백/크래시 제출), §3(자동 업데이트·넛지), §1(star-nag), Orca Cloud/모바일 릴레이, §4(사용량 폴링 + 관리형 Claude 계정/`platform.claude.com` OAuth 회전), 맞춤법 사전 다운로드, scrcpy jar 직접 다운로드(§0.2 #9), Chromium의 DNS-over-HTTPS 자동 승격(§8)이 한 번에 닫히고, Gitea 폴백 오인이 방지됩니다.

**닫히지 않는 것**(§0.2와 동일): 서브프로세스 트래픽, 렌더러 외부 이미지, SSH 릴레이의 원격 `npm install`, STT 모델 다운로드. 레벨 1만으로 "외부 통신이 끊겼다"고 보고하면 안 됩니다.

추가로:
- 사이드바 워크트리 카드 속성에서 `pr`/`ci`(신형 카드 스타일이면 `status`) 제거 → PR/리뷰 백그라운드 갱신 중단(명시적 열람은 유지). 단 **`groupBy`가 `pr-status`이거나 우측 사이드바가 PR 데이터를 보이면 카드 속성과 무관하게 계속 갱신**됩니다 (`src/renderer/src/store/slices/github.ts:4270-4275`).
- Gemini/MiniMax/OpenCode/받아쓰기는 기본 꺼짐이라 **켜지 않으면 됨**.

### 레벨 2 — 환경변수 (정책 파일과 별개로 여전히 유효한 것)

```
GH_HOST=github.samsungds.net       # gh 자신의 변수. 정책 파일이 대체하지 못함 — 아래 참고
HTTPS_PROXY / HTTP_PROXY / NO_PROXY # 프록시 (§5, Electron 세션 한정)
NODE_EXTRA_CA_CERTS=<corp-ca.pem>  # 사설 CA (§5)
```

⚠️ **`githubEnterpriseHost`는 `GH_HOST`를 대체하지 않습니다.** 저장소 전체에서 이 정책 값을 읽는 곳은 `src/main/gitea/repository-ref.ts:91`(Gitea 폴백 후보에서 제외)과 `src/shared/enterprise-policy.ts:204-207`(허용목록에 자동 추가) 두 곳뿐입니다. `gh`가 어느 호스트로 나갈지는 여전히 origin 리모트에서 유도한 `options.host` 또는 `GH_HOST`가 정합니다 (`src/main/git/runner.ts:1306-1312,1370-1376`). 의존 방향은 오히려 반대입니다 — `githubEnterpriseHost`가 비어 있을 때 `GH_HOST`를 폴백으로 읽습니다 (`src/shared/enterprise-policy.ts:203`).

### 레벨 3 — 허용목록 하드 게이트 (opt-in)

`"enforceNetworkAllowlist": true`. 구현은 `src/main/enterprise/enterprise-network-guard.ts`이며 두 레인을 덮습니다:

1. `session.defaultSession.webRequest.onBeforeRequest` — 렌더러 요청 (`:87-97`)
2. 메인 프로세스 global `fetch` 래퍼 — §5의 undici 호출 지점 (`:99-122`)

허용목록에 없는 호스트는 호스트당 한 줄씩 stderr에 기록되고 차단됩니다 (`:36-45`). 로그는 256개 호스트에서 멈추지만(`:30,37`) **차단 자체에는 상한이 없습니다** — 로그가 끊겨도 요청은 계속 막힙니다. 루프백과 non-http 스킴은 항상 통과합니다 (`:47-71`).

**덮지 않는 것** (§0.2와 동일): 서브프로세스(`gh`/`glab`/에이전트 CLI), `node:https` 다운로더(단 scrcpy는 별도 가드가 있고, 그 가드도 `enforceNetworkAllowlist`를 함께 봅니다 — `enterprise-direct-download-guard.ts:26-31`), 임베디드 브라우저의 `persist:` 파티션(`:9-13` — 그 슬롯은 인증서 게이트가 점유). ⚠️ Electron `net.fetch`/`net.request`가 `defaultSession`의 `webRequest` 리스너를 타는지는 테스트로 확인되지 않았습니다(`enterprise-network-guard.test.ts`의 케이스는 렌더러 요청 8건과 global fetch 5건뿐 — `:86-182`, `:184-243`). 이 항목이 §4의 `api.anthropic.com`·`platform.claude.com`(둘 다 `net.fetch`)과 §0.2 #10에 동시에 걸립니다.

### 레벨 4 — 망 차원 (가장 견고)

서브프로세스 트래픽은 Electron 세션 밖이므로 방화벽/프록시 강제가 유일한 통제 수단입니다. 레벨 1 + 레벨 4 병행이 실질적인 완전형입니다.

### 레벨 5 — 빌드 설정

- 빌드 셸에 `ORCA_DISABLE_PUBLISH_TARGET=1` → `publish`가 `null`이 되어 업데이터 메타 미생성 (`config/electron-builder.config.cjs:411-413`, §3의 이중 방어). 빌드 업로드는 `--publish never`로 별도 처리.

---

## 8. 종결된 항목 및 남은 미검증(⚠️)

이전 판의 “미검증 5건” 중 **4건이 완전히 종결**되었고, 나머지 1건(Electron 기본 동작)은 맞춤법 사전과 DNS-over-HTTPS가 종결되고 컴포넌트 업데이터만 남았습니다.

### ✅ 종결: Chromium 맞춤법 사전 다운로드 — 실재하며, 이제 차단됨

Electron은 `spellcheck`를 기본 켜며, **Windows/Linux에서 Chromium이 hunspell 사전을 Google CDN에서 내려받습니다** — 이 문장은 코드 주석에 그대로 있습니다(`src/main/window/createMainWindow.ts:298`). 주석은 macOS를 언급하지 않습니다(macOS가 OS 검사기를 쓴다는 것은 Electron 플랫폼 동작이며 이 저장소 코드로는 확인되지 않습니다). `disableSpellcheck`는 **자체 세션을 갖는 WebContents 5곳을 전부** 끕니다 — 메인 창(`:299`), `will-attach-webview` 게스트(`:471`, 게스트는 자체 세션이라 메인 창 설정이 안 미침 — `:470` 주석), 대시보드 팝아웃 창(`src/main/window/dashboard-popout-window.ts:176`), 오프스크린 브라우저 백엔드(`src/main/browser/offscreen-browser-backend.ts:45`), PDF 내보내기 WebContents(`src/main/lib/html-to-pdf.ts:46`). 한 곳이라도 켜져 있으면 그 세션이 hunspell 다운로드를 다시 무장시키기 때문입니다(`html-to-pdf.ts:45` 주석).

### ✅ 종결: 프로덕션 렌더러 CSP — **부재 확정**

`src/renderer/index.html`에는 CSP가 없습니다. 이전에 “electron-vite가 주입한다”고 적혀 있던 주석은 **거짓이었고 제거되었습니다**. 현재 주석은 사실대로 “어느 단계에서도 CSP는 주입되지 않으며, egress는 메인 프로세스의 `enterprise-network-guard.ts`에서 통제한다”고 명시합니다. 저장소 전체에서 `Content-Security-Policy`가 나오는 곳은 마크다운 내보내기 HTML 템플릿(`src/renderer/src/components/editor/markdown-export-html.ts:41`) 하나뿐이며, 이는 앱 렌더러와 무관합니다.

대체 통제 수단은 opt-in `enforceNetworkAllowlist`입니다. **덮는 것**: 렌더러의 모든 http(s) 요청(§6의 이미지 포함)과 메인 프로세스 global `fetch`. **덮지 않는 것**: 서브프로세스, `node:https`(scrcpy만 별도 가드가 대신 봄 — §5), 임베디드 브라우저 파티션 (§0.2·§7 레벨 3).

### ✅ 종결: SSH 릴레이의 원격 다운로드 — **npm install은 실재, ripgrep 다운로드는 사실무근**

- **실재**: 릴레이는 원격 호스트에서 `npm install`을 실행해 `node-pty`와 `@parcel/watcher`를 설치합니다 (`src/main/ssh/ssh-relay-deploy.ts:743-744,725,737`). 이 둘은 네이티브 애드온이라 esbuild 번들에 포함할 수 없습니다. Linux에서는 node-pty가 소스 컴파일되므로 C/C++ 툴체인까지 필요합니다(툴체인 프로브 `:822-825`, 실패 시 안내 문구는 `:853`). **폐쇄망 원격 호스트에서는 최초 연결이 실패합니다** — 사내 npm 미러 또는 사전 설치가 필요합니다.
- **사실무근**: 릴레이가 ripgrep을 다운로드하지는 **않습니다.** `src/relay/fs-handler-install-rg.ts`는 배포판을 감지해 `sudo apt install ripgrep` 같은 **설치 안내 문자열만 생성**하며(`:10-33`, 배포판 분기 `:35-52`), `:32`의 `github.com/BurntSushi/ripgrep` URL도 사용자에게 보여 주는 텍스트일 뿐 소켓을 열지 않습니다. 이 파일이 import하는 것은 `node:fs/promises`의 `readFile`과 로컬 파서뿐이라(`:1-5`) HTTP 클라이언트 자체가 없습니다. rg가 없으면 git/readdir 폴백으로 degrade합니다(`fs-handler-git-fallback.ts`, `fs-handler-readdir-fallback.ts`).
- 릴레이 번들 자체는 SCP로 전송되며 다운로드하지 않습니다. 원격 Node가 없을 때도 안내 메시지만 냅니다(`src/main/ssh/ssh-remote-node-resolution.ts:301`).

### ✅ 종결: agent-browser 서브프로세스의 `process.env` 상속 — **전체 상속 확정**

`src/main/browser/agent-browser-bridge.ts:2670-2672` — `env: execOptions?.envOverrides ? { ...process.env, ...execOptions.envOverrides } : process.env`. **`process.env` 전체를 그대로 넘깁니다.** 이것이 이 브랜치가 잠금 설정을 환경변수에서 파일로 옮긴 이유를 그대로 뒷받침합니다 (§0.1).

### ✅ 종결: 로케일 카탈로그의 Google Translate — **빌드 스크립트 한정**

`config/scripts/bootstrap-locale-catalog.mjs:66`에서 `translate.googleapis.com/translate_a/single`을 호출합니다. 이는 **번역 카탈로그를 생성하는 개발용 스크립트**이며 앱 런타임 코드가 아닙니다(`src/` 아래 어디에도 이 호스트가 없음). 사내 배포 위험 아님.

### ✅ 종결: Chromium의 DNS-over-HTTPS 자동 승격 — `lockdown`이 OS 리졸버로 고정

Electron의 `configureHostResolver`는 `secureDnsMode`가 기본 `'automatic'`이라, 머신에 설정된 리졸버가 알려진 DoH 제공자면 Chromium이 스스로 DoH로 승격합니다. 그러면 이름 해석이 443으로 공용 리졸버에 나가면서 **사내 호스트만 풀 수 있는 split-horizon DNS와 DNS 기반 egress 모니터링을 동시에 지나칩니다** — 근거는 코드 주석에 그대로 있습니다(`src/main/enterprise/enterprise-secure-dns.ts:1-8`). `lockdown`이면 `secureDnsMode: 'off'`로 고정합니다(`:19-24`). 배선은 `ready` 이후입니다(`src/main/index.ts:1833`, Electron이 `ready` 전 호출을 거부하므로). 고정에 실패해도 stderr 한 줄만 남기고 기동은 계속합니다(`:25-30`).

> ⚠️ 이 통제는 **커맨드라인 스위치가 아니라 `app.configureHostResolver` 호출**이므로 `disable-features`/`appendSwitch` 목록에는 나타나지 않습니다. 스위치 목록만 보고 “DoH 통제 수단이 없다”고 읽으면 안 됩니다 — 이전 판이 그렇게 적었고, 틀렸습니다.

### ⚠️ 남은 미검증

- **`enforceNetworkAllowlist`는 WebSocket을 검사하지 않습니다.** 가드는 `http:`/`https:` URL만 보고 `globalThis.fetch`만 래핑합니다 (`src/main/enterprise/enterprise-network-guard.ts:66`). 원격 Orca 런타임과 모바일 페어링은 WebSocket이므로 **허용목록으로는 막히지 않습니다** — 그래서 `disableRemoteOrcaServer` / `disableMobilePairing`이 별도 스위치로 존재합니다. 허용목록만 켜고 두 스위치를 끄면 구멍이 남습니다.
- **웹 클라이언트(`orca serve` / `pnpm dev:web`)에는 정책이 전달되지 않습니다.** `src/renderer/src/web/web-preload-api.ts`에 `enterprisePolicy` 키가 없어 렌더러 캐시가 "제한 없음"으로 남습니다. **UI 차단만 무력화되고 메인 프로세스 게이트는 그대로 유효**하므로 실제 egress는 막히지만, 화면에는 정책이 지운 섹션이 보입니다. 데스크톱 앱에는 해당하지 않습니다.
- **Computer Use 승인은 창이 있을 때만 물을 수 있습니다.** `requireComputerUseApproval`은 띄울 창이 없으면 **거부**로 처리하므로 헤드리스 경로에서 무단 실행되지는 않지만, 그 경로에서는 Computer Use가 사실상 사용 불가가 됩니다.
- **Chromium 컴포넌트 업데이터.** 이 브랜치는 관련 스위치를 걸지 않습니다 — `disable-features`에 들어가는 값은 `IntensiveWakeUpThrottling` 하나뿐이고(`src/main/startup/configure-process.ts:304-310`), 프로덕션 `appendSwitch` 호출 10곳(`configure-process.ts` 6곳, `index.ts:1381`, `startup/ensure-virtual-display.ts:22,25`, `startup/renderer-heap-headroom.ts:101`) 어디에도 컴포넌트 관련 항목이 없습니다. **통제 수단이 없다는 것은 확인했으나, Electron 런타임이 실제로 컴포넌트 업데이트 요청을 내는지는 패킷 캡처로 확인하지 못했습니다.** 배포 전 실측 권장.

---

## 부록: 확정 44건 요약

전체 원자료(호스트·파일·라인·차단 평가)는 조사 산출물에 있습니다. 여기서는 실제 외부 호출로 **확정된** 기능만 나열합니다.

git: GitHub REST/GraphQL·PR 백그라운드 폴링·아바타·star-nag / GitLab / Bitbucket / Azure DevOps / Gitea 폴백 / 일반 git fetch·push·clone / attribution 푸터.
이슈: Linear GraphQL·에이전트 write·첨부 signed URL / Jira REST / GitHub·GitLab 이슈 소스 / 본문 마크다운의 인라인 이미지·벤더 아바타.
AI: Claude 사용량(`api.anthropic.com`)·OAuth갱신(`platform.claude.com`) / Codex / Gemini / MiniMax / OpenCode / Grok / Kimi / 받아쓰기(OpenAI).
클라우드/업데이트: PostHog / 진단·크래시·피드백(`onorca.dev`) / electron-updater / 넛지·changelog / Orca Cloud 로그인 / 모바일 페어링 릴레이.
에셋: STT 모델(sherpa-onnx)·scrcpy(에뮬레이터) GitHub Releases 다운로드 / Google favicon·아바타 이미지 / SSH 릴레이의 원격 npm install.
