# 외부 연동 감사 및 차단 계획 (사내 배포용)

기준: **v1.4.153** (브랜치 `enterprise/samsungds`).
목적: 사내(폐쇄망/보안) 환경에서 Orca를 배포할 때, 외부 인터넷으로 나가는 기능을 파악하고 필요 시 차단한다.

> **조사 방식**: 10개 카테고리를 병렬로 정적 분석(스윕) → 누락 항목 크리틱 → 항목별 적대적 검증(“실제로 소켓을 여는가 / 언제 발동하는가 / 끌 수 있는가”). 후보 103건 중 44건이 실제 외부 호출로 확정됐습니다. 세션 한도로 일부 항목의 최종 검증과 엔터프라이즈 4개 분석(GHE·차단설계·프록시·윈도우)이 중단되어, 그 부분은 직접 코드를 확인해 아래에 채웠습니다. **⚠️ 표시는 미검증(스윕 단계) 항목**입니다.

---

## 0. 한눈에 보기 — 사내 배포 시 판단

| 분류 | 기본 상태 | 사내 조치 |
| --- | --- | --- |
| **프록시 / 사설 CA** | Orca가 이미 지원 | 환경변수만 설정 (§5). 좋은 소식 |
| **텔레메트리 / 진단 / 크래시** | opt-in (기본 꺼짐) + 공식 빌드에서만 전송 | `ORCA_TELEMETRY_DISABLED=1`로 확실히 봉인 (§2) |
| **벤더 클라우드(onorca.dev) — 로그인/모바일/업데이트** | 로그인 안 하면 대부분 안 나감. 단 **업데이트/넛지는 로그인 무관하게 나감** | 자동 업데이트·넛지 차단 필요 (§3) |
| **AI 벤더 사용량 폴링(Claude/Gemini/MiniMax/…)** | 대부분 계정/쿠키 설정해야 작동 (기본 꺼짐). **Claude OAuth 갱신은 예외** | §4 |
| **git 호스팅(GitHub/GitLab/…)** | 사용자가 열람할 때 + 일부 자동 폴링 | GHES로 목적지 변경 + SaaS 고정 경로 1곳 제거 (§1) |
| **Google favicon / 아바타 이미지** | 저장소·에이전트 아이콘 표시 시 자동 | 렌더러에서 외부 이미지 (§6) |

**결론**: Orca는 폐쇄망 친화적으로 설계된 편입니다. 텔레메트리·클라우드·AI 사용량은 대부분 **기본 꺼짐 또는 로그인/설정 필요**라 저절로는 안 나갑니다. 반드시 손봐야 하는 것은 **(a) 자동 업데이트/넛지(onorca.dev, github.com), (b) star-nag의 SaaS 고정 호출, (c) Claude OAuth 토큰 갱신, (d) git 목적지의 GHES 전환**입니다.

### ✅ 이 브랜치(`enterprise/samsungds`)에 구현된 잠금 스위치

아래는 **코드로 구현 완료**되어 환경변수만 설정하면 동작합니다 (`src/shared/enterprise-policy.ts`).

| 환경변수 | 효과 | 구현 위치 |
| --- | --- | --- |
| `ORCA_ENTERPRISE_LOCKDOWN=1` | 아래 3개를 일괄 ON (마스터) | `enterprise-policy.ts` |
| `ORCA_DISABLE_AUTO_UPDATE` | 자동 업데이트 피드 + 넛지 폴링 + 수동 체크 차단 (§3) | `updater.ts` (`setupAutoUpdater`, `checkForUpdatesFromMenu`) |
| `ORCA_DISABLE_STAR_NAG` | github.com star 체크/쓰기 차단 (§1) | `star-nag/service.ts` (`start`) |
| `ORCA_TELEMETRY_DISABLED` / `DO_NOT_TRACK` | 텔레메트리 차단 (§2) | `telemetry/consent.ts` |
| `ORCA_GITHUB_ENTERPRISE_HOST` (또는 `GH_HOST`) | GHES 호스트를 GitHub로 인식 → Gitea 오폴백 방지 (§1) | `gitea/repository-ref.ts` |

개별 스위치가 마스터보다 우선합니다(`ORCA_ENTERPRISE_LOCKDOWN=1` + `ORCA_DISABLE_AUTO_UPDATE=0` 가능). 아직 코드로 막지 않은 것은 §4의 Claude OAuth(Bedrock 사용 시 자동 미발생)와 §6 이미지 로드입니다.

---

## 1. Git 호스팅 (GitHub / GitLab / Bitbucket / Azure DevOps / Gitea)

### GitHub — `gh` CLI 서브프로세스 (직접 fetch 아님)

- **호스트**: `api.github.com`, `github.com`, 설정 시 사내 GHES(`github.samsungds.net`)
- **발동**: 대부분 사용자 조작(PR/이슈 열람). **일부 자동**: 사이드바에 보이는 워크트리 행의 PR/CI 백그라운드 갱신, 앱 부팅 시 star-nag.
- **전송**: repo owner/name, 브랜치, 커밋 SHA, PR/이슈 번호·제목·본문, 리뷰 코멘트, CI 로그. 인증 토큰은 `gh`가 보관하고 **Orca 프로세스를 통과하지 않음** (긍정적).
- **GHES 지원**: 이미 있음. origin 리모트에서 호스트를 유도하거나 `GH_HOST`/`options.host`로 `gh api --hostname <host>` 주입 (`src/main/git/runner.ts:1298-1377`, `github-enterprise-repository.ts`). **github.com 하드코딩 아님.**

### ⚠️ 주의 1: GHES 감지가 `gh auth status`에 의존

사내 GHES가 `gh`에 로그인돼 있지 않으면 GHES 감지(`github-enterprise-repository.ts:151`)가 실패하고 **Gitea 폴백 경로로 떨어질 수 있습니다**. → 배포 시 `gh auth login --hostname github.samsungds.net`을 선행하세요.

### 🔴 주의 2: star-nag는 github.com에 고정 (유일한 SaaS 하드코딩)

`src/main/github/client.ts:124` — `const ORCA_REPO = 'stablyai/orca'`
`:234` — `gh api --include user/starred/stablyai/orca` (읽기)
`:394` — `gh api -X PUT user/starred/stablyai/orca` (쓰기)

이 경로는 공용 러너(`ghExecFileAsync`)를 우회하는 **raw `execFileAsync`**라 `--hostname` 주입도, GHES 라우팅도 타지 않습니다. 앱 부팅 후(`src/main/index.ts:2149 starNag.start()`) 에이전트 스폰 임계치에서 `github.com`으로 나가는 **유일한 SaaS 고정 경로**입니다. → §7의 패치로 제거 권장.

### 다른 provider

| Provider | 방식 | 호스트 | 폴백 위험 |
| --- | --- | --- | --- |
| **GitLab** | `glab` CLI 서브프로세스 | `gitlab.com` / self-hosted | 자체 self-hosted 감지 있음 |
| **Bitbucket** | Orca **직접 fetch** | `api.bitbucket.org` | — |
| **Azure DevOps** | Orca **직접 fetch** | `dev.azure.com`, `*.visualstudio.com` | `ORCA_AZURE_DEVOPS_API_BASE_URL`로 지정 가능 |
| 🔴 **Gitea/Forgejo** | Orca **직접 fetch** | **origin 리모트에서 동적 유도** | **미지정 호스트 전부의 폴백 provider** |

**🔴 Gitea 폴백이 핵심 리스크**: `KNOWN_NON_GITEA_HOSTS`(github/gitlab/bitbucket/azure)만 제외하고 **그 외 모든 리모트 호스트를 Gitea로 간주**해 `/api/v1/repos/.../pulls`로 직접 fetch합니다 (`src/main/gitea/repository-ref.ts:160`). 즉 사내 git 호스트가 GitHub로 인식되지 못하면 Orca가 `github.samsungds.net/api/v1/...`(Gitea API)로 요청을 쏩니다. `ORCA_GITEA_TOKEN` 없으면 무인증 GET은 그대로 나갑니다. → GHES 감지를 확실히 시키는 것이 이 폴백을 막는 방법입니다.

---

## 2. 텔레메트리 / 진단 / 크래시 리포트

| 기능 | 호스트 | 기본 상태 |
| --- | --- | --- |
| PostHog 제품 텔레메트리 | `us.i.posthog.com` | **opt-in(기본 꺼짐)** + 공식 CI 빌드에서만 키 주입 |
| 진단 번들 업로드 (설정 → Privacy) | 벤더 서버 (2단계 토큰) | 사용자 명시적 클릭 |
| 크래시 리포트 + 인앱 피드백 | 벤더 서버 | 사용자 명시적 제출 |
| star-nag 프롬프트 텔레메트리 | `us.i.posthog.com` | 위 PostHog 게이트에 종속 |

**이미 강력하게 게이트되어 있습니다** (`src/main/telemetry/consent.ts:78-90`):
1. `DO_NOT_TRACK` truthy → 무조건 차단 (최우선)
2. `ORCA_TELEMETRY_DISABLED` truthy → 차단
3. `CI` 환경변수 존재 → 차단
4. 사용자 opt-in 배너에 동의하지 않으면 기본 **미전송**

게다가 전송 키(`ORCA_POSTHOG_WRITE_KEY`)는 **공식 CI 릴리스 빌드에만 컴파일타임에 주입**되고, 사내에서 직접 빌드한 exe는 이 값이 `null`이라 애초에 전송 경로가 죽습니다 (`electron.vite.config.ts`). **→ 사내 조치: `ORCA_TELEMETRY_DISABLED=1`을 배포 환경에 박아 이중으로 봉인.**

---

## 3. 자동 업데이트 / 넛지 (🔴 로그인과 무관하게 나감 — 반드시 차단)

| 기능 | 호스트 | 주기 | 끌 수 있나 |
| --- | --- | --- | --- |
| electron-updater 자동 업데이트 피드 | `github.com`, `objects.githubusercontent.com`, `onorca.dev` | 주기적 | **설정 없음** — 패키징 시 차단 |
| 업데이트 넛지(강제 업데이트 체크) | `onorca.dev/whats-new/nudge.json` | **30분마다** + 창 포커스/절전복귀 시 | **설정 없음** |
| 릴리스 `.atom` 피드 + 매니페스트 폴링 | `github.com` (stablyai/orca) | 주기적 | — |
| 변경사항("what's new") fetch | `onorca.dev` | 업데이트 시 | — |

**이것이 텔레메트리보다 더 문제입니다.** 런타임 토글이 없고, 앱이 살아있는 한 30분마다 `onorca.dev`로 나갑니다(공용 IP + "이 머신에 Orca 실행 중"을 벤더에 노출). 넛지 "닫기"는 폴링 타이머를 멈추지 않습니다.

**차단 방법 (택1 또는 병행)**:
1. **빌드 시**: `config/electron-builder.config.cjs`의 `publish` 블록을 `publish: null`로 → 업데이터 메타(`latest.yml`, `app-update.yml`) 미생성 → electron-updater가 피드 조회를 못 함.
2. **코드**: `src/main/updater.ts`의 넛지 폴링(`nudgeCheckTimer`)과 업데이트 체크 진입점을 정책 플래그(`ORCA_DISABLE_UPDATES`)로 조기 반환. §7 참고.
3. **망 차원**: `onorca.dev` / `github.com` 릴리스 에셋을 사내 방화벽에서 차단(가장 확실하지만 git 기능과 충돌 주의).

빌드 단계의 phone-home(electron-builder가 github에 업로드 시도)은 [윈도우 빌드 가이드 §5](./windows-corporate-build.md)에서 `--publish never`로 이미 다룹니다.

---

## 4. AI 벤더 사용량/인증 (Orca 자체 호출)

Orca가 스폰하는 에이전트 CLI(claude/codex/…)의 트래픽이 아니라, **Orca가 직접 거는 호출**입니다. 대부분 계정/쿠키를 설정해야 작동하므로 **기본적으로는 안 나갑니다**.

| 기능 | 호스트 | 기본 상태 / 차단법 |
| --- | --- | --- |
| 🔴 **Claude OAuth 리프레시 토큰 회전** | `platform.claude.com` | **차단 설정 없음.** Orca가 사용자의 Anthropic refresh_token으로 `POST /v1/oauth/token`. Orca 관리 Claude 계정을 추가하지 않으면 안 나감(`runtime-auth-service.ts:230`). 완전 차단은 `refreshClaude...` 조기 `return null` 필요 |
| Claude 사용량/rate-limit 폴링 | `platform.claude.com` | 위 계정 연동에 종속 |
| Gemini CLI 쿼터 + Google OAuth 갱신 | `cloudcode-pa.googleapis.com`, `oauth2.googleapis.com` | **기본 꺼짐** — `geminiCliOAuthEnabled: false` (opt-in). 조치 불필요 |
| MiniMax 사용량 | `platform.minimax.io` | **기본 꺼짐** — 세션 쿠키 미설정 시 무전송(`minimax-fetcher.ts:221`) |
| OpenCode 사용량 | `opencode.ai` | **기본 꺼짐** — 세션 쿠키 필요 |
| Codex / Grok / Kimi 사용량 | 각 벤더 | 계정 연동 시에만 |
| 🔴 **받아쓰기(STT) → OpenAI** | `api.openai.com` | **기본 꺼짐** — `voice.enabled: false` + 모델 미선택 + API 키 미설정, 3중 게이트. 마이크 녹음을 업로드하므로 정책상 명시적으로 잠글 가치 있음 |

**요점**: Gemini/MiniMax/OpenCode/받아쓰기는 **기본 opt-in이라 저절로 안 나갑니다**. 손봐야 하는 건 **Claude OAuth 갱신**뿐이며, 이는 Orca 관리 Claude 계정 기능을 쓸 때만 발생합니다.

### AWS Bedrock으로 Claude를 쓰는 경우

사내가 Bedrock을 쓴다면 인증은 Orca가 스폰하는 **Claude Code CLI 자체**가 AWS로 처리합니다(`bedrock-runtime.<region>.amazonaws.com`). Orca는 셸/워크스페이스 환경변수를 PTY에 전달하므로, 아래를 사용자 셸 또는 per-workspace 환경에 넣으면 됩니다.

```
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION / AWS_PROFILE (또는 AWS_ACCESS_KEY_ID 등)
ANTHROPIC_MODEL=<Bedrock inference profile ARN 또는 모델 ID>
```

이 경우 `platform.claude.com`으로 가는 Orca 자체 호출(위 표의 Claude 사용량·OAuth 갱신)은 **Orca 관리 Claude 계정을 추가하지 않는 한 발생하지 않습니다.** 계정 스위처를 쓰지 않으면 별도 코드 차단이 필요 없습니다(그래서 이 브랜치도 해당 경로는 코드로 막지 않았습니다). AWS 자격증명이 프록시/사설 CA를 타야 하면 §5의 환경변수를 함께 설정하세요.

---

## 5. 사내 프록시 / 사설 CA (✅ 이미 지원)

**좋은 소식**: Orca는 이미 대응 코드를 갖고 있습니다.

- **프록시**: `src/main/network/proxy-settings.ts`의 `ensureElectronProxyFromEnvironment`가 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`를 읽어 Electron 세션 프록시에 적용. Dock/런치패드 실행처럼 셸 env를 못 물려받는 경우까지 고려해 부팅 시 적용(`src/main/index.ts:1847`).
- **사설 CA / TLS 검사**: 임베디드 브라우저에 인증서 신뢰 컨트롤러 존재(`browser-certificate-trust-controller.ts`). Node 계층은 표준 `NODE_EXTRA_CA_CERTS`를 따르므로 사내 루트 CA를 이 환경변수로 주입.

**사내 조치**: 빌드/배포 환경에 다음을 설정하면 대부분의 연동이 프록시·사내 CA를 통과합니다.
```
HTTPS_PROXY / HTTP_PROXY / NO_PROXY
NODE_EXTRA_CA_CERTS=C:\path\to\corp-root-ca.pem
```
⚠️ 스폰되는 에이전트 CLI와 `gh`/`glab`도 이 env를 물려받아야 하니, 사용자 셸 프로파일 또는 per-workspace env에 반영하세요.

---

## 6. 이미지 / 아이콘 (렌더러 직접 로드)

| 기능 | 호스트 | 발동 |
| --- | --- | --- |
| GitHub 아바타 (gh 우회) | `avatars.githubusercontent.com` | PR/이슈 렌더 시 |
| 저장소 아이콘 자동감지 | `www.google.com/s2/favicons` | 저장소 표시 시 |
| 에이전트 카탈로그 아이콘 ⚠️ | `www.google.com/s2/favicons` | 카탈로그 표시 |
| 티켓 마크다운 인라인 이미지 | Linear/Jira 첨부 signed URL | 이슈 열람 시 |

렌더러 `<img>`가 직접 로드하므로 프록시/CA는 §5로 처리되지만, **폐쇄망에서 로드 실패 시 아이콘만 깨질 뿐 기능은 동작**합니다. 완전 차단하려면 §7의 CSP/webRequest 필터가 필요합니다.

---

## 7. 통합 차단(kill-switch) 설계 — 권장안

세션 한도로 자동 설계가 중단되어, 직접 확인한 사실 기반으로 정리합니다. **가장 적은 편집점**부터:

### 레벨 1 — 설정/환경변수 (코드 수정 없음, 지금 당장 가능)
```
ORCA_TELEMETRY_DISABLED=1          # 텔레메트리·진단 봉인 (§2)
HTTPS_PROXY / NO_PROXY             # 프록시 (§5)
NODE_EXTRA_CA_CERTS=<corp-ca.pem>  # 사설 CA (§5)
GH_HOST=github.samsungds.net       # 필요 시 gh 목적지
```
- 사이드바 워크트리 카드 속성에서 `pr`/`ci`/`status` 제거 → GitHub/Gitea 백그라운드 폴링 중단(명시적 열람은 유지).
- Gemini/MiniMax/OpenCode/받아쓰기는 기본 꺼짐이라 **켜지 않으면 됨**.

### 레벨 2 — 빌드 설정 (사내 포크 1~2줄)
- `config/electron-builder.config.cjs`의 `publish` 블록 → `publish: null`: 런타임 자동 업데이트 phone-home 차단 (§3). 빌드 업로드는 `--publish never`로 별도 처리.

### 레벨 3 — 정책 플래그 도입 (권장, 편집점 소수)
단일 환경변수(`ORCA_ENTERPRISE_LOCKDOWN` 또는 개별 `ORCA_DISABLE_*`)로 아래 지점에 조기 반환을 삽입:

| 대상 | 편집점 | 효과 |
| --- | --- | --- |
| GitHub 전체 | `src/main/git/runner.ts` `ghExecFileAsync` 진입부 | client/issues/work-item 등 100+ 호출 일괄 차단 |
| star-nag SaaS 고정 | `src/main/star-nag/service.ts:121` `checkOrcaStarred` 호출 제거 **또는** `client.ts:233/394` 조기 반환 | github.com 고정 호출 제거 (🔴 최우선, 1줄) |
| 자동 업데이트/넛지 | `src/main/updater.ts` 체크 진입부 + `nudgeCheckTimer` | onorca.dev/github 업데이트 트래픽 차단 |
| Claude OAuth 갱신 | `refreshClaude...` 진입부 `return null` | platform.claude.com 차단 |

### 레벨 4 — 망 차원 초크포인트 (가장 견고)
`src/main/index.ts`의 `session.defaultSession.webRequest.onBeforeRequest`에 **호스트 허용목록**을 걸면 메인 프로세스·렌더러·임베디드 브라우저의 모든 트래픽을 한 곳에서 통제할 수 있습니다. 사내 호스트(`github.samsungds.net`, 사내 미러)만 허용하고 나머지 차단. 단, `gh`/`glab`/에이전트 CLI 등 **서브프로세스 트래픽은 Electron 세션 밖**이라 이 필터로는 못 막으니(그건 §5 프록시/방화벽으로), 두 계층을 병행해야 완전합니다.

> **참고**: `src/main/global-fetch-call-site-audit.test.ts`가 메인 프로세스의 모든 `fetch` 호출 지점을 열거·감사하고 있어, fetch 계층 초크포인트 도입이 현실적으로 가능합니다.

---

## 8. 미검증(⚠️) 및 후속 필요

세션 한도로 아래는 스윕 단계 데이터만 있고 최종 검증이 안 됐습니다. 배포 전 직접 확인 권장:

- Electron 기본 동작: 맞춤법 사전 다운로드, DNS-over-HTTPS 자동 업그레이드, 컴포넌트 업데이트 — Chromium 기본값이 사내망에서 나갈 수 있음.
- agent-browser 서브프로세스가 `process.env` 전체 상속 여부.
- SSH 릴레이가 원격 호스트에서 npm install / node 다운로드를 하는지(폐쇄망 원격 호스트에서 문제).
- 프로덕션 렌더러 CSP 부재 여부(§6 이미지 차단과 연결).
- 로케일 카탈로그 부트스트랩이 Google Translate 비공개 엔드포인트를 쓰는지(빌드 스크립트 한정일 가능성).

이 항목들은 필요 시 다시 조사를 돌려 채우겠습니다(세션 한도 리셋 후).

---

## 부록: 확정 44건 요약

전체 원자료(호스트·파일·라인·차단 평가)는 조사 산출물에 있습니다. 여기서는 실제 외부 호출로 **확정된** 기능만 나열합니다.

git: GitHub REST/GraphQL·PR 백그라운드 폴링·아바타·star-nag / GitLab / Bitbucket / Azure DevOps / Gitea 폴백 / 일반 git fetch·push·clone / attribution 푸터.
이슈: Linear GraphQL·에이전트 write·첨부 signed URL / Jira REST / GitHub·GitLab 이슈 소스 / 티켓 인라인 이미지.
AI: Claude 사용량·OAuth갱신 / Codex / Gemini / MiniMax / OpenCode / Grok / Kimi / 받아쓰기(OpenAI).
클라우드/업데이트: PostHog / 진단·크래시·피드백 / electron-updater / 넛지·changelog / Orca Cloud 로그인 / 모바일 페어링 릴레이.
에셋: STT 모델(sherpa-onnx)·scrcpy(에뮬레이터) GitHub Releases 다운로드 / Google favicon·아바타 이미지.
