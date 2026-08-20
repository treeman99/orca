# 로컬 실행 가이드 — 설치 프로그램을 만들기 전에

[Windows 사내 빌드 가이드](./windows-corporate-build.md)는 **배포용 `.exe`를 만드는 절차**입니다. 이 문서는 그 앞 단계 — **패키징 없이 소스에서 바로 앱을 띄워서** 사내 커스터마이즈(정책 파일, GHES, 에이전트 허용목록)가 의도대로 도는지 확인하는 방법입니다.

정책 키의 의미와 스키마는 [정책 파일 레퍼런스](./enterprise-policy.md)에, 사람이 밟는 배포 경로는 [README](../../README.md)에 있습니다. 여기서는 **"내 PC에서 어떻게 돌려보고 무엇까지 확인되는가"**만 다룹니다.

**화면만 보면 되는 경우엔 [macOS dev UI 확인 가이드](./macos-dev-ui-check.md)가 더 짧습니다.** 이 문서는 Windows 기준으로, 화면에 안 나타나는 것(트레이스 스팬, 망 허용목록 튜닝)과 **개발 인스턴스로는 원리상 증명할 수 없는 것**까지 다룹니다.

---

## 1. 세 가지 실행 방식 — 무엇이 확인되는가

| 방식 | 명령 | `app.isPackaged` | userData | 여기서만 되는 것 | 여기서는 안 되는 것 |
| --- | --- | --- | --- | --- | --- |
| **개발 인스턴스** | `pnpm dev` | `false` | `%APPDATA%\orca-dev` | 정책 진단(stderr)이 터미널에 그대로 보임, 임의 경로 정책 파일, 실사용 프로필과 격리 | 패키징 전용 우선순위 규칙, 텔레메트리 실경로 |
| **언팩 패키징** | `pnpm build:unpack` → `dist\win-unpacked\Orca.exe` | `true` | `%APPDATA%\Orca` (**실사용 프로필**) | 환경변수가 머신 전역 정책을 못 이긴다는 보안 속성 실증 | 설치/제거, 바로가기, 서명 |
| **설치 프로그램** | [빌드 가이드 §4](./windows-corporate-build.md) | `true` | 동일 | 전부 | — |

**정책 검증의 대부분은 `pnpm dev`로 끝납니다.** 비패키징 프로세스에서는 `ORCA_ENTERPRISE_POLICY`가 탐색 1순위를 가져가므로(`enterprisePolicySearchPaths` — `src/main/enterprise/enterprise-policy-file.ts`) 관리자 권한도, `%ProgramData%` 쓰기도, 설치 프로그램도 필요 없습니다.

> 환경변수를 **안 붙여도** 잠금이 걸립니다 — 체크아웃의 `resources/enterprise-policy.json`이 탐색의 마지막 후보로 들어가므로(§5-D), 아무 준비 없이 `pnpm dev`만 해도 플릿에 배포되는 것과 같은 정책이 적용된 화면이 나옵니다. 화면 확인이 목적이라면 [macOS dev UI 확인 가이드](./macos-dev-ui-check.md)가 더 짧은 경로입니다.

설치본과 개발 인스턴스는 **동시에 띄울 수 있습니다** — 단일 인스턴스 락이 `userData` 기준이라 네임스페이스가 분리됩니다(`src/main/index.ts`).

---

## 2. 준비물 — 빌드 가이드에서 무엇이 빠지나

**빠지는 것**: electron-builder / NSIS 툴셋, `verify:computer-native`의 `powershell.exe` 핸드셰이크, .NET `csc.exe`(CLI 런처 빌드), 코드 서명, `--publish never` 안전장치, `GH_TOKEN` 계열 제거 절차. `dist\`도 만들지 않으므로 디스크도 덜 씁니다.

**그대로 필요한 것**:

| 항목 | 이유 |
| --- | --- |
| Node(24 LTS 권장, 최신도 가능) + pnpm 10.24.0 | [빌드 가이드 §3](./windows-corporate-build.md) 그대로 |
| **VS 2022 Build Tools + Python 3** (Windows) | `pnpm install`의 postinstall이 네이티브 모듈을 **Electron ABI로 컴파일**합니다(`CLAUDE.md`, `config/scripts/rebuild-native-deps.mjs`). 개발 실행이라고 건너뛰지 않습니다 — 준비 부담의 대부분이 여기 있고, 그건 빌드와 동일합니다 |
| 네트워크 또는 사내 미러 | `pnpm install`이 npm 레지스트리 · Electron 바이너리 · node-gyp 헤더를 받습니다. 폐쇄망 전략은 [빌드 가이드 §6](./windows-corporate-build.md) |
| Git 2.25 이상 | 앱이 실행 중에 쓰는 것과 같은 바이너리 |

`gh`는 GHES 연동을 시험할 때만 필요합니다(§6-2).

---

## 3. 첫 실행

```powershell
git clone <사내 저장소 URL> C:\src\orca
cd C:\src\orca
git checkout enterprise/samsungds

corepack enable ; corepack prepare pnpm@10.24.0 --activate
$env:ORCA_STRICT_ELECTRON_INSTALL = "1"   # Electron 바이너리 설치 실패를 묵인하지 않음 (rebuild-native-deps.mjs)
pnpm install --frozen-lockfile

node config/scripts/ensure-native-runtime.mjs --check-only   # exit 0 이어야 함
pnpm dev
```

macOS/Linux에서 개발한다면 마지막 두 줄만 동일하게 실행하면 됩니다(`$env:` 대신 `export`).

- `pnpm dev`는 `ensure:electron-runtime`(node-pty를 Electron ABI로 재조준)을 먼저 돌린 뒤 `config/scripts/run-electron-vite-dev.mjs`로 electron-vite watch 모드를 띄웁니다(`package.json`).
- 창 제목과 Dock 이름이 `Orca: <브랜치>`라서 **어느 체크아웃을 보고 있는지 바로 확인됩니다**(`run-electron-vite-dev.mjs`). 여러 워크트리를 동시에 띄워도 구분됩니다.
- Claude Code·VS Code의 통합 터미널에서 실행해도 됩니다 — 러너가 `ELECTRON_RUN_AS_NODE`를 지웁니다(`run-electron-vite-dev.mjs`).
- `Native modules still do not load for Node <v>`는 Node 메이저 문제가 아니라 **`pnpm install`이 안 됐거나 실패했다**는 뜻입니다(`CLAUDE.md`).

`pnpm dev:web`은 렌더러만 브라우저에 띄웁니다. 정책·GHES는 전부 **메인 프로세스** 기능이라 `dev:web`으로는 확인할 수 없습니다.

---

## 4. 개발 인스턴스는 설치본과 어디가 다른가

| | `pnpm dev` | 설치본 |
| --- | --- | --- |
| `userData` | `%APPDATA%\orca-dev` (`src/main/startup/configure-process.ts`). `ORCA_DEV_USER_DATA_PATH`로 더 격리 가능 | `%APPDATA%\Orca` |
| 정책 환경변수 | `ORCA_ENTERPRISE_POLICY`가 **1순위**, 무력화 값으로 탐색 전체를 끌 수 있음 | 후보 **추가**만 가능(`enterprise-policy-file.ts`) |
| `[enterprise-policy]` / `[enterprise-network]` stderr | **터미널에 그대로 보임** | 콘솔 없는 GUI 프로세스라 소실(`enterprise-policy-file.ts`) |
| 자동 업데이트 | 양쪽 모두 **소스에 없음** — 업데이터·넛지·릴리스 채널 모듈이 삭제됐습니다([감사 문서 §3](./external-integrations-audit.md)). `disableAutoUpdate`는 아무도 읽지 않는 dead switch입니다(`src/shared/enterprise-policy.ts`) | 동일 |
| 텔레메트리 전송 | 키가 컴파일 상수라 dev 빌드는 **전송 자체가 불가**(`CLAUDE.md`) | 정책·동의에 따름 |
| 트레이스 로그 | `%APPDATA%\orca-dev\logs\main.trace.ndjson` | `%APPDATA%\Orca\logs\main.trace.ndjson` |

정리하면 **`disableTelemetry`의 "실제로 나가지 않는다"는 개발 인스턴스로 증명할 수 없습니다.** 정책이 그 값으로 해석됐다는 것까지만 §5로 확인하고, 게이트 동작 자체는 §8이나 설치본에서 보세요.

`disableAutoUpdate`는 다릅니다 — 게이트를 시험할 대상 코드 자체가 없습니다. 키가 `LOCKDOWN_INHERITING_KEYS`에 남아 있는 이유는 **업스트림 리베이스가 업데이터를 되살렸을 때 기본값으로 다시 잠기게 하려는 것**이며, 배포된 정책 파일이 이 키를 계속 쓰더라도 경고 없이 파싱되도록 하기 위함입니다. 리베이스 후에는 이 스위치가 아니라 업데이터 모듈이 되돌아왔는지를 봐야 합니다([감사 문서 §3](./external-integrations-audit.md)의 탐지 명령).

---

## 5. 정책 파일을 로컬에 물리는 네 가지 방법

비패키징 실행의 탐색 순서는 **환경변수 → (없으면) 머신 전역 → 사용자별 → 체크아웃 `resources/`** 입니다(`enterprisePolicySearchPaths`). 환경변수를 준 순간 **그 경로 하나만** 후보가 되고 나머지는 전부 무시됩니다.

### A. 임의 경로 + 환경변수 (권장)

```powershell
New-Item -ItemType Directory -Force C:\src\orca-policy | Out-Null
@'
{
  // 로컬 검증용
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net"
}
'@ | Set-Content -Encoding utf8 C:\src\orca-policy\enterprise-policy.json

$env:ORCA_ENTERPRISE_POLICY = "C:\src\orca-policy\enterprise-policy.json"
pnpm dev
```

비패키징에서는 이 경로 **하나만** 탐색합니다 — 그 PC에 머신 전역 파일이 깔려 있어도 무시됩니다(`enterprise-policy-file.ts`). 반대로 머신 전역 파일이 깔린 개발 PC에서 **잠기지 않은 상태**를 보고 싶으면:

```powershell
$env:ORCA_ENTERPRISE_POLICY = "off"     # none / disabled / false / 0 도 동일
```

이때는 D의 체크아웃 기본값까지 함께 꺼집니다 — 탐색 자체를 끄는 값이기 때문입니다.

### B. 개발 프로필의 사용자별 경로

`%APPDATA%\orca-dev\enterprise-policy.json`. 환경변수 없이 **실제 배포와 같은 탐색 순서**(머신 전역 → 사용자별)를 밟으므로, 우선순위까지 같이 보고 싶을 때 씁니다.

### C. 진짜 머신 전역 경로

`%ProgramData%\Orca\enterprise-policy.json`. 관리자 권한이 필요하고 그 PC의 **모든** Orca(설치본 포함)에 영향을 줍니다. ACL·배포 절차까지 시험할 때만 쓰세요([레퍼런스 §6](./enterprise-policy.md)).

### D. 체크아웃의 `resources/enterprise-policy.json` — 아무것도 안 했을 때의 기본값

설치 프로그램이 `resourcesPath`로 복사하는 바로 그 파일이고, `pnpm dev`도 체크아웃에서 같은 파일을 **탐색 마지막 후보**로 집습니다(`devCheckoutPolicyPath`). 그래서 정책 파일도 환경변수도 없이 띄우면 **플릿과 같은 잠금 상태**가 나옵니다 — 이게 없던 시절에는 비패키징 실행이 정책을 하나도 못 찾아 모든 화면이 업스트림처럼 보였고, "게이트가 깨졌다"는 잘못된 판정이 나왔습니다.

이 파일은 **floor로도 동작합니다.** A~C로 다른 파일을 채택해도 빌드 자체 정책이 그 아래 깔려, 채택된 파일이 언급하지 않은 잠금은 유지됩니다(`applyEnterprisePolicyBaseline` — 오직 **더 조이는 방향으로만** 병합됩니다). 어떤 키가 그렇게 채워졌는지는 §6-1 스팬의 `…baseline_path`·`…baseline_applied_keys`로 확인합니다.

> **정책은 프로세스당 한 번만 읽고 캐시합니다(`getEnterprisePolicy`).** 파일을 고쳤으면 **앱을 재시작**하세요 — watch 모드의 HMR은 렌더러만 갱신하고 이 값은 바뀌지 않습니다.

형식은 JSONC(`//` 주석·후행 쉼표 허용)이고 문법 오류면 **파일 전체가 버려집니다**. 개발 인스턴스의 장점이 여기서 바로 드러납니다 — 터미널에 그 이유가 즉시 찍힙니다:

```
[enterprise-policy] C:\src\orca-policy\enterprise-policy.json is not valid JSON; ignoring it.
```

---

## 6. 적용 결과 확인

### 6-1. `enterprise.policy` 스팬 — 확정적인 확인 수단

`initObservability()` 직후 한 번 기록됩니다(`src/main/enterprise/enterprise-policy-trace.ts`, 호출부 `src/main/index.ts`). 개발 인스턴스에서는 파일 위치만 다릅니다:

```powershell
Select-String -Path "$env:APPDATA\orca-dev\logs\main.trace.ndjson" -Pattern "enterprise.policy" | Select-Object -Last 1
```

속성별 의미는 [레퍼런스 §7-2](./enterprise-policy.md). 실제 채택된 파일 경로(`…source_path`), 탐색한 후보 전체(`…searched_paths`), lockdown 상속 스위치 값(`…switches`), 허용 에이전트(`…allowed_agents`), floor로 깔린 빌드 정책(`…baseline_path`·`…baseline_applied_keys`), GHES 호스트, 망 허용목록, 경고 원문이 들어갑니다.

> `allowedAgents`가 `switches`와 **따로** 기록되는 이유: 이 키는 lockdown을 상속하지 않습니다. 키가 없거나 오타가 나면 다른 속성은 전부 "잠김"으로 보이는데 에이전트만 전부 선택 가능한 상태가 되므로, `(unrestricted)`라는 값 자체가 판정 근거입니다.
>
⚠️ 셸에 `CI`, `GITHUB_ACTIONS` 등이 설정돼 있으면 **로컬 파일 로깅 자체가 꺼져** 이 파일이 생기지 않습니다(`src/main/observability/index.ts`). dev 셸에서는 지우고 실행하세요.

### 6-2. GHES (`githubEnterpriseHost`)

- 설정 → **연동**의 맨 위 **사내 GitHub (Enterprise)** 섹션(`GitHubEnterpriseSection.tsx`)에서 호스트를 저장하고, `gh auth login --web` 브라우저 흐름 또는 개인 액세스 토큰 붙여넣기를 시험합니다. 이 포크의 연동 화면에는 GitHub만 남습니다(`IntegrationsPane.tsx`).
- `gh`가 PATH에 없으면 `The GitHub CLI (gh) was not found on your PATH.`가 뜹니다(`GitHubEnterpriseSection.tsx`) — 오류 처리까지는 사내망 없이도 확인됩니다.
- **사내망 밖에서는 여기까지가 한계입니다.** "이 호스트는 GitHub다"라는 판정은 `gh auth status` 인벤토리에 달려 있으므로(README §2), PR·이슈 조회가 실제로 되는지는 GHES에 로그인된 머신에서만 확인됩니다.
- 정책 키 자체(정규화 결과)는 §6-1 스팬의 `…github_enterprise_host`로 확인합니다.

### 6-4. `allowedAgents`

`{ "allowedAgents": ["claude"] }`를 넣고 에이전트 선택 UI에 그 id만 남는지 봅니다. `null`(키 없음)은 "제한 없음"이고, 빈 배열이나 오타난 id는 **목록이 조용히 비어 보이는** 결과가 되니 실제로 쓸 id로 시험하세요. 이 키는 lockdown 상속 대상이 아니라 명시 목록입니다(§6-1 스팬에는 `…allowed_agents`로 따로 남습니다).

**피커 하나만 보고 판정하지 마세요.** 필터는 `filterAgentsByPolicy`(`src/shared/corporate-agent-access.ts`)를 타는 화면마다 걸려 있고, 업스트림이 새 스폰 표면을 추가할 때마다 필터를 안 타는 화면이 생깁니다. 최소한 탭 바 새 탭, 상태바 로스터, 자동화 에디터, 대시보드 스폰 메뉴 — 네 곳을 모두 보세요.

실제 차단은 UI가 아니라 메인 프로세스 초크포인트 `assertAgentAllowedByEnterprisePolicy`(`src/main/enterprise/agent-allowlist-guard.ts`)가 합니다. 그래서 **피커에 보이는데 누르면 오류 토스트**가 뜨는 상태는 보안 우회가 아니라 "그 화면이 필터를 빠뜨렸다"는 신호입니다 — 리베이스 후 이 증상이 보이면 새로 들어온 화면을 찾아 게이트를 붙이세요.

### 6-5. `enforceNetworkAllowlist`

차단 로그는 stderr로만 나가고 트레이스 파일에는 남지 않습니다(`src/main/enterprise/enterprise-network-guard.ts`, 호스트당 한 줄).

```
[enterprise-network] blocked <lane> to <host>: not in allowedNetworkHosts
```

**허용목록 튜닝은 개발 인스턴스에서 하는 것이 유일하게 현실적인 방법입니다.** 아바타·에셋 호스트를 빠뜨리면 UI가 깨지는데([레퍼런스 §5](./enterprise-policy.md)), 그 목록을 실제로 뽑아내는 수단이 이 로그입니다. 앱을 평소처럼 한 바퀴 돌린 뒤 찍힌 호스트를 모아 `allowedNetworkHosts`에 넣고 다시 돌리세요.

### 6-6. 나머지 스위치

[레퍼런스 §7-1](./enterprise-policy.md)의 동작 확인 표를 그대로 쓰되, §4 표의 제약(텔레메트리는 dev에서 증명 불가, `disableAutoUpdate`는 대상 코드 자체가 없음)을 감안하세요.

---

## 7. 자동 테스트

```powershell
pnpm test                                                  # 전체 vitest
pnpm test src/main/enterprise src/shared/enterprise-policy.test.ts   # 사내 커스터마이즈만
pnpm typecheck
pnpm lint
```

- **테스트 러너는 `ORCA_ENTERPRISE_POLICY=off`로 시작합니다**(`config/vitest-enterprise-policy-isolation.ts`, 등록은 `config/vitest.config.ts`). 이 포크를 빌드하는 머신에는 머신 전역 정책 파일이 깔려 있어서, 그게 없으면 스위트 전체가 잠금 상태로 돌아 무관한 케이스가 무더기로 깨지기 때문입니다. 같은 파일이 `GH_HOST`도 지웁니다.
  → **"테스트는 다 통과하는데 앱은 잠겨 있다"는 정상입니다.** 정책이 필요한 케이스는 각자 `vi.stubEnv`로 되돌립니다.
- 정책을 소비하는 쪽 테스트는 `src/shared/enterprise-policy-fixture.ts`의 `makeEnterprisePolicy` / `makeLockdownPolicy`를 씁니다 — 스위치를 추가하면 이 픽스처 한 곳만 고치면 됩니다.
- e2e(`pnpm test:e2e`)도 자체 격리 홈·프로필을 쓰고 정책을 `off`로 중화합니다(`tests/e2e/helpers/electron-home-isolation.ts`).

---

## 8. 패키징 semantics까지 확인 — `pnpm build:unpack`

설치 프로그램을 만들지 않고 **"패키징된 앱"**만 얻습니다.

```powershell
pnpm build:unpack        # dist\win-unpacked\Orca.exe
```

여기서만 확인되는 것:

- `app.isPackaged === true` → **`ORCA_ENTERPRISE_POLICY`가 머신 전역 파일과 번들 정책 뒤로 밀립니다**(`enterprisePolicySearchPaths`의 `allowEnvOverride === false` 분기). 환경변수는 후보를 **추가**만 할 수 있고, 무력화 값(`off`)도 무시됩니다 — 사용자가 `setx ORCA_ENTERPRISE_POLICY off`로 잠금을 풀 수 없다는 보안 속성의 실증이며, **개발 인스턴스로는 원리상 확인할 수 없습니다.**
- 텔레메트리 게이트의 실제 경로(§4 표).

주의:

- userData가 **실사용 프로필** `%APPDATA%\Orca`입니다(개발용 오버라이드는 `is.dev`일 때만 적용됩니다 — `configure-process.ts`). 평소 쓰는 Orca 상태와 섞입니다.
- stderr가 다시 보이지 않습니다 — cmd 리디렉션([레퍼런스 §7-3](./enterprise-policy.md))이나 트레이스 파일을 쓰세요.
- NSIS 산출물을 만들지 않으므로 설치 경로·바로가기·서명은 **여전히 실제 `.exe` 빌드로만** 확인됩니다.

---

## 9. 로컬 실행으로는 확인되지 않는 것

과신하지 않기 위한 목록입니다.

- **코드 서명, 설치/제거, per-user 설치 경로, 바로가기** → [빌드 가이드](./windows-corporate-build.md) §4·§7
- **텔레메트리가 실제로 안 나가는 것** → 언팩(§8) 또는 설치본. dev 빌드는 키가 없어 애초에 전송이 불가하므로 게이트를 시험한 것이 아닙니다
- **업데이터가 리베이스로 되살아났는지** → 정책 스위치가 아니라 소스에서 확인합니다([감사 문서 §3](./external-integrations-audit.md))
- **AWS Bedrock / SSO** → Claude Code CLI가 처리하는 영역이라 Orca 바깥입니다(README §3.1). CLI가 설치돼 있으면 개발 인스턴스에서도 같은 흐름으로 돌지만, 검증 대상은 Orca가 아니라 CLI·AWS 설정입니다
- **사내 CA·프록시** — `git`/`gh` 바이너리의 TLS는 `NODE_EXTRA_CA_CERTS`와 무관합니다(README §2). 사내망에 붙은 PC에서만 확인됩니다
- **GHES 판정** — `gh auth status` 인벤토리가 실물이어야 합니다(§6-2)
- **ACL·GPO 기반 정책 파일 배포** → [레퍼런스 §6](./enterprise-policy.md)

---

## 10. 자주 밟는 것

| 증상 | 원인 | 대처 |
| --- | --- | --- |
| `pnpm dev`가 `Native modules still do not load for Node <v>` | `pnpm install`을 안 했거나 postinstall이 실패 | `pnpm install` 재실행. Windows면 VS Build Tools·Python부터 (`CLAUDE.md`) |
| 정책 파일을 고쳤는데 그대로 | 프로세스당 1회 캐시(`enterprise-policy-file.ts`) | 앱 재시작 (HMR로는 안 됨) |
| 아무 잠금도 안 걸리고 경고도 없음 | 경로 오타 — ENOENT는 경고를 내지 않습니다. `off` 값이 남아 §5-D 기본값까지 껐을 수도 있습니다 | 스팬의 `…searched_paths`와 `…source_path` 대조(§6-1) |
| 고친 게 화면에 전혀 반영되지 않음 | 이 체크아웃이 아닌 다른 Orca를 보고 있음 | dev 인스턴스는 앱 이름이 **`Orca Dev`**, 창 제목이 `Orca: <브랜치>`입니다. 설치본에는 이 저장소의 커밋이 하나도 없습니다 |
| 정책은 맞는데 특정 화면만 안 먹음 | 그 피커가 필터를 안 탐 | 오류 토스트가 뜨면 초크포인트는 살아 있는 것 — 화면 쪽 게이트를 붙이세요(§6-4) |
| `main.trace.ndjson`이 아예 없음 | 셸에 `CI` 등이 설정됨 | 해당 변수 제거 후 재실행(`observability/index.ts`) |
| 개발에선 잠기는데 `pnpm test`는 안 잠김 | 의도된 격리 | §7 |
| 환경변수로 지정한 경로가 무시됨 | 언팩·설치본으로 시험한 것 | 1순위는 비패키징에서만(§5-A, §8) |
| `dev:web`에서 정책·GHES가 안 보임 | 메인 프로세스 기능 | `pnpm dev` |
