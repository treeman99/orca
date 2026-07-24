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

기능 사용법 자체는 원본 문서([onorca.dev/docs](https://www.onorca.dev/docs))를 참고하세요. 이 README는 **사내 빌드·설정·동기화**에 집중합니다.

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
> **아래 §2–§4의 설정값(`ORCA_*`, `GH_HOST`, `AWS_*`, `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS` 등)은 전부 OS 환경 변수입니다.** 앱 설정 화면이나 소스 코드가 아니라, **Orca를 실행하는 환경에 환경 변수로 심어야** 합니다. Orca는 시작할 때 이 값들을 읽습니다.
>
> Windows에서 영구 설정(사용자 단위) — `setx` 또는 `시스템 속성 → 고급 → 환경 변수` GUI:
> ```powershell
> setx ORCA_ENTERPRISE_LOCKDOWN 1
> setx ORCA_GITHUB_ENTERPRISE_HOST "github.samsungds.net"
> # 필요한 변수마다 반복
> ```
> - `setx`로 넣은 값은 **새로 실행되는 프로세스부터** 적용됩니다. 이미 떠 있는 Orca·터미널은 껐다 다시 켜세요.
> - 바탕화면/시작 메뉴 아이콘(GUI)으로 Orca를 켜면 **사용자/시스템 환경 변수**만 상속됩니다. 특정 터미널에서 `$env:VAR="..."`로만 넣은 값은 그 터미널에서 실행한 Orca에만 전달됩니다.
> - 여러 대에 배포할 때는 그룹 정책(GPO)이나 배포 스크립트로 한 번에 심는 것이 편합니다.
> - truthy 인식: `1` / `true` / `yes` / `on` (대소문자 무관). `0` / `false`면 꺼집니다.

## 2. 사내 GitHub Enterprise (`github.samsungds.net`)

Orca의 GitHub 연동은 `gh` CLI를 통하며 **GHES를 이미 지원**합니다(github.com 하드코딩 아님). 사내 호스트로 쓰려면:

```powershell
# 실행 환경에 설정 (Orca 전용 변수 또는 gh 표준 GH_HOST)
setx ORCA_GITHUB_ENTERPRISE_HOST "github.samsungds.net"
# gh를 사내 호스트로 로그인 (사용자별 1회)
gh auth login --hostname github.samsungds.net
```

`ORCA_GITHUB_ENTERPRISE_HOST`를 지정하면 Orca가 해당 호스트를 GitHub로 인식합니다. 이 브랜치는 지정하지 않았을 때 사내 호스트를 Gitea로 오인해 `/api/v1/...`로 잘못 요청하던 폴백을 막도록 수정되어 있습니다. 아바타·PR·이슈 링크는 모두 이 호스트 기준으로 동작합니다.

---

## 3. AWS Bedrock으로 Claude 사용

Bedrock 인증은 Orca가 실행하는 **Claude Code CLI 자체**가 AWS로 처리합니다. Orca는 자신이 받은 환경 변수를 에이전트에 전달하므로, 아래 **환경 변수**를 (a) OS 사용자 환경 변수로 심거나(위 안내의 `setx`), (b) Orca의 per-workspace 환경(설정 → 워크스페이스 환경변수)에 넣으면 됩니다.

```powershell
setx CLAUDE_CODE_USE_BEDROCK 1
setx AWS_REGION us-east-1                      # 사내에서 사용하는 리전
setx AWS_PROFILE <프로필>                       # 또는 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN
setx ANTHROPIC_MODEL "<Bedrock inference profile ARN 또는 모델 ID>"
```

Bedrock을 쓰면 Orca 자체의 Claude 클라우드 호출(`platform.claude.com` 사용량/OAuth)은 **Orca 관리 Claude 계정을 추가하지 않는 한 발생하지 않습니다.** 계정 스위처를 쓰지 않으면 별도 차단이 필요 없습니다.

---

## 4. 외부 연동 잠금 (보안)

아래 **환경 변수** 하나만 심으면 벤더 SaaS phone-home(자동 업데이트, 업데이트 넛지, star 체크, 텔레메트리)을 일괄 차단합니다.

```powershell
setx ORCA_ENTERPRISE_LOCKDOWN 1
```

개별 제어도 환경 변수로 합니다: `ORCA_DISABLE_AUTO_UPDATE`, `ORCA_DISABLE_STAR_NAG`, `ORCA_TELEMETRY_DISABLED`(`DO_NOT_TRACK`). 개별 값이 마스터보다 우선하므로 `ORCA_ENTERPRISE_LOCKDOWN=1` + `ORCA_DISABLE_AUTO_UPDATE=0`처럼 예외도 둘 수 있습니다.

사내 프록시/사설 CA도 표준 **환경 변수**로 처리됩니다.

```powershell
setx HTTPS_PROXY "http://proxy.samsungds.net:8080"   # HTTP_PROXY / NO_PROXY 도 동일
setx NODE_EXTRA_CA_CERTS "C:\path\to\corp-root-ca.pem"
```

어떤 기능이 어디로(어떤 호스트) 나가는지 전체 목록과 차단 근거는 **[외부 연동 감사 및 차단 계획](docs/reference/external-integrations-audit.md)** 을 참고하세요.

---

## 5. 원본(upstream) 최신 반영 — fork 동기화

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

원본이 예컨대 `v1.4.160`을 릴리스했다면, 사내 커밋들을 그 태그 위로 재생합니다.

```bash
git fetch upstream --tags
git checkout enterprise/samsungds
git rebase v1.4.160                 # 사내 커밋만 새 태그 위로 재생
# 충돌은 대개 README.md / .gitignore 처럼 추가된 영역 → 해결 후:
git add -A && git rebase --continue
git push --force-with-lease origin enterprise/samsungds
```

- `rebase`는 히스토리를 깨끗하게 유지하지만 강제 푸시(`--force-with-lease`)가 필요합니다. 강제 푸시를 피하려면 대신 병합하세요:
  ```bash
  git checkout enterprise/samsungds
  git merge v1.4.160
  git push origin enterprise/samsungds
  ```
- exe는 항상 이 `enterprise/samsungds` 브랜치(또는 재배치한 릴리스 태그)에서 빌드합니다.
- 충돌이 잦다면 사내 변경을 더 격리하세요 — 이 브랜치의 변경은 대부분 `src/shared/enterprise-policy.ts`(신규)와 소수 파일의 최소 게이트라 원본 파일과 겹칠 일이 적습니다.

---

## 개발 / 저장소 구조

- 아키텍처와 명령어 개요: [`CLAUDE.md`](CLAUDE.md)
- 프로젝트 규칙(크로스플랫폼, Git 호환성, 디자인 시스템 등): [`AGENTS.md`](AGENTS.md)
- 사내 커스터마이즈의 핵심: `src/shared/enterprise-policy.ts`(환경변수 정책) + `updater.ts` / `star-nag/service.ts` / `telemetry/consent.ts` / `gitea/repository-ref.ts`의 최소 게이트
- 원본 프로젝트의 일반 기여/개발 안내: [원본 CONTRIBUTING.md](https://github.com/stablyai/orca/blob/main/.github/CONTRIBUTING.md)

## License

원본 Orca는 [MIT License](LICENSE) 하에 배포되는 오픈소스이며, 이 포크도 동일 라이선스를 따릅니다.
