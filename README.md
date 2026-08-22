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
- **봇(Bots)** — 이름·역할·에이전트·워크스페이스를 묶은 담당자에게 **채팅으로 일을 시키고** 반복 작업을 맡깁니다. 봇끼리 일을 넘길 수도 있습니다 (이 포크 고유 기능, §8)

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

이 네 버킷은 **설정 값**만 다룹니다. **자격증명과 신뢰 저장소는 여기 없습니다** — `gh auth status` 인벤토리(§2), `git config`의 `http.sslBackend`/`http.sslCAInfo`(§2), `gateway-cli`가 자기 안에 들고 있는 게이트웨이 세션(§3.1), 은 각각 별도의 위치이며 해당 절에서 다룹니다.

핵심 원칙: **Orca의 동작을 바꾸는 값은 환경 변수가 아니라 정책 파일(B)에 넣습니다.** 이유는 Orca가 `env`에서 읽는 값이 Orca가 띄우는 **모든 자식 프로세스**(에이전트 CLI, `gh`, `git`, 릴레이)에 그대로 상속되고, `setx`로 심은 값은 같은 머신의 무관한 도구까지 오염시키기 때문입니다 — 근거: `src/shared/enterprise-policy.ts:4-8`, `src/main/enterprise/enterprise-policy-file.ts:4-11`.

### A. OS 환경 변수 — 실제로 여기에 있어야 하는 것만

| 변수 | 읽는 주체 | 필수? | 비고 |
| --- | --- | --- | --- |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | OS 표준. Orca의 Node 계층(대소문자 6종 + `NO_PROXY` 2종을 직접 읽습니다 — `src/shared/network-proxy.ts:13-21`), `git`, `gh`, Claude Code CLI, `gateway-cli`가 각자 읽음 | 사내 프록시 환경이면 **필수** | 앱 안의 프록시 설정(설정 → Advanced → Network)은 **비워 두는 편이 안전**합니다 — 아래 참고 |
| `NODE_EXTRA_CA_CERTS` | **Node만.** Orca 메인 프로세스와 Node 기반 CLI | TLS 검사 프록시 환경이면 필요 | **`git`/`gh` 바이너리에는 아무 효과가 없습니다**(§2). `gateway-cli`가 사내 CA를 어떻게 신뢰하는지는 그 CLI의 계약이며 **미확인**입니다 *(이 행 전체가 Node/git 쪽 계약입니다 — 저장소에는 `NODE_EXTRA_CA_CERTS` 참조가 한 건도 없으므로 코드로 검증한 사실이 아닙니다)* |
| `GH_HOST` | `gh` CLI 고유 변수 | **선택** | Orca는 정책의 `githubEnterpriseHost`가 비었을 때만 폴백으로 읽습니다(`src/shared/enterprise-policy.ts:366`). 정책에 호스트를 넣었다면 불필요 |
| `ORCA_ENTERPRISE_POLICY` | Orca만 | **불필요** — 아래 참고 | 정책 **파일 경로**만 지정하는 변수. 이 포크가 추가한 유일한 런타임 환경 변수 |

> [!IMPORTANT]
> **설치 프로그램이 기본 정책을 이미 싣고 있으므로 `ORCA_ENTERPRISE_POLICY`는 전혀 필요하지 않습니다.**
> 패키징 빌드에서 탐색 후보는 `[머신 전역, 번들, ORCA_ENTERPRISE_POLICY 경로, 사용자별]` 순서로 조립되고(`enterprise-policy-file.ts:110-113`), 머신 전역 Windows 경로는 코드에 하드코딩(`:58-68`), 번들 경로는 `process.resourcesPath`에서 해석됩니다(`:236-244`). 후보를 순서대로 읽다가 **먼저 파싱에 성공한 파일에서 멈추므로**(`:161-215`) 앞 후보가 있으면 환경 변수 후보는 도달조차 하지 않습니다. **플릿에는 이 변수를 배포하지 마세요.** 개발·검증용입니다(§4.1).

**선택적으로 유효한 OS 환경 변수** (이 포크가 만든 것이 아니라 upstream/커뮤니티 소유):

- `DO_NOT_TRACK`, `ORCA_TELEMETRY_DISABLED` — upstream의 텔레메트리 킬 스위치(`src/main/telemetry/consent.ts:79`, `:83`). 정책 파일의 `disableTelemetry`가 같은 일을 하므로 중복입니다.
- `ORCA_DIAGNOSTICS_DISABLED` — **로컬 NDJSON 진단 파일 기록까지** 끕니다(`src/main/observability/index.ts:102`, `:113-118`). 정책 파일로는 로컬 파일을 끌 수 없습니다. 다만 이 변수를 켜면 §5.2의 정책 적용 확인 수단도 함께 사라집니다.
- `WSLENV` — WSL 프로젝트에 Windows 환경 변수를 넘길 때만(§3.4).
- `AWS_REGION`, `CLAUDE_CODE_USE_BEDROCK` 등 — 여기 두어도 동작하지만 **버킷 C가 더 깔끔합니다**(§3.2).

**여기에 두면 안 되는 변수**

- `AWS_PROFILE` — **설정하지 마세요. 새 인증 방식에는 프로필 개념이 없습니다.** 자격증명은 `gateway-cli`가 소유하며(§3.1), Orca 프로덕션 코드에는 이 변수 참조가 0건입니다.
- `CLAUDE_CONFIG_DIR` — **설정하지 마세요.** 값이 있으면 Orca가 그 값을 자식 환경에 재기입하고(`src/main/claude-accounts/runtime-paths.ts:23`), SSH 프로젝트에서는 **로컬 Windows 경로가 원격 셸로 들어갑니다**(§3.3).

> [!WARNING]
> **`setx`로 OS 환경 변수를 바꾼 뒤 Orca만 재시작해도 에이전트 터미널에는 반영되지 않습니다.** 터미널을 앱 재시작 이후까지 살려 두는 영속 데몬이 자기 fork 시점의 `process.env`를 계속 쓰고(`src/main/daemon/daemon-init.ts:700-705`, 재사용 판정 `:574`), 레지스트리에서 다시 읽어 병합하는 값은 `PATH` 하나뿐입니다(`src/main/pty/windows-environment-path.ts:280-292`). 반영시키려면 **데몬을 교체**(Manage Sessions → Restart)하거나 **로그아웃/재로그인**하세요.

**프록시를 어디에 둘 것인가** — 앱의 프록시 설정(`설정 → Advanced → Network`, `src/renderer/src/components/settings/AdvancedNetworkSettingsSection.tsx`)이 비어 있으면 `buildConfiguredProxyEnv`가 `{}`를 반환해 상속된 프록시 환경 변수를 전혀 건드리지 않습니다(`src/shared/network-proxy.ts:115-121`). 값이 들어 있으면 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`(대소문자 6종)를 **덮어쓰고**, `NO_PROXY`만은 상속값과 병합해 보존합니다(`:124-137`, 병합 소스 `:83-88`; 호출부 `src/main/ipc/pty.ts:1696`). 따라서 **프록시는 OS 환경 변수에 두고 앱 설정은 비워 두는 것**이 예측 가능합니다.

### B. 정책 파일 — Orca 자신의 동작

전체 스키마·예제·롤아웃은 **[엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md)** 에 있습니다. 이 배포의 관리자가 실제로 쓰는 키는 다음 정도입니다.

```jsonc
// %ProgramData%\Orca\enterprise-policy.json
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net"
}
```

- `lockdown: true` — 마스터 스위치. 개별 `disable*` 키를 쓰지 않아도 전부 상속됩니다(`enterprise-policy.ts:157-175`, `:358-362`).
- `githubEnterpriseHost` — 허용목록 자동 추가 + GHES 로그인 대상 기본값 + GHES blob/commit URL 인식(§2).
- `lockdown`을 쓰지 않을 거라면 **`disableManagedClaudeAccounts`와 `disableUsagePolling`은 Bedrock 플릿에서 명시적으로 켜야 합니다**(§3.3).
- `enforceNetworkAllowlist` / `allowedNetworkHosts` — `lockdown`을 상속하지 않는 opt-in(§4.3).

전체 키 목록과 각 키가 실제로 무엇을 끄는지는 §4.2 표를 보세요.

### C. Claude Code `~/.claude/settings.json` — Bedrock 키는 Orca가 건드리지 않지만, 파일 자체는 Orca도 씁니다

Bedrock 모델/리전/플래그가 들어가는 곳입니다. 두 가지를 분리해서 알아야 합니다.

**Orca가 건드리지 않는 것 — Bedrock 설정 그 자체.** `env`·`awsAuthRefresh` 같은 키를 Orca는 읽지도 쓰지도 않고, 파일 경로를 바꾸지도 않습니다. `CLAUDE_CONFIG_DIR`은 이미 상속된 값이 있을 때만 재기입되고, 사내는 이 변수를 설정하지 않으므로 `%USERPROFILE%\.claude`가 그대로 쓰입니다(`src/main/claude-accounts/runtime-paths.ts:15-24`).

**Orca가 건드리는 것 — 같은 파일의 `hooks`와 `statusLine`.** 에이전트 상태 훅이 이 파일에 설치됩니다. 경로는 `%USERPROFILE%\.claude\settings.json`으로 정해져 있고(`src/main/claude/hook-settings.ts:22-26`, `:71-73`), **앱을 띄울 때마다 자동으로 설치됩니다**(`src/main/index.ts:2786-2799`). 이 자동 설치를 막는 코드 게이트는 인자를 무시하고 항상 `true`를 돌려주므로(`src/main/startup/configure-process.ts:200-203`) 유일한 off 스위치는 `설정 → Agents`의 에이전트 상태 훅 토글입니다(`src/renderer/src/components/settings/AgentsPane.tsx:1058-1066`; 시작 시 이 값을 확인하는 곳은 `src/main/index.ts:2788`). 설치는 파일을 읽고(`src/main/claude/hook-service.ts:193`) `hooks`만 갈아끼운 뒤(`src/main/claude/hook-settings.ts:160-178` — `{ ...config, hooks }`로 나머지 키를 보존) 다시 씁니다(`src/main/claude/hook-service.ts:218`). 실무상 의미는 세 가지입니다:

- **Bedrock 블록은 살아남습니다.** `hooks`/`statusLine` 밖의 키는 `JSON.parse` → `JSON.stringify` 왕복으로 보존됩니다(`src/main/agent-hooks/hooks-json-read.ts:14-39`, `src/main/agent-hooks/installer-utils.ts:328`).
- **파일이 재포맷되고 `.bak`이 생깁니다.** 2-스페이스 인덴트로 다시 써지며, 직전 내용은 `settings.json.bak` 하나로 롤링 백업됩니다(`installer-utils.ts:351-353`).
- **주석이나 후행 쉼표를 넣지 마세요.** 이 파일은 엄격한 JSON으로 파싱되므로(`src/main/agent-hooks/hooks-json-read.ts:17-22`) 깨져 있으면 훅 설치가 `error` 상태로 끝나고 쓰기를 포기합니다(`src/main/claude/hook-service.ts:194-202`). **JSONC를 허용하는 것은 정책 파일(버킷 B)뿐이고 이 파일은 아닙니다.**

읽기 전용으로 이 파일을 보는 곳이 하나 더 있습니다 — 스킬/플러그인 탐색이 활성 플러그인 목록을 확인할 때입니다(`src/main/skills/claude-plugin-skill-sources.ts:37`).

Bedrock 설정 자체의 내용과 주의사항은 §3.

### D. 빌드 셸 전용 — 사용자 환경에는 절대 넣지 않습니다

| 변수 | 역할 | 근거 |
| --- | --- | --- |
| `ORCA_WIN_PUBLISHER_NAME` | 설치 프로그램의 Authenticode publisherName. 기본값은 `SignPath Foundation` | `config/electron-builder.config.cjs:330-332` |
| `ORCA_DISABLE_PUBLISH_TARGET=1` | `publish` 타깃을 `null`로 만들어 업데이터 메타데이터를 아예 생성하지 않음 | `:543-551` (의도는 `:540-542` 주석) |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | electron-builder 고유의 Windows 코드 서명 입력 | electron-builder 계약 |
| `ORCA_MAC_RELEASE` | **반드시 비어 있어야 합니다.** `1`이면 `forceCodeSigning`이 최상위 설정으로 켜져(`:450`, 값 출처 `:29-30`) 서명 없는 Windows 빌드가 실패합니다 | `:29-30`, `:450` |
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
- `--publish never`는 **필수**입니다. 빠지면 사내 CI(`CI=true`)에서 electron-builder가 `github.com/stablyai/orca`로 업로드를 시도합니다(`config/electron-builder.config.cjs:543-551`). 원커맨드 `pnpm build:win`에는 이 플래그가 없으므로 **그대로 쓰지 마세요.**

> 공개 배포본을 그대로 받아 쓰지 않는 이유: 공개 `.exe`는 자동 업데이트·텔레메트리가 켜진 빌드입니다. 사내에서는 이 브랜치를 직접 빌드해 외부 연동을 잠급니다(§4).

**설치 프로그램을 만들지 않고 화면만 확인하려면** — 맥북에서 `pnpm dev`로 잠금이 적용된 UI를 그대로 볼 수 있습니다. 비패키징 인스턴스에서는 `ORCA_ENTERPRISE_POLICY`가 정책 탐색 1순위이므로 `%ProgramData%`도 관리자 권한도 필요하지 않습니다. 절차·확인 지점·dev로는 확인할 수 없는 항목은 **[macOS dev 빌드 UI 확인 가이드](docs/reference/macos-dev-ui-check.md)** 를 보세요.

---

## 2. 사내 GitHub Enterprise (`github.samsungds.net`)

Orca의 GitHub 연동은 `gh` CLI를 통하며 GHES를 **원본 단계에서 이미 지원**합니다(github.com 하드코딩 아님).

```powershell
# 사용자별 1회. 이 단계가 빠지면 GHES 리모트는 GitHub로 인식되지 않습니다.
gh auth login --hostname github.samsungds.net
gh auth status                      # github.samsungds.net 이 목록에 보여야 함
```

#### 무엇이 "이 호스트는 GitHub다"를 결정하는가 — `gh auth status`입니다

사내 GHES 같은 커스텀 호스트를 GitHub로 판정하는 신호는 **오직 `gh auth status` 인벤토리**입니다. 정책 파일도, 환경 변수도 아닙니다. `github.com`은 호스트명만으로 바로 처리되고(`src/main/github/github-api-repository.ts:97-98`) 엔터프라이즈 판정 경로는 그 호스트에서 즉시 빠집니다 — v1.4.159부터는 SSH 별칭까지 해석한 **실효 호스트** 기준으로 판정합니다(`src/main/github/github-enterprise-repository.ts:249-251`, 별칭 해석은 `:231-247`).

- `github-enterprise-repository.ts:151-152`가 `gh auth status`를 실행하고, `:98-122`(`authenticatedHostFromInventory`)가 리모트 호스트를 그 목록과 대조합니다. 목록에 없으면 `:213-263`가 `null`을 돌려주고 GitHub 경로는 그대로 포기합니다.
- 호출 체인: `src/main/source-control/forge-provider.ts:136-137` → `src/main/github/client.ts:1725-1735`(`getRepoSlug`) → `src/main/github/github-api-repository.ts:114-132` → `github-enterprise-repository.ts:266-270`.
- 코드 주석이 이 계약을 명시합니다 — "`gh`는 github.com / GitHub Enterprise 자격증명만 관리하므로, `gh auth status`가 로그인됐다고 보고하는 호스트는 확정적으로 GitHub 호스트다"(`github-enterprise-repository.ts:24-25`).

**따라서 `gh auth login --hostname github.samsungds.net`은 선택이 아니라 필수입니다.** PR·이슈가 안 보인다는 신고가 들어오면 정책 파일이 아니라 **`gh auth status`부터** 확인하세요. `gh`가 아예 없거나 spawn에 실패하면 판정이 "미확정"으로 남아 캐시되지 않습니다(`:155-159`).

#### 정책의 `githubEnterpriseHost`가 하는 일

세 가지입니다. **GitHub로 인식시키는 기능은 여기 없습니다**(그건 위의 `gh auth status`입니다).

1. **네트워크 허용목록 자동 추가** — `enforceNetworkAllowlist`를 켠 플릿에서 관리자가 GHES 호스트를 `allowedNetworkHosts`에 한 번 더 적지 않아도 되도록 자동으로 넣습니다(`src/shared/enterprise-policy.ts:370-371`).
2. **GHES 로그인 대상 기본값** — 설정 → GitHub Enterprise 팬에서 사용자가 호스트를 저장한 적이 없으면 이 값이 `gh auth login --hostname <host>`의 대상이 됩니다(`src/main/ipc/github-enterprise.ts:83-86`). 로그인 뒤 실제로 `gh`가 어느 호스트로 나가는지는 `gh` 자신의 설정이 정하고, 팬은 그 "실효 호스트"를 별도로 표시합니다(`src/main/github/effective-github-host.ts`).
3. **GHES 퍼머링크 인식** — GHES는 `/owner/repo/blob/<ref>/<path>#L<n>` 형태를 호스트 루트에 그대로 서비스하므로, 호스트를 알아보는 것만으로 blob/commit URL이 GitHub 프로바이더로 매핑됩니다(`src/main/git/hosted-remote-url.ts:38-42`). 같은 값이 `disableVendorLinks`의 예외로도 쓰여 사내 GHES 링크는 벤더 링크로 차단되지 않습니다(`src/main/enterprise/enterprise-vendor-link-guard.ts:80-83`).

예전 README가 첫 번째 역할로 적었던 "Gitea 폴백 오인 차단"은 이제 해당하지 않습니다 — Bitbucket·Azure DevOps·Gitea 연동을 커밋 `4d58e5f21c`에서 코드째 제거했고, provider 탐색은 GitLab → GitHub 둘뿐이라 어느 쪽도 아니면 `unsupported`로 끝납니다(잘못된 호스트로 요청이 나가지 않습니다).

```jsonc
// 정책 파일 (§4)
{ "githubEnterpriseHost": "github.samsungds.net" }
```

값이 없으면 `gh`의 `GH_HOST` → `gh` 자체 설정의 기본 호스트(`gh auth login --hostname <ghes>`가 쓰는 `hosts.yml`, 로그인 호스트가 정확히 하나일 때) 순으로 폴백합니다(`src/shared/enterprise-policy.ts:364-367`, `src/main/github/gh-config-host.ts`). 프로토콜·포트·경로·자격증명이 붙어 있어도 호스트명만 정규화해 씁니다(`:227-240`).

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

Bedrock 인증은 **Claude Code CLI 자체**가 자격증명 체인으로 처리하고, 그 자격증명은 **`gateway-cli`가 소유**합니다. Orca는 이 흐름에 관여하지 않습니다.

### 3.1 결론부터 — 자격증명은 `gateway-cli`가 소유하고 Orca는 손대지 않습니다

사내 인증은 **`gateway-cli login`**(인자 없음)으로 통일됐습니다. OIDC 브라우저 로그인을 마치면 게이트웨이가 **virtual key를 자동 발급**하고, 그 키를 에이전트까지 전달하는 것도 `gateway-cli`의 몫입니다. **프로필이라는 개념 자체가 이 레인에서 사라졌으므로** 사용자가 `~/.aws/config`를 관리하거나 `AWS_PROFILE`을 지정할 일이 없습니다. 상태 확인은 `gateway-cli verify`입니다.

Orca의 책임 경계는 AWS SSO 시절과 **동일합니다** — 로그인 명령을 실행하고 상태를 보여줄 뿐, 토큰·키를 읽지도 저장하지도 않고 **환경변수도 주입하지 않습니다.** 그 경계가 실제로 지켜지는지 코드로 확인한 항목입니다.

| 확인 항목 | 결과 | 근거 |
| --- | --- | --- |
| Orca가 virtual key/토큰을 읽거나 저장하는가 | **아니오.** 이 레인이 다루는 것은 CLI 실행과 그 출력뿐입니다 | `src/shared/gateway-auth.ts` 헤더 주석이 계약을 명시. `src/main/gateway/`에 자격증명 저장소가 없습니다 |
| Orca가 자격증명 환경변수를 주입하는가 | **아니오.** virtual key 전달은 `gateway-cli`가 알아서 합니다 | `buildGatewayCommandEnv()`가 만드는 것은 **CLI 자신을 스폰할 때 쓰는 env**(= `process.env` + Windows에서 레지스트리 PATH 재병합)이고, 에이전트 PTY 환경이 아닙니다 |
| PTY 환경에 화이트리스트가 있는가 | **아니오.** `process.env` 전체를 상속한 뒤 소수의 명시적 `delete`만 적용 | `providers/local-pty-provider.ts`·`daemon/pty-subprocess.ts`의 `stripInheritedBuildModeEnv(process.env)` 스프레드 |
| Orca가 지우는 `AWS_*` 변수 | **`AWS_BEARER_TOKEN_BEDROCK` 단 하나** (`CLAUDE_AUTH_ENV_VARS`) | `src/main/claude-accounts/environment.ts`. ⚠️ **virtual key 방식이 이 변수를 쓰는지는 미확인** — 쓴다면 §3.3의 `disableManagedClaudeAccounts`가 "권장"이 아니라 **동작 조건**이 됩니다 |
| `HOME`/`USERPROFILE`을 바꾸는가 | **아니오.** 프로덕션 코드의 모든 참조가 읽기입니다 → `gateway-cli`가 자기 설정·캐시를 정상적으로 찾습니다 | 읽기 지점: `providers/pty-default-cwd.ts`, `relay/pty-shell-utils.ts`, `relay/relay-command-env.ts`. 재검증: `grep -rn USERPROFILE src/main src/shared src/relay` |
| `CLAUDE_CONFIG_DIR`을 리다이렉트하는가 | 상속값이 이미 있을 때만. 사내는 설정하지 않으므로 `%USERPROFILE%\.claude`가 그대로 쓰입니다 | `claude-accounts/runtime-paths.ts`의 `getRuntimePaths()` |
| `gateway-cli`를 어디서 찾는가 | **PATH만** 해석합니다 | `src/main/gateway/gateway-cli-command.ts`의 `resolveGatewayCommand()`. 설치 경로가 미확인이라 경로 추측을 넣지 않았습니다 |

`HOME`/`USERPROFILE`을 건드리지 않는다는 마지막 두 항목이 여전히 핵심입니다 — `gateway-cli`가 로그인 상태를 어디에 두든, Orca가 그 위치를 옮기지 않기 때문에 앱 안에서 로그인하든 터미널에서 로그인하든 같은 세션이 됩니다.

**앱 안에서 로그인하기 (이 포크가 추가)** — 터미널을 열지 않아도 **설정 → AI 제공업체 계정 → "사내 게이트웨이 로그인"**에서 처리할 수 있습니다.

- 버튼은 `gateway-cli login`을 **인자 없이** 실행합니다(`runGatewayLogin()`). 브라우저는 `gateway-cli`가 직접 띄웁니다. 고를 프로필이 없으므로 화면에도 선택 UI가 없습니다. 로그인 중 CLI가 사용자 코드나 인증 URL을 인쇄하면 그대로 화면에 올려 줍니다(`GatewayLoginProgress`) — 브라우저가 안 뜨는 환경을 위한 것이고, 그 값을 만들어 내는 것은 Orca가 아니라 CLI입니다.
- **로그인 여부·만료·신원은 `gateway-cli verify`의 실행 결과로 판정합니다**(`runGatewayVerify()`). AWS SSO 시절과 달라진 **실질적인 변화**입니다: 예전에는 AWS CLI 토큰 캐시의 `expiresAt`을 네트워크 없이 파일에서 읽었지만, 이제는 **상태를 새로 고칠 때마다 CLI가 최대 두 번 실행됩니다** — 설치 감지용 `gateway-cli --version`과 `gateway-cli verify`. 그 실행이 네트워크를 타는지는 `gateway-cli` 구현에 달려 있어 **미확인**입니다.
- **`verify`의 출력 형식은 확정되지 않았습니다.** 그래서 파서(`src/shared/gateway-cli-output.ts`)가 JSON → 텍스트 → 종료 코드 순으로 방어적으로 읽고, 알아보지 못한 항목은 `null`로 남깁니다. 배지에 만료가 안 보이면 **"만료를 알 수 없음"이지 "만료됨"이 아닙니다.** 화면에 올라가는 `detail` 문자열은 파서가 비밀 후보(키·토큰 형태의 대입문, 숫자를 포함한 20자 이상 불투명 문자열)를 `***`로 가린 뒤 넘깁니다.
- `gateway-cli`가 PATH에 없으면 로그인 버튼 대신 **미설치 경고**가 뜹니다(`detectGatewayCli()`).
- **로그아웃 버튼은 없습니다.** `gateway-cli logout`이 존재하는지 확인되지 않아, 없는 하위 명령을 발명하지 않았습니다.

> **로컬 전용입니다.** 이 버튼은 이 PC의 `gateway-cli`를 로그인시킵니다. WSL 게스트와 SSH 원격 호스트는 각자 자기 세션을 쓰므로 **그 안에서 따로** `gateway-cli login`을 실행해야 합니다(§3.4). `disableManagedClaudeAccounts`·`enforceNetworkAllowlist` 같은 정책 스위치는 이 경로에 관여하지 않습니다 — 자식 프로세스의 egress는 허용목록 밖입니다([감사 문서](docs/reference/external-integrations-audit.md) §0.2 #25).

### 3.2 모델·리전·플래그는 Claude Code 설정 파일에 (버킷 C)

```jsonc
// %USERPROFILE%\.claude\settings.json  ← 아래 블록을 읽는 것은 Claude Code CLI입니다
// (Orca는 같은 파일의 hooks/statusLine 키만 씁니다 — §0.C)
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "us-east-1",
    "ANTHROPIC_MODEL": "<Bedrock inference profile ARN 또는 모델 ID>"
  }
}
```

**`awsAuthRefresh`는 예시에서 뺐습니다.** 예전 값이던 `"aws sso login"`은 더 이상 맞지 않고, 새 방식에서 이 키를 어떻게 채워야 하는지는 확인되지 않았습니다 — 아래 NOTE를 보세요.

> [!NOTE]
> **위 키 이름과 의미는 Claude Code CLI의 계약이며 이 저장소 코드로 검증할 수 없습니다.** 정확한 스펙은 Claude Code 문서를 따르세요. 이 저장소에서 검증한 것은 "Orca가 **이 키들**(`env`, `awsAuthRefresh`)에 관여하지 않고 경로 리다이렉트도 하지 않는다"는 사실뿐입니다. **파일 자체는 Orca도 씁니다** — `hooks`/`statusLine` 키에 한정되며 나머지 키는 보존되지만, 그래서 이 파일에 **주석이나 후행 쉼표를 넣으면 안 됩니다**(§0.C).
>
> **`awsAuthRefresh`를 새 방식에서 어떻게 채워야 하는지는 미확인입니다.** 이 키는 Claude Code CLI가 자격증명 만료 시 실행하는 명령이므로, 값으로 `gateway-cli login`을 **넣을 수는 있지만** 게이트웨이 방식에서 그 훅이 필요한지, 브라우저를 띄우는 명령을 여기 두는 것이 맞는지는 이 저장소로 판정할 수 없습니다. **사내 인증 담당의 안내를 따르고, 확인 전에는 키를 비워 두는 편이 안전합니다** — 세션 시작 전에 `gateway-cli verify`로 상태를 한 번 보는 것으로 대체할 수 있습니다.

### 3.3 반드시 켜야 하는 정책 키 두 개

- **`disableManagedClaudeAccounts` — 권장이 아니라 필수입니다.**
  이 기능은 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`**을, 그리고 인증 정보가 담긴 것으로 판정되면 `ANTHROPIC_CUSTOM_HEADERS`까지 제거합니다(`claude-accounts/environment.ts:3-8`, `:22-29`).
  Windows 호스트에서는 관리형 계정을 **선택한 동안에만** 제거되지만(`claude-accounts/runtime-auth-service.ts:667`), **WSL 런타임을 고르면 관리형 계정이 하나도 없어도 제거가 켜지고**(`:647`, `:657` — upstream v1.4.155는 이 두 곳이 `stripAuthEnv: true` 하드코딩이었고 포크가 `!managedAccountsDisabled`로 바꿨습니다), 런치 환경에 해당 변수가 있으면 PTY 스폰이 `This Claude launch defines explicit Anthropic auth environment variables.`로 **하드 실패**합니다(`src/main/ipc/pty.ts:4576-4580`, `:6164-6168`).
  스위치를 켜면 활성 계정이 `null`로 고정되고(`runtime-auth-service.ts:613-616`) 하드코딩 호출자까지 최후 방어선에서 막혀(`environment.ts:22`) 이 실패 조건이 사라지며, `platform.claude.com`으로 나가는 OAuth 토큰 회전도 함수 진입부에서 차단됩니다(`claude-accounts/oauth-refresh.ts:131-133`).
  ⚠️ **게이트웨이가 발급하는 virtual key가 `AWS_BEARER_TOKEN_BEDROCK`으로 전달되는지는 확인 필요입니다.** 전달되지 않는다면 오늘 당장 깨지지 않고, 전달된다면 이 스위치는 권장이 아니라 **WSL 런치의 동작 조건**입니다. 어느 쪽이든 **누군가 bearer token으로 우회하거나 `ANTHROPIC_API_KEY`를 병기하는 순간 WSL 런치가 즉시 실패합니다.** SSH 경로도 같은 스위치로 함께 정리됩니다 — 스트립이 켜져 있으면 `envToDelete`가 릴레이까지 전송되어 **원격 spawn env에서** 해당 변수가 삭제되고(`src/main/providers/ssh-pty-spawn-request.ts:21`), `claudeAuth.envPatch`가 `connectionId` 유무와 무관하게 SSH env에 병합됩니다(`pty.ts:4614-4616`, `:6174-6176`). 후자는 사내에서 `CLAUDE_CONFIG_DIR`을 설정하지 않아 지금은 빈 객체이므로 실제 피해가 없지만, 누군가 이 변수를 심으면 **로컬 Windows 경로가 원격 셸에 들어갑니다.**

- **`disableUsagePolling` — Bedrock 전용 머신에서도 `api.anthropic.com`으로 나갑니다.**
  Orca는 창이 보이고 포커스된 동안(`src/main/rate-limits/service.ts:873-882` `shouldBackgroundPoll`) 15분 주기로(`:82` `DEFAULT_POLL_MS`) `https://api.anthropic.com/api/oauth/usage`(`src/main/rate-limits/claude-fetcher.ts:46`)를 호출합니다. 이 호출은 Orca의 관리형 계정 등록 여부와 무관하고, 과거 OAuth 로그인 흔적(`~/.claude/.credentials.json` 등, `claude-fetcher.ts:190-194`)만 있으면 켜집니다. 게다가 이 경로에는 `claude` CLI를 숨겨서 스폰하는 PTY도 있어(`src/main/rate-limits/claude-pty.ts:244-245`, spawn env = `{...process.env}`) **Bedrock 환경에서는 예상치 못한 Bedrock 호출·과금**이 발생할 수 있습니다.

`lockdown: true`면 둘 다 자동으로 켜집니다(`enterprise-policy.ts:157-175`, `:358-362`).

### 3.4 함정 — 실제로 사람들이 밟는 것들

- **`설정 → Agents`의 에이전트별 env는 OS 값을 덮어씁니다(shadow).** 빈 값을 넣으면 변수가 삭제되는 게 아니라 **빈 문자열로 덮어써지고 그 빈 문자열이 이깁니다.** `AWS_REGION=` 한 줄이 `{AWS_REGION: ''}`로 파싱되고(`src/renderer/src/components/settings/agent-default-env-draft.ts:24-32`), 정규화가 빈 문자열을 보존하며(`src/shared/tui-agent-launch-defaults.ts:62-67`), 병합에서 override가 최종 승자입니다(`src/shared/git-credential-prompt-env.ts:11`). 지우려면 **항목 자체를 삭제**하세요.
- **WSL 게스트는 호스트와 별개로 로그인해야 합니다.** 게스트의 게이트웨이 로그인 상태는 Windows 호스트의 것과 **별개**입니다 — virtual key가 어디에 보관되는지는 미확인이지만, 게스트는 자기 홈 디렉터리를 쓰고 Orca는 `HOME`/`USERPROFILE`을 다리로 놓지 않으므로(§3.1) 호스트 로그인이 게스트에 보일 길이 없습니다. AWS SSO 시절 토큰 캐시가 호스트와 게스트에서 다른 파일이었던 것과 같은 구조이고, 로그인 주체만 `gateway-cli`로 바뀌었습니다. 그리고 `wsl.exe`는 `WSLENV`에 등재된 변수만 가져오는데 Orca가 등재하는 것은 `ORCA_*` 계열(`src/main/pty/wsl-orca-env.ts:77-102`), `CODEX_HOME`/`ORCA_CODEX_HOME`/`CLAUDE_CONFIG_DIR`/Hermes·p10k 변수, git credential 가드 키(`src/shared/git-credential-prompt-env.ts:112`)뿐이라 **자격증명 성격의 변수는 어느 등재 지점에도 없습니다.** 따라서 WSL 프로젝트는 **게스트 안에서 따로** 구성해야 합니다:
  1. 게스트에 `gateway-cli`를 설치하고 **게스트 안에서 `gateway-cli login`을 별도로 실행** — Windows 쪽 로그인은 게스트에 보이지 않습니다. *(`gateway-cli`가 WSL 게스트에서 어떻게 동작하는지, 게스트에 설치본이 제공되는지는 **미확인**입니다. 사내 배포 담당에게 확인하세요.)*
  2. 게스트에 Claude Code CLI를 설치하고 **게스트의** `~/.claude/settings.json`에 Bedrock 블록을 둡니다. Windows 쪽 파일은 읽히지 않습니다.
  3. 리전/플래그처럼 **자격증명이 아닌** 값만 Windows에서 넘기고 싶다면 `setx WSLENV "AWS_REGION/u:CLAUDE_CODE_USE_BEDROCK/u"`처럼 `WSLENV`를 직접 채우세요 — Orca는 기존 `WSLENV`를 **보존하고 append만** 하므로 이 값이 살아남습니다(`src/shared/wsl-env.ts:5-16`). **자격증명 자체는 이 방법으로 넘길 수 없습니다.**
- **SSH 원격 호스트도 각자 로그인해야 합니다.** 호스트 env를 조립하는 `buildPtyHostEnv`는 SSH 경로에서 아예 호출되지 않고(계약은 `src/main/ipc/pty.ts:1684-1689` 주석, 게이트는 `:6125-6128`의 `!args.connectionId`), 릴레이는 **자기 자신의 `process.env`**(SSH exec 채널이 준 환경)에 렌더러가 보낸 env만 얹어 PTY를 만듭니다(`src/relay/pty-handler.ts:596-607`). 따라서 원격에서 별도로 `gateway-cli login`을 수행하고, 원격의 `~/.claude/settings.json`과 로그인 셸 프로필에 설정을 두어야 합니다. *(원격 호스트에서의 `gateway-cli` 동작 — 특히 브라우저를 띄울 수 없는 헤드리스 호스트에서 OIDC 흐름이 어떻게 끝나는지 — 도 **미확인**입니다.)*
- **`enforceNetworkAllowlist`는 Bedrock 호출과도, 게이트웨이 로그인과도 무관합니다.** Electron session과 메인 프로세스 `fetch`만 감싸므로(`src/main/enterprise/enterprise-network-guard.ts:128-136`) 자식 프로세스(Claude Code CLI, `gateway-cli`, `git`, `gh`)의 egress에는 적용되지 않습니다. `bedrock-runtime.<region>.amazonaws.com`이나 사내 IdP·게이트웨이 호스트를 `allowedNetworkHosts`에 넣을 필요가 없고, 넣어도 CLI에는 아무 효과가 없습니다.
- `setx` 후 데몬 staleness — §0의 경고 박스를 참고하세요. Bedrock 설정을 OS 환경 변수로 넣었을 때 "설정했는데 안 먹는다"의 1순위 원인입니다.


## 4. 외부 연동 잠금 — 관리자 소유 정책 파일

### 4.1 정책 파일을 어디에 두는가 — 먼저 **파싱에 성공한** 파일이 이깁니다

탐색 순서를 조립하는 곳은 `enterprise-policy-file.ts:89-114`이고, 그 후보를 순서대로 읽다가 **처음 파싱에 성공한 파일에서 멈추는** 곳은 `:161-215`입니다(설계 의도는 `:1-17` 주석). 따라서 사용자별 파일이 위 후보를 완화할 수 없습니다.

**패키징 빌드 — 사용자 PC에 설치된 `.exe`. 플릿에서 유일하게 의미 있는 순서입니다.**

| 순위 | 위치 | 비고 |
| --- | --- | --- |
| 1 | **머신 전역** — `%ProgramData%\Orca\enterprise-policy.json` (`:58-68`) | 중앙(GPO/Intune)에서 값을 **덮어쓸** 위치. 선택입니다 |
| 2 | **번들** — `<설치폴더>\resources\enterprise-policy.json` (`:236-244`) | **설치 프로그램에 내장된 기본값.** 저장소 원본은 `resources/enterprise-policy.json` |
| 3 | `ORCA_ENTERPRISE_POLICY` 환경 변수 | 명시 경로가 **후보에 추가**될 뿐. `off`/`none`/`disabled`/`false`/`0`은 **무시됩니다**(`:41`, `:97`) |
| 4 | 사용자별 — `<userData>\enterprise-policy.json` | 개인 테스트용 |

**비패키징(`pnpm dev`·vitest)에서만** `ORCA_ENTERPRISE_POLICY`가 1순위를 가져가고, 무력화 값으로 탐색 전체를 끌 수 있습니다(`:99-106`; 테스트 스위트가 이 값을 씁니다). 번들 후보는 비패키징에서 **최후순위**로만 들어옵니다(`:110-111` — 후보는 `[머신 전역, 사용자별, 체크아웃의 resources/enterprise-policy.json]`, 경로 해석은 `:258-272` `devCheckoutPolicyPath`, 설계 의도는 `:80-87` 주석). 그래서 `pnpm dev`가 별도 설정 없이도 플릿 UI를 보여 주고([macOS dev UI 점검](docs/reference/macos-dev-ui-check.md)), 무력화 값을 쓰는 vitest·E2E 격리는 그대로 유지됩니다.

> 📦 **빌드하는 사람에게: 정책을 바꾸는 1차 경로는 `resources/enterprise-policy.json`을 고치고 다시 빌드하는 것입니다.** 그 파일이 `config/electron-builder.config.cjs`의 `commonExtraResources`로 실려 위 2순위가 됩니다(3 OS 공통). 패키징 후 `afterPack`이 산출물에 실제로 들어갔는지, JSONC로 파싱되는지, `lockdown: true`인지 검사하고 아니면 빌드를 **실패시킵니다**(`config/scripts/verify-packaged-enterprise-policy.cjs`) — electron-builder는 `extraResources` 원본이 없어도 경고 한 줄만 남기고 넘어가기 때문입니다.

> 🔒 **환경 변수는 사내 잠금을 끌 수 없습니다 — 이게 보안 속성입니다.** Windows에서 표준 사용자는 관리자 권한 없이 자기 계정의 환경 변수를 만들 수 있습니다. `setx ORCA_ENTERPRISE_POLICY off` 한 줄로 잠금이 풀린다면 그건 정책이 아닙니다. 그래서 패키징 빌드에서는 이 변수가 후보를 **추가**만 하고, 머신 전역 파일과 번들 정책이 **항상 먼저** 탐색됩니다(`enterprise-policy-file.ts:70-88` 주석, 분기는 `:110-113`). 판정 신호는 `app.isPackaged`입니다 — 표준 사용자가 바꿀 수 없는 유일한 신호이기 때문입니다(`:228-234`). 같은 이유로 번들 후보는 사용자별(`%APPDATA%`) 후보보다 **위**입니다 — 아니면 `%APPDATA%\Orca\enterprise-policy.json`에 `{}` 하나로 풀립니다.
>
> **배포상의 결론: 설치만으로 잠기고, 값을 중앙에서 바꿔야 할 때만 1순위 머신 전역 경로에 파일을 놓고 사용자가 쓰지 못하도록 ACL을 거세요(§5.2).** 환경 변수로 커스텀 경로를 지정하는 방식은 **개발·검증용이지 플릿용이 아닙니다.**

**머신 전역 위치가 이 설계의 핵심입니다.** `setx`는 사용자별 상태를 쓰기 때문에, 같은 PC의 다른 Windows 프로필·서비스 계정·앞으로 새로 만들어질 프로필은 전부 잠기지 않은 채로 남습니다(`enterprise-policy-file.ts:9-11`). 번들 정책도 같은 성질을 가집니다 — 설치 폴더의 파일 하나가 그 설치본을 쓰는 모든 실행에 적용됩니다. 다만 per-user 설치라 **그 폴더는 사용자 소유**입니다([외부 연동 감사](docs/reference/external-integrations-audit.md) §0.2 #21).

정책은 프로세스당 **한 번만** 읽고 캐시합니다(`:325-368`). 파일을 바꾸면 **Orca를 재시작**해야 반영됩니다.

### 4.2 파일 형식

JSONC입니다 — `//` 주석과 후행 쉼표를 허용합니다(`enterprise-policy-file.ts:184-186`). UTF-8 BOM과 PowerShell 5.1의 UTF-16LE 출력도 자동으로 처리합니다(`:166-171`, `:181-186`).

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
| `lockdown` | `false` | 마스터 스위치. 추가로 **Chromium의 DNS-over-HTTPS 자동 승격을 끄고** OS 리졸버로 고정합니다(`src/main/enterprise/enterprise-secure-dns.ts:19-24`, 배선 `src/main/index.ts:2084`), **`node:https` 직접 다운로드를 거부합니다**(`enterprise-direct-download-guard.ts:17-25`) |
| `disableTelemetry` | `lockdown` 상속 | PostHog 텔레메트리(`telemetry/consent.ts:88`) + 진단 번들 **업로드 레인**(`observability/index.ts:103`, `:120-133`). **로컬 NDJSON 로그는 계속 기록됩니다** — 네트워크만 막습니다. 앱 내 피드백·크래시 리포트 전송은 정책이 아니라 **코드에서 제거**되었습니다 |
| `disableAutoUpdate` | `lockdown` 상속 | 사내 GHES(`githubEnterpriseHost`)의 `updateReleaseRepository`(기본 `DPI/Orcads`) 릴리스 태그를 읽어 **"새 버전이 있습니다" 팝업**을 띄우는 레인을 끕니다. 게이트는 `app-update/app-update-check-service.ts`의 `check()` 한 곳. ⚠️ **벤더 인앱 업데이터는 여전히 코드에 없습니다** — 이 키를 `false`로 둬도 다운로드·설치·자가교체는 일어나지 않고 `electron-updater`도 의존성이 아닙니다. 팝업의 유일한 동작은 사내 릴리스 페이지를 브라우저로 여는 것입니다 |
| `updateReleaseRepository` | `null` → `DPI/Orcads` | 위 릴리스 조회가 볼 저장소(`OWNER/REPO`). `lockdown`을 상속하지 않는 **값**입니다. URL은 받지 않습니다 |
| `disableStarNag` | `lockdown` 상속 | github.com SaaS로 가는 star 조회/쓰기 — `github/client.ts:341`(`checkOrcaStarred`), `:527`(`starOrca`). **게이트를 서비스가 아니라 클라이언트 함수에 뒀습니다** — 넛지 서비스(`star-nag/service.ts:121`) 말고도 `star-nag/direct-star-attempt.ts:9`, `star-nag/agent-value-moment.ts:46`, IPC 핸들러 `ipc/github.ts:1210`·`:1213`이 같은 함수로 들어옵니다 |
| `disableCloudRelay` | `lockdown` 상속 | `orca-profiles/profile-cloud-auth-config.ts:82`이 "미구성"으로 응답 → Orca Cloud 로그인, 조직 멤버 조회(`orca-profiles/profile-cloud-org-members-service.ts:119`), 그리고 **데스크톱↔모바일 페어링 릴레이**(`src/main/index.ts:3065-3068`이 `configured`일 때만 `DesktopRelayService`를 만듭니다)가 한꺼번에 꺼집니다. 단일 초크포인트임을 `:76-78` 주석이 명시 |
| `disableUsagePolling` | `lockdown` 상속 | AI 벤더 사용량/레이트리밋 폴링. 게이트는 `rate-limits/service.ts:824-825`, 진입점은 `start()`(`:353`), Codex 리셋 크레딧(`:478`), 계정 스위처 프리뷰 2종(`:572`, `:652`), `fetchAll`(`:998`), `fetchCodexOnly`(`:1063`), `fetchClaudeOnly`(`:1125`), `fetchGrokOnly`(`:1190`). 벤더 백엔드로 POST하는 경로는 예외를 던집니다 |
| `disableManagedClaudeAccounts` | `lockdown` 상속 | Orca 관리형 Claude 계정 — `platform.claude.com` OAuth 토큰 회전(게이트 `claude-accounts/oauth-refresh.ts:131-133`)과 에이전트 PTY로 가는 환경에서 AWS Bedrock 자격증명을 지우는 동작(게이트 `runtime-auth-service.ts:613-616` + `environment.ts:22`)을 함께 끕니다. **Bedrock 플릿에서는 필수 — §3.3** |
| `disableSpellcheck` | `lockdown` 상속 | Chromium 맞춤법 사전 CDN 다운로드. 자체 세션을 갖는 WebContents는 메인 창의 게이트를 상속하지 않으므로 **여섯 곳**에 개별로 걸려 있습니다: 메인 창(`window/createMainWindow.ts:306`), webview 게스트(`:494`), 임베디드 브라우저 팝업(`browser/browser-manager.ts:195`), 오프스크린 브라우저(`browser/offscreen-browser-backend.ts:45`), 대시보드 팝아웃(`window/dashboard-popout-window.ts:181`), PDF 렌더러(`lib/html-to-pdf.ts:46`) |
| `enforceNetworkAllowlist` | **항상 `false`** (상속 안 함) | 아래 4.3 |
| `allowedNetworkHosts` | `[]` | 허용 호스트 목록. `enforceNetworkAllowlist`가 켜졌을 때만 의미가 있습니다 |

전체 스키마와 예제는 **[엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md)** 를 보세요.

**값 해석 규칙** (`enterprise-policy.ts:200-223`)

- JSON `true` / `false`가 정식입니다. 문자열 `"true"`/`"yes"`/`"on"`/`"1"`과 `"false"`/`"no"`/`"off"`/`"0"`도 받습니다(대소문자·공백 무관 — `:190-191`).
- **알아볼 수 없는 값은 "꺼짐"이 아니라 "없음"으로 취급**되어 `lockdown`을 상속하고, 경고를 남깁니다. 관리자 오타가 조용히 머신을 풀어버리는 사고를 막기 위한 설계입니다(`:197-199`).
- 모르는 키도 경고합니다(`:352-356`). JSON 자체가 깨졌으면 **일부만 적용하지 않고 파일 전체를 버리고 다음 후보로 넘어갑니다**(`enterprise-policy-file.ts:187-194`) — 번들 정책이 있으면 그쪽이 적용되므로, 오타 하나가 플릿을 풀어버리지는 않습니다(§4.1).
- 경고는 `[enterprise-policy]` 접두사로 stderr에 나가고 **동시에 버퍼링되어 NDJSON 로그에 남습니다**(`enterprise-policy-file.ts:131-136`). Start Menu로 띄운 Windows GUI 프로세스에는 콘솔이 없어 stderr가 사라지기 때문입니다(§5.2).

### 4.3 네트워크 허용 목록 (opt-in)

`enforceNetworkAllowlist`는 **`lockdown`을 상속하지 않습니다.** 잘못된 허용 목록은 기능 스위치와 달리 배포 전체를 깨뜨릴 수 있어서 관리자가 명시적으로 켜야 합니다(`enterprise-policy.ts:386-388`, `enterprise-network-guard.ts:15-16`).

켜면 두 곳을 막습니다(`enterprise-network-guard.ts:79-97`, `:99-122`):

- `session.defaultSession`의 `webRequest.onBeforeRequest` — 이 세션을 지나는 요청. 렌더러 요청이 대표적입니다. 로그 라벨은 `renderer request`(`:93`) *(세션 범위는 Electron 계약이지 이 저장소 코드의 사실은 아닙니다 — 실제 차단 여부는 배포 전 1대에서 확인하세요.)*
- 메인 프로세스의 global `fetch` 래퍼(`:111`, 라벨 `main-process fetch`) — Node의 global fetch를 쓰는 메인 클라이언트용. `network/proxy-settings.ts`의 사내 프록시는 Electron 세션에만 적용되어 global fetch를 못 보기 때문입니다(`enterprise-network-guard.ts:3-7`)

`githubEnterpriseHost`는 항상 허용 목록에 자동 추가되고(`enterprise-policy.ts:369-372`), loopback은 언제나 통과합니다(`enterprise-network-guard.ts:47-55`). 차단은 호스트당 한 줄씩 stderr로 보고됩니다(`:36-45`).

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

`config/electron-builder.config.cjs:356-365`의 `nsis` 블록은 `oneClick`과 `perMachine`을 **설정하지 않습니다.** 산출물 이름은 `orca-windows-setup.exe`로 고정입니다(`:357`). 따라서 electron-builder 기본값이 적용되어 **원클릭·사용자별 설치**가 되고, `%LOCALAPPDATA%\Programs\` 아래에 설치되며 관리자 권한이 필요 없습니다. *(여기서 코드로 검증한 것은 두 키가 설정되지 않았다는 사실까지입니다. `oneClick: true`/`perMachine: false` 기본값과 그에 따른 설치 위치·권한은 electron-builder/NSIS의 계약이므로 배포 전 1대에서 확인하세요.)*

- 무인 설치: `orca-windows-setup.exe /S` — NSIS 원클릭 설치 프로그램의 표준 동작입니다. *(electron-builder/NSIS의 계약이지 이 저장소 코드의 사실은 아닙니다. 배포 전 1대에서 검증하세요.)*
- 관리자 권한이 필요 없으므로 사용자 단위 소프트웨어 배포 채널(Intune 사용자 대상 앱 등)로 밀 수 있습니다.
- ⚠️ **그 대가**: 설치 폴더가 사용자 소유이므로, 여기에 내장한 번들 정책(§5.2)은 표준 사용자가 지울 수 있습니다. 이걸 막으려면 `%ProgramData%` 배치(ACL 포함) 또는 perMachine 설치가 필요합니다 — [외부 연동 감사](docs/reference/external-integrations-audit.md) §0.2 #21.
- 제거 시 `%LOCALAPPDATA%` 아래로 재배치된 터미널 데몬을 정리하는 NSIS 스크립트가 포함되어 있습니다(`:361-364`, 스크립트는 `config/nsis/daemon-host-uninstall.nsh`).

### 5.2 정책 파일 배포 — 이제 **선택**입니다

**설치 프로그램이 기본 정책을 싣고 있습니다.** `resources/enterprise-policy.json`이 `extraResources`로 설치 폴더에 들어가고 앱이 `process.resourcesPath`에서 읽으므로, `.exe`만 설치한 PC도 §4.2의 잠금이 걸린 상태로 뜹니다. 예전 판의 "설치 프로그램은 정책 파일을 만들지 않습니다"는 더 이상 사실이 아닙니다. `nsis.include` 스크립트는 여전히 데몬 제거용 하나뿐이며, 정책은 NSIS가 아니라 리소스 복사로 실립니다.

아래 배포는 **번들 기본값을 중앙에서 덮어써야 할 때**만 하세요 — 값을 바꿔야 하는데 재빌드·재배포를 하고 싶지 않을 때, 부서별로 값이 달라야 할 때, 또는 Intune 콘솔에서 준수 여부를 감시하고 싶을 때입니다.

- 대상: **`%ProgramData%\Orca\enterprise-policy.json` — 기본 머신 전역 경로를 쓰세요.** 패키징 빌드에서 이 경로가 1순위이고 환경 변수도, 번들 정책도 이것을 밀어낼 수 없기 때문입니다(§4.1). **`ORCA_ENTERPRISE_POLICY`는 배포하지 마세요** — 필요하지 않고, 개발·검증용입니다.
- ⚠️ **배포한 파일의 문법을 검증하세요.** 깨진 파일은 무시되고 **번들 정책으로 되돌아갑니다** — 잠금은 유지되지만 관리자가 의도한 예외가 조용히 사라집니다(§4.1).
- **ACL을 함께 고정하세요 — 사용자가 쓸 수 있는 정책 파일은 정책이 아니라 기본값입니다.** 관리자가 넣어 둔 파일은 기본 ACL에서 표준 사용자가 수정·삭제할 수 없지만, `%ProgramData%` 루트는 표준 사용자도 새 폴더·파일을 만들 수 있으므로 **파일이 아직 없는 머신에서는 사용자가 자기 소유의 정책 파일을 먼저 만들 수 있습니다.** 배포 스크립트에서 폴더 상속을 끊고 `Users`를 읽기 전용으로 내리세요 — 구체적인 `icacls` 명령은 [엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md) §6-1에 있습니다. *(Windows ACL 동작이지 이 저장소 코드의 사실은 아닙니다.)*
- 수단: GPO 파일 기본 설정, Intune 구성 프로필/스크립트, SCCM 패키지 등 기존 구성 관리 채널. *(운영 권고 — 코드가 강제하는 바가 아닙니다.)*
- 순서는 상관없습니다. 정책 파일이 앱보다 먼저 들어가도 되고 나중에 들어가도 되지만, 정책은 프로세스 시작 시 1회만 읽히므로(`enterprise-policy-file.ts:325-368`) **이미 실행 중인 Orca는 재시작해야** 반영됩니다.

#### 적용 확인 — NDJSON 로그의 `enterprise.policy` 스팬

Start Menu로 띄운 Windows GUI 프로세스에는 콘솔이 없어서 `[enterprise-policy]` stderr 진단이 그대로 사라집니다. 그래서 정책 해석 결과를 로그에 한 번 기록합니다(`src/main/enterprise/enterprise-policy-trace.ts:1-12` 주석이 이 이유를 명시).

- 파일: `%APPDATA%\Orca\logs\main.trace.ndjson` (`src/main/observability/logs-directory.ts:28`, `:33`)
- 스팬 이름 `enterprise.policy`. 속성에 **실제 채택된 파일 경로**(`enterprise.policy.source_path`, 없으면 `(none found)`), **탐색한 후보 목록**(`…searched_paths`), `lockdown`, 각 `disable*` 값, GHES 호스트, 허용 목록, 그리고 모든 경고가 들어갑니다(`enterprise-policy-trace.ts:28-62`).
- 기록 시점은 `initObservability()` 직후입니다(`src/main/index.ts:2309-2312`).
- `disableTelemetry`/`lockdown`이 켜져도 로컬 NDJSON은 유지되므로 잠금 상태에서도 이 확인이 동작합니다(`observability/index.ts:120-133`). 단 **`ORCA_DIAGNOSTICS_DISABLED`를 켜면 이 로그도 사라집니다**(`:113-118`).

```powershell
Select-String -Path "$env:APPDATA\Orca\logs\main.trace.ndjson" -Pattern "enterprise.policy" | Select-Object -Last 1
```

기능으로 확인하는 방법(예: `?` 메뉴에 "피드백 보내기"가 없는지)도 여전히 유효합니다. 반대로 **경고가 없다는 것은 파일을 찾았다는 증거가 아닙니다** — 정책 파일이 아예 없어도 코드는 조용히 지나갑니다(`enterprise-policy-file.ts:172-178`). 그래서 위 스팬의 `enterprise.policy.source_path` 속성을 보는 것이 유일하게 확정적인 확인 방법입니다.

### 5.3 잠긴 사내 빌드와 공개 빌드를 구분하는 법 — 내장 수단이 없습니다

이 포크는 버전 문자열도 앱 식별자도 바꾸지 않습니다. `package.json`의 `version`은 upstream 값(`1.4.155`) 그대로이고, `appId`는 `com.stablyai.orca`, `productName`은 `Orca`입니다(`config/electron-builder.config.cjs:53`, `:118-119`). **즉 앱 안의 버전·이름만으로는 사내 빌드와 공개 빌드를 구분할 수 없습니다.**

실무 권고 *(운영 관례이지 코드가 보장하는 것이 아닙니다)*:

1. **정책 파일 존재 여부를 자산 관리로 감시** — `%ProgramData%\Orca\enterprise-policy.json`이 없는 머신이 곧 안 잠긴 머신입니다. 실행 파일이 어느 빌드인지보다 이쪽이 실질적인 판정 기준입니다.
2. **`ORCA_DISABLE_PUBLISH_TARGET=1`로 빌드** — `publish` 타깃이 `null`이 되어 업데이터 메타데이터가 아예 안 실립니다. 그러면 이 설치본은 upstream 릴리스 피드로 덮어써질 수 없습니다(`config/electron-builder.config.cjs:543-551`).
3. **사내 인증서로 서명하고 `ORCA_WIN_PUBLISHER_NAME`을 그 주체로 지정** — 공개 배포본의 서명 주체와 달라지므로 공개 설치 프로그램이 사내 빌드를 갈아치우지 못합니다. 기본값을 그대로 두면(`SignPath Foundation`) 공개 빌드가 그대로 받아들여집니다(`:326-332`). (이 빌드 자체에는 인앱 업데이터가 없습니다.)
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

현재 `enterprise/samsungds`에는 **`v1.4.184`** 가 병합되어 있습니다(`git log --oneline --merges -3`로 확인). v1.4.159부터 v1.4.184까지 매번 **병합(merge)** 으로 올렸습니다 — 강제 푸시가 필요 없고, 사내에서 이미 받아 간 커밋이 재작성되지 않습니다.

```powershell
git fetch upstream --tags --prune
git checkout enterprise/samsungds
git merge v1.4.165                  # 예: 새 릴리스 태그
# 충돌 해결 후:
git add -A ; git commit
git push origin enterprise/samsungds
```

- **릴리스 태그는 서로 조상 관계가 아닙니다.** upstream은 릴리스마다 `main`에서 새로 분기해 픽스를 체리픽하므로 `v1.4.159`는 `v1.4.162`의 조상이 아니고, `--ff-only`로는 절대 올라가지 않습니다. 그래서 `main`은 **`upstream/main` 미러로만** 두고, 릴리스 태그는 이 브랜치에 병합합니다.
- `rebase`로도 되지만 강제 푸시(`--force-with-lease`)가 필요하고, 위 이유로 재생 대상이 릴리스 태그일 때는 충돌이 더 큽니다.
- exe는 항상 이 `enterprise/samsungds` 브랜치(또는 사내 릴리스 태그 `v1.4.x-samsungds`)에서 빌드합니다.
- 병합 직후에는 **문서의 `file:line` 인용이 전부 밀립니다.** 이 README와 `docs/reference/*.md`의 인용을 재검증하는 것을 체크리스트에 넣으세요.
- 병합 후 `pnpm install`을 **반드시** 다시 돌리세요. v1.4.162는 신규 런타임 의존성(`emojibase-data`)을 추가했고, 없으면 `pnpm typecheck`가 먼저 깨집니다.
- **upstream이 잠금 대상 파일을 리팩터링하면 게이트가 조용히 사라집니다.** v1.4.163이 실제로 두 번 그랬습니다: `runtime-environments.ts`를 쪼개면서 `assertRemoteOrcaServerAllowed()`가 붙어 있던 핸들러를 옮겼고(+ `verifyAndAddFromPairingCode`라는 두 번째 페어링 레인 신설), 계정 등록에는 ipcMain을 지나지 않는 `accounts.addClaudeFromConfigDir` RPC를 열었습니다. 병합 후 `git grep -n 'getEnterprisePolicy()' src/`와 `src/main/enterprise/*-guard.ts`의 호출부를 **이전 브랜치와 대조**하고, upstream 신규 코드에 `net.fetch`/새 IPC 채널/새 RPC 메서드가 있는지 훑으세요.

#### 충돌 예상 지점 — 솔직한 현황

사내 변경은 "신규 파일 몇 개"가 아닙니다. `v1.4.163` 기준으로 **신규 파일 112개, 기존 upstream 파일 수정 157개, upstream 파일 삭제 5개**(잠금으로 없앤 설정 팬)입니다. 최신 수치는 직접 확인하세요:

```powershell
git diff --name-status v1.4.163..HEAD   # A=신규, M=upstream 파일 수정, D=삭제
```

| 성격 | 파일 | 리베이스 충돌 |
| --- | --- | --- |
| **신규(포크 전용)** | `src/shared/enterprise-policy.ts`(+`.test.ts`), `src/main/enterprise/**` 24개(정책 파일 탐색·트레이스·네트워크 가드·직접 다운로드 가드·secure DNS·에뮬레이터/원격 서버/에이전트 허용목록 가드·픽스처·테스트), `src/main/rate-limits/usage-polling-disabled-providers.ts`(+`.test.ts`), `src/main/observability/observability-consent.test.ts`, `src/main/claude-accounts/environment.test.ts`, `src/main/emulator/android/scrcpy-server-download.test.ts`, `config/vitest-enterprise-policy-isolation.ts`, `docs/reference/*.md` 5개, `.claude/harness/*.md` 3개(규칙 원장 — [7절](#7-오케스트레이션-규칙-원장)) | 거의 없음 |
| **포크가 삭제한 표면** | upstream 대비 **123개 파일**을 지웠습니다. 도메인별로 피드백 제출 12개(`ipc/feedback*`, `sidebar/SidebarFeedback*`, `lib/feedback-image-attachments*`, `crash-reporting/crash-feedback-diagnostic-bundle.ts`), 크래시 리포트 7개, local-builds 7개, orca-profiles 4개, artifacts 3개 등. 게이트를 다는 대신 표면 자체를 없앤 경우입니다 | **가장 위험한 범주입니다.** upstream이 지운 파일을 수정하면 modify/delete 충돌이 나고, incoming을 수용하면 **표면이 통째로 되살아납니다** — 파일이 통째로 돌아오므로 게이트 grep에도 타입체크에도 잡히지 않습니다. 동기화마다 `comm -23 <(git ls-tree -r --name-only <옛태그>) <(git ls-tree -r --name-only HEAD)` 로 삭제 목록을 뽑아 upstream 변경분과 교집합을 확인하세요 |
| **upstream 파일에 삽입한 게이트** | 메인: `telemetry/consent.ts`, `observability/index.ts`, `github/client.ts`, `git/hosted-remote-url.ts`, `orca-profiles/profile-cloud-auth-config.ts`, `rate-limits/service.ts`, `rate-limits/claude-pty.ts`, `claude-accounts/{environment,oauth-refresh,runtime-auth-service}.ts`, `ipc/pty.ts`, `window/{createMainWindow,dashboard-popout-window}.ts`, `browser/{browser-manager,offscreen-browser-backend}.ts`, `lib/html-to-pdf.ts`, `emulator/android/scrcpy-server-download.ts`, `index.ts`, `src/shared/network-proxy.ts`. 렌더러: `src/renderer/index.html`(CSP 주석), `components/settings/PrivacyDiagnosticsSection.tsx`. 빌드·테스트: `config/electron-builder.config.cjs`, `config/vitest.config.ts`, `tests/e2e/helpers/electron-home-isolation.ts` (+ 대응 테스트 파일들, i18n 카탈로그 5개, `.gitignore` 3줄). 문서: `skill-guides/orchestration.md`의 `## Project Rule Ledger` 절 + `## Next Action`의 원장 로드 한 구절 | upstream이 같은 함수를 건드리면 발생. 게이트를 각 도메인의 **단일 초크포인트**에 넣어 둔 이유가 이것입니다. 오케스트레이션 가이드 절은 `config/scripts/orchestration-skill-guidance.test.mjs`가 지키므로 유실 시 테스트가 먼저 붉어집니다 |
| **포크가 재작성해 소유한 문서** | `README.md`(upstream 원문 268줄을 사내 문서로 전면 교체 — 남은 공통 문장이 거의 없어 자동 병합이 되지 않습니다), `CLAUDE.md`(upstream은 `@AGENTS.md` 한 줄짜리 11바이트 스텁 → 126줄로 확장) | **둘 다 upstream에도 존재하므로 upstream이 손댈 때마다 반드시 충돌합니다.** 리베이스에서 사내 버전을 남기려면 `git checkout --theirs README.md CLAUDE.md` — **리베이스에서는 `--ours`가 재배치 대상(upstream), `--theirs`가 재생 중인 사내 커밋**이라 머지와 의미가 뒤집혀 있습니다. 그다음 upstream 변경분 중 필요한 것만 수동으로 반영하세요 |

> 위 목록에는 정책 작업과 무관한 upstream 접근성/드리프트 수정도 섞여 있습니다(예: `src/renderer/src/components/DetachedHeadBadge.tsx`, `src/renderer/src/components/skills/skill-freshness-group.tsx`). 이런 커밋은 upstream에 PR로 올려 없애는 편이 장기적으로 리베이스 충돌 면적을 줄입니다.

---

## 7. 오케스트레이션 규칙 원장

`/orchestration`으로 워커를 띄우면 코디네이터가 **태스크마다** 프로젝트 규칙을 골라 워커의
`--spec`에 주입합니다. 워커는 매번 새 세션이고 새 worktree일 때가 많아 **코디네이터의 세션
메모리를 구조적으로 볼 수 없기 때문**입니다(세션 메모리는 작업 디렉터리 키). dispatch spec이
규칙을 워커에게 전달하는 유일한 경로입니다.

| 무엇 | 어디 | 성격 |
| --- | --- | --- |
| 프로토콜(동작 규정) | `skill-guides/orchestration.md`의 `## Project Rule Ledger` | 바이너리에 임베드 |
| 규칙 데이터 | `.claude/harness/rules.md` | 커밋. 블록 12개 / 200줄 상한 |
| 승격 후보 | `.claude/harness/candidates.md` | 커밋. 어떤 컨텍스트에도 안 들어감 |
| 폐기 이력 | `.claude/harness/retired.md` | 커밋. 부활 방지용 |

**패키징 경로 — URL로 설치해도 동작합니다.** 프로토콜은 스킬 파일이 아니라 바이너리가 서빙합니다.

```
skill-guides/orchestration.md          ← 유일한 편집 대상
  └─ pnpm generate:bundled-skill-guides
       ├─ src/cli/bundled-skill-guides.ts   → build:cli → 설치 프로그램에 포함
       └─ skills/orchestration/SKILL.md     → 얇은 디스커버리 스텁(내용 안 바뀜)
```

마켓플레이스 URL로 설치하면 사용자는 스텁만 받고, 스텁은 `orca skills get orchestration`을
실행하라고 지시합니다. 그 명령이 **설치된 사내 바이너리**에서 위 절을 그대로 꺼내므로 원장
프로토콜이 그대로 적용됩니다. 반대로 스텁에 프로토콜을 넣으면 바이너리와 드리프트하므로 넣지
않습니다(`orchestration-skill-guidance.test.mjs`가 이를 강제합니다).

**편집 절차:** `skill-guides/orchestration.md`를 고친 뒤 `pnpm generate:bundled-skill-guides`를
반드시 실행하세요. 빼먹으면 `pnpm lint`의 `verify:bundled-skill-guides`가 stale로 실패합니다.

**규칙이 늘어나는 방식:** 워커 완료 후 사용자가 지적하거나 실행 도중 원장에 없던 프로젝트 요구를
추가로 주면, 코디네이터가 `candidates.md`에 자동으로 한 건 적습니다(승인 불필요 — 어떤 컨텍스트에도
안 들어가므로 비용 0). 승격 심사는 **한 run의 마지막 워커가 정산된 뒤**에 묻고, 세션이 예고 없이
끝날 수 있으므로 **다음 run이 `rules.md`를 읽는 시점에 미결 후보를 다시 확인**합니다. 최종 반영은
항상 사람이 승인합니다. 관측 2회 미만, `pnpm lint`/`pnpm typecheck`가 이미 잡는 것, 기존 블록과
scope가 겹치는 것, 이 머신에서만 참인 것은 승격하지 않습니다.

> **프로토콜은 사내 빌드에만 실립니다.** 원장 *데이터*(`.claude/harness/`)는 프로젝트마다 다르고
> 저장소에 커밋되지만, *동작 규정*은 이 포크의 `orca` 바이너리가 서빙합니다. 공개 upstream Orca
> 설치본으로 같은 프로젝트를 열면 `orca skills get orchestration`에 이 절이 없어 원장이 그대로
> 무시됩니다 — 파일은 있는데 아무도 안 읽는 상태가 되므로, 팀에 공유할 때 사내 빌드 사용 여부를
> 함께 확인하세요.

---

## 8. 봇(Bots) — 반복 작업을 맡기는 상주 담당자

> 이 포크 고유 기능입니다. upstream Orca와 [onorca.dev/docs](https://www.onorca.dev/docs)에는 없습니다.
> 설계 배경·의도적으로 만들지 않은 것은 [`docs/reference/bot-lane.md`](docs/reference/bot-lane.md).

좌측 사이드바 위쪽의 **`Sessions | Bots`** 탭에서 씁니다. `Sessions`는 지금까지 쓰던 워크스페이스
목록 그대로이고, `Bots`가 새로 붙은 레인입니다.

봇에게는 두 가지 방식으로 일을 시킵니다 — **채팅으로 직접**(§8.3), 또는 **예약 루틴으로**(§8.4).

### 8.1 봇이란

**봇은 새로운 실행 엔진이 아니라 이름입니다.**

```
봇 = 이름 + 아바타 + 역할 설명
    + 에이전트(claude 등) + 워크스페이스 바인딩
    + 고정된 대화 1개 (그 봇의 세션)
    + 그 봇에게 맡긴 루틴(예약 작업) N개
```

루틴이 실행되면 **평소처럼 그 워크스페이스에 에이전트 터미널이 뜨고 프롬프트가 들어갑니다.**
봇 전용 프로세스도, 봇 전용 대화 저장소도 없습니다. 그래서 실행 이력·사용량 집계·SSH 동작이
기존 자동화와 완전히 같습니다.

봇에 붙인 루틴은 **자동화 페이지에도 그대로 보입니다** — 같은 레코드이기 때문입니다.

### 8.2 봇 만들기

1. 사이드바 상단 **`Bots`** 탭 → 오른쪽 **`+`**
2. **아바타 / 이름 / 역할 / 설명**을 채웁니다
   - 이름에서 `@핸들`이 자동으로 만들어집니다 (예: `릴리스 점검` → `@릴리스-점검`).
     다른 봇에게 일을 넘길 때 쓰는 주소입니다(§8.4). 이름을 바꾸면 핸들도 따라 바뀝니다.
3. **에이전트**를 고릅니다. 정책의 `allowedAgents`로 좁혀진 목록만 나옵니다.
4. **워크스페이스**를 고릅니다. 루틴은 여기서 실행됩니다.
   - 나중에 정해도 됩니다(`연결 안 함`). 다만 워크스페이스가 없으면 루틴을 만들 수 없습니다.

### 8.3 채팅으로 일 시키기

봇을 열면 **대화** 입력창이 있습니다. 지시를 적고 **Enter**로 보냅니다(줄바꿈은 Shift+Enter).

- 처음 보내면 그 봇의 워크스페이스에 **백그라운드 탭**으로 에이전트 세션이 뜹니다.
  현재 보고 있는 탭을 빼앗지 않습니다.
- 두 번째부터는 **같은 세션**으로 들어갑니다. 봇마다 대화가 하나라는 뜻입니다.
- 봇이 작업 중이어도 보낼 수 있습니다. 상태 점이 `작업 중`으로 바뀌고, 최근 답변이 아래에 뜹니다.
- 헤더의 **↗** 버튼으로 그 세션을 본 화면에서 엽니다. **전체 대화는 거기에 있습니다** —
  사이드바에는 내가 보낸 것·다른 봇이 넘긴 것과 가장 최근 답변 하나만 보입니다.

⚠️ **앱을 재시작하면 대화가 끊길 수 있습니다.** 데몬이 세션을 살려 두면 이어지고, 아니면 다음
메시지가 새 대화를 엽니다(§8.7).

### 8.4 봇끼리 일 넘기기

**입력창 맨 앞에 `@핸들`** 을 쓰면 그 메시지는 다른 봇에게 갑니다.

```
@code-reviewer PR 3 좀 봐줘
```

- 받는 봇의 대화에 **누가 보냈는지가 붙어서** 들어갑니다 (`Message from 🤖 …`).
  이게 없으면 받는 에이전트가 사용자가 쓴 것으로 읽고 엉뚱한 쪽에 답합니다.
- **맨 앞의 멘션만** 넘깁니다. 문장 중간의 `@이름`은 지금 보고 있는 봇에게 읽히라고 쓴 글로 봅니다.
- 없는 핸들이면 보내지 않고 알려 줍니다.
- 받은 봇에는 로스터에 **점**이 붙고 `Bots` 탭에 개수가 뜹니다. 그 봇을 열면 사라집니다.

봇이 **스스로** 다른 봇에게 넘길 수도 있습니다. 대화가 처음 열릴 때 팀메이트 명부가 주입되고,
각 봇 세션은 `bot:<핸들>` 제목으로 떠 있어 에이전트가 `orca terminal list` / `create` / `send`로
찾거나 **직접 띄워서** 보낼 수 있습니다.

⚠️ **봇은 한 번이라도 메시지를 받아야 세션이 생깁니다.** 방금 만든 봇 3개 중 하나에게만 말을 걸었다면
나머지 둘은 떠 있지 않고, 코디네이터 봇이 "위임할 대상이 없다"고 판단합니다. 그래서 프리앰블이
`orca terminal create --title "bot:<핸들>"`로 **직접 띄우는 방법**까지 알려 줍니다 — 제목이 맞으면
Orca가 그 터미널을 그 봇의 대화로 채택합니다. 미리 확실히 하려면 각 봇에게 인사 한 마디씩 보내
세션을 만들어 두세요.

⚠️ 이건 **강제되지 않습니다** — 에이전트가 그렇게 하기로 할 때만 동작합니다.
확실하게 넘기려면 `@핸들`을 쓰세요.

### 8.5 루틴(예약 작업) 붙이기

봇을 열고 **`Routines`** 옆 **`+`**:

| 항목 | 설명 |
| --- | --- |
| 이름 | 실행 기록에 남는 이름 |
| 프롬프트 | 매 실행마다 에이전트에게 들어갈 지시 |
| 주기 | 매시간 / 매일 / 평일 / 매주 |
| 시각 | `매시간`이면 분만 사용합니다 |

만들면 봇 상세에 다음 실행 주기와 최근 실행 상태가 뜹니다. 각 행에서 **`▶`(지금 실행)** 과
**켜기/끄기** 를 바로 할 수 있습니다.

루틴은 **`reuseSession`이 켜진 채로** 만들어집니다 — 매일 새 대화를 여는 대신 그 봇과의 대화를
이어 가려는 의도입니다. ⚠️ 다만 현재 세션 재사용 판정은 "그 페인이 아직 살아 있는가"라서
**앱을 재시작하면 대화가 끊깁니다.** 정본 대화(봇 챗)는 아직 없습니다(§8.5).

### 8.6 봇 삭제 — 루틴은 지워지지 않습니다

봇을 지워도 **루틴은 계속 실행됩니다.** 봇 귀속만 떨어지고 자동화 페이지에 남습니다.
로스터를 정리했다는 이유로 예약된 에이전트 실행이 조용히 취소되면 안 되기 때문입니다.
정말 멈추려면 자동화 페이지에서 직접 끄거나 삭제하세요.

### 8.7 지금은 안 되는 것

| | 상태 |
| --- | --- |
| 재시작을 넘기는 대화 | ⚠️ 데몬이 세션을 살려 두면 이어지고, 아니면 새 대화가 열립니다. 사이드바의 라우팅 기록은 재시작 시 사라집니다 |
| 여러 봇 그룹 채팅(한 방에서 토론) | ❌ 멤버 명부를 가진 영속 방이 없습니다. 폭주 방지 상한도 함께 설계해야 합니다 |
| 봇마다 다른 계정으로 동시 실행 | ❌ 계정은 전역 1개 활성 구조입니다 |
| Telegram/Slack 등 메신저 연동 | ❌ **의도적으로 만들지 않았습니다** — 사내 소스가 사외로 나가는 레인이고 정책 파일로 막을 수 없는 형태가 되기 쉽습니다 |
| 폴더 워크스페이스 봇의 대화·루틴 | ❌ git 워크스페이스에만 가능합니다. 폴더를 고르면 그 자리에서 이유를 안내합니다 |
| SSH 원격 상주 봇 | ❌ 노트북을 닫으면 보고 통로가 끊깁니다 — `orca serve` peer 모델이 맞습니다 |

### 8.8 ⚠️ "항상 켜져 있는 봇"이 아닙니다

봇은 **예정대로 실행하고 결과를 남기는 것**이지 24시간 대기하는 서비스가 아닙니다.
Windows에서 데몬 레인이 실패·열화하면 터미널이 로컬 PTY로 떠서 **앱 종료와 함께 죽고,
그 폴백은 화면에 아무것도 보여 주지 않습니다**
([windows-daemon-session-survival.md](docs/reference/windows-daemon-session-survival.md)).
봇의 가용성을 업무 SLA로 약속하지 마세요. 봇 상세의 최근 실행 상태를 근거로 삼으십시오.

### 8.9 관리자 — 무인 실행 끄기

정책 키 **`disableUnattendedAgentRuns`** 가 봇 루틴과 예약 자동화를 **함께** 덮습니다.

```jsonc
// %ProgramData%\Orca\enterprise-policy.json
"disableUnattendedAgentRuns": true
```

- 켜면 예약된 실행이 **시작되지 않고** 기록에 `Blocked by policy`가 남습니다.
  기존 루틴은 목록에 그대로 보입니다 — 사라지면 왜 안 도는지 알 수 없기 때문입니다.
- **"지금 실행"(수동)은 그대로 동작합니다.** 이 스위치의 축은 "사람 없이 시작되는가"입니다.
- ⚠️ **번들 정책의 기본값은 `false`입니다.** 스위치가 생겼다는 이유만으로 이미 쓰던 예약
  자동화가 조용히 꺼지지 않게 한 선택입니다. 막으려면 위처럼 **명시하거나 그 줄을 지우세요**
  (`lockdown: true` 아래에서는 줄을 지우면 상속되어 켜집니다).

전체 스키마는 [엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md) §3.

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
  - `src/shared/enterprise-policy-fixture.ts` — 테스트 전용 픽스처
  - `config/vitest-enterprise-policy-isolation.ts` — 이 포크를 빌드하는 머신에는 머신 전역 정책 파일이 깔려 있으므로, 테스트 스위트가 lockdown 상태로 돌지 않도록 무력화
  - `src/shared/gateway-auth.ts` + `src/main/gateway/` — 사내 게이트웨이 로그인 레인(§3.1). 자격증명은 다루지 않고 `gateway-cli`의 실행과 상태 표시만 합니다. 이전의 AWS SSO 레인(`src/main/aws/`, `awsSso:*` IPC)을 **완전히 대체**했습니다
  - upstream 파일에 삽입된 게이트 목록은 §6 표 참고
- 원본 프로젝트의 일반 기여/개발 안내: [원본 CONTRIBUTING.md](https://github.com/stablyai/orca/blob/main/.github/CONTRIBUTING.md)

## License

원본 Orca는 [MIT License](LICENSE) 하에 배포되는 오픈소스이며, 이 포크도 동일 라이선스를 따릅니다.
