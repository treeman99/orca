<h1 align="center">
  <img src="resources/build/icon.png" alt="Orca" width="64" valign="middle" /> Orca — 사내 빌드 (Samsung DS)
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20x64-4493F8?style=flat-square" alt="Windows x64" />
  <img src="https://img.shields.io/badge/git-GitHub%20Enterprise-08C?style=flat-square" alt="GitHub Enterprise" />
  <img src="https://img.shields.io/badge/Claude-AWS%20Bedrock-FF9900?style=flat-square" alt="AWS Bedrock" />
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat-square" alt="License: MIT" />
</p>

> 이 브랜치(`enterprise/samsungds`)는 오픈소스 [`stablyai/orca`](https://github.com/stablyai/orca)를 **사내 환경에 맞춰 커스터마이즈한 포크**입니다.
> 배포 대상은 **Windows x64 단일 플랫폼**이며, 사내 GitHub Enterprise(`github.samsungds.net`)와 **AWS Bedrock 기반 Claude**를 씁니다.
> 공개 배포본(자동 업데이트·텔레메트리가 켜진 `.exe`)과 달리, 이 빌드는 사내에서 직접 빌드하고 외부 phone-home을 관리자 정책으로 잠급니다.

---

## Orca란

Orca는 여러 CLI 코딩 에이전트(Claude Code, Codex 등)를 **각자의 git worktree에서 병렬로 실행**하고 한 곳에서 관리하는 Electron 데스크톱 앱입니다. 주요 기능:

- **병렬 Worktree** — 하나의 프롬프트를 여러 에이전트에 나눠 실행하고 결과를 비교·병합
- **터미널 분할** — WebGL 렌더링, 무한 분할, 재시작 후에도 유지되는 스크롤백
- **GitHub 네이티브 통합** — PR·이슈·체크를 앱 안에서 열람하고 worktree로 바로 진입 (이 브랜치는 사내 GHES 대응)
- **AI Diff 주석 / 파일 드래그 / 임베디드 브라우저 / Orca CLI** 등

기능 사용법 자체는 원본 문서([onorca.dev/docs](https://www.onorca.dev/docs))를 참고하세요. 이 README는 **사내 빌드·설정·배포·동기화**에 집중하며, 문서 전체가 Windows x64 배포를 전제로 합니다.

> [!NOTE]
> **배포 대상이 Windows뿐이라는 사실이 코드를 Windows 전용으로 고쳐도 된다는 뜻은 아닙니다.** [`AGENTS.md`](AGENTS.md)의 "Cross-Platform Support" 규칙은 macOS/Linux/WSL/SSH를 모두 지원하도록 요구하는 **기여 규칙**이고, 이 README가 좁히는 것은 **빌드·배포 대상**입니다. 플랫폼 분기를 "우리는 Windows만 쓰니까"라는 이유로 지우지 마세요.

지원 에이전트: 터미널에서 도는 CLI 에이전트는 모두 동작합니다. 이 환경의 1차 대상은 **AWS Bedrock 기반 Claude Code**입니다(§3).

---

## 0. 설정이 어디에 사는가 — 네 개의 버킷

이 배포에서 **동작을 바꾸는 설정 값**은 네 군데에 흩어져 있고, **각각 읽는 주체가 다릅니다.** 어떤 값을 어디에 넣어야 하는지 헷갈리는 것이 이 배포의 가장 흔한 사고 원인이므로 먼저 정리합니다.

| 버킷 | 위치 | 읽는 주체 | 넣는 사람 |
| --- | --- | --- | --- |
| **A. OS 환경 변수** | Windows 사용자/시스템 환경 변수 | Orca **외부**의 프로세스(`git`, `gh`, CLI, Node) 또는 Orca 시작 **전에** 존재해야 하는 값 | IT / 사용자 |
| **B. 정책 파일** | `%ProgramData%\Orca\enterprise-policy.json` | **Orca 자신**(TypeScript 코드) | 관리자 전용 |
| **C. Claude Code 설정** | `%USERPROFILE%\.claude\settings.json` | Bedrock 관련 키(`env`, `awsAuthRefresh`)는 **Claude Code CLI만.** 단 같은 파일의 `hooks`/`statusLine` 키는 **Orca도 읽고 씁니다** — 아래 C | 사용자 |
| **D. 빌드 셸 전용** | 빌드하는 PowerShell 세션 안에서만 | `electron-builder`와 빌드 스크립트 (패키징 시점) | 빌드 담당자 |

이 네 버킷은 **설정 값**만 다룹니다. **자격증명과 신뢰 저장소는 여기 없습니다** — `gh auth status` 인벤토리(§2), `git config`의 `http.sslBackend`/`http.sslCAInfo`(§2), `%USERPROFILE%\.aws\config`와 SSO 토큰 캐시(§3.1), 그리고 사내 LLM 토큰(§3.5)은 각각 별도의 위치이며 해당 절에서 다룹니다. 사내 LLM 토큰이 특히 헷갈리기 쉬운데, **엔드포인트 정의는 버킷 B(정책 파일)이지만 토큰은 어느 버킷에도 없습니다** — 사용자가 앱 안에서 입력하고 Orca가 사용자 프로필에 암호화해 보관합니다.

핵심 원칙: **Orca의 동작을 바꾸는 값은 환경 변수가 아니라 정책 파일(B)에 넣습니다.** 이유는 Orca가 `env`에서 읽는 값이 Orca가 띄우는 **모든 자식 프로세스**(에이전트 CLI, `gh`, `git`, 릴레이)에 그대로 상속되고, `setx`로 심은 값은 같은 머신의 무관한 도구까지 오염시키기 때문입니다 — 근거: `src/shared/enterprise-policy.ts:4-8`, `src/main/enterprise/enterprise-policy-file.ts:4-11`.

### A. OS 환경 변수 — 실제로 여기에 있어야 하는 것만

| 변수 | 읽는 주체 | 필수? | 비고 |
| --- | --- | --- | --- |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | OS 표준. Orca의 Node 계층(대소문자 6종 + `NO_PROXY` 2종을 직접 읽습니다 — `src/shared/network-proxy.ts:13-21`), `git`, `gh`, Claude Code CLI, AWS CLI가 각자 읽음 | 사내 프록시 환경이면 **필수** | 앱 안의 프록시 설정(설정 → Advanced → Network)은 **비워 두는 편이 안전**합니다 — 아래 참고 |
| `NODE_EXTRA_CA_CERTS` | **Node만.** Orca 메인 프로세스와 Node 기반 CLI | TLS 검사 프록시 환경이면 필요 | **`git`/`gh` 바이너리에는 아무 효과가 없습니다**(§2). AWS CLI는 `AWS_CA_BUNDLE`을 별도로 봅니다 *(이 행 전체가 Node/git/AWS CLI 쪽 계약입니다 — 저장소에는 `NODE_EXTRA_CA_CERTS` 참조가 한 건도 없으므로 코드로 검증한 사실이 아닙니다)* |
| `GH_HOST` | `gh` CLI 고유 변수 | **선택** | Orca는 정책의 `githubEnterpriseHost`가 비었을 때만 폴백으로 읽습니다(`src/shared/enterprise-policy.ts:203`). 정책에 호스트를 넣었다면 불필요 |
| `ORCA_ENTERPRISE_POLICY` | Orca만 | **불필요** — 아래 참고 | 정책 **파일 경로**만 지정하는 변수. 이 포크가 추가한 유일한 런타임 환경 변수 |

> [!IMPORTANT]
> **정책 파일을 기본 머신 전역 경로(`%ProgramData%\Orca\enterprise-policy.json`)에 두면 `ORCA_ENTERPRISE_POLICY`는 전혀 필요하지 않습니다.**
> 패키징 빌드에서 탐색 후보는 `[머신 전역, ORCA_ENTERPRISE_POLICY 경로, 사용자별]` 순서로 조립되고(`enterprise-policy-file.ts:79-82`), 머신 전역 Windows 경로는 코드에 하드코딩되어 있습니다(`:37-47`). 후보를 순서대로 읽다가 **먼저 열린 파일에서 즉시 멈추므로**(`:119-151`) 기본 경로에 파일이 있으면 환경 변수 후보는 도달조차 하지 않습니다. **플릿에는 이 변수를 배포하지 마세요.** 개발·검증용입니다(§4.1).

**선택적으로 유효한 OS 환경 변수** (이 포크가 만든 것이 아니라 upstream/커뮤니티 소유):

- `DO_NOT_TRACK`, `ORCA_TELEMETRY_DISABLED` — upstream의 텔레메트리 킬 스위치(`src/main/telemetry/consent.ts:79`, `:83`). 정책 파일의 `disableTelemetry`가 같은 일을 하므로 중복입니다.
- `ORCA_DIAGNOSTICS_DISABLED` — **로컬 NDJSON 진단 파일 기록까지** 끕니다(`src/main/observability/index.ts:102`, `:113-118`). 정책 파일로는 로컬 파일을 끌 수 없습니다. 다만 이 변수를 켜면 §5.2의 정책 적용 확인 수단도 함께 사라집니다.
- `WSLENV` — WSL 프로젝트에 Windows 환경 변수를 넘길 때만(§3.4).
- `AWS_REGION`, `CLAUDE_CODE_USE_BEDROCK` 등 — 여기 두어도 동작하지만 **버킷 C가 더 깔끔합니다**(§3.2).

**여기에 두면 안 되는 변수**

- `AWS_PROFILE` — **설정하지 않는 것이 정상입니다.** SSO의 default 프로필이 쓰이며, Orca 프로덕션 코드에는 참조가 0건입니다(§3.1). named 프로필이 꼭 필요한 개별 사용자만 `설정 → Agents`의 에이전트별 env로 넣으세요.
- `CLAUDE_CONFIG_DIR` — **설정하지 마세요.** 값이 있으면 Orca가 그 값을 자식 환경에 재기입하고(`src/main/claude-accounts/runtime-paths.ts:23`), SSH 프로젝트에서는 **로컬 Windows 경로가 원격 셸로 들어갑니다**(§3.3).

> [!WARNING]
> **`setx`로 OS 환경 변수를 바꾼 뒤 Orca만 재시작해도 에이전트 터미널에는 반영되지 않습니다.** 터미널을 앱 재시작 이후까지 살려 두는 영속 데몬이 자기 fork 시점의 `process.env`를 계속 쓰고(`src/main/daemon/daemon-init.ts:466-471`, 재사용 판정 `:401`), 레지스트리에서 다시 읽어 병합하는 값은 `PATH` 하나뿐입니다(`src/main/pty/windows-environment-path.ts:114-146`). 반영시키려면 **데몬을 교체**(Manage Sessions → Restart)하거나 **로그아웃/재로그인**하세요.

**프록시를 어디에 둘 것인가** — 앱의 프록시 설정(`설정 → Advanced → Network`, `src/renderer/src/components/settings/AdvancedNetworkSettingsSection.tsx`)이 비어 있으면 `buildConfiguredProxyEnv`가 `{}`를 반환해 상속된 프록시 환경 변수를 전혀 건드리지 않습니다(`src/shared/network-proxy.ts:115-121`). 값이 들어 있으면 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`(대소문자 6종)를 **덮어쓰고**, `NO_PROXY`만은 상속값과 병합해 보존합니다(`:124-137`, 병합 소스 `:83-88`; 호출부 `src/main/ipc/pty.ts:982`). 따라서 **프록시는 OS 환경 변수에 두고 앱 설정은 비워 두는 것**이 예측 가능합니다.

### B. 정책 파일 — Orca 자신의 동작

전체 스키마·예제·롤아웃은 **[엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md)** 에 있습니다. 이 배포의 관리자가 실제로 쓰는 키는 다음 정도입니다.

```jsonc
// %ProgramData%\Orca\enterprise-policy.json
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net"
}
```

- `lockdown: true` — 마스터 스위치. 개별 `disable*` 키를 쓰지 않아도 전부 상속됩니다(`enterprise-policy.ts:52-60`, `:196-200`).
- `githubEnterpriseHost` — Gitea 폴백 오인 차단 + GHES blob/commit URL 인식(§2).
- `lockdown`을 쓰지 않을 거라면 **`disableManagedClaudeAccounts`와 `disableUsagePolling`은 Bedrock 플릿에서 명시적으로 켜야 합니다**(§3.3).
- `enforceNetworkAllowlist` / `allowedNetworkHosts` — `lockdown`을 상속하지 않는 opt-in(§4.3).

전체 키 목록과 각 키가 실제로 무엇을 끄는지는 §4.2 표를 보세요.

### C. Claude Code `~/.claude/settings.json` — Bedrock 키는 Orca가 건드리지 않지만, 파일 자체는 Orca도 씁니다

Bedrock 모델/리전/플래그가 들어가는 곳입니다. 두 가지를 분리해서 알아야 합니다.

**Orca가 건드리지 않는 것 — Bedrock 설정 그 자체.** `env`·`awsAuthRefresh` 같은 키를 Orca는 읽지도 쓰지도 않고, 파일 경로를 바꾸지도 않습니다. `CLAUDE_CONFIG_DIR`은 이미 상속된 값이 있을 때만 재기입되고, 사내는 이 변수를 설정하지 않으므로 `%USERPROFILE%\.claude`가 그대로 쓰입니다(`src/main/claude-accounts/runtime-paths.ts:15-24`).

**Orca가 건드리는 것 — 같은 파일의 `hooks`와 `statusLine`.** 에이전트 상태 훅이 이 파일에 설치됩니다. 경로는 `%USERPROFILE%\.claude\settings.json`으로 정해져 있고(`src/main/claude/hook-settings.ts:20-23`, `:64-66`), **앱을 띄울 때마다 자동으로 설치됩니다**(`src/main/index.ts:2179-2182`). 이 자동 설치를 막는 코드 게이트는 인자를 무시하고 항상 `true`를 돌려주므로(`src/main/startup/configure-process.ts:209-212`) 유일한 off 스위치는 `설정 → Agents`의 에이전트 상태 훅 토글입니다(`src/renderer/src/components/settings/AgentsPane.tsx:967-976`; 시작 시 이 값을 확인하는 곳은 `src/main/index.ts:2181`). 설치는 파일을 읽고(`src/main/claude/hook-service.ts:175`) `hooks`만 갈아끼운 뒤(`src/main/claude/hook-settings.ts:114-132` — `{ ...config, hooks }`로 나머지 키를 보존) 다시 씁니다(`src/main/claude/hook-service.ts:200`). 실무상 의미는 세 가지입니다:

- **Bedrock 블록은 살아남습니다.** `hooks`/`statusLine` 밖의 키는 `JSON.parse` → `JSON.stringify` 왕복으로 보존됩니다(`src/main/agent-hooks/hooks-json-read.ts:17-33`, `src/main/agent-hooks/installer-utils.ts:321`).
- **파일이 재포맷되고 `.bak`이 생깁니다.** 2-스페이스 인덴트로 다시 써지며, 직전 내용은 `settings.json.bak` 하나로 롤링 백업됩니다(`installer-utils.ts:344-346`).
- **주석이나 후행 쉼표를 넣지 마세요.** 이 파일은 엄격한 JSON으로 파싱되므로(`src/main/agent-hooks/hooks-json-read.ts:27-32`) 깨져 있으면 훅 설치가 `error` 상태로 끝나고 쓰기를 포기합니다(`src/main/claude/hook-service.ts:176-184`). **JSONC를 허용하는 것은 정책 파일(버킷 B)뿐이고 이 파일은 아닙니다.**

읽기 전용으로 이 파일을 보는 곳이 하나 더 있습니다 — 스킬/플러그인 탐색이 활성 플러그인 목록을 확인할 때입니다(`src/main/skills/claude-plugin-skill-sources.ts:37`).

Bedrock 설정 자체의 내용과 주의사항은 §3.

### D. 빌드 셸 전용 — 사용자 환경에는 절대 넣지 않습니다

| 변수 | 역할 | 근거 |
| --- | --- | --- |
| `ORCA_WIN_PUBLISHER_NAME` | electron-updater의 Authenticode 확인이 기대하는 publisherName. 기본값은 `SignPath Foundation` | `config/electron-builder.config.cjs:200-202` |
| `ORCA_DISABLE_PUBLISH_TARGET=1` | `publish` 타깃을 `null`로 만들어 업데이터 메타데이터를 아예 생성하지 않음 | `:405-413` (의도는 `:403-404` 주석) |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | electron-builder 고유의 Windows 코드 서명 입력 | electron-builder 계약 |
| `ORCA_MAC_RELEASE` | **반드시 비어 있어야 합니다.** `1`이면 `forceCodeSigning`이 최상위 설정으로 켜져(`:313`, 값 출처 `:16`) 서명 없는 Windows 빌드가 실패합니다 | `:16`, `:313` |
| `ORCA_STRICT_ELECTRON_INSTALL=1` | `pnpm install`의 postinstall이 Electron 바이너리 설치 실패를 **묵인하고 넘어가지 않게** 합니다. §1의 빌드 순서가 이 값을 켭니다 | `config/scripts/rebuild-native-deps.mjs:282` |
| `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_RELEASE_TOKEN` | electron-builder가 릴리스 업로드에 쓰는 자격증명. §1에서 **지우는** 대상입니다 — 남아 있으면 `--publish never`와 함께 쓰더라도 실수로 upstream에 올릴 여지를 남깁니다 | electron-builder 계약 |

이 표의 변수들은 **빌드·패키징 시점에만** 읽힙니다. 설치된 Orca는 어느 것도 읽지 않으므로 `setx`로 심을 이유가 전혀 없습니다.

> **이전 문서에 있던 `ORCA_ENTERPRISE_LOCKDOWN` / `ORCA_DISABLE_AUTO_UPDATE` / `ORCA_DISABLE_STAR_NAG` / `ORCA_DISABLE_TELEMETRY` / `ORCA_GITHUB_ENTERPRISE_HOST`는 전부 삭제되었습니다.** 코드 어디에도 없으므로 `setx`로 심어도 아무 일도 일어나지 않습니다.

---

## 1. 빌드 — Windows 설치 프로그램(.exe)

회사 Windows x64 머신에서 PowerShell로 빌드합니다. 전체 절차·서명·프록시·트러블슈팅은 **[Windows 사내 빌드 가이드](docs/reference/windows-corporate-build.md)** 참고.

```powershell
git checkout enterprise/samsungds
corepack enable ; corepack prepare pnpm@10.24.0 --activate
Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN, Env:GITHUB_RELEASE_TOKEN, Env:ORCA_MAC_RELEASE -ErrorAction SilentlyContinue
$env:ORCA_STRICT_ELECTRON_INSTALL = "1"
pnpm install --frozen-lockfile
pnpm build:release
node config/scripts/ensure-native-runtime.mjs --runtime=electron
pnpm exec electron-builder --config config/electron-builder.config.cjs --win --x64 --publish never
# 산출물: dist\orca-windows-setup.exe  (NSIS, per-user 설치, 기본 무서명)
```

**전제 조건**

- **Visual Studio 2022 Build Tools**("C++를 사용한 데스크톱 개발" 워크로드) + **Python 3** — 준비 부담의 대부분이 여기 있습니다. 매 빌드마다 네이티브 모듈을 소스에서 재컴파일합니다.
- **Node** — 회사 표준 최신 버전으로도 빌드됩니다. `package.json`의 `engines.node: "24"`는 강제되지 않고(경고만), 네이티브 모듈은 호스트 Node가 아니라 Electron ABI로 재빌드됩니다. 첫 빌드 전 `node config/scripts/ensure-native-runtime.mjs --check-only`가 exit 0인지만 확인하세요(플래그는 `config/scripts/ensure-native-runtime.mjs:19-21`).
- `--publish never`는 **필수**입니다. 빠지면 사내 CI(`CI=true`)에서 electron-builder가 `github.com/stablyai/orca`로 업로드를 시도합니다(`config/electron-builder.config.cjs:405-413`). 원커맨드 `pnpm build:win`에는 이 플래그가 없으므로 **그대로 쓰지 마세요.**

> 공개 배포본을 그대로 받아 쓰지 않는 이유: 공개 `.exe`는 자동 업데이트·텔레메트리가 켜진 빌드입니다. 사내에서는 이 브랜치를 직접 빌드해 외부 연동을 잠급니다(§4).

---

## 2. 사내 GitHub Enterprise (`github.samsungds.net`)

Orca의 GitHub 연동은 `gh` CLI를 통하며 GHES를 **원본 단계에서 이미 지원**합니다(github.com 하드코딩 아님).

```powershell
# 사용자별 1회. 이 단계가 빠지면 GHES 리모트는 GitHub로 인식되지 않습니다.
gh auth login --hostname github.samsungds.net
gh auth status                      # github.samsungds.net 이 목록에 보여야 함
```

#### 무엇이 "이 호스트는 GitHub다"를 결정하는가 — `gh auth status`입니다

사내 GHES 같은 커스텀 호스트를 GitHub로 판정하는 신호는 **오직 `gh auth status` 인벤토리**입니다. 정책 파일도, 환경 변수도 아닙니다. `github.com`은 호스트명만으로 바로 처리되고(`src/main/github/github-api-repository.ts:102-103`) 엔터프라이즈 판정 경로는 그 호스트에서 즉시 빠집니다(`src/main/github/github-enterprise-repository.ts:228-229`).

- `github-enterprise-repository.ts:151-152`가 `gh auth status`를 실행하고, `:98-122`(`authenticatedHostFromInventory`)가 리모트 호스트를 그 목록과 대조합니다. 목록에 없으면 `:213-242`가 `null`을 돌려주고 GitHub 경로는 그대로 포기합니다.
- 호출 체인: `src/main/source-control/forge-provider.ts:131-132` → `src/main/github/client.ts:1605-1615`(`getRepoSlug`) → `src/main/github/github-api-repository.ts:119-137` → `github-enterprise-repository.ts:245-249`.
- 코드 주석이 이 계약을 명시합니다 — "`gh`는 github.com / GitHub Enterprise 자격증명만 관리하므로, `gh auth status`가 로그인됐다고 보고하는 호스트는 확정적으로 GitHub 호스트다"(`github-enterprise-repository.ts:19-20`).

**따라서 `gh auth login --hostname github.samsungds.net`은 선택이 아니라 필수입니다.** PR·이슈가 안 보인다는 신고가 들어오면 정책 파일이 아니라 **`gh auth status`부터** 확인하세요. `gh`가 아예 없거나 spawn에 실패하면 판정이 "미확정"으로 남아 캐시되지 않습니다(`:155-159`).

#### 정책의 `githubEnterpriseHost`가 하는 일

두 가지입니다. **GitHub로 인식시키는 기능은 여기 없습니다**(그건 위의 `gh auth status`입니다).

1. **Gitea 폴백 오인 차단** — 그 호스트를 Gitea 폴백에서 제외합니다(`src/main/gitea/repository-ref.ts:91-99`). `gh` 인증이 없거나 깨진 상태에서는 GitHub 판정이 실패하고, 탐색 순서의 마지막인 Gitea 프로바이더(`forge-provider.ts:265-271`: gitlab → github → bitbucket → azure-devops → gitea)가 사내 호스트를 자기 것으로 주장해 `https://github.samsungds.net/api/v1/...`라는 존재하지 않는 엔드포인트를 때립니다. 이 키가 그 잘못된 요청을 막습니다.
2. **GHES 퍼머링크 인식** — GHES는 `/owner/repo/blob/<ref>/<path>#L<n>` 형태를 호스트 루트에 그대로 서비스하므로, 호스트를 알아보는 것만으로 blob/commit URL이 GitHub 프로바이더로 매핑됩니다(`src/main/git/hosted-remote-url.ts:38-42`).

```jsonc
// 정책 파일 (§4)
{ "githubEnterpriseHost": "github.samsungds.net" }
```

값이 없으면 `gh`의 `GH_HOST`를 폴백으로 읽습니다(`enterprise-policy.ts:203`). 프로토콜·포트·경로·자격증명이 붙어 있어도 호스트명만 정규화해 씁니다(`:110-123`).

#### git 바이너리(clone/fetch/push·워크트리) 전제조건

PR/이슈 표시는 `gh` API를 타지만, **클론·페치·푸시, 그리고 워크트리 생성 시 base 브랜치 페치는 `git` 바이너리**가 직접 `origin`(= 사내 GHES)로 나갑니다. `git worktree add` 자체는 로컬이지만 base 브랜치가 로컬에 없으면 생성 과정에서 `git fetch origin`이 일어나므로, 아래가 갖춰져야 워크트리가 막힘없이 만들어집니다.

- **git 자격증명**: `gh auth login`만으로는 `git` HTTPS 인증이 자동 설정되지 않습니다. `gh auth setup-git --hostname github.samsungds.net`(gh를 git credential helper로 등록)이나 Windows 자격증명 관리자/SSH 키를 함께 설정하세요.
- **사설 CA**: `NODE_EXTRA_CA_CERTS`는 Orca의 Node 계층에만 적용되고 **`git`/`gh` 바이너리 TLS엔 무관**합니다. `git`은 TLS 백엔드에 따라 신뢰 저장소가 다릅니다:
  - `http.sslBackend=schannel` (Git for Windows 설치 기본값) — **Windows 인증서 저장소**를 씁니다. 사내 루트 CA를 (보통 GPO로) 저장소에 넣어야 하며, **`http.sslCAInfo`는 schannel에서 무시됩니다.**
  - `http.sslBackend=openssl` — 이때만 `git config --global http.sslCAInfo C:\path\to\corp-root-ca.pem`이 의미가 있습니다. 먼저 `git config --global http.sslBackend openssl`로 전환해야 합니다.
  - 현재 값 확인: `git config --get http.sslBackend`
- **프록시**: `HTTPS_PROXY`가 외부 프록시를 가리키면 내부 호스트를 `NO_PROXY`에 넣거나(`setx NO_PROXY "github.samsungds.net,.samsungds.net"`) 프록시가 내부 라우팅을 하도록 하세요. git 서브프로세스는 이 env를 상속합니다.

---

## 3. AWS Bedrock으로 Claude 사용

Bedrock 인증은 **Claude Code CLI 자체**가 AWS 기본 자격증명 체인으로 처리합니다. Orca는 이 흐름에 관여하지 않습니다.

### 3.1 결론부터 — `AWS_PROFILE`은 설정하지 않는 것이 정상입니다

사내는 SSO(`aws sso login`)를 쓰고 `AWS_PROFILE`을 지정하지 않으므로 **default 프로필/SSO 세션이 쓰입니다.** 이것을 Orca가 방해할 지점이 없음을 코드로 확인했습니다.

| 확인 항목 | 결과 | 근거 |
| --- | --- | --- |
| Orca가 `AWS_PROFILE`을 읽거나 쓰거나 기본값을 주는가 | **아니오.** 프로덕션 코드 참조 0건 (테스트 픽스처 2곳뿐) | `src/main/claude-accounts/environment.test.ts:13`, `:72` — 후자는 `AWS_PROFILE`/`AWS_REGION`을 "인증 변수"로 분류하지 **않는다**는 회귀 테스트 |
| PTY 환경에 화이트리스트가 있는가 | **아니오.** `process.env` 전체를 상속한 뒤 소수의 명시적 `delete`만 적용 | `src/main/providers/local-pty-provider.ts:647`, `src/main/daemon/pty-subprocess.ts:562-563` |
| Orca가 지우는 `AWS_*` 변수 | **`AWS_BEARER_TOKEN_BEDROCK` 단 하나.** SSO 플릿은 쓰지 않으므로 무해 | `src/main/claude-accounts/environment.ts:3-8` |
| `HOME`/`USERPROFILE`을 바꾸는가 | **아니오.** 프로덕션 코드의 모든 참조가 읽기입니다 → `%USERPROFILE%\.aws\config`와 `%USERPROFILE%\.aws\sso\cache`를 CLI가 정상적으로 찾습니다 | 읽기 지점: `src/main/providers/pty-default-cwd.ts:19`, `src/relay/pty-shell-utils.ts:84`, `src/relay/relay-command-env.ts:110-121`. 재검증: `grep -rn USERPROFILE src/main src/shared src/relay` |
| `CLAUDE_CONFIG_DIR`을 리다이렉트하는가 | 상속값이 이미 있을 때만. 사내는 설정하지 않으므로 `%USERPROFILE%\.claude`가 그대로 쓰입니다 | `src/main/claude-accounts/runtime-paths.ts:15-24` |

SSO는 환경 변수가 아니라 **파일**(토큰 캐시) 기반이므로 마지막 두 항목이 핵심입니다. 사전에 `aws sso login`을 한 번 끝내 두면 됩니다. named 프로필이 꼭 필요할 때만 `AWS_PROFILE`을 추가하세요 — `설정 → Agents`의 에이전트별 env로 넣는 것도 정상 동작합니다.

### 3.2 모델·리전·플래그는 Claude Code 설정 파일에 (버킷 C)

```jsonc
// %USERPROFILE%\.claude\settings.json  ← 아래 블록을 읽는 것은 Claude Code CLI입니다
// (Orca는 같은 파일의 hooks/statusLine 키만 씁니다 — §0.C)
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "us-east-1",
    "ANTHROPIC_MODEL": "<Bedrock inference profile ARN 또는 모델 ID>"
  },
  "awsAuthRefresh": "aws sso login"
}
```

> [!NOTE]
> **위 키 이름과 의미는 Claude Code CLI의 계약이며 이 저장소 코드로 검증할 수 없습니다.** 정확한 스펙은 Claude Code 문서를 따르세요. 이 저장소에서 검증한 것은 "Orca가 **이 키들**(`env`, `awsAuthRefresh`)에 관여하지 않고 경로 리다이렉트도 하지 않는다"는 사실뿐입니다. **파일 자체는 Orca도 씁니다** — `hooks`/`statusLine` 키에 한정되며 나머지 키는 보존되지만, 그래서 이 파일에 **주석이나 후행 쉼표를 넣으면 안 됩니다**(§0.C).
>
> **SSO + 사내 프록시/VPN 주의**: 브라우저 SSO 흐름이 막히는 환경이면 `awsAuthRefresh`가 인증 루프를 유발할 수 있습니다. 그럴 땐 `awsAuthRefresh`를 빼고 세션 시작 전 수동으로 `aws sso login`을 끝내 두세요.

### 3.3 반드시 켜야 하는 정책 키 두 개

- **`disableManagedClaudeAccounts` — 권장이 아니라 필수입니다.**
  이 기능은 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`**을, 그리고 인증 정보가 담긴 것으로 판정되면 `ANTHROPIC_CUSTOM_HEADERS`까지 제거합니다(`claude-accounts/environment.ts:3-8`, `:22-29`).
  Windows 호스트에서는 관리형 계정을 **선택한 동안에만** 제거되지만(`claude-accounts/runtime-auth-service.ts:667`), **WSL 런타임을 고르면 관리형 계정이 하나도 없어도 제거가 켜지고**(`:647`, `:657` — upstream v1.4.155는 이 두 곳이 `stripAuthEnv: true` 하드코딩이었고 포크가 `!managedAccountsDisabled`로 바꿨습니다), 런치 환경에 해당 변수가 있으면 PTY 스폰이 `This Claude launch defines explicit Anthropic auth environment variables.`로 **하드 실패**합니다(`src/main/ipc/pty.ts:2955-2959`, `:4013-4017`).
  스위치를 켜면 활성 계정이 `null`로 고정되고(`runtime-auth-service.ts:613-616`) 하드코딩 호출자까지 최후 방어선에서 막혀(`environment.ts:22`) 이 실패 조건이 사라지며, `platform.claude.com`으로 나가는 OAuth 토큰 회전도 함수 진입부에서 차단됩니다(`claude-accounts/oauth-refresh.ts:131-133`).
  SSO 플릿은 bearer token을 쓰지 않으므로 오늘 당장 깨지지는 않습니다. 하지만 **누군가 bearer token으로 우회하거나 `ANTHROPIC_API_KEY`를 병기하는 순간 WSL 런치가 즉시 실패합니다.** SSH 경로도 같은 스위치로 함께 정리됩니다 — 스트립이 켜져 있으면 `envToDelete`가 릴레이까지 전송되어 **원격 spawn env에서** 해당 변수가 삭제되고(`src/main/providers/ssh-pty-spawn-request.ts:21`), `claudeAuth.envPatch`가 `connectionId` 유무와 무관하게 SSH env에 병합됩니다(`pty.ts:3014-3016`, `:4049-4051`). 후자는 사내에서 `CLAUDE_CONFIG_DIR`을 설정하지 않아 지금은 빈 객체이므로 실제 피해가 없지만, 누군가 이 변수를 심으면 **로컬 Windows 경로가 원격 셸에 들어갑니다.**

- **`disableUsagePolling` — Bedrock 전용 머신에서도 `api.anthropic.com`으로 나갑니다.**
  Orca는 창이 보이고 포커스된 동안(`src/main/rate-limits/service.ts:770-779` `shouldBackgroundPoll`) 15분 주기로(`:75` `DEFAULT_POLL_MS`) `https://api.anthropic.com/api/oauth/usage`(`src/main/rate-limits/claude-fetcher.ts:46`)를 호출합니다. 이 호출은 Orca의 관리형 계정 등록 여부와 무관하고, 과거 OAuth 로그인 흔적(`~/.claude/.credentials.json` 등, `claude-fetcher.ts:190-194`)만 있으면 켜집니다. 게다가 이 경로에는 `claude` CLI를 숨겨서 스폰하는 PTY도 있어(`src/main/rate-limits/claude-pty.ts:244-245`, spawn env = `{...process.env}`) **Bedrock 환경에서는 예상치 못한 Bedrock 호출·과금**이 발생할 수 있습니다.

`lockdown: true`면 둘 다 자동으로 켜집니다(`enterprise-policy.ts:52-60`, `:196-200`).

### 3.4 함정 — 실제로 사람들이 밟는 것들

- **`설정 → Agents`의 에이전트별 env는 OS 값을 덮어씁니다(shadow).** 빈 값을 넣으면 변수가 삭제되는 게 아니라 **빈 문자열로 덮어써지고 그 빈 문자열이 이깁니다.** `AWS_REGION=` 한 줄이 `{AWS_REGION: ''}`로 파싱되고(`src/renderer/src/components/settings/agent-default-env-draft.ts:24-32`), 정규화가 빈 문자열을 보존하며(`src/shared/tui-agent-launch-defaults.ts:62-67`), 병합에서 override가 최종 승자입니다(`src/shared/git-credential-prompt-env.ts:11`). 지우려면 **항목 자체를 삭제**하세요.
- **WSL 프로젝트에는 어떤 `AWS_*` 변수도 넘어가지 않습니다.** `wsl.exe`는 `WSLENV`에 등재된 변수만 가져오는데, Orca가 등재하는 것은 `ORCA_*` 계열(`src/main/pty/wsl-orca-env.ts:58-76`)과 `CODEX_HOME`/`ORCA_CODEX_HOME`/`CLAUDE_CONFIG_DIR`/Hermes·p10k 변수(`src/main/providers/local-pty-provider.ts:710`, `:727`, `:731`, `:735`, `:749` — 데몬 경로는 `src/main/daemon/pty-subprocess.ts:675`, `:698-706`, `:767`), 그리고 git credential 가드 키(`src/shared/git-credential-prompt-env.ts:112`)뿐이고 AWS는 어디에도 없습니다. 따라서 WSL 프로젝트는 **게스트 안에서 따로** 구성해야 합니다:
  1. 게스트에 AWS CLI v2를 설치하고 **게스트 안에서 `aws sso login`을 별도로 실행** — 토큰 캐시는 게스트의 `~/.aws/sso/cache`이고 Windows의 것과 다른 파일입니다. 표준 환경 변수로 캐시 위치를 옮길 수 없으므로 Windows 캐시 재사용은 사실상 불가합니다.
  2. 게스트에 Claude Code CLI를 설치하고 **게스트의** `~/.claude/settings.json`에 Bedrock 블록을 둡니다. Windows 쪽 파일은 읽히지 않습니다.
  3. 리전/플래그만 Windows에서 넘기고 싶다면 `setx WSLENV "AWS_REGION/u:CLAUDE_CODE_USE_BEDROCK/u"`처럼 `WSLENV`를 직접 채우세요 — Orca는 기존 `WSLENV`를 **보존하고 append만** 하므로 이 값이 살아남습니다(`src/shared/wsl-env.ts:5-16`). **자격증명 자체는 이 방법으로 넘길 수 없습니다.**
- **SSH 원격 호스트에는 Windows 쪽 AWS 변수가 넘어가지 않습니다.** 호스트 env를 조립하는 `buildPtyHostEnv`는 SSH 경로에서 아예 호출되지 않고(계약은 `src/main/ipc/pty.ts:973-975` 주석, 게이트는 `:4020-4023`의 `!args.connectionId`), 릴레이는 **자기 자신의 `process.env`**(SSH exec 채널이 준 환경)에 렌더러가 보낸 env만 얹어 PTY를 만듭니다(`src/relay/pty-handler.ts:424-435`). 따라서 원격에서 별도로 `aws sso login`을 수행하고, 원격의 `~/.claude/settings.json`과 로그인 셸 프로필에 설정을 두어야 합니다.
- **`enforceNetworkAllowlist`는 Bedrock 호출과 무관합니다.** Electron session과 메인 프로세스 `fetch`만 감싸므로(`src/main/enterprise/enterprise-network-guard.ts:128-136`) 자식 프로세스(Claude Code CLI, `git`, `gh`)의 egress에는 적용되지 않습니다. `bedrock-runtime.<region>.amazonaws.com`을 `allowedNetworkHosts`에 넣을 필요가 없고, 넣어도 CLI에는 아무 효과가 없습니다.
- `setx` 후 데몬 staleness — §0의 경고 박스를 참고하세요. Bedrock 설정을 OS 환경 변수로 넣었을 때 "설정했는데 안 먹는다"의 1순위 원인입니다.

### 3.5 대안 — 사내에서 직접 서비스하는 모델

사내가 오픈웨이트 모델을 직접 서비스한다면, 세션을 Bedrock 대신 그쪽으로 돌릴 수 있습니다. 스키마 전체는 [정책 파일 레퍼런스 §3-2](docs/reference/enterprise-policy.md)에 있고, 여기서는 **사람이 밟는 경로**만 적습니다.

**역할이 둘로 나뉩니다.** 관리자는 정책 파일에 엔드포인트(URL·프로토콜·모델)를 배포하고, **토큰은 사용자가 각자 입력**합니다. 정책 파일은 그 PC의 모든 계정이 읽을 수 있어서, 토큰을 거기 넣으면 머신 공용이 되고 개인별 추적이 불가능해지기 때문입니다.

1. **토큰 넣기** — **설정 → Accounts → "Self-hosted models"**. 관리자가 배포한 엔드포인트가 목록에 뜹니다. base URL을 확인하고(내 토큰을 어느 호스트에 맡기는지 보라고 노출해 둔 값입니다) 토큰을 붙여넣고 저장합니다. Orca가 이 기기의 자격증명 저장소로 암호화해 보관하며 **다시 보여주지 않습니다.** 교체와 삭제만 가능합니다.
2. **세션에서 고르기** — 실행 중인 세션의 **모델 핀**에서 사내 LLM을 고릅니다.

> [!IMPORTANT]
> **첫 실행에서는 고를 수 없습니다.** 모델 선택 표면이 세션이 뜬 뒤에 붙기 때문에, 새 설치의 첫 세션은 Bedrock으로 시작합니다. 그 세션의 모델 핀에서 사내 LLM을 고르면 **이후 런치부터** 적용됩니다. 이걸 모르면 "설정했는데 안 먹는다"로 오해하기 쉽습니다.
>
> **선택 범위는 워크스페이스가 아니라 에이전트 단위입니다.** 이 코드베이스에 워크스페이스별 에이전트 설정 계층이 없어서, 한 번 고르면 그 에이전트의 이후 모든 런치에 적용됩니다.

**안 먹을 때**: 스폰이 죽지 않고 조용히 기존 백엔드(Bedrock)를 유지하도록 만들어 두었습니다 — 인증 없는 요청을 보내거나 터미널이 안 뜨는 것보다 낫다는 판단입니다. 그래서 증상이 조용하니, 해당 세션 터미널에서 `echo $env:ORCA_CORPORATE_LLM_ENDPOINT`(WSL이면 `echo "$ORCA_CORPORATE_LLM_ENDPOINT"`)로 확인하세요. 진단 절차는 [레퍼런스 §7-5](docs/reference/enterprise-policy.md).

**WSL과 사내 CA**: WSL 프로젝트도 지원됩니다 — Bedrock과 달리 사내 LLM 변수는 `WSLENV`로 게스트까지 넘어갑니다(`src/main/enterprise/corporate-llm-wsl-passthrough.ts`). 엔드포인트가 사내 인증서를 쓰면 `NODE_EXTRA_CA_CERTS`를 **OS 환경 변수(버킷 A)로** 심으세요. Windows 호스트에서는 이미 전달되고, WSL에도 경로 번역과 함께 넘어갑니다.

---

## 4. 외부 연동 잠금 — 관리자 소유 정책 파일

### 4.1 정책 파일을 어디에 두는가 — 먼저 발견된 파일이 이깁니다

탐색 순서를 조립하는 곳은 `enterprise-policy-file.ts:59-83`이고, 그 후보를 순서대로 읽다가 **처음 열린 파일에서 멈추는** 곳은 `:119-151`입니다(설계 의도는 `:49-58` 주석). 따라서 사용자별 파일이 머신 전역 파일을 완화할 수 없습니다.

**패키징 빌드 — 사용자 PC에 설치된 `.exe`. 플릿에서 유일하게 의미 있는 순서입니다.**

| 순위 | 위치 | 비고 |
| --- | --- | --- |
| 1 | **머신 전역** — `%ProgramData%\Orca\enterprise-policy.json` (`:39-42`) | 사내 배포에서 쓸 위치 |
| 2 | `ORCA_ENTERPRISE_POLICY` 환경 변수 | 명시 경로가 **후보에 추가**될 뿐. `off`/`none`/`disabled`/`false`/`0`은 **무시됩니다**(`:28`, `:66-67`) |
| 3 | 사용자별 — `<userData>\enterprise-policy.json` | 개인 테스트용 |

**비패키징(`pnpm dev`·vitest)에서만** `ORCA_ENTERPRISE_POLICY`가 1순위를 가져가고, 무력화 값으로 탐색 전체를 끌 수 있습니다(`:68-75`; 테스트 스위트가 이 값을 씁니다).

> 🔒 **환경 변수는 사내 잠금을 끌 수 없습니다 — 이게 보안 속성입니다.** Windows에서 표준 사용자는 관리자 권한 없이 자기 계정의 환경 변수를 만들 수 있습니다. `setx ORCA_ENTERPRISE_POLICY off` 한 줄로 잠금이 풀린다면 그건 정책이 아닙니다. 그래서 패키징 빌드에서는 이 변수가 후보를 **추가**만 하고, 머신 전역 파일은 **항상 먼저** 탐색됩니다(`enterprise-policy-file.ts:49-58` 주석, 분기는 `:79-82`). 판정 신호는 `app.isPackaged`입니다 — 표준 사용자가 바꿀 수 없는 유일한 신호이기 때문입니다(`:163-171`).
>
> **배포상의 결론: 파일은 위 1순위의 머신 전역 기본 경로에 두고, 사용자가 쓰지 못하도록 ACL을 거세요(§5.2).** 환경 변수로 커스텀 경로를 지정하는 방식은 **개발·검증용이지 플릿용이 아닙니다.**

**머신 전역 위치가 이 설계의 핵심입니다.** `setx`는 사용자별 상태를 쓰기 때문에, 같은 PC의 다른 Windows 프로필·서비스 계정·앞으로 새로 만들어질 프로필은 전부 잠기지 않은 채로 남습니다(`enterprise-policy-file.ts:9-11`).

정책은 프로세스당 **한 번만** 읽고 캐시합니다(`:180-199`). 파일을 바꾸면 **Orca를 재시작**해야 반영됩니다.

### 4.2 파일 형식

JSONC입니다 — `//` 주석과 후행 쉼표를 허용합니다(`enterprise-policy-file.ts:142-144`). UTF-8 BOM과 PowerShell 5.1의 UTF-16LE 출력도 자동으로 처리합니다(`:124-129`, `:139-142`).

```jsonc
// %ProgramData%\Orca\enterprise-policy.json
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",

  // 개별 예외: lockdown 아래에서도 이 기능만 되살립니다
  "disableSpellcheck": false
}
```

| 키 | 기본값 | 무엇을 끄는가 (검증한 근거) |
| --- | --- | --- |
| `lockdown` | `false` | 마스터 스위치. 추가로 **Chromium의 DNS-over-HTTPS 자동 승격을 끄고** OS 리졸버로 고정합니다(`src/main/enterprise/enterprise-secure-dns.ts:19-24`, 배선 `src/main/index.ts:1793`), **`node:https` 직접 다운로드를 거부합니다**(`enterprise-direct-download-guard.ts:17-25`) |
| `disableTelemetry` | `lockdown` 상속 | PostHog 텔레메트리(`telemetry/consent.ts:88`) + 진단/크래시 번들 **업로드 레인**(`observability/index.ts:103`, `:120-133`) + **앱 내 피드백·크래시 리포트 전송**(`ipc/feedback-submission-policy.ts:13-16` → `ipc/feedback.ts:262`). **로컬 NDJSON 로그는 계속 기록됩니다** — 네트워크만 막습니다 |
| `disableAutoUpdate` | `lockdown` 상속 | 업데이트 피드 조회 단일 초크포인트(`updater.ts:1179` `runBackgroundUpdateCheck`), 메뉴의 수동 "업데이트 확인"(`:1251` `checkForUpdatesFromMenu`), 그리고 **onorca.dev 넛지 스케줄러·powerMonitor 리스너가 아예 배선되지 않도록**(`:1458` `setupAutoUpdater`) |
| `disableStarNag` | `lockdown` 상속 | github.com SaaS로 가는 star 조회/쓰기 — `github/client.ts:234`(`checkOrcaStarred`), `:401`(`starOrca`). **게이트를 서비스가 아니라 클라이언트 함수에 뒀습니다** — 넛지 서비스(`star-nag/service.ts:121`) 말고도 `star-nag/direct-star-attempt.ts:9`, `star-nag/agent-value-moment.ts:46`, IPC 핸들러 `ipc/github.ts:1174`·`:1177`이 같은 함수로 들어옵니다 |
| `disableCloudRelay` | `lockdown` 상속 | `orca-profiles/profile-cloud-auth-config.ts:73`이 "미구성"으로 응답 → Orca Cloud 로그인, 조직 멤버 조회(`orca-profiles/profile-cloud-org-members-service.ts:119`), 그리고 **데스크톱↔모바일 페어링 릴레이**(`src/main/index.ts:2427-2430`이 `configured`일 때만 `DesktopRelayService`를 만듭니다)가 한꺼번에 꺼집니다. 단일 초크포인트임을 `:71-72` 주석이 명시 |
| `disableUsagePolling` | `lockdown` 상속 | AI 벤더 사용량/레이트리밋 폴링. 게이트는 `rate-limits/service.ts:734-735`, 진입점은 `start()`(`:310`), Codex 리셋 크레딧(`:426`), 계정 스위처 프리뷰 2종(`:500`, `:580`), `fetchAll`(`:895`), `fetchCodexOnly`(`:960`), `fetchClaudeOnly`(`:1022`), `fetchGrokOnly`(`:1087`). 벤더 백엔드로 POST하는 경로는 예외를 던집니다 |
| `disableManagedClaudeAccounts` | `lockdown` 상속 | Orca 관리형 Claude 계정 — `platform.claude.com` OAuth 토큰 회전(게이트 `claude-accounts/oauth-refresh.ts:131-133`)과 에이전트 PTY로 가는 환경에서 AWS Bedrock 자격증명을 지우는 동작(게이트 `runtime-auth-service.ts:613-616` + `environment.ts:22`)을 함께 끕니다. **Bedrock 플릿에서는 필수 — §3.3** |
| `disableSpellcheck` | `lockdown` 상속 | Chromium 맞춤법 사전 CDN 다운로드. 자체 세션을 갖는 WebContents는 메인 창의 게이트를 상속하지 않으므로 **여섯 곳**에 개별로 걸려 있습니다: 메인 창(`window/createMainWindow.ts:253`), webview 게스트(`:425`), 임베디드 브라우저 팝업(`browser/browser-manager.ts:193`), 오프스크린 브라우저(`browser/offscreen-browser-backend.ts:45`), 대시보드 팝아웃(`window/dashboard-popout-window.ts:176`), PDF 렌더러(`lib/html-to-pdf.ts:46`) |
| `enforceNetworkAllowlist` | **항상 `false`** (상속 안 함) | 아래 4.3 |
| `allowedNetworkHosts` | `[]` | 허용 호스트 목록. `enforceNetworkAllowlist`가 켜졌을 때만 의미가 있습니다 |

전체 스키마와 예제는 **[엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md)** 를 보세요.

**값 해석 규칙** (`enterprise-policy.ts:83-106`)

- JSON `true` / `false`가 정식입니다. 문자열 `"true"`/`"yes"`/`"on"`/`"1"`과 `"false"`/`"no"`/`"off"`/`"0"`도 받습니다(대소문자·공백 무관 — `:73-74`).
- **알아볼 수 없는 값은 "꺼짐"이 아니라 "없음"으로 취급**되어 `lockdown`을 상속하고, 경고를 남깁니다. 관리자 오타가 조용히 머신을 풀어버리는 사고를 막기 위한 설계입니다(`:80-82`).
- 모르는 키도 경고합니다(`:190-194`). JSON 자체가 깨졌으면 **일부만 적용하지 않고 파일 전체를 버립니다**(`enterprise-policy-file.ts:145-148`).
- 경고는 `[enterprise-policy]` 접두사로 stderr에 나가고 **동시에 버퍼링되어 NDJSON 로그에 남습니다**(`enterprise-policy-file.ts:98-103`). Start Menu로 띄운 Windows GUI 프로세스에는 콘솔이 없어 stderr가 사라지기 때문입니다(§5.2).

### 4.3 네트워크 허용 목록 (opt-in)

`enforceNetworkAllowlist`는 **`lockdown`을 상속하지 않습니다.** 잘못된 허용 목록은 기능 스위치와 달리 배포 전체를 깨뜨릴 수 있어서 관리자가 명시적으로 켜야 합니다(`enterprise-policy.ts:212-214`, `enterprise-network-guard.ts:15-16`).

켜면 두 곳을 막습니다(`enterprise-network-guard.ts:79-97`, `:99-122`):

- `session.defaultSession`의 `webRequest.onBeforeRequest` — 이 세션을 지나는 요청. 렌더러 요청이 대표적입니다. 로그 라벨은 `renderer request`(`:93`) *(세션 범위는 Electron 계약이지 이 저장소 코드의 사실은 아닙니다 — 실제 차단 여부는 배포 전 1대에서 확인하세요.)*
- 메인 프로세스의 global `fetch` 래퍼(`:111`, 라벨 `main-process fetch`) — Node의 global fetch를 쓰는 메인 클라이언트용. `network/proxy-settings.ts`의 사내 프록시는 Electron 세션에만 적용되어 global fetch를 못 보기 때문입니다(`enterprise-network-guard.ts:3-7`)

`githubEnterpriseHost`는 항상 허용 목록에 자동 추가되고(`enterprise-policy.ts:204-207`), loopback은 언제나 통과합니다(`enterprise-network-guard.ts:47-55`). 차단은 호스트당 한 줄씩 stderr로 보고됩니다(`:36-45`).

`node:https`로 직접 나가는 다운로드는 이 두 레인을 모두 우회하므로 별도 가드가 있습니다 — `lockdown`이면 무조건 거부, 아니면 `allowedNetworkHosts` 대조(`enterprise-direct-download-guard.ts:17-32`). 현재 유일한 적용 지점은 Android 에뮬레이터의 `scrcpy.jar` 다운로드입니다(`src/main/emulator/android/scrcpy-server-download.ts:42`).

### 4.4 잠금이 **덮지 않는** 것 (정직하게)

- **에이전트 CLI 자체의 통신** — Claude Code, Codex 등이 어디로 나가는지는 Orca의 통제 밖입니다. Orca는 PTY만 띄웁니다. 허용 목록도 자식 프로세스에는 적용되지 않습니다(§3.4).
- **임베디드 브라우저** — `persist:` 파티션에서 돌며 허용 목록에서 **의도적으로 제외**됩니다. 임의 사이트 탐색이 그 기능의 목적이고, 해당 파티션의 단 하나뿐인 `onBeforeRequest` 슬롯은 이미 인증서 게이트가 쓰고 있습니다(`enterprise-network-guard.ts:9-13`).
- **패키징된 렌더러에 CSP가 없습니다** — 에이전트 카탈로그의 favicon/아바타/첨부 URL을 그대로 로드하기 때문입니다(`enterprise-network-guard.ts:3-4`, `src/renderer/index.html:6`). 이 구멍을 실제로 막는 유일한 수단이 `enforceNetworkAllowlist`입니다.
- **로컬 진단 로그** — `disableTelemetry`는 egress만 끕니다. NDJSON 파일은 계속 기록됩니다(`observability/index.ts:120-133`). 로컬 파일까지 멈추려면 정책 키가 아니라 upstream의 `ORCA_DIAGNOSTICS_DISABLED` 환경 변수를 써야 하며(`:113-118`), 그러면 §5.2의 확인 수단도 사라집니다.

어떤 기능이 어떤 호스트로 나가는지 전체 목록은 **[외부 연동 감사 및 차단 계획](docs/reference/external-integrations-audit.md)** 을 참고하세요.

---

## 5. 사내 배포(롤아웃)

### 5.1 산출물 — per-user NSIS 설치 프로그램

`config/electron-builder.config.cjs:226-235`의 `nsis` 블록은 `oneClick`과 `perMachine`을 **설정하지 않습니다.** 산출물 이름은 `orca-windows-setup.exe`로 고정입니다(`:227`). 따라서 electron-builder 기본값이 적용되어 **원클릭·사용자별 설치**가 되고, `%LOCALAPPDATA%\Programs\` 아래에 설치되며 관리자 권한이 필요 없습니다. *(여기서 코드로 검증한 것은 두 키가 설정되지 않았다는 사실까지입니다. `oneClick: true`/`perMachine: false` 기본값과 그에 따른 설치 위치·권한은 electron-builder/NSIS의 계약이므로 배포 전 1대에서 확인하세요.)*

- 무인 설치: `orca-windows-setup.exe /S` — NSIS 원클릭 설치 프로그램의 표준 동작입니다. *(electron-builder/NSIS의 계약이지 이 저장소 코드의 사실은 아닙니다. 배포 전 1대에서 검증하세요.)*
- 관리자 권한이 필요 없으므로 사용자 단위 소프트웨어 배포 채널(Intune 사용자 대상 앱 등)로 밀 수 있습니다.
- 제거 시 `%LOCALAPPDATA%` 아래로 재배치된 터미널 데몬을 정리하는 NSIS 스크립트가 포함되어 있습니다(`:231-234`, 스크립트는 `config/nsis/daemon-host-uninstall.nsh`).

### 5.2 정책 파일 배포

**설치 프로그램은 정책 파일을 만들지 않습니다.** `nsis.include`에 들어 있는 스크립트는 데몬 제거용 하나뿐입니다(`:234`). 정책 파일은 앱 배포와 **완전히 분리된 경로**로 넣어야 합니다.

- 대상: **`%ProgramData%\Orca\enterprise-policy.json` — 기본 머신 전역 경로를 쓰세요.** 패키징 빌드에서 이 경로가 1순위이고 환경 변수가 이것을 밀어낼 수 없기 때문입니다(§4.1). **`ORCA_ENTERPRISE_POLICY`는 배포하지 마세요** — 필요하지 않고, 개발·검증용입니다.
- **ACL을 함께 고정하세요 — 사용자가 쓸 수 있는 정책 파일은 정책이 아니라 기본값입니다.** 관리자가 넣어 둔 파일은 기본 ACL에서 표준 사용자가 수정·삭제할 수 없지만, `%ProgramData%` 루트는 표준 사용자도 새 폴더·파일을 만들 수 있으므로 **파일이 아직 없는 머신에서는 사용자가 자기 소유의 정책 파일을 먼저 만들 수 있습니다.** 배포 스크립트에서 폴더 상속을 끊고 `Users`를 읽기 전용으로 내리세요 — 구체적인 `icacls` 명령은 [엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md) §6-1에 있습니다. *(Windows ACL 동작이지 이 저장소 코드의 사실은 아닙니다.)*
- 수단: GPO 파일 기본 설정, Intune 구성 프로필/스크립트, SCCM 패키지 등 기존 구성 관리 채널. *(운영 권고 — 코드가 강제하는 바가 아닙니다.)*
- 순서는 상관없습니다. 정책 파일이 앱보다 먼저 들어가도 되고 나중에 들어가도 되지만, 정책은 프로세스 시작 시 1회만 읽히므로(`enterprise-policy-file.ts:180-199`) **이미 실행 중인 Orca는 재시작해야** 반영됩니다.

#### 적용 확인 — NDJSON 로그의 `enterprise.policy` 스팬

Start Menu로 띄운 Windows GUI 프로세스에는 콘솔이 없어서 `[enterprise-policy]` stderr 진단이 그대로 사라집니다. 그래서 정책 해석 결과를 로그에 한 번 기록합니다(`src/main/enterprise/enterprise-policy-trace.ts:1-12` 주석이 이 이유를 명시).

- 파일: `%APPDATA%\Orca\logs\main.trace.ndjson` (`src/main/observability/logs-directory.ts:28`, `:33`)
- 스팬 이름 `enterprise.policy`. 속성에 **실제 채택된 파일 경로**(`enterprise.policy.source_path`, 없으면 `(none found)`), **탐색한 후보 목록**(`…searched_paths`), `lockdown`, 각 `disable*` 값, GHES 호스트, 허용 목록, 그리고 모든 경고가 들어갑니다(`enterprise-policy-trace.ts:26-48`).
- 기록 시점은 `initObservability()` 직후입니다(`src/main/index.ts:1892-1895`).
- `disableTelemetry`/`lockdown`이 켜져도 로컬 NDJSON은 유지되므로 잠금 상태에서도 이 확인이 동작합니다(`observability/index.ts:120-133`). 단 **`ORCA_DIAGNOSTICS_DISABLED`를 켜면 이 로그도 사라집니다**(`:113-118`).

```powershell
Select-String -Path "$env:APPDATA\Orca\logs\main.trace.ndjson" -Pattern "enterprise.policy" | Select-Object -Last 1
```

기능으로 확인하는 방법(예: 메뉴의 "업데이트 확인"이 무반응인지)도 여전히 유효합니다. 반대로 **경고가 없다는 것은 파일을 찾았다는 증거가 아닙니다** — 정책 파일이 아예 없어도 코드는 조용히 지나갑니다(`enterprise-policy-file.ts:130-136`). 그래서 위 스팬의 `enterprise.policy.source_path` 속성을 보는 것이 유일하게 확정적인 확인 방법입니다.

### 5.3 잠긴 사내 빌드와 공개 빌드를 구분하는 법 — 내장 수단이 없습니다

이 포크는 버전 문자열도 앱 식별자도 바꾸지 않습니다. `package.json`의 `version`은 upstream 값(`1.4.155`) 그대로이고, `appId`는 `com.stablyai.orca`, `productName`은 `Orca`입니다(`config/electron-builder.config.cjs:55-56`). **즉 앱 안의 버전·이름만으로는 사내 빌드와 공개 빌드를 구분할 수 없습니다.**

실무 권고 *(운영 관례이지 코드가 보장하는 것이 아닙니다)*:

1. **정책 파일 존재 여부를 자산 관리로 감시** — `%ProgramData%\Orca\enterprise-policy.json`이 없는 머신이 곧 안 잠긴 머신입니다. 실행 파일이 어느 빌드인지보다 이쪽이 실질적인 판정 기준입니다.
2. **`ORCA_DISABLE_PUBLISH_TARGET=1`로 빌드** — `publish` 타깃이 `null`이 되어 업데이터 메타데이터가 아예 안 실립니다. 그러면 이 설치본은 upstream 릴리스 피드로 덮어써질 수 없습니다(`config/electron-builder.config.cjs:405-413`).
3. **사내 인증서로 서명하고 `ORCA_WIN_PUBLISHER_NAME`을 그 주체로 지정** — electron-updater의 Authenticode 확인이 기대하는 publisherName이 바뀌므로, 공개 설치 프로그램이 사내 빌드를 갈아치우지 못합니다. 기본값을 그대로 두면(`SignPath Foundation`) 공개 빌드가 그대로 받아들여집니다(`:196-202`).
4. 사내 자체 식별이 꼭 필요하면 릴리스 태그·파일명·설치 경로 규약을 사내에서 별도로 정하세요. 앱은 도와주지 않습니다.

---

## 6. 원본(upstream) 최신 반영 — fork 동기화

원본 [`stablyai/orca`](https://github.com/stablyai/orca)는 자주 릴리스되므로 주기적으로 최신 변경을 가져옵니다. 전략은 **역할 분리**입니다.

- `main` — 원본 `upstream/main`의 **깨끗한 미러**로만 유지(사내 커밋을 올리지 않음). 항상 fast-forward로 갱신됩니다.
- `enterprise/samsungds` — 사내 커스터마이즈. 새 릴리스가 나오면 그 위로 **재배치(rebase)** 합니다.

#### 최초 1회 — upstream 원격 등록

```powershell
git remote add upstream https://github.com/stablyai/orca.git
git remote -v   # origin=사내 fork, upstream=stablyai/orca 확인
```

#### 주기적으로 — main 미러 갱신

`main`에는 사내 커밋이 없으므로 fast-forward만 하면 됩니다.

```powershell
git fetch upstream --tags --prune
git checkout main
git merge --ff-only upstream/main
git push origin main
```

> 더 간단하게는 GitHub 웹의 fork 페이지 상단 **"Sync fork" → "Update branch"** 버튼으로 `main`을 원클릭 갱신할 수 있습니다.

#### 사내 커스터마이즈를 새 릴리스 위로 올리기

현재 `enterprise/samsungds`는 태그 **`v1.4.155`** 위에 사내 커밋이 얹혀 있습니다(`git log --oneline v1.4.155..HEAD`로 확인). 원본이 예컨대 `v1.4.160`을 릴리스했다면 사내 커밋들을 그 태그 위로 재생합니다.

```powershell
git fetch upstream --tags
git checkout enterprise/samsungds
git rebase v1.4.160                 # 사내 커밋만 새 태그 위로 재생
# 충돌 해결 후:
git add -A ; git rebase --continue
git push --force-with-lease origin enterprise/samsungds
```

- `rebase`는 히스토리를 깨끗하게 유지하지만 강제 푸시(`--force-with-lease`)가 필요합니다. 강제 푸시를 피하려면 대신 병합하세요:
  ```powershell
  git checkout enterprise/samsungds
  git merge v1.4.160
  git push origin enterprise/samsungds
  ```
- exe는 항상 이 `enterprise/samsungds` 브랜치(또는 재배치한 릴리스 태그)에서 빌드합니다.
- 리베이스 직후에는 **문서의 `file:line` 인용이 전부 밀립니다.** 이 README와 `docs/reference/*.md`의 인용을 재검증하는 것을 리베이스 체크리스트에 넣으세요.

#### 충돌 예상 지점 — 솔직한 현황

사내 변경은 "신규 파일 몇 개"가 아닙니다. 이 문서 작성 시점의 `v1.4.155..HEAD` 기준으로 **신규 파일 22개, 기존 upstream 파일 수정 56개**입니다. 최신 수치는 직접 확인하세요:

```powershell
git diff --name-status v1.4.155..HEAD   # A=신규, M=upstream 파일 수정
```

| 성격 | 파일 | 리베이스 충돌 |
| --- | --- | --- |
| **신규(포크 전용)** | `src/shared/enterprise-policy.ts`(+`.test.ts`), `src/main/enterprise/**` 10개(정책 파일 탐색·트레이스·네트워크 가드·직접 다운로드 가드·secure DNS·픽스처·테스트), `src/main/ipc/feedback-submission-policy.ts`, `src/main/rate-limits/usage-polling-disabled-providers.ts`(+`.test.ts`), `src/main/observability/observability-consent.test.ts`, `src/main/claude-accounts/environment.test.ts`, `src/main/emulator/android/scrcpy-server-download.test.ts`, `config/vitest-enterprise-policy-isolation.ts`, `docs/reference/*.md` 3개 | 거의 없음 |
| **upstream 파일에 삽입한 게이트** | 메인: `src/main/updater.ts`, `telemetry/consent.ts`, `observability/index.ts`, `github/client.ts`, `git/hosted-remote-url.ts`, `gitea/repository-ref.ts`, `orca-profiles/profile-cloud-auth-config.ts`, `rate-limits/service.ts`, `rate-limits/claude-pty.ts`, `claude-accounts/{environment,oauth-refresh,runtime-auth-service}.ts`, `ipc/{feedback,pty}.ts`, `window/{createMainWindow,dashboard-popout-window}.ts`, `browser/{browser-manager,offscreen-browser-backend}.ts`, `lib/html-to-pdf.ts`, `emulator/android/scrcpy-server-download.ts`, `index.ts`, `src/shared/network-proxy.ts`. 렌더러: `src/renderer/index.html`(CSP 주석), `components/settings/PrivacyDiagnosticsSection.tsx`, `components/sidebar/SidebarFeedbackDialog.tsx`. 빌드·테스트: `config/electron-builder.config.cjs`, `config/vitest.config.ts`, `tests/e2e/helpers/electron-home-isolation.ts` (+ 대응 테스트 파일들, i18n 카탈로그 5개, `.gitignore` 3줄) | upstream이 같은 함수를 건드리면 발생. 게이트를 각 도메인의 **단일 초크포인트**에 넣어 둔 이유가 이것입니다 |
| **포크가 재작성해 소유한 문서** | `README.md`(upstream 원문 268줄을 사내 문서로 전면 교체 — 남은 공통 문장이 거의 없어 자동 병합이 되지 않습니다), `CLAUDE.md`(upstream은 `@AGENTS.md` 한 줄짜리 11바이트 스텁 → 126줄로 확장) | **둘 다 upstream에도 존재하므로 upstream이 손댈 때마다 반드시 충돌합니다.** 리베이스에서 사내 버전을 남기려면 `git checkout --theirs README.md CLAUDE.md` — **리베이스에서는 `--ours`가 재배치 대상(upstream), `--theirs`가 재생 중인 사내 커밋**이라 머지와 의미가 뒤집혀 있습니다. 그다음 upstream 변경분 중 필요한 것만 수동으로 반영하세요 |

> 위 목록에는 정책 작업과 무관한 upstream 접근성/드리프트 수정도 섞여 있습니다(예: `src/renderer/src/components/DetachedHeadBadge.tsx`, `src/renderer/src/components/skills/skill-freshness-group.tsx`). 이런 커밋은 upstream에 PR로 올려 없애는 편이 장기적으로 리베이스 충돌 면적을 줄입니다.

---

## 개발 / 저장소 구조

- 아키텍처와 명령어 개요: [`CLAUDE.md`](CLAUDE.md) *(upstream의 `@AGENTS.md` 스텁을 이 포크가 확장한 파일)*
- 프로젝트 규칙(크로스플랫폼, Git 호환성, 디자인 시스템 등): [`AGENTS.md`](AGENTS.md) *(upstream 원본, 손대지 않음)*
- 사내 커스터마이즈의 핵심:
  - `src/shared/enterprise-policy.ts` — 순수 리졸버 + 타입 (파일 I/O 없음)
  - `src/main/enterprise/enterprise-policy-file.ts` — 정책 파일 탐색·파싱·캐시
  - `src/main/enterprise/enterprise-policy-trace.ts` — 채택된 정책을 NDJSON 로그에 1회 기록
  - `src/main/enterprise/enterprise-network-guard.ts` — opt-in 허용 목록
  - `src/main/enterprise/enterprise-secure-dns.ts` — `lockdown` 시 DNS-over-HTTPS 승격 차단
  - `src/main/enterprise/enterprise-direct-download-guard.ts` — `node:https` 직접 다운로드 거부
  - `src/main/enterprise/enterprise-policy-fixture.ts` — 테스트 전용 픽스처
  - `config/vitest-enterprise-policy-isolation.ts` — 이 포크를 빌드하는 머신에는 머신 전역 정책 파일이 깔려 있으므로, 테스트 스위트가 lockdown 상태로 돌지 않도록 무력화
  - upstream 파일에 삽입된 게이트 목록은 §6 표 참고
- 원본 프로젝트의 일반 기여/개발 안내: [원본 CONTRIBUTING.md](https://github.com/stablyai/orca/blob/main/.github/CONTRIBUTING.md)

## License

원본 Orca는 [MIT License](LICENSE) 하에 배포되는 오픈소스이며, 이 포크도 동일 라이선스를 따릅니다.
