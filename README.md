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
> 대상 환경은 **Windows + 사내 GitHub Enterprise(`github.samsungds.net`) + AWS Bedrock 기반 Claude**이며, 보안을 위해 외부 인터넷 연동을 차단할 수 있습니다.
> 공개 배포본(설치 프로그램, 자동 업데이트, 텔레메트리)과 달리, 이 빌드는 사내에서 직접 빌드하고 외부 phone-home을 잠급니다.

---

## Orca란

Orca는 여러 CLI 코딩 에이전트(Claude Code, Codex 등)를 **각자의 git worktree에서 병렬로 실행**하고 한 곳에서 관리하는 Electron 데스크톱 앱입니다. 주요 기능:

- **병렬 Worktree** — 하나의 프롬프트를 여러 에이전트에 나눠 실행하고 결과를 비교·병합
- **터미널 분할** — WebGL 렌더링, 무한 분할, 재시작 후에도 유지되는 스크롤백
- **GitHub 네이티브 통합** — PR·이슈·체크를 앱 안에서 열람하고 worktree로 바로 진입 (이 브랜치는 사내 GHES 대응)
- **AI Diff 주석 / 파일 드래그 / 임베디드 브라우저 / Orca CLI** 등

기능 사용법 자체는 원본 문서([onorca.dev/docs](https://www.onorca.dev/docs))를 참고하세요. 이 README는 **사내 빌드·설정·배포·동기화**에 집중합니다.

지원 에이전트: 터미널에서 도는 CLI 에이전트는 모두 동작합니다. 이 환경의 1차 대상은 **AWS Bedrock 기반 Claude Code**입니다(§3).

---

## 1. 빌드 — Windows 설치 프로그램(.exe)

회사 Windows 머신에서 빌드합니다. 전체 절차·서명·프록시·트러블슈팅은 **[Windows 사내 빌드 가이드](docs/reference/windows-corporate-build.md)** 참고.

```powershell
corepack enable ; corepack prepare pnpm@10.24.0 --activate
Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN, Env:GITHUB_RELEASE_TOKEN, Env:ORCA_MAC_RELEASE -ErrorAction SilentlyContinue
pnpm install --frozen-lockfile
pnpm build:release
node config/scripts/ensure-native-runtime.mjs --runtime=electron
pnpm exec electron-builder --config config/electron-builder.config.cjs --win --x64 --publish never
# 산출물: dist\orca-windows-setup.exe  (NSIS, per-user 설치, 기본 무서명)
```

**전제 조건**

- **Visual Studio 2022 Build Tools**("C++를 사용한 데스크톱 개발" 워크로드) + **Python 3** — 준비 부담의 대부분이 여기 있습니다. 매 빌드마다 네이티브 모듈을 소스에서 재컴파일합니다.
- **Node** — 회사 표준 최신 버전으로도 빌드됩니다. `engines`의 Node 24는 강제되지 않고(경고만), 네이티브 모듈은 호스트 Node가 아니라 Electron ABI로 재빌드됩니다. 첫 빌드 전 `node config/scripts/ensure-native-runtime.mjs --check-only`가 exit 0인지만 확인하세요(근거: 빌드 가이드 §3).
- `--publish never`는 **필수**입니다. 빠지면 사내 CI(`CI=true`)에서 electron-builder가 github.com으로 업로드를 시도합니다.

> 공개 배포본을 그대로 받아 쓰지 않는 이유: 공개 `.exe`는 자동 업데이트·텔레메트리가 켜진 빌드입니다. 사내에서는 이 브랜치를 직접 빌드해 외부 연동을 잠급니다(§4).

---

> [!IMPORTANT]
> **이 포크가 추가하는 런타임 환경 변수는 딱 하나, `ORCA_ENTERPRISE_POLICY`(정책 파일 경로)뿐입니다.** 나머지 설정은 전부 **관리자 소유 JSON 정책 파일** 안에 들어갑니다.
>
> 이유: Orca가 `env`에서 읽는 값은 Orca가 띄우는 **모든 자식 프로세스**(에이전트 CLI, `gh`, `git`, 릴레이)에 그대로 상속되고, `setx`로 심은 값은 같은 머신의 무관한 도구까지 오염시킵니다. 그래서 환경 변수는 최소로 두고 나머지는 파일로 옮겼습니다 — 근거: `src/shared/enterprise-policy.ts:4-8`, `src/main/enterprise/enterprise-policy-file.ts:4-11`.
>
> | 값 | 성격 | 소유자 |
> | --- | --- | --- |
> | `ORCA_ENTERPRISE_POLICY` | **런타임 환경 변수(유일)** — 정책 파일 경로. **패키징 빌드에서는 후보를 추가만 할 뿐 머신 전역 파일을 대체하거나 끄지 못합니다**(§4.1) | 이 포크 |
> | `lockdown`, `disable*`, `githubEnterpriseHost`, … | **정책 파일 키** (§4) | 이 포크 |
> | `GH_HOST` | GHES 호스트 폴백. `gh` CLI 고유 변수이므로 포크가 새로 만들지 않고 있으면 읽기만 함 (`enterprise-policy.ts:203`) | `gh` |
> | `DO_NOT_TRACK`, `ORCA_TELEMETRY_DISABLED`, `ORCA_DIAGNOSTICS_DISABLED` | upstream 원본의 텔레메트리·진단 킬 스위치. 포크가 손대지 않음 (`telemetry/consent.ts:79`, `:83`; `observability/index.ts:100-102`) | upstream |
> | `AWS_REGION`, `AWS_PROFILE`, `CLAUDE_CODE_USE_BEDROCK` … | **Orca 설정이 아님.** Claude Code CLI가 읽습니다 — §3 | Claude Code |
> | `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS` | OS/Node 표준. Orca가 정의하는 값이 아님 | OS/Node |
> | `ORCA_WIN_PUBLISHER_NAME`, `ORCA_DISABLE_PUBLISH_TARGET` | **빌드 시점 전용**(빌드 셸). 앱 런타임 환경과 무관 (`config/electron-builder.config.cjs:201`, `:406`) | 이 포크(빌드) |
> | `ORCA_MAC_RELEASE`(`config/electron-builder.config.cjs:16`), `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`(electron-builder 고유) | 빌드 시점 전용 | upstream / electron-builder |
>
> 예전 문서에 있던 `ORCA_ENTERPRISE_LOCKDOWN` / `ORCA_DISABLE_AUTO_UPDATE` / `ORCA_DISABLE_STAR_NAG` / `ORCA_DISABLE_TELEMETRY` / `ORCA_GITHUB_ENTERPRISE_HOST`는 **전부 삭제되었습니다.** 코드 어디에도 없으므로 `setx`로 심어도 아무 일도 일어나지 않습니다.

## 2. 사내 GitHub Enterprise (`github.samsungds.net`)

Orca의 GitHub 연동은 `gh` CLI를 통하며 GHES를 **원본 단계에서 이미 지원**합니다(github.com 하드코딩 아님).

```powershell
# 사용자별 1회. 이 단계가 빠지면 GHES 리모트는 GitHub로 인식되지 않습니다.
gh auth login --hostname github.samsungds.net
gh auth status                      # github.samsungds.net 이 목록에 보여야 함
```

#### 무엇이 "이 호스트는 GitHub다"를 결정하는가 — `gh auth status`입니다

사내 GHES 같은 커스텀 호스트를 GitHub로 판정하는 신호는 **오직 `gh auth status` 인벤토리**입니다(`github.com`만 호스트명으로 바로 처리 — `github-enterprise-repository.ts:228-230`). 정책 파일도, 환경 변수도 아닙니다.

- `github-enterprise-repository.ts:145-152`가 `gh auth status`를 실행하고, `:98-123`(`authenticatedHostFromInventory`)이 리모트 호스트를 그 목록과 대조합니다. 목록에 없으면 `:213-243`이 `null`을 돌려주고 GitHub 경로는 그대로 포기합니다.
- 호출 체인: `source-control/forge-provider.ts:131-132` → `github/client.ts:1605-1615`(`getRepoSlug`) → `github/github-api-repository.ts:119-137` → `github-enterprise-repository.ts:245-251`.
- 코드 주석이 이 계약을 명시합니다 — "`gh`는 github.com / GitHub Enterprise 자격증명만 관리하므로, `gh auth status`가 로그인됐다고 보고하는 호스트는 확정적으로 GitHub 호스트다"(`github-enterprise-repository.ts:19-22`).

**따라서 `gh auth login --hostname github.samsungds.net`은 선택이 아니라 필수입니다.** PR·이슈가 안 보인다는 신고가 들어오면 정책 파일이 아니라 **`gh auth status`부터** 확인하세요. `gh`가 아예 없거나 spawn에 실패하면 판정이 "미확정"으로 남아 캐시되지 않습니다(`:153-159`).

#### 정책의 `githubEnterpriseHost`가 하는 일 — Gitea 오폴백 차단 (그게 전부)

정책 파일의 `githubEnterpriseHost`는 그 호스트를 **Gitea 폴백에서 제외**할 뿐입니다(`gitea/repository-ref.ts:87-97`). GitHub로 인식시키는 기능은 없습니다.

`gh` 인증이 없거나 깨진 상태에서는 GitHub 판정이 실패하고, 탐색 순서의 마지막인 Gitea 프로바이더(`forge-provider.ts:265-271`: gitlab → github → bitbucket → azure-devops → gitea)가 사내 호스트를 자기 것으로 주장해 `https://github.samsungds.net/api/v1/...`라는 존재하지 않는 엔드포인트를 때립니다. `githubEnterpriseHost`는 그 잘못된 요청을 막는 안전장치입니다.

```jsonc
// 정책 파일 (§4)
{ "githubEnterpriseHost": "github.samsungds.net" }
```

값이 없으면 `gh`의 `GH_HOST`를 폴백으로 읽습니다(`enterprise-policy.ts:203`). 프로토콜·포트·경로가 붙어 있어도 호스트명만 정규화해 씁니다(`:110-123`).

#### git 바이너리(clone/fetch/push·워크트리) 전제조건

PR/이슈 표시는 `gh` API를 타지만, **클론·페치·푸시, 그리고 워크트리 생성 시 base 브랜치 페치는 `git` 바이너리**가 직접 `origin`(= 사내 GHES)로 나갑니다. `git worktree add` 자체는 로컬이지만 base 브랜치가 로컬에 없으면 생성 과정에서 `git fetch origin`이 일어나므로, 아래가 갖춰져야 워크트리가 막힘없이 만들어집니다.

- **git 자격증명**: `gh auth login`만으로는 `git` HTTPS 인증이 자동 설정되지 않습니다. `gh auth setup-git --hostname github.samsungds.net`(gh를 git credential helper로 등록)이나 Windows 자격증명 관리자/SSH 키를 함께 설정하세요.
- **사설 CA**: `NODE_EXTRA_CA_CERTS`는 Orca의 Node 계층에만 적용되고 **`git`/`gh` 바이너리 TLS엔 무관**합니다. `git`은 TLS 백엔드에 따라 신뢰 저장소가 다르므로 **백엔드마다 손잡이가 다릅니다**:
  - `http.sslBackend=schannel` (Git for Windows 설치 기본값) — **Windows 인증서 저장소**를 씁니다. 사내 루트 CA를 (보통 GPO로) 저장소에 넣어야 하며, **`http.sslCAInfo`는 schannel에서 무시됩니다.**
  - `http.sslBackend=openssl` (Linux/macOS 기본, Windows에서도 전환 가능) — 이때만 `git config --global http.sslCAInfo C:\path\to\corp-root-ca.pem`이 의미가 있습니다. Windows에서 이 경로를 쓰려면 `git config --global http.sslBackend openssl`로 먼저 전환해야 합니다.
  - 현재 값 확인: `git config --get http.sslBackend`
- **프록시**: `HTTPS_PROXY`가 외부 프록시를 가리키면 내부 호스트를 `NO_PROXY`에 넣거나(`setx NO_PROXY "github.samsungds.net,.samsungds.net"`) 프록시가 내부 라우팅을 하도록 하세요. git 서브프로세스는 이 env를 상속합니다.

---

## 3. AWS Bedrock으로 Claude 사용

Bedrock 인증은 **Claude Code CLI 자체**가 처리합니다. Orca는 이 흐름에 관여하지 않고(어떤 AWS/Bedrock 변수도 주입·요구하지 않음), 받은 환경을 에이전트 PTY에 그대로 물려줍니다 — 아래 첫 항목의 관리형 계정 스위처를 켠 경우만 예외입니다. 따라서 **모델·리전·Bedrock 플래그는 Claude Code의 `~/.claude/settings.json`에 두는 것이 가장 깔끔합니다.** (`/setup-bedrock` 슬래시 명령이 이 블록을 자동으로 써 줍니다.)

```jsonc
// ~/.claude/settings.json  ← Orca가 아니라 Claude Code가 읽습니다
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "us-east-1",                     // 미지정 시 `~/.aws` 설정의 리전(AWS SDK 우선순위)을 따르므로 명시 권장
    "ANTHROPIC_MODEL": "<Bedrock inference profile ARN 또는 모델 ID>"
  },
  "awsAuthRefresh": "aws sso login"                // SSO 세션 만료 감지 시 자동 재로그인
}
```

자격증명은 **기본 AWS 자격증명 체인**을 씁니다. 사내는 SSO(`aws sso login`)를 쓰고 **`AWS_PROFILE`을 따로 지정하지 않으므로**(지정하지 않으면 default 프로필/SSO 세션 사용), 위 설정 + 사전 `aws sso login` 1회면 됩니다. named 프로필이 꼭 필요할 때만 `env`에 `AWS_PROFILE`을 추가하세요. OS 환경변수나 `설정 → Agents`의 에이전트별 env로 넣어도 동작하지만, Orca는 어느 쪽이든 값을 만들지 않고 전달만 합니다.

- **관리형 Claude 계정 스위처는 정책 파일로 끄세요 — `disableManagedClaudeAccounts`(§4.2).** 이 기능은 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`**과 인증성 `ANTHROPIC_CUSTOM_HEADERS`를 제거합니다(`claude-accounts/environment.ts:3-8`, `:22-29`). Windows 호스트에서는 관리형 계정을 **선택한 동안에만** 제거되지만(`claude-accounts/runtime-auth-service.ts:667`), **WSL 런타임을 고르면 관리형 계정이 하나도 없어도 제거가 켜져**(`:647`, `:657`), 런치 환경에 해당 변수가 있으면 PTY 스폰이 `This Claude launch defines explicit Anthropic auth environment variables.`로 **하드 실패**합니다(`ipc/pty.ts:2955-2959`, `:4013-4017`). 스위치를 켜면 활성 계정이 `null`로 고정되고(`runtime-auth-service.ts:613-616`) 스트립도 최후 방어선에서 한 번 더 막혀(`environment.ts:22`) 이 실패 조건이 사라지며, `platform.claude.com`으로 나가는 OAuth 토큰 회전도 함수 진입부에서 차단됩니다(`claude-accounts/oauth-refresh.ts:131-133`). `lockdown: true`면 자동으로 켜집니다.
- **Bedrock을 써도 Orca의 사용량 폴링은 별개로 나갑니다.** Orca는 창이 보이고 포커스된 동안(`rate-limits/service.ts:769-778`) **15분 주기로**(`:74` `DEFAULT_POLL_MS`) `https://api.anthropic.com/api/oauth/usage`(`rate-limits/claude-fetcher.ts:46`)를 호출합니다. 이 호출은 **Orca의 관리형 계정 등록 여부와 무관**하고, **Claude Code CLI가 OAuth 로그인 시 쓰는 자격증명**(macOS 키체인 → `~/.claude/.credentials.json`, `claude-fetcher.ts:193-201`)이 있으면 켜집니다. 즉 과거에 한 번이라도 OAuth로 로그인한 흔적이 남아 있으면 Bedrock 전용 머신에서도 `api.anthropic.com`으로 나갑니다. 차단하려면 정책 파일의 **`disableUsagePolling`**(§4)을 쓰세요.
- **SSO + 사내 프록시/VPN 주의**: 브라우저 SSO 흐름이 막히는 환경이면 `awsAuthRefresh`가 무한 인증 루프를 유발할 수 있습니다. 그럴 땐 `awsAuthRefresh`를 빼고 세션 시작 전 수동으로 `aws sso login`을 끝내 두세요.

---

## 4. 외부 연동 잠금 — 관리자 소유 정책 파일

### 4.1 정책 파일을 어디에 두는가 — 먼저 발견된 파일이 이깁니다

탐색 순서(`enterprise-policy-file.ts:59-83`). **첫 번째로 존재하는 파일이 그대로 채택**되며, 사용자별 파일이 머신 전역 파일을 완화할 수 없습니다. 순서는 빌드가 패키징됐는지에 따라 갈립니다.

**패키징 빌드 — 사용자 PC에 설치된 `.exe`. 플릿에서 유일하게 의미 있는 순서입니다.**

| 순위 | 위치 | 비고 |
| --- | --- | --- |
| 1 | **머신 전역** — Windows `%ProgramData%\Orca\enterprise-policy.json`<br>macOS `/Library/Application Support/Orca/enterprise-policy.json`<br>Linux `/etc/orca/enterprise-policy.json` | 사내 배포에서 쓸 위치 |
| 2 | `ORCA_ENTERPRISE_POLICY` 환경 변수 | 명시 경로가 **후보에 추가**될 뿐. `off`/`none`/`disabled`/`false`/`0`은 **무시됩니다** |
| 3 | 사용자별 — `<userData>/enterprise-policy.json` | 개인 테스트용 |

**비패키징(`pnpm dev`·vitest)에서만** `ORCA_ENTERPRISE_POLICY`가 1순위를 가져가고, 무력화 값으로 탐색 전체를 끌 수 있습니다(테스트 스위트가 이 값을 씁니다).

> 🔒 **환경 변수는 사내 잠금을 끌 수 없습니다 — 이게 보안 속성입니다.** Windows에서 표준 사용자는 관리자 권한 없이 자기 계정의 환경 변수를 만들 수 있습니다. `setx ORCA_ENTERPRISE_POLICY off` 한 줄로 잠금이 풀린다면 그건 정책이 아닙니다. 그래서 패키징 빌드에서는 이 변수가 후보를 **추가**만 하고, 머신 전역 파일은 **항상 먼저** 탐색됩니다(`enterprise-policy-file.ts:49-58` 주석, 분기는 `:68-82`). 판정 신호는 `app.isPackaged`입니다 — 표준 사용자가 바꿀 수 없는 유일한 신호이기 때문입니다(`:163-171`).
>
> **배포상의 결론: 파일은 위 1순위의 머신 전역 기본 경로에 두고, 사용자가 쓰지 못하도록 ACL을 거세요(§5.2).** 환경 변수로 커스텀 경로를 지정하는 방식은 **개발·검증용이지 플릿용이 아닙니다.**

**머신 전역 위치가 이번 재설계의 핵심입니다.** `setx`는 사용자별 상태를 쓰기 때문에, 같은 PC의 다른 Windows 프로필·서비스 계정·앞으로 새로 만들어질 프로필은 전부 잠기지 않은 채로 남았습니다(`enterprise-policy-file.ts:9-11`).

정책은 프로세스당 **한 번만** 읽고 캐시합니다(`:180-199`). 파일을 바꾸면 **Orca를 재시작**해야 반영됩니다.

### 4.2 파일 형식

JSONC입니다 — `//` 주석과 후행 쉼표를 허용합니다(`enterprise-policy-file.ts:142-144`).

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
| `lockdown` | `false` | 마스터 스위치 |
| `disableTelemetry` | `lockdown` 상속 | PostHog 텔레메트리(`telemetry/consent.ts:88`) + 진단/크래시 번들 **업로드 레인**(`observability/index.ts:103,120-133`). **로컬 NDJSON 로그는 계속 기록됩니다** — 네트워크만 막습니다 |
| `disableAutoUpdate` | `lockdown` 상속 | 업데이트 피드 조회 단일 초크포인트(`updater.ts:1179` `runBackgroundUpdateCheck`), 메뉴의 수동 "업데이트 확인"(`:1251` `checkForUpdatesFromMenu`), 그리고 **onorca.dev 넛지 스케줄러·powerMonitor 리스너가 아예 배선되지 않도록**(`:1458` `setupAutoUpdater`) |
| `disableStarNag` | `lockdown` 상속 | github.com SaaS로 가는 star 조회/쓰기 — `github/client.ts:234`(`checkOrcaStarred`), `:401`(`starOrca`). **게이트를 서비스가 아니라 클라이언트 함수에 뒀습니다** — 넛지 서비스(`star-nag/service.ts:121`) 말고도 `star-nag/direct-star-attempt.ts:9`, `star-nag/agent-value-moment.ts:46`, IPC 핸들러 `ipc/github.ts:1174`·`:1177`이 같은 함수로 들어옵니다 |
| `disableCloudRelay` | `lockdown` 상속 | `orca-profiles/profile-cloud-auth-config.ts:73`이 "미구성"으로 응답 → Orca Cloud 로그인, 조직 멤버 조회, 그리고 **데스크톱↔모바일 페어링 릴레이**(`src/main/index.ts:2420-2421`)가 한꺼번에 꺼집니다 |
| `disableUsagePolling` | `lockdown` 상속 | AI 벤더 사용량/레이트리밋 폴링. 게이트는 `rate-limits/service.ts:733-735`, 호출부는 `start()`(`:309`), `fetchAll`(`:894`), `fetchCodexOnly`(`:959`), `fetchClaudeOnly`(`:1021`), `fetchGrokOnly`(`:1086`), 계정 스위처 프리뷰 2종(`:499`, `:579`), Codex 리셋 크레딧(`:425`) |
| `disableManagedClaudeAccounts` | `lockdown` 상속 | Orca 관리형 Claude 계정 — `platform.claude.com` OAuth 토큰 회전(게이트 `claude-accounts/oauth-refresh.ts:131-133`)과 에이전트 PTY로 가는 환경에서 AWS Bedrock 자격증명을 지우는 동작(게이트 `claude-accounts/runtime-auth-service.ts:613-616` + `claude-accounts/environment.ts:22`)을 함께 끕니다. **Bedrock 플릿에서는 켜 두세요 — §3 참고** |
| `disableSpellcheck` | `lockdown` 상속 | Chromium 맞춤법 사전 CDN 다운로드. 메인 창(`window/createMainWindow.ts:253`) **및** webview 게스트 하드닝 블록(`:425`) 양쪽 |
| `enforceNetworkAllowlist` | **항상 `false`** (상속 안 함) | 아래 4.3 |
| `allowedNetworkHosts` | `[]` | 허용 호스트 목록. `enforceNetworkAllowlist`가 켜졌을 때만 의미가 있습니다 |

전체 스키마와 예제는 **[엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md)** 를 보세요.

**값 해석 규칙** (`enterprise-policy.ts:83-106`)

- JSON `true` / `false`가 정식입니다. 문자열 `"true"`/`"yes"`/`"on"`/`"1"`과 `"false"`/`"no"`/`"off"`/`"0"`도 받습니다(대소문자·공백 무관).
- **알아볼 수 없는 값은 "꺼짐"이 아니라 "없음"으로 취급**되어 `lockdown`을 상속하고, stderr에 경고가 찍힙니다. 관리자 오타가 조용히 머신을 풀어버리는 사고를 막기 위한 설계입니다(`:80-82`).
- 모르는 키도 경고합니다(`:190-194`). JSON 자체가 깨졌으면 **일부만 적용하지 않고 파일 전체를 버립니다**(`enterprise-policy-file.ts:145-148`).
- 경고는 전부 `[enterprise-policy]` 접두사로 stderr에 나갑니다(`enterprise-policy-file.ts:98-103`, `:194-196`).

### 4.3 네트워크 허용 목록 (opt-in)

`enforceNetworkAllowlist`는 **`lockdown`을 상속하지 않습니다.** 잘못된 허용 목록은 기능 스위치와 달리 배포 전체를 깨뜨릴 수 있어서 관리자가 명시적으로 켜야 합니다(`enterprise-policy.ts:212-214`, `enterprise-network-guard.ts:15-16`).

켜면 두 곳을 막습니다(`enterprise-network-guard.ts:87-96`, `:99-122`):

- `session.defaultSession`의 `webRequest.onBeforeRequest` — 이 세션을 지나는 요청. 렌더러 요청이 대표적이고, 메인에서 Electron `net.fetch`로 나가는 요청(§4.4의 피드백 폼)도 같은 세션을 씁니다. 로그 라벨은 `renderer request`(`:93`) *(세션 범위는 Electron 계약이지 이 저장소 코드의 사실은 아닙니다 — 실제 차단 여부는 배포 전 1대에서 확인하세요.)*
- 메인 프로세스의 global `fetch` 래퍼(`:111`, 라벨 `main-process fetch`) — Node의 global fetch를 쓰는 메인 클라이언트용. `network/proxy-settings.ts`의 사내 프록시는 Electron 세션에만 적용되어 global fetch를 못 보기 때문입니다(`enterprise-network-guard.ts:5-7`)

`githubEnterpriseHost`는 항상 허용 목록에 자동 추가되고(`enterprise-policy.ts:204-207`), loopback은 언제나 통과합니다(`enterprise-network-guard.ts:47-55`). 차단은 호스트당 한 줄씩 stderr로 보고됩니다(`:36-45`).

### 4.4 잠금이 **덮지 않는** 것 (정직하게)

- **앱 내 피드백 폼** — `src/main/ipc/feedback.ts:9-10`이 `https://www.onorca.dev/v1/feedback`으로 POST합니다(Electron `net.fetch`, `:104`). 사용자가 직접 누를 때만 나가지만 **`lockdown`도 `disable*` 스위치도 이 경로를 보지 않습니다.** 유일한 차단 수단은 §4.3의 허용 목록(`enforceNetworkAllowlist`)이고, 그것도 `defaultSession` 세션 레인을 통해서만 걸립니다.
- **에이전트 CLI 자체의 통신** — Claude Code, Codex 등이 어디로 나가는지는 Orca의 통제 밖입니다. Orca는 PTY만 띄웁니다.
- **임베디드 브라우저** — `persist:` 파티션에서 돌며 허용 목록에서 **의도적으로 제외**됩니다. 임의 사이트 탐색이 그 기능의 목적이고, 해당 파티션의 단 하나뿐인 `onBeforeRequest` 슬롯은 이미 인증서 게이트가 쓰고 있습니다(`enterprise-network-guard.ts:9-13`).
- **패키징된 렌더러에 CSP가 없습니다** — 에이전트 카탈로그의 favicon/아바타/첨부 URL을 그대로 로드하기 때문입니다(`enterprise-network-guard.ts:3-5`, `src/renderer/index.html:6`). 이 구멍을 실제로 막는 유일한 수단이 `enforceNetworkAllowlist`입니다.
- **로컬 진단 로그** — `disableTelemetry`는 egress만 끕니다. NDJSON 파일은 계속 기록됩니다(`observability/index.ts:120-133`). 로컬 파일까지 멈추려면 정책 키가 아니라 upstream의 `ORCA_DIAGNOSTICS_DISABLED` 환경 변수를 써야 합니다(`:102`, `:113-118`).

### 4.5 프록시 / 사설 CA

정책 파일이 아니라 OS/Node 표준 환경 변수입니다.

```powershell
setx HTTPS_PROXY "http://proxy.samsungds.net:8080"   # HTTP_PROXY / NO_PROXY 도 동일
setx NODE_EXTRA_CA_CERTS "C:\path\to\corp-root-ca.pem"
```

> `NODE_EXTRA_CA_CERTS`는 Orca(Node) 자체 통신용입니다. **`git`/`gh` 바이너리의 사설 CA 신뢰는 별개**로 TLS 백엔드를 따릅니다 — §2의 "git 바이너리 전제조건" 참고.

어떤 기능이 어떤 호스트로 나가는지 전체 목록은 **[외부 연동 감사 및 차단 계획](docs/reference/external-integrations-audit.md)** 을 참고하세요.

---

## 5. 사내 배포(롤아웃)

### 5.1 산출물 — per-user NSIS 설치 프로그램

`config/electron-builder.config.cjs:226-235`의 `nsis` 블록은 `oneClick`과 `perMachine`을 **설정하지 않습니다.** 따라서 electron-builder 기본값(`oneClick: true`, `perMachine: false`)이 적용되어 **원클릭·사용자별 설치**가 되고, `%LOCALAPPDATA%\Programs\` 아래에 설치되며 **관리자 권한이 필요 없습니다.** 산출물 이름은 `orca-windows-setup.exe`로 고정입니다(`:227`).

- 무인 설치: `orca-windows-setup.exe /S` — NSIS 원클릭 설치 프로그램의 표준 동작입니다. *(electron-builder/NSIS의 계약이지 이 저장소 코드의 사실은 아닙니다. 배포 전 1대에서 검증하세요.)*
- 관리자 권한이 필요 없으므로 사용자 단위 소프트웨어 배포 채널(Intune 사용자 대상 앱 등)로 밀 수 있습니다.
- 제거 시 `%LOCALAPPDATA%` 아래로 재배치된 터미널 데몬을 정리하는 NSIS 스크립트가 포함되어 있습니다(`:231-234`).

### 5.2 정책 파일 배포

**설치 프로그램은 정책 파일을 만들지 않습니다.** `nsis.include`에 들어 있는 스크립트는 데몬 제거용 하나뿐입니다(`:234`). 정책 파일은 앱 배포와 **완전히 분리된 경로**로 넣어야 합니다.

- 대상: **`%ProgramData%\Orca\enterprise-policy.json` — 기본 머신 전역 경로를 쓰세요.** 패키징 빌드에서 이 경로가 1순위이고 환경 변수가 이것을 밀어낼 수 없기 때문입니다(§4.1). `ORCA_ENTERPRISE_POLICY`로 커스텀 경로를 지정하는 방식은 **개발·검증용이며 플릿 배포 수단이 아닙니다.**
- **ACL을 함께 고정하세요 — 사용자가 쓸 수 있는 정책 파일은 정책이 아니라 기본값입니다.** 관리자가 넣어 둔 파일은 기본 ACL에서 표준 사용자가 수정·삭제할 수 없지만, `%ProgramData%` 루트는 표준 사용자도 새 폴더·파일을 만들 수 있으므로 **파일이 아직 없는 머신에서는 사용자가 자기 소유의 정책 파일을 먼저 만들 수 있습니다.** 배포 스크립트에서 폴더 상속을 끊고 `Users`를 읽기 전용으로 내리세요 — 구체적인 `icacls` 명령은 [엔터프라이즈 정책 파일 레퍼런스](docs/reference/enterprise-policy.md) §6-1에 있습니다. *(Windows ACL 동작이지 이 저장소 코드의 사실은 아닙니다.)*
- 수단: GPO 파일 기본 설정, Intune 구성 프로필/스크립트, SCCM 패키지 등 기존 구성 관리 채널. *(운영 권고 — 코드가 강제하는 바가 아닙니다.)*
- 순서는 상관없습니다. 정책 파일이 앱보다 먼저 들어가도 되고 나중에 들어가도 되지만, 정책은 프로세스 시작 시 1회만 읽히므로(`enterprise-policy-file.ts:180-199`) **이미 실행 중인 Orca는 재시작해야** 반영됩니다.
- 적용 확인은 **기능으로** 하세요 — §4.4 예외 목록에 없는 기능(예: 메뉴의 "업데이트 확인")이 실제로 무반응인지 보면 됩니다. Orca를 터미널에서 띄웠을 때 `[enterprise-policy]` 경고가 찍히면 "파일은 찾았지만 내용에 문제가 있다"는 뜻이고, **경고가 없다는 것은 파일을 찾았다는 증거가 아닙니다** — 정책 파일이 아예 없어도 코드는 조용히 지나갑니다(`enterprise-policy-file.ts:130-136`).

### 5.3 잠긴 사내 빌드와 공개 빌드를 구분하는 법 — 내장 수단이 없습니다

이 포크는 버전 문자열도 앱 식별자도 바꾸지 않습니다. `package.json:3`의 `version`은 upstream 값(`1.4.153`) 그대로이고, `appId`는 `com.stablyai.orca`, `productName`은 `Orca`입니다(`config/electron-builder.config.cjs:55-56`). **즉 앱 안의 버전·이름만으로는 사내 빌드와 공개 빌드를 구분할 수 없습니다.**

실무 권고 *(운영 관례이지 코드가 보장하는 것이 아닙니다)*:

1. **정책 파일 존재 여부를 자산 관리로 감시** — `%ProgramData%\Orca\enterprise-policy.json`이 없는 머신이 곧 안 잠긴 머신입니다. 실행 파일이 어느 빌드인지보다 이쪽이 실질적인 판정 기준입니다.
2. **`ORCA_DISABLE_PUBLISH_TARGET=1`로 빌드** — `publish` 타깃이 `null`이 되어 업데이터 메타데이터가 아예 안 실립니다. 그러면 이 설치본은 upstream 릴리스 피드로 덮어써질 수 없습니다(`config/electron-builder.config.cjs:403-413`).
3. **사내 인증서로 서명하고 `ORCA_WIN_PUBLISHER_NAME`을 그 주체로 지정** — electron-updater의 Authenticode 확인이 기대하는 publisherName이 바뀌므로, 공개 설치 프로그램이 사내 빌드를 갈아치우지 못합니다. 기본값을 그대로 두면(`SignPath Foundation`) 공개 빌드가 그대로 받아들여집니다(`:196-202`).
4. 사내 자체 식별이 꼭 필요하면 릴리스 태그·파일명·설치 경로 규약을 사내에서 별도로 정하세요. 앱은 도와주지 않습니다.

---

## 6. 원본(upstream) 최신 반영 — fork 동기화

원본 [`stablyai/orca`](https://github.com/stablyai/orca)는 자주 릴리스되므로 주기적으로 최신 변경을 가져옵니다. 전략은 **역할 분리**입니다.

- `main` — 원본 `upstream/main`의 **깨끗한 미러**로만 유지(사내 커밋을 올리지 않음). 항상 fast-forward로 갱신됩니다.
- `enterprise/samsungds` — 사내 커스터마이즈. 새 릴리스가 나오면 그 위로 **재배치(rebase)** 합니다.

#### 최초 1회 — upstream 원격 등록

```bash
git remote add upstream https://github.com/stablyai/orca.git
git remote -v   # origin=treeman99/orca, upstream=stablyai/orca 확인
```

#### 주기적으로 — main 미러 갱신

`main`에는 사내 커밋이 없으므로 fast-forward만 하면 됩니다.

```bash
git fetch upstream --tags --prune
git checkout main
git merge --ff-only upstream/main
git push origin main
```

> 더 간단하게는 GitHub 웹의 fork 페이지 상단 **"Sync fork" → "Update branch"** 버튼으로 `main`을 원클릭 갱신할 수 있습니다.

#### 사내 커스터마이즈를 새 릴리스 위로 올리기

현재 `enterprise/samsungds`는 태그 `v1.4.153` 위에 사내 커밋이 얹혀 있는 상태입니다(`git log --oneline v1.4.153..HEAD`로 확인). 원본이 예컨대 `v1.4.160`을 릴리스했다면 사내 커밋들을 그 태그 위로 재생합니다.

```bash
git fetch upstream --tags
git checkout enterprise/samsungds
git rebase v1.4.160                 # 사내 커밋만 새 태그 위로 재생
git add -A && git rebase --continue # 충돌 해결 후
git push --force-with-lease origin enterprise/samsungds
```

- `rebase`는 히스토리를 깨끗하게 유지하지만 강제 푸시(`--force-with-lease`)가 필요합니다. 강제 푸시를 피하려면 대신 병합하세요:
  ```bash
  git checkout enterprise/samsungds
  git merge v1.4.160
  git push origin enterprise/samsungds
  ```
- exe는 항상 이 `enterprise/samsungds` 브랜치(또는 재배치한 릴리스 태그)에서 빌드합니다.

#### 충돌 예상 지점 — 솔직한 현황

사내 변경은 "신규 파일 몇 개"가 아닙니다. 실제로는 **upstream 파일 12개에 게이트를 삽입**하고, `.gitignore`에서 새 문서 3개를 unignore하고, upstream에도 있는 문서 2개를 재작성했습니다. 현재 상태는 커밋된 것(`git diff --stat v1.4.153..HEAD`)과 아직 커밋되지 않은 작업 트리(`git status --porcelain`)를 합친 것입니다.

| 성격 | 파일 | 리베이스 충돌 |
| --- | --- | --- |
| **신규(포크 전용)** | `src/shared/enterprise-policy.ts`(+`.test.ts`), `src/main/enterprise/**`(정책 파일 탐색·네트워크 가드·테스트 픽스처), `src/main/observability/observability-consent.test.ts`, `config/vitest-enterprise-policy-isolation.ts`, `docs/reference/*.md` 3개 | 거의 없음 |
| **upstream 파일에 삽입한 게이트** | `src/main/updater.ts`, `telemetry/consent.ts`, `observability/index.ts`, `github/client.ts`, `gitea/repository-ref.ts`, `orca-profiles/profile-cloud-auth-config.ts`, `rate-limits/service.ts`, `window/createMainWindow.ts`, `index.ts`, `src/renderer/index.html`(CSP 주석), `config/electron-builder.config.cjs`, `config/vitest.config.ts` (+ 이들에 대응하는 기존 테스트 파일 8개, + `.gitignore` 3줄) | upstream이 같은 함수를 건드리면 발생. 게이트를 각 도메인의 **단일 초크포인트**에 넣어 둔 이유가 이것입니다 |
| **포크가 재작성해 소유한 문서** | `README.md`(upstream 원문 268줄을 사내 문서로 전면 교체 — 남은 공통 문장이 거의 없어 자동 병합이 되지 않습니다), `CLAUDE.md`(upstream은 `@AGENTS.md` 한 줄짜리 11바이트 스텁 → 105줄로 확장) | **둘 다 upstream에도 존재하는 파일이므로 upstream이 손댈 때마다 반드시 충돌합니다.** 리베이스에서 사내 버전을 남기려면 `git checkout --theirs README.md CLAUDE.md` — **리베이스에서는 `--ours`가 재배치 대상(upstream), `--theirs`가 재생 중인 사내 커밋**이라 머지와 의미가 뒤집혀 있습니다. 그다음 upstream 변경분 중 필요한 것만 수동으로 반영하세요 |

> 표에 없는 작업 트리 변경 2건 — i18n 카탈로그 5개(`src/renderer/src/i18n/locales/*.json`, SSH 호스트 UI 문자열 동기화)와 `src/renderer/src/components/skills/skill-freshness-group.tsx`(칩 타입 좁히기) — 은 정책 작업과 무관한 드리프트입니다. 커밋 전에 분리하세요.

---

## 개발 / 저장소 구조

- 아키텍처와 명령어 개요: [`CLAUDE.md`](CLAUDE.md) *(upstream의 `@AGENTS.md` 스텁을 이 포크가 확장한 파일)*
- 프로젝트 규칙(크로스플랫폼, Git 호환성, 디자인 시스템 등): [`AGENTS.md`](AGENTS.md) *(upstream 원본, 손대지 않음)*
- 사내 커스터마이즈의 핵심:
  - `src/shared/enterprise-policy.ts` — 순수 리졸버 + 타입 (파일 I/O 없음)
  - `src/main/enterprise/enterprise-policy-file.ts` — 정책 파일 탐색·파싱·캐시
  - `src/main/enterprise/enterprise-network-guard.ts` — opt-in 허용 목록
  - `src/main/enterprise/enterprise-policy-fixture.ts` — 테스트 전용 픽스처
  - `config/vitest-enterprise-policy-isolation.ts` — 이 포크를 빌드하는 머신에는 머신 전역 정책 파일이 깔려 있으므로, 테스트 스위트가 lockdown 상태로 돌지 않도록 무력화
  - upstream 파일에 삽입된 게이트 목록은 §6 표 참고
- 원본 프로젝트의 일반 기여/개발 안내: [원본 CONTRIBUTING.md](https://github.com/stablyai/orca/blob/main/.github/CONTRIBUTING.md)

## License

원본 Orca는 [MIT License](LICENSE) 하에 배포되는 오픈소스이며, 이 포크도 동일 라이선스를 따릅니다.
