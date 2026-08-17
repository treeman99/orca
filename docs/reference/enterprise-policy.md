# 엔터프라이즈 정책 파일 레퍼런스 (관리자용)

기준: **v1.4.155** (브랜치 `enterprise/samsungds`).
대상: 이 포크를 사내 다수 PC에 배포·운영하는 관리자. 배포 대상은 **Windows x64**입니다. 정책 파일 하나로 벤더 phone-home을 끄고 사내 GHES 호스트를 지정합니다.

관련 문서: 외부 연동 목록과 정책이 덮지 못하는 항목은 [외부 연동 감사](./external-integrations-audit.md), Windows 설치 파일 제작은 [Windows 사내 빌드 가이드](./windows-corporate-build.md).

---

## 1. 왜 환경변수가 아니라 파일인가

Orca가 `process.env`에서 읽는 값은 **Orca가 스폰하는 프로세스가 그대로 상속**합니다 — 에이전트 CLI(claude/codex/…)를 띄우는 PTY, `gh`/`glab`/`git` 서브프로세스(예: `src/main/github/client.ts:346-350`은 `env` 옵션 없이 실행하므로 `process.env`를 통째로 물려받습니다), 그리고 릴레이까지 (설계 근거는 `src/shared/enterprise-policy.ts:4-8` 주석). 잠금 스위치를 환경변수로 두면 같은 머신의 무관한 도구까지 `ORCA_*` 변수로 오염되고, Windows에서는 `setx`로 심은 값이 **사용자 프로파일 단위**라 다른 계정·서비스 계정·새로 만든 프로파일은 그대로 풀린 상태로 남습니다.

그래서 이 포크는 **런타임 환경변수를 딱 하나만 추가**하고, 나머지 스위치는 전부 관리자 소유 JSON 파일 안에 둡니다 (`src/shared/enterprise-policy.ts:4-8`, `src/main/enterprise/enterprise-policy-file.ts:4-17`).

### 이 포크가 추가하는 런타임 환경변수 (전부)

| 환경변수 | 값 | 패키징 빌드(사용자 PC에 설치된 `.exe`) | 비패키징(`pnpm dev`·vitest) |
| --- | --- | --- | --- |
| `ORCA_ENTERPRISE_POLICY` | 정책 파일 절대경로 | 후보 목록에 **끼워 넣기만** 합니다 — 순서는 머신 전역 → **번들** → 이 경로 → 사용자별. **머신 전역과 번들 정책이 여전히 위** | 그 경로 **하나만** 후보로 삼음 (나머지 탐색 안 함) |
| `ORCA_ENTERPRISE_POLICY` | `off` / `none` / `disabled` / `false` / `0` (대소문자 무관) | **무시됩니다.** 머신 전역 또는 번들 정책이 그대로 적용 | 탐색 자체를 무력화. 정책 미적용 |

구현: `enterprise-policy-file.ts:36`(변수명), `:41`(무력화 값), `:89-114`(후보 목록 조립 — `allowEnvOverride`가 `false`면 무력화 값을 버리고 명시 경로를 머신 전역·번들 **뒤로** 강등), `:228-234`(`app.isPackaged !== true`로 패키징 여부 판정), `:236-244`(번들 경로를 `process.resourcesPath`에서 해석), `:325-338`(호출부).

> 🔒 **이것이 보안 경계입니다.** Windows에서는 표준 사용자도 관리자 권한 없이 자기 계정의 환경변수를 만들 수 있습니다(`setx ORCA_ENTERPRISE_POLICY off` 한 줄). 환경변수 무력화가 무조건 통했다면 사내 잠금이 **명령어 하나로 우회**됐을 것입니다. 그래서 패키징 빌드에서는 환경변수가 후보를 **추가**만 할 수 있고, 관리자가 배포한 머신 전역 파일이나 빌드에 내장된 번들 정책에서 **다른 곳으로 돌리거나 그것을 끄지 못합니다** (`enterprise-policy-file.ts:70-88` 주석). 판정 신호로 `app.isPackaged`를 쓰는 이유도 같습니다 — 표준 사용자가 바꿀 수 없는 유일한 신호입니다 (`:226-227` 주석).

비패키징에서 옛 동작을 남겨 둔 것은 개발·테스트 때문입니다. `config/vitest-enterprise-policy-isolation.ts:6`이 `ORCA_ENTERPRISE_POLICY=off`를 박아, 이 포크를 빌드하는 사내 머신(머신 전역 정책 파일이 이미 깔려 있는 PC)에서 vitest가 lockdown 상태로 돌지 않게 합니다. 테스트 러너는 패키징 빌드가 아니므로 이 값이 그대로 듣습니다. **번들 정책도 이 옵트아웃 뒤에 있습니다** — 비패키징에서는 체크아웃의 `resources/enterprise-policy.json`이 맨 마지막 후보로 붙지만(§2), 무력화 값이면 후보 목록 자체가 비므로 vitest와 E2E는 그 앞에서 멈춥니다.

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
| `GH_HOST` | `gh` CLI | `githubEnterpriseHost`가 비었을 때의 폴백 (`src/shared/enterprise-policy.ts:366`) |
| `DO_NOT_TRACK` | 커뮤니티 표준 | 텔레메트리 차단, 최우선 (`src/main/telemetry/consent.ts:79-81`) |
| `ORCA_TELEMETRY_DISABLED` | 업스트림 Orca | 텔레메트리 차단 (`consent.ts:83-85`) |
| `ORCA_DIAGNOSTICS_DISABLED` | 업스트림 Orca | 로컬 진단 파일까지 포함해 진단 레인 전체 off (`src/main/observability/index.ts:102, 113-119`) |

**빌드 시점 전용**(빌드 셸에서만 쓰이고 앱 런타임 환경에는 들어가지 않음): `ORCA_WIN_PUBLISHER_NAME`(`config/electron-builder.config.cjs:331`), `ORCA_DISABLE_PUBLISH_TARGET`(`:543-551`), 업스트림의 `ORCA_MAC_RELEASE`(`:30`), electron-builder 고유의 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`.

---

## 2. 탐색 순서 — 먼저 **성공적으로 파싱된** 파일이 이긴다

순서는 빌드가 패키징됐는지에 따라 갈립니다 (`enterprise-policy-file.ts:89-114`).

**패키징 빌드 — 사용자 PC에 설치된 `.exe`. 플릿에서 유일하게 의미 있는 열입니다.**

| 순위 | 위치 | 비고 |
| --- | --- | --- |
| 1 | **머신 전역** — `%ProgramData%\Orca\enterprise-policy.json` | `ProgramData` 또는 `PROGRAMDATA` 환경변수 기준. 둘 다 없으면 후보 없음 (`enterprise-policy-file.ts:60-62`). **중앙(GPO/Intune)에서 값을 바꾸고 싶을 때 쓰는 자리** |
| 2 | **번들** — `<설치폴더>\resources\enterprise-policy.json` | **설치 파일에 내장된 기본값.** 런타임 경로는 `process.resourcesPath` 기준 (`:236-244`), 저장소 원본은 `resources/enterprise-policy.json`, 실리는 지점은 `config/electron-builder.config.cjs`의 `commonExtraResources` |
| 3 | `ORCA_ENTERPRISE_POLICY`가 가리키는 경로 | 무력화 값(`off` 등)이면 후보에서 빠질 뿐, 위 1·2순위는 그대로 남습니다 |
| 4 | **사용자별** — `%APPDATA%\Orca\enterprise-policy.json` | `:107-109` |

**비패키징(`pnpm dev`·vitest)** — 번들 후보가 **맨 아래**에 붙습니다.

| 순위 | 위치 | 비고 |
| --- | --- | --- |
| 1 | `ORCA_ENTERPRISE_POLICY`가 가리키는 경로 | 이 값이 있으면 아래를 아예 보지 않음. 무력화 값이면 후보 없음(정책 미적용) |
| 2 | 머신 전역 (위와 동일) | |
| 3 | 사용자별 — `<userData>/enterprise-policy.json` | dev 인스턴스는 `<userData>`가 `orca-dev`입니다 |
| 4 | **체크아웃** — `<체크아웃>/resources/enterprise-policy.json` | 저장소의 번들 원본 그대로. 아래 주석 참고 |

> 🧪 **4순위가 있는 이유.** 없을 때 `pnpm dev`는 정책을 **하나도** 못 찾았고, 그러면 모든 화면이 upstream 그대로 보입니다 — 설정 → 에이전트에 `codex`가, 자동화 편집 창의 에이전트 드롭다운에 `gemini`·`copilot`이 그대로 나옵니다. 게이트가 깨진 것처럼 보이지만 실제로는 **적용할 정책이 없었던 것**이라, dev로 확인할 때마다 같은 오진이 반복됐습니다. 이제 이 포크를 체크아웃에서 그냥 띄우면 플릿과 같은 화면이 나옵니다. **잠금 없는 상태와 비교하려면 `ORCA_ENTERPRISE_POLICY=off`** — 무력화 값은 비패키징에서 여전히 그대로 듣습니다.
>
> 경로 해석은 `app.getAppPath()` 기준인데, electron-vite가 `electron out/main/index.js` 형태로 띄우므로 이 값은 체크아웃이 아니라 **`<체크아웃>/out/main`** 입니다(실측). 그래서 그 접미사가 붙어 있을 때만 두 단계 올라갑니다 (`enterprise-policy-file.ts`의 `devCheckoutPolicyPath`).

> **다른 OS 각주.** 이 배포는 Windows x64 전용이라 위 표는 Windows 경로만 싣지만 **코드는 세 OS를 그대로 지원합니다**: 머신 전역 경로가 macOS는 `/Library/Application Support/Orca/enterprise-policy.json`(`enterprise-policy-file.ts:64-66`), Linux는 `/etc/orca/enterprise-policy.json`(`:67`)입니다. 번들 후보도 세 OS 모두에 실립니다(`commonExtraResources`) — macOS는 `Orca.app/Contents/Resources/enterprise-policy.json`, Linux는 `<AppImage 마운트>/resources/enterprise-policy.json`. 4순위의 `<userData>`는 Electron 규약대로 Windows `%APPDATA%\Orca`, macOS `~/Library/Application Support/Orca`, Linux `~/.config/Orca`입니다. 배치 절차는 §6-2.

앱 이름은 `app.setName('Orca')`(`src/main/index.ts:2087` → `src/main/startup/dev-instance-identity.ts:57-58`). `pnpm dev`로 띄운 개발 인스턴스만 `Orca Dev`를 씁니다(`dev-instance-identity.ts:83`).

**먼저 성공적으로 파싱된 파일이 그대로 끝입니다.** 후보끼리 병합하지 않습니다. 즉 **사용자별 파일로 머신 전역·번들 정책을 완화할 수 없습니다** — 사용자가 자기 `%APPDATA%\Orca\enterprise-policy.json`에 `{"lockdown": false}`를 써도, 위 후보 중 하나가 읽히는 한 그 파일은 읽히지 않습니다.

> ⚠️ **"파싱 성공"에는 내용이 JSON 객체여야 한다는 조건이 포함됩니다.** `null`, `[]`, `"lockdown"`, `42`는 전부 문법상 올바른 JSON이라, 예전에는 이런 파일이 탐색을 **이기고** 아래 후보를 전부 차단했습니다. 지금은 문법 오류와 똑같이 경고를 남기고 다음 후보로 넘어갑니다.

### 2-1. 번들 정책은 채택된 파일 **밑에 깔리는 바닥선**입니다

병합은 하지 않지만, 예외가 하나 있습니다. 채택된 파일이 **말하지 않은** 스위치는 빌드에 내장된 정책 값으로 채워집니다 (`src/shared/enterprise-policy-baseline.ts`).

이 규칙이 생긴 이유는 실제 사고입니다. `allowedAgents`는 `lockdown`을 **상속하지 않으므로**, 그 키가 생기기 전에 배포된 `%ProgramData%\Orca\enterprise-policy.json`(예: `{"lockdown": true}`)이 채택되면 — 다른 잠금은 전부 걸린 것처럼 보이면서 **에이전트 제한만 0**이 됩니다. 설치본에 `allowedAgents`가 내장돼 있어도 그 파일은 한 번도 읽히지 않았습니다.

바닥선의 규칙은 둘뿐이고, 둘 다 **관리자가 항상 이기도록** 만들어져 있습니다:

1. **채택된 파일이 언급한 키는 절대 건드리지 않습니다.** 관리자가 `"allowedAgents": ["claude","codex"]`라고 쓰면 그게 이깁니다. 풀고 싶으면 **명시하세요** — 적지 않으면 내장값이 남습니다.
2. **조이는 방향으로만 채웁니다.** 내장 정책의 `true`(또는 허용목록)만 반영되고, `false`는 무시됩니다. per-user NSIS 설치에서는 설치 폴더가 **그 사용자 소유**라(§7-5), 그렇지 않으면 표준 사용자가 설치 폴더의 파일에 `false`를 써넣어 관리자의 머신 전역 잠금에 구멍을 낼 수 있습니다.

`llmEndpoints`·`allowedNetworkHosts`·`githubEnterpriseHost`는 **바닥선에서 제외**입니다. 조이는 값이 아니라 넓히는 값이고, 관리자 파일이 그 키들의 주인입니다.

#### 그 아래 한 겹 더 — 빌드에 박힌 에이전트 바닥값

위 바닥선은 **채택된 파일이 있을 때** 그 빈칸을 채웁니다. 채택할 파일이 아예 없으면 채울 대상이 없고, `allowedAgents`가 없다는 것은 곧 **제한 없음**이므로 모든 벤더 CLI가 피커에 돌아옵니다. per-user NSIS 설치에서는 설치 폴더가 그 사용자 소유라(§7-5) `resources\enterprise-policy.json`을 **지우기만 해도** 그 상태가 됩니다.

그래서 파일이 아니라 **코드에 박힌 목록**이 마지막 바닥값으로 깔려 있습니다 (`BUILT_IN_AGENT_ALLOWLIST`, `src/shared/enterprise-policy-baseline.ts`). 현재 값은 `["claude", "opencode"]`이고, 바꾸려면 **저장소를 수정해 다시 빌드해야 합니다.**

규칙은 위 바닥선과 같습니다.

- **패키징 빌드에서만 적용됩니다.** `app.isPackaged`는 표준 사용자가 설정할 수 없는 유일한 신호입니다. `pnpm dev`와 vitest는 영향을 받지 않습니다 — 조용한 에이전트 제한이 걸리면 업스트림 케이스 수십 개가 이유 없이 깨집니다.
- **관리자가 항상 이깁니다.** 머신 전역 파일에 `allowedAgents`를 **명시**하면 그 값이 그대로 쓰입니다. 넓히려면 명시하세요 — 예: `"allowedAgents": ["claude", "opencode", "codex"]`.
- **`allowedAgents` 하나만 건드립니다.** 정책 파일이 없다는 사실을 `lockdown`으로 읽지 않습니다.

적용되면 트레이스의 `…baseline_applied_keys`에 `allowedAgents`가 남고 경고가 나옵니다.

```
[enterprise-policy] no policy file set allowedAgents; kept the build's own claude, opencode.
```

바닥선이 실제로 무엇을 채웠는지는 §7-2 트레이스의 `enterprise.policy.baseline_path`와 `…baseline_applied_keys`에 남고, 같은 내용이 경고로도 나옵니다:

```
[enterprise-policy] C:\ProgramData\Orca\enterprise-policy.json does not set allowedAgents; kept from <설치폴더>\resources\enterprise-policy.json.
```

> **"발견"이 아니라 "파싱"입니다 — v1.4.163 이후 바뀐 부분입니다.** 예전에는 후보 하나가 JSON 문법 오류를 내면 거기서 탐색을 **중단**하고 정책을 통째로 포기했습니다. 번들 기본값이 생긴 지금 그 동작은 위험합니다 — 관리자가 GPO로 뿌린 파일의 쉼표 하나가 그 PC를 **완전히 풀린 상태**로 만들기 때문입니다. 지금은 읽기 실패(ENOENT 외 권한/마운트 오류)와 똑같이 **다음 후보로 넘어갑니다** (`enterprise-policy-file.ts:172-178`, `:187-194`). 넘어가더라도 경고는 그대로 남으므로(§7-3), 관리자는 §7-2 트레이스의 `…warnings`에서 자기 파일이 무시된 사실을 확인할 수 있습니다.

> **이 순서가 재설계의 핵심입니다.** 예전 방식(`setx ORCA_ENTERPRISE_LOCKDOWN 1`)은 **HKCU에 쓰는 사용자별 상태**였습니다. 같은 PC의 다른 로그인 계정, 서비스 계정, 그리고 그 뒤에 새로 만들어진 프로파일은 전부 잠금이 걸리지 않았습니다. `%ProgramData%`에 놓인 파일 하나는 그 PC의 **모든 계정**에 동일하게 적용됩니다.

> 🔒 **환경변수는 패키징 빌드에서 머신 전역·번들 정책을 못 이깁니다.** §1의 이유 그대로입니다 — Windows에서 표준 사용자가 자기 환경변수를 만드는 데는 권한이 필요 없으므로, 무조건 듣는 옵트아웃은 명령어 하나짜리 우회 통로가 됩니다. 그래서 패키징 빌드에서는 `ORCA_ENTERPRISE_POLICY`가 **1·2순위를 뺏지 못하고 3순위로 강등**되며 무력화 값은 통째로 무시됩니다 (`enterprise-policy-file.ts:99-106`, `:110-113`). 같은 이유로 **번들 후보가 사용자별(`%APPDATA%`) 후보보다 위**입니다 — 그렇지 않으면 `%APPDATA%\Orca\enterprise-policy.json`에 `{}`를 떨어뜨리는 것만으로 잠금이 풀립니다.
>
> **배포상의 결론: 인스톨러의 번들 정책이 기본선이고, 값을 중앙에서 바꾸고 싶을 때만 머신 전역 경로에 파일을 놓고 ACL을 거세요**(§6). 환경변수로 커스텀 경로를 지정하는 방식은 **개발·검증용이지 플릿용이 아닙니다** — 패키징 빌드에서는 어차피 3순위라 위 두 후보가 있으면 읽히지도 않습니다.

읽기는 프로세스당 1회이며 캐시됩니다(`enterprise-policy-file.ts:318`, `:325-368`). **파일을 바꿨으면 앱을 재시작해야 반영됩니다.** 앱은 이 파일에 절대 쓰지 않습니다(`readFileSync`만).

---

## 3. 스키마

JSONC입니다 — `//` 주석과 후행 쉼표를 허용합니다 (`enterprise-policy-file.ts:184-186`, `jsonc-parser`). 자동 탐색 경로에서의 파일명은 `enterprise-policy.json`으로 고정이고(`:37`), `ORCA_ENTERPRISE_POLICY`로 직접 지정할 때는 이름이 무엇이든 무관합니다.

| 키 | 타입 | 기본값 | 실제로 끄는 것 (게이트 위치) |
| --- | --- | --- | --- |
| `lockdown` | boolean | `false` | 마스터 스위치. 아래 상속 스위치 전부(`LOCKDOWN_INHERITING_KEYS`, 현재 17개)의 **기본값**이 됩니다 (`src/shared/enterprise-policy.ts:157-175`, `:358-362`). 그 자체로 직접 끄는 기능은 없습니다 |
| `githubEnterpriseHost` | string | `GH_HOST` → `gh`의 `hosts.yml` → 없으면 `null` | 사내 GHES 호스트명. 하는 일: 허용목록 자동 추가(`src/shared/enterprise-policy.ts:370-371`) · 설정 → GitHub Enterprise 팬의 로그인 대상 기본값(`src/main/ipc/github-enterprise.ts:83-86`, 사용자가 저장한 호스트가 없을 때) · GHES 퍼머링크(blob/commit URL) 인식(`src/main/git/hosted-remote-url.ts:38-42`) · `disableVendorLinks`의 GHES 예외(`src/main/enterprise/enterprise-vendor-link-guard.ts:80-83`). **호스트를 GitHub로 인식시키는 기능은 아닙니다**(그건 `gh auth status`) — 예전 문서가 적었던 "Gitea 오폴백 차단"은 Gitea 연동이 코드에서 제거돼(커밋 `4d58e5f21c`) 더는 해당하지 않습니다. **폴백 3순위가 `gh` 자신의 설정 파일입니다** — `gh auth login --hostname <ghes>`는 환경변수가 아니라 `hosts.yml`에 쓰므로, GUI로 실행된 앱이 셸 rc의 `GH_HOST`를 못 보는 흔한 상황에서 이 경로가 유일한 단서입니다 (`src/main/github/gh-config-host.ts`). 로그인된 호스트가 **정확히 하나일 때만** 채택합니다(gh의 `DefaultHost()`와 동일) |
| `disableTelemetry` | boolean | `lockdown` | PostHog 레인 (`src/main/telemetry/consent.ts:88-90`) **및** 진단 번들 업로드 — 컨센트 계산은 `src/main/observability/index.ts:103, 120-134`이고 실제 거부는 메인의 IPC 게이트(`src/main/ipc/diagnostics.ts:221`(수집), `:253`·`:263`(업로드))에서 일어납니다. ℹ️ **제품 피드백·크래시 리포트 전송 경로(`onorca.dev/v1/feedback`)는 이 포크에서 코드째 삭제**되었으므로 이 스위치가 덮던 그 레인은 더 이상 존재하지 않습니다(§3-0). **로컬 NDJSON 로깅은 그대로 유지됩니다** (`observability/index.ts:129-133`) |
| `disableAutoUpdate` | boolean | `lockdown` | 🔴 **죽은 스위치입니다.** 이 포크는 인앱 업데이터를 코드에서 통째로 제거했으므로(§3-0) 이 키를 읽는 게이트가 저장소에 하나도 없습니다. 키 자체는 `LOCKDOWN_INHERITING_KEYS`에 남겨 둡니다 — 업스트림 리베이스로 업데이터가 되살아났을 때 잠금이 자동으로 다시 걸리게 하기 위한 안전판이고, 이미 배포된 정책 파일이 이 키를 담고 있어도 경고 없이 계속 파싱되게 하기 위해서입니다 |
| `disableStarNag` | boolean | `lockdown` | `checkOrcaStarred()`는 "이미 star함"으로 응답(`src/main/github/client.ts:341-343`), `starOrca()`는 실패로 응답(`:527-529`). 도달 경로 4개를 모두 덮습니다 — `star-nag/service.ts:121`, `star-nag/agent-value-moment.ts:46`, `star-nag/direct-star-attempt.ts:9`, `ipc/github.ts:1210-1211`(랜딩/설정 화면) |
| `disableCloudRelay` | boolean | `lockdown` | 🔴 **사실상 죽은 스위치 (v1.4.178~).** 같은 함수 `getOrcaCloudAuthConfig()`에서 **이 정책 검사보다 앞에** 무조건 차단이 들어갔습니다 — Orca Cloud 로그인과 모바일 페어링 릴레이는 정책이 아니라 소스에서 제거되었습니다([외부 연동 감사 §3.1](./external-integrations-audit.md)). 이 키가 무엇이든 클라우드는 미구성이며, 결과(로그인·릴레이 미기동·`orcaProfiles:*` IPC 3종 `unconfigured`)는 동일합니다. `disableAutoUpdate`와 같은 이유로 키만 유지합니다 — 리베이스 안전판 겸 기존 정책 파일 호환. ⚠️ 예전에도 지금도 **모바일 페어링을 막지 않습니다** — LAN/Tailscale 페어링은 그대로 동작합니다. 모바일을 막으려면 `disableMobilePairing`을 쓰세요 |
| `disableUsagePolling` | boolean | `lockdown` | AI 벤더 사용량/rate-limit 폴링 **및 그 데이터를 보여주는 UI**. 폴링 게이트 1곳(`src/main/rate-limits/service.ts:824-825`)을 진입점 전부에서 호출 — `start()`(`:353`), `fetchAll()`(`:998`), `fetchCodexOnly()`(`:1063`), `fetchClaudeOnly()`(`:1125`), `fetchGrokOnly()`(`:1190`), 계정 스위처 프리뷰 2개(`fetchInactiveClaudeAccountsOnOpen` `:572`, `fetchInactiveCodexAccountsOnOpen` `:652`), Codex 리셋 크레딧 POST(`:478`, 에러 throw), 상태칩은 `unavailable`로 고정(`:1614`). **UI**: 설정 → **통계 및 사용량** 팬이 사이드바·Cmd+J 팔레트·설정 검색에서 함께 사라지고(`useSettingsNavigationMetadata.ts`의 `stats` 항목 + `Settings.tsx`의 섹션 + 딥링크 가드 `settings-pane-policy-visibility.ts`), 상태바 팝오버의 "Usage details & history" 항목도 없어집니다(`UsageRosterPanel.tsx`). ⚠️ 이 팬에는 **Orca 자체 로컬 통계**(에이전트 실행 수·작업 시간·PR 수, 네트워크 없음)도 들어 있어 함께 사라집니다 — 그것만 남기고 싶다면 이 스위치를 `false`로 두고 §7-1의 확인 절차로 폴링만 끄는 조합을 검토하세요. 이 팬 안에만 있던 `x.com/intent/post` 사용량 공유 버튼도 함께 도달 불가가 됩니다 |
| `disableManagedClaudeAccounts` | boolean | `lockdown` | 관리형 Claude 계정의 **런타임 효과 전체** — `platform.claude.com` 토큰 회전, 활성 계정 선택, 에이전트 환경변수 재작성. 설정 UI에서 계정을 추가·선택하는 것 자체는 막지 않습니다 — 그건 `disableVendorProviderAccounts`의 역할이고, 둘은 중복이 아니라 상보 관계입니다(전자는 런타임, 후자는 등록 표면). §3-1 참고 |
| `disableSpellcheck` | boolean | `lockdown` | Chromium 맞춤법 검사기. Electron 기본값이 on이라 Windows/Linux에서 Google CDN으로 hunspell 사전을 받습니다. 메인 윈도(`src/main/window/createMainWindow.ts:306`)와 `will-attach-webview` 게스트 하드닝(`:494`) 양쪽 |
| `disableMobilePairing` | boolean | `lockdown` | Orca 모바일 페어링 **자체**를 거부합니다. `disableCloudRelay`는 벤더 릴레이만 껐고 **LAN/Tailscale 페어링은 그대로 동작**했습니다 — 오히려 lockdown 상태에서 모든 QR이 "동작하는 local-only QR"로 정상 발급됐습니다. 게이트는 `createPairingOffer()`의 `scope === 'mobile'`(`src/main/runtime/runtime-rpc.ts`)이라 설정 QR·`orca serve --mobile-pairing`·릴레이 경유 오퍼를 한 번에 덮고, 이미 페어링된 폰의 RPC 디스패치도 거부합니다. UI에서는 설정 → 모바일 탭, 사이드바 버튼, Cmd+J 항목, 앱 메뉴 토글이 사라집니다 |
| `disableMobileEmulator` | boolean | `lockdown` | 로컬 iOS 시뮬레이터 / Android AVD를 탭으로 스트리밍하는 **모바일 에뮬레이터**를 거부합니다. ⚠️ **`disableMobilePairing`과 다른 스위치입니다** — 저쪽은 실제 폰을 이 데스크톱에 페어링하는 기능이고, 이쪽은 이 기계 안의 시뮬레이터를 화면에 띄우는 기능입니다. 코드가 겹치지 않아(RPC 네임스페이스 `emulator.*` vs `scope === 'mobile'`, 설정 팬 id `mobile-emulator` vs `mobile`) 한쪽만 끄고 싶은 플릿이 존재합니다. 하드 게이트 2곳: `assertMobileEmulatorAllowedByPolicy()`(`src/main/enterprise/mobile-emulator-guard.ts`; `orca-runtime.ts`가 `RuntimeEmulatorCommands` 호스트의 `getEmulatorBridge`에 걸어 두어 `requireEmulatorBridge()`를 지나는 19개 RPC 핸들러 전부 → 렌더러 팬·`orca emulator` CLI·헤드리스 `orca serve`가 `emulator_disabled_by_policy`로 거부. 동작 테스트 `src/main/runtime/mobile-emulator-enterprise-policy.test.ts`)와 RPC 디스패처를 우회하는 MJPEG/H.264 스트림 채널 2개의 **미등록**(`register-core-handlers.ts`). UI에서는 설정 → 모바일 에뮬레이터 팬, `+` 메뉴의 New Mobile Emulator, 단축키 설정의 해당 행, 그리고 **이전에 열려 있던 시뮬레이터 탭까지** 사라집니다. scrcpy jar 다운로드는 이미 `enterprise-direct-download-guard.ts`가 막고 있으므로 이 스위치는 egress가 아니라 **도달 가능성**에 관한 것입니다 |
| `disableExternalAutomations` | boolean | `lockdown` | 자동화 페이지의 **외부 자동화 소스**(`hermes`, `openclaw`)를 거부합니다 — 발견(PATH 탐지 + `~/.hermes` 읽기), 실행 이력, 그리고 벤더 CLI를 스케줄로 띄우는 create/edit/pause/run 전부. 게이트 1곳(`src/main/automations/external-manager.ts`의 `isExternalAutomationProviderAllowed`)이 발견 경로와 렌더러가 provider를 넘기는 4개 진입점을 함께 덮습니다. `allowedAgents`로도 같은 결과가 나오지만(두 provider id가 곧 에이전트 CLI id) 그쪽은 `lockdown`을 상속하지 않으므로, **아무도 안 보는 상태에서 벤더 에이전트가 크론으로 도는 레인**을 마스터 스위치만으로 끄고 싶다면 이 키가 필요합니다. ⚠️ 잔여 위험: Orca는 스케줄러가 아니라 목록/조작 UI일 뿐이므로, 이미 등록된 `~/.hermes` 크론 잡은 Hermes 자신의 스케줄러로 계속 실행됩니다 — 제거는 `hermes cron rm`으로 해야 합니다 |
| `disableAgentInstallSuggestions` | boolean | `lockdown` | 사용자에게 **에이전트 CLI를 직접 설치하라고 권하는 표면**을 없앱니다: 설정 → 에이전트의 "설치 가능" 섹션(각 행이 벤더 홈페이지로 나가는 링크를 답니다), 온보딩 에이전트 스텝의 설치 안내 배너·"Install instructions" 버튼·"N개 더 보기" 목록(온보딩·Feature Wall 체크리스트·설정 → Setup Guide **3경로**에서 같은 컴포넌트가 렌더됩니다), 설정 검색의 `install` 키워드. `allowedAgents`와 **다른 축**입니다 — 저쪽은 "무엇을 고를 수 있나", 이쪽은 "직접 설치하라고 안내해도 되나"이고, 사내 소프트웨어 배포로 CLI를 깔아주는 플릿에서는 후자가 틀린 지시입니다. 허용된 에이전트가 아직 PATH에 없어도 설치 권유는 나오지 않고, 대신 "사내 배포로 설치한 뒤 새로 고침하세요" 안내가 뜹니다. ⚠️ 설치를 **막지는 못합니다** — 사용자가 터미널에서 직접 설치하는 것은 `allowedAgents`(실행 제한)의 몫입니다 |
| `disableVendorProviderAccounts` | boolean | `lockdown` | 벤더 AI 계정 **등록**을 거부합니다 (Claude 구독/Codex/Grok/MiniMax). `allowedAgents`로는 표현할 수 없습니다 — Bedrock 플릿은 `allowedAgents: ["claude"]`(= CLI 바이너리)가 필요한데 그 값이 이름이 같은 `platform.claude.com` 로그인 섹션을 통과시켰습니다. **사내 게이트웨이 로그인과 사내 self-hosted 엔드포인트는 대상이 아닙니다.** `list`/`select`/`remove`도 막지 않습니다 — 이미 저장된 자격증명을 지울 길이 사라지면 오히려 위험합니다. 게이트: `src/main/ipc/{claude,codex}-accounts.ts`, `minimax-credentials.ts`의 add/reauthenticate/saveCookie + `OrcaRuntimeService.addClaudeAccountFromConfigDir` / `addCodexAccountFromHome` (`src/main/runtime/orca-runtime.ts`). **후자는 v1.4.163 대응입니다** — 새 `accounts.addClaudeFromConfigDir` / `addCodexFromHome` RPC(= `orca account add` CLI)는 ipcMain을 지나지 않으므로 런타임 메서드가 두 레인의 공통 초크포인트입니다 |
| `disableRemoteOrcaServer` | boolean | `lockdown` | 이 데스크톱이 **다른 Orca에 붙는 것**(아웃바운드)을 거부합니다 — 설정 → 원격 Orca 서버, 페어링 코드 등록, ephemeral VM, 부팅 시 저장된 원격을 활성 런타임으로 복원하는 hydration. **SSH 호스트와 인바운드 `orca serve` 리스너는 대상이 아닙니다** — 원격 개발을 통째로 없애지 않습니다. 게이트: `src/main/ipc/runtime-environment-transport-routing.ts`의 status/call/subscribe 3개 진입점 (`:47`, `:102`, `:213`) |
| `disableVoice` | boolean | `lockdown` | 받아쓰기를 끝에서 끝까지 끕니다 — 로컬 STT 런타임, 모델 다운로드(HuggingFace CDN), 컴포저 마이크 버튼, 단축키, 모바일 클라이언트의 원격 받아쓰기 토글. 게이트: `src/main/speech/speech-runtime-service.ts`의 두 게터 + `registerSpeechHandlers` 미등록(macOS 마이크 권한 프롬프트가 뜨지 않게). **macOS 마이크 entitlement는 제거하지 않습니다** — 내장 브라우저의 WebRTC와 공유되기 때문입니다 |
| `disablePlugins` | boolean | `lockdown` | v1.4.162가 추가한 **플러그인 시스템**을 끝에서 끝까지 거부합니다. ⚠️ **다른 스위치와 성격이 다릅니다 — 이것만 사용자 설정을 덮어씁니다.** upstream은 기능 전체를 사용자 설정 `pluginSystemEnabled`(기본 `false`)에 걸어 뒀는데, 그건 정책이 아니라 설정 화면의 토글이라 사용자가 언제든 켤 수 있습니다. 켜지는 순간 두 갈래가 나갑니다: 벤더 마켓플레이스 인덱스를 **`git` 자식 프로세스로 clone**(`https://github.com/stablyai/orca-plugins.git`)하고, 벤더 kill-list를 `fetch`합니다(`https://onorca.dev/plugins/kill-list.json`). **전자는 `enforceNetworkAllowlist`가 구조적으로 못 막습니다** — 허용목록은 Electron 세션과 메인 프로세스 global `fetch`만 감싸고 자식 프로세스는 못 봅니다(§0.2 #1). 게이트는 네 겹입니다: ① 기능 플래그 판독을 전부 대체하는 `isPluginSystemAllowed()`(`src/main/plugins/plugin-system-policy.ts`) → 탐색·패널·워커·마켓플레이스 시드·kill-list 갱신이 모두 fail-closed, ② **egress 초크포인트** `runPluginGit()`(`plugin-git-repository.ts`) — `plugins:install`과 `plugins:refreshMarketplaces`는 기능 플래그를 보지 않고 Git에 도달하므로 여기서 막아야 합니다, ③ `fetchPluginKillList()`, ④ `registerPluginHandlers` 미등록 + `setPluginServiceForRpc` 미설정(→ `plugins.*` RPC 네임스페이스 전체가 거부되므로 `orca serve`·모바일 클라이언트도 함께 막힙니다). 플러그인 워커는 평범한 자식 프로세스라 네트워크가 자유롭다는 점이 이 스위치가 필요한 근본 이유입니다 |
| `disableVendorLinks` | boolean | `lockdown` | 앱이 사용자를 **벤더 자신의 웹 자산으로 내보내는 링크**를 없앱니다 — 커뮤니티/소셜(Discord 초대, `x.com/orca_build`, `x.com/intent/*` 공유), github.com SaaS의 **공개 이슈 트래커**(`github.com/stablyai/*`), 벤더 문서/체인지로그(`onorca.dev`). 두 가지 다른 이유가 한 스위치에 묶여 있습니다: 커뮤니티 레인은 사용자가 **사내 맥락을 공개 장소에 적어 넣는** 유출 표면이고(링크가 OS 브라우저를 열기 때문에 `enforceNetworkAllowlist`가 원리적으로 볼 수 없습니다), 문서 레인은 이 플릿에서 **틀린 지시**입니다(업스트림 문서가 설명하는 Cloud 로그인·플러그인·모바일 페어링·자동 업데이트는 이미 정책이 꺼 놓은 기능이고, 체인지로그는 받지 못할 릴리스를 광고합니다). **초크포인트 2곳**: `openExternalUrlUnderPolicy()`(`src/main/ipc/shell-open-url.ts` — `shell:openUrl` IPC 전체 = 렌더러가 링크를 여는 유일한 레인)와 `installPrivilegedWindowNavigationPolicy()`의 `setWindowOpenHandler`/`will-navigate`(`src/main/window/privileged-window-navigation.ts` — 터미널 에러 토스트의 생 `<a href>`처럼 IPC를 안 타는 경로). 판정은 `enterprise-vendor-link-guard.ts`의 호스트+경로 규칙표입니다. UI에서는 `?` 메뉴의 Docs/Changelog/GitHub/Discord/X 블록, 피드백 다이얼로그의 커뮤니티 카드, 사용량 카드의 "Share on X", 프로젝트 뷰의 "File feature request"(툴팁·aria-label 포함), 터미널 에러 토스트의 "file an issue", 첫 실행 배너의 "Privacy policy", 피처월의 문서 링크가 사라집니다. ⚠️ **웹 필터가 아닙니다** — 내장 브라우저에 x.com을 직접 입력하는 것은 그대로 되고, 동료가 PR 본문에 붙여 넣은 x.com 링크도 열립니다. 막는 것은 **Orca가 스스로 광고하는 목적지**뿐입니다. ⚠️ `githubEnterpriseHost`는 **항상 우선**합니다 — 사내 GHES 호스트는 이 스위치와 무관하게 열립니다. 제3자 도구 문서(`cli.github.com`, `gitea.com`, 각 에이전트 CLI 홈페이지)도 대상이 아닙니다 |
| `requireComputerUseApproval` | boolean | `lockdown` | Computer Use가 **무언가를 바꾸기 전에** 사용자에게 네이티브 확인 창을 띄웁니다 (클릭/타이핑/키/드래그/스크롤/붙여넣기/값 입력). 읽기(접근성 트리·스크린샷)는 묻지 않습니다. 창에는 대상 앱과 입력될 텍스트가 표시되고, 기본 버튼과 Esc는 **거부**입니다. 띄울 창이 없으면(헤드리스 `orca serve`) 거부합니다. 게이트: `callComputerSidecarAction`(`src/main/computer/sidecar-client.ts`) — 변경 동작 9개가 전부 지나가는 유일한 지점 |
| `enforceNetworkAllowlist` | boolean | **`false`** (lockdown을 상속하지 **않음**) | §5 참고. `src/shared/enterprise-policy.ts:386-388`에 이유가 주석으로 박혀 있습니다 |
| `allowedNetworkHosts` | string[] | `[]` (+ `githubEnterpriseHost` 자동 포함) | `enforceNetworkAllowlist: true`일 때만 의미가 있습니다 |
| `llmEndpoints` | object[] | `[]` | 사내에서 직접 서비스하는 모델의 접속 지점 목록. 사용자가 세션을 Bedrock 대신 여기로 돌릴 수 있습니다. 각 엔드포인트의 호스트는 허용목록에 자동 추가됩니다 (`src/shared/enterprise-policy.ts:373-381`). **토큰은 여기 넣지 않습니다** — §3-2 참고 |
| `allowedAgents` | string[] | `null` (제한 없음) | 사용자가 **쓸 수 있는 에이전트 CLI id 목록** (예: `"claude"`). ⚠️ **UI 필터가 아니라 하드 거부입니다** — 예전 판의 "고를 수 있는 목록"이라는 설명은 부족했습니다. 두 축으로 동작합니다: ① **표시** — 에이전트/모델 피커·계정 설정·하단 사용량 미터가 이 목록으로만 좁혀지고, 나머지 벤더(codex/gpt, gemini, opencode, grok 등)는 UI에서 사라지고 사용량 폴링(예: Codex → chatgpt.com)도 하지 않습니다. ② **스폰 거부** — 목록 밖 에이전트는 **실제로 실행되지 않습니다**. 표시 게이트만으로 부족한 이유는 렌더러를 거치지 않는 경로가 여럿이기 때문입니다: 정책 배포 전에 바인딩된 키보드 코드, `orca` CLI, 페어링된 모바일/웹 클라이언트, 오케스트레이션 디스패치. 초크포인트 2곳 — `pty:spawn` IPC(`src/main/ipc/pty.ts`)와 `runtime.setPtyController({spawn})`(`src/main/runtime/orca-runtime.ts`, CLI·모바일·자동화·오케스트레이션이 지나는 레인). 거부는 `agent_blocked_by_enterprise_policy` 오류로 사용자 토스트에 표시됩니다 (`src/main/enterprise/agent-allowlist-guard.ts`). 빈 배열/오타는 피커를 완전히 막지 않도록 "제한 없음"으로 처리됩니다. 사내 self-hosted 모델은 에이전트가 아니라 허용된 에이전트의 모델 피커에 얹히므로 여기 적을 필요가 없습니다. §3-3 참고 |
| `$schema` | string | — | 알려진 키라 경고가 나지 않습니다. 에디터 편의용 (`enterprise-policy.ts:180`) |

### 3-0. 정책이 아니라 코드에서 제거된 것

아래 세 표면은 **정책 파일 유무와 무관하게** 이 포크의 바이너리에 존재하지 않습니다. 스위치를 어떻게 두든 되살아나지 않습니다.

| 제거된 표면 | 예전에 덮던 스위치 | 지금 상태 |
| --- | --- | --- |
| 사이드바 `?` 메뉴의 **피드백 보내기**와 크래시 리포트 다이얼로그 (`onorca.dev/v1/feedback` POST) | `disableTelemetry`(첨부만), `disableVendorLinks`(링크만) | 다이얼로그·`feedback:submit` IPC·preload 계약이 전부 삭제됨. 크래시 **기록**은 로컬에 그대로 남습니다(브레드크럼·렌더러 오류 기록) |
| 앱 메뉴 **도움말** 하위의 크래시 리포트 / Explore Orca / Getting Started / 업데이트 확인 | `disableAutoUpdate`(업데이트 항목만) | 도움말에는 **About Orca 하나만** 남습니다 (macOS/Windows/Linux 공통) |
| **인앱 업데이터 전체** — electron-updater 피드, `onorca.dev` 넛지 폴링, 릴리스 채널 빌드 선택기, 원격 서버 업데이트, 트레이/설정/상태바의 업데이트 표면 | `disableAutoUpdate` | 코드·IPC·preload·`electron-updater` 의존성까지 제거. `disableAutoUpdate`는 죽은 스위치입니다 |

회귀 방지는 정책 테스트가 아니라 **"이 표면이 더 이상 없다"를 주장하는 테스트**가 담당합니다 — `src/main/menu/register-app-menu.test.ts`, `src/renderer/src/components/sidebar/SidebarSettingsHelpMenu.test.tsx`, `src/renderer/src/app-startup-routing.test.ts`, `src/main/ipc/crash-reporting.test.ts`, `src/main/serve-update-handoff.test.ts`, `src/main/startup/serve-desktop-activation-wiring.test.ts`, `src/main/runtime/mobile-rpc-allowlist.test.ts`, `src/preload/renderer-restart-wiring.test.ts`.

### 3-1. `disableManagedClaudeAccounts` — Bedrock 플릿에서는 필수입니다

Orca에는 Claude 계정을 앱이 직접 보관·전환하는 **관리형 계정 스위처**가 있습니다. 이 스위치는 그 기능의 런타임 동작을 끕니다. 계약은 `src/shared/enterprise-policy.ts:35-41`에 정의되어 있고, 나머지 `disable*`와 똑같이 `lockdown`을 상속합니다 (`:157-175`).

게이트는 프로덕션 코드에 **정확히 세 곳**입니다 — `oauth-refresh.ts:131`, `runtime-auth-service.ts:613`, `environment.ts:22`. 설정 UI와 `claudeAccounts:*` IPC에는 게이트가 없으므로 **계정을 추가·선택하는 화면 자체는 그대로 보입니다.** 끄는 것은 그 선택이 런타임에 만들어 내던 효과입니다.

끄는 대상은 두 가지이며, **Bedrock 배포에서는 각각 성격이 다릅니다.**

**1. `platform.claude.com`으로 나가는 OAuth 토큰 회전 → egress 문제**

`refreshClaudeOauthCredentials()`가 저장된 refresh_token으로 `https://platform.claude.com/v1/oauth/token`에 POST합니다 (`src/main/claude-accounts/oauth-refresh.ts:10`, `:125`, 실제 전송은 `:149`의 `net.fetch`). 게이트는 **그 함수 진입부**에 있어 호출자를 가리지 않습니다 — `disableManagedClaudeAccounts`면 소켓을 열기 전에 `null`을 반환합니다 (`:131-133`). `null`은 원래 "기존 자격증명 유지"라 예외가 나지 않습니다.

호출 지점은 두 곳이고 둘 다 이 게이트를 지납니다: 에이전트 스폰 직전의 런타임 인증 준비(`src/main/claude-accounts/runtime-auth-service.ts:1054`, `:1057`)와 사용량 페처(`src/main/rate-limits/claude-fetcher.ts:1204-1205` — 여기는 `disableUsagePolling`도 이미 덮습니다).

**2. 에이전트 PTY로 가는 환경변수 재작성 → 기능 장애 위험**

관리형 계정이 활성화되면 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`**, 그리고 인증처럼 보이는 `ANTHROPIC_CUSTOM_HEADERS`를 삭제합니다 (`src/main/claude-accounts/environment.ts:3-8`, `:22-29`). 게이트는 두 겹입니다.

- **원천** — 인증 준비 단계에서 활성 계정 자체를 `null`로 만들어 스트립을 요구하지 않게 합니다 (`src/main/claude-accounts/runtime-auth-service.ts:613-616`). 호스트 세션의 `stripAuthEnv`는 활성 계정 유무에서 유도되므로 자동으로 `false`가 됩니다 (`:667`).
- **최후 방어선** — `stripAuthEnv: true`를 하드코딩해 넘기는 호출자가 있어도 삭제를 건너뜁니다 (`environment.ts:22`). 적용부는 `src/main/rate-limits/claude-pty.ts:244-247`과 `src/main/text-generation/commit-message-agent-environment.ts:131-132`입니다.

특히 이 두 번째는 **WSL에서 더 셌습니다.** WSL 런타임을 고른 세션은 관리형 계정을 하나도 등록하지 않아도 스트립이 켜졌고(`runtime-auth-service.ts:647`, `:657` — 각각 WSL 홈을 찾은 경우와 못 찾은 경우), 그 상태에서 런치 환경에 위 변수 중 하나라도 있으면 PTY 스폰이 **에러로 하드 실패**했습니다 (`src/main/ipc/pty.ts:4576-4580`, `:6164-6168`).

```
This Claude launch defines explicit Anthropic auth environment variables. Remove those overrides before using a managed Claude account.
```

지금은 두 WSL 분기의 `stripAuthEnv`가 `!managedAccountsDisabled`이므로(`:647`, `:657`) 스위치가 켜져 있으면 하드 실패 조건 자체가 성립하지 않습니다. Windows 호스트 세션은 원래도 관리형 계정을 **선택한 동안에만** 스트립됐습니다 (`:667`).

**따라서 Bedrock 플릿에서 이 값은 사실상 필수입니다 — `true`(= `lockdown: true`면 자동).** 권장이 아니라 필수인 이유는 위 두 번째 항목입니다: 이 스위치가 없으면 WSL 런타임을 고른 세션은 관리형 계정을 하나도 등록하지 않아도 스트립이 켜지고, 런치 환경에 Bedrock 계열 변수가 하나라도 있으면 PTY 스폰이 하드 실패합니다. Bedrock 인증은 Claude Code CLI가 자격증명 체인으로 처리하고 그 자격증명은 사내 게이트웨이(`gateway-cli login`)가 소유하므로 관리형 계정은 필요가 없고, 켜 두면 egress 한 줄과 WSL 스폰 실패 한 줄을 동시에 없앱니다. 반대로 이 기능을 실제로 쓰는 배포라면 `"disableManagedClaudeAccounts": false`로 명시해 되살리세요.

> ⚠️ **이 스위치가 WSL 게스트에 자격증명을 넣어 주지는 않습니다.** 이 스위치가 없애는 것은 "지우는 동작"뿐입니다. `wsl.exe`는 `WSLENV`에 등록된 변수만 게스트로 넘기는데, Orca가 등록하는 것은 `ORCA_*`와 워크트리 경로 변수(`src/main/pty/wsl-orca-env.ts:77-102` → `:44-54`의 `CONDUCTOR_ROOT_PATH`/`GHOSTX_ROOT_PATH` 포함), 그리고 에이전트 홈 경로(`CODEX_HOME`·`CLAUDE_CONFIG_DIR` — `src/main/providers/local-pty-provider.ts:748`, `:769`)뿐입니다. **어느 등록 지점에도 `AWS_*`는 없습니다** (배경은 `src/main/rate-limits/claude-pty.ts:273-274` 주석). WSL 안에서 Bedrock을 쓰려면 **게스트 배포판 안에서 `gateway-cli login`을 따로 실행**하고 리전 설정도 게스트에 두어야 합니다 — 호스트의 로그인은 게스트에 보이지 않습니다([README §3.4](../../README.md)).

### 3-2. `llmEndpoints` — 사내에서 직접 서비스하는 모델

사내가 오픈웨이트 모델을 직접 서비스한다면, 사용자가 세션을 Bedrock 대신 그쪽으로 돌릴 수 있습니다. **정책 파일의 엔드포인트는 관리자 소유이고 토큰은 사용자 소유**이지만, 아래처럼 **사용자가 엔드포인트 자체를 추가하는 별도 레인이 있습니다** — 즉 실제 목록은 관리자 배포분과 사용자 추가분의 합집합입니다.

> **사용자 직접 추가(UI):** 관리자가 정책 파일에 넣지 않아도, 사용자가 **설정 → AI 제공업체 계정 → "사내 자체 호스팅 모델"(영문 UI: Accounts → Self-hosted models)** 에서 URL·프로토콜·토큰을 입력해 엔드포인트를 직접 추가할 수 있습니다(`src/renderer/src/components/settings/CorporateLlmEndpointsSection.tsx`). 저장 위치는 사용자 프로파일(`%APPDATA%\Orca\corporate-llm-user-endpoints.json`, 토큰은 별도 암호화 저장)이며, 정책 엔드포인트와 동일하게 모델 피커·실행 주입 경로를 탑니다(`corporate-llm-endpoint-registry.ts`). URL은 https만 허용됩니다(루프백 예외, 쓰기 시점 검증). **이 레인을 끄는 정책 스위치는 없고, `enforceNetworkAllowlist: true`도 이것을 막지 못합니다** — 실제 전송 주체가 에이전트 CLI 서브프로세스라 허용목록이 원리적으로 보지 못하기 때문입니다(감사 문서 §0.2 #1·#14). 하드 잠금 배포에서 사용자 지정 목적지를 통제하려면 망 계층(프록시 강제·방화벽)이 유일한 수단입니다.

#### 엔드포인트 항목 스키마 (`src/shared/enterprise-llm-endpoints.ts`)

| 필드 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `id` | ✅ | — | 안정적인 키. **파일명이 되므로** 토큰 저장소가 `^[a-zA-Z0-9._-]{1,64}$`만 받습니다 (`corporate-llm-token-store.ts:21-23`). 이 범위를 벗어난 id는 정책 파싱은 통과해도 **토큰을 저장할 수 없습니다** |
| `baseUrl` | ✅ | — | **`https`만 허용**합니다. 예외는 루프백(`localhost` / `127.0.0.1` / `::1`)뿐 (`:40-46`, `:49-52`). 후행 슬래시는 제거됩니다 |
| `api` | | `"openai"` | `"anthropic"` 또는 `"openai"`. 사내 서비스가 말하는 프로토콜 |
| `label` | | `id`와 동일 | UI에 표시되는 이름 |
| `model` | | 없음 | 서비스가 모델 id를 요구할 때만 |

> **왜 `https`를 강제하나**: 토큰은 이 URL이 가리키는 곳으로 전송됩니다. `http://`로 잘못 적으면 사내망에 **평문으로 흐릅니다** (`:26-27` 주석).

**항목 하나가 잘못돼도 정책 전체가 죽지는 않습니다.** 쓸 수 없는 항목은 경고와 함께 버려지고 나머지는 적용됩니다 (`:91-95` 주석) — 엔드포인트 오타 하나가 플릿의 잠금 스위치를 날리면 안 되기 때문입니다. id가 중복되면 **처음 것을 유지**합니다 (`:114-117`).

#### 토큰은 관리자가 배포하지 않습니다

정책 파일은 `%ProgramData%`에 있어 **그 PC의 모든 계정이 읽을 수 있습니다.** 토큰은 사람을 식별하므로 여기 넣으면 머신 공용 토큰이 되고 개인별 추적이 불가능해집니다. 그래서 **사용자가 앱에서 직접 입력**합니다.

| | |
| --- | --- |
| 입력 위치 | **설정 → AI 제공업체 계정 → "사내 자체 호스팅 모델"(영문 UI: Accounts → Self-hosted models)** (`src/renderer/src/components/settings/AccountsPane.tsx:1972`) |
| 저장 위치 | `%APPDATA%\Orca\corporate-llm-tokens\<id>.token` (`corporate-llm-token-store.ts:17`, `:28`) |
| 암호화 | Electron `safeStorage` = **Windows에서는 DPAPI**. 사용자 계정에 묶여 다른 프로필은 파일에 접근해도 못 읽습니다. 파일 모드 `0600` (`:94`) |
| 암호화 불가 시 | **저장을 거부합니다** (`:87-90`). 평문으로 떨어뜨리지 않습니다 |

관리자가 할 일은 `llmEndpoints`를 배포하는 것까지입니다. 사용자에게는 "설정에서 자기 토큰을 한 번 넣으라"고만 안내하면 됩니다.

#### 에이전트에 실제로 전달되는 것 (`src/shared/corporate-llm-launch-env.ts:53-72`)

| `api` | 전달되는 환경변수 |
| --- | --- |
| `"openai"` | `OPENAI_BASE_URL`, `OPENAI_API_KEY`, (`model` 지정 시) `OPENAI_MODEL` |
| `"anthropic"` | `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, (`model` 지정 시) `ANTHROPIC_MODEL` |

여기에 더해 엔드포인트 호스트가 `NO_PROXY`/`no_proxy`에 **병합**됩니다(기존 값을 덮지 않음, `:28-40`). 사내 엔드포인트를 외부 프록시로 보내면 실패하거나 프롬프트 트래픽이 노출되기 때문입니다.

**토큰은 정책 파일에도, 저장되는 세션 설정에도 들어가지 않습니다.** 선택은 `ORCA_CORPORATE_LLM_ENDPOINT=<id>`라는 **비밀이 아닌 값**으로만 이동하고, 스폰 시점에 main이 정책에서 URL을, 암호화 저장소에서 토큰을 꺼내 합칩니다 (`src/main/enterprise/corporate-llm-launch-injection.ts`). 이렇게 나눈 이유는 `SleepingAgentLaunchConfig`가 에이전트 환경을 **평문으로 디스크에 저장**하기 때문입니다 (`src/shared/sleeping-agent-launch-config.ts:12-16`).

#### 두 가지 제약 — 배포 전에 알고 계세요

1. **워크스페이스 단위가 아닙니다.** 이 코드베이스에 워크스페이스별 에이전트 설정 계층이 없어서, 선택은 **에이전트 단위**로 저장되고 그 에이전트의 이후 모든 런치에 적용됩니다.
2. **첫 런치에서는 고를 수 없습니다.** 모델 선택 표면이 스폰이 큐잉된 뒤에 붙습니다. 새 설치의 첫 세션은 Bedrock으로 뜨고, 사용자가 그 세션의 모델 핀에서 사내 LLM을 고르면 **이후 런치부터** 적용됩니다. 모르면 "고장났다"고 판단할 지점이라 사용자 안내에 꼭 넣으세요.

#### 선택이 먹히지 않을 때 — 스폰은 죽지 않습니다

정책에 없는 id이거나 토큰이 저장돼 있지 않으면 **환경을 건드리지 않고** 기존 백엔드(이 플릿에서는 Bedrock)를 유지합니다 (`corporate-llm-launch-injection.ts:53`, `:57`). 인증 없는 요청을 보내거나 터미널이 안 뜨는 것보다 낫다는 판단입니다. 진단은 §7-5를 보세요.

#### WSL

`wsl.exe`는 `WSLENV` 등재 변수만 게스트로 넘깁니다. 위 환경변수 전부와 `NO_PROXY`·`ORCA_CORPORATE_LLM_ENDPOINT`가 `/u`로, `NODE_EXTRA_CA_CERTS`가 `/p`(Windows 경로일 때) 또는 `/u`(이미 Linux 경로일 때)로 등재됩니다 (`src/main/enterprise/corporate-llm-wsl-passthrough.ts:9-27`). 인증서 번들은 경로라서 게스트용으로 번역해야 하기 때문입니다.

**`HTTP_PROXY`/`HTTPS_PROXY`는 넘기지 않습니다** — 모든 WSL 에이전트의 네트워킹을 바꾸는 변경이라 이 기능의 곁다리로 처리하지 않았습니다.

#### 사내 CA

사내 엔드포인트가 사내 인증서를 쓰면 Node 기반 에이전트 CLI는 `NODE_EXTRA_CA_CERTS`가 필요합니다. **OS 환경변수로 심으면 됩니다** — Orca는 PTY에 `process.env`를 통째로 상속시키고 allowlist가 없어서 Windows 호스트에서는 이미 전달되고, 위 항목으로 WSL에도 넘어갑니다.

### 값 해석 규칙

- **boolean 키**는 진짜 boolean 외에 문자열 `"true"/"yes"/"on"/"1"`, `"false"/"no"/"off"/"0"`도 받습니다 (`enterprise-policy.ts:190-191`, `:212-220`).
- **인식할 수 없는 값은 "부재"로 처리**되어 `lockdown`을 상속하고, stderr에 경고가 나갑니다 (`:221-222`). 절대 "off"로 읽지 않습니다 — 관리자의 오타가 조용히 잠금을 푸는 사고를 막기 위한 설계입니다 (`:197-199` 주석).
- **호스트 문자열**은 스킴·경로·자격증명·포트를 벗겨내고 소문자로 정규화됩니다 (`:227-240`). `https://github.samsungds.net/`, `git@github.samsungds.net:8443` 모두 `github.samsungds.net`이 됩니다.
- **모르는 키**는 무시되고 경고만 나갑니다 (`:352-356`). 오타난 키(`disableStarNagg`)는 곧 "그 스위치는 부재" = `lockdown` 상속입니다.
- **문법이 깨진 파일은 통째로 거부**합니다 (`enterprise-policy-file.ts:187-194`). 절반만 적용되는 상태는 만들지 않습니다 — 대신 **다음 후보로 넘어갑니다**(§2). 즉 결과는 "그 파일의 값이 사라지고 아래 후보(보통 번들 정책)가 적용됨"이며, 아래에 아무 후보도 없으면 **정책 미적용**입니다. §7-4에서 반드시 확인하세요.

### 3-3. `allowedAgents` — Bedrock + 사내 모델만 남기기

기본 배포판에는 Claude·Codex(gpt)·Gemini·OpenCode·Grok 등 여러 에이전트 CLI와 그 벤더 모델이 UI 곳곳에 노출됩니다. `allowedAgents`를 지정하면 **고를 수 있는 에이전트를 이 목록으로만 좁힙니다.** Bedrock 전용 플릿이라면 `["claude"]` 하나면 됩니다 — `claude` 에이전트만이 사내 게이트웨이가 발급한 자격증명으로 Bedrock에 말하기 때문입니다. *(그 자격증명이 구체적으로 어떤 변수·경로로 CLI에 전달되는지는 `gateway-cli`의 계약이며 이 저장소로 검증할 수 없습니다.)*

- **탐지 결과에서 제거 (메인 — 이게 본체입니다):** 허용되지 않은 에이전트는 **에이전트 탐지 결과 자체에서 빠집니다** (`src/main/ipc/preflight.ts`의 `detectInstalledAgents` / `detectRemoteAgents`). "무엇이 감지되었나"가 모든 피커·자동 선택·퀵런치·키보드 단축키의 입력이고, 웹 클라이언트·모바일 클라이언트·CLI·페어링된 데스크톱이 받는 답도 같은 값입니다 — 이들은 렌더러 정책 뷰를 **아예 보지 못하므로**(웹 preload에 `enterprisePolicy` API가 없습니다) 메인 쪽 게이트가 유일한 방어선입니다.
- **좁혀지는 표면 (렌더러):** 정책은 `enterprisePolicy:get`(+ 동기 채널 `:get-sync`) IPC로 렌더러에 전달되고, **에이전트 카탈로그 자체**가 허용 목록으로 필터됩니다 (`src/renderer/src/lib/agent-catalog.tsx`의 `getAgentCatalog()`). 즉 피커를 새로 추가한 코드가 별도 조치 없이도 게이트를 물려받습니다 — 설정 → 에이전트, 계정 설정, 새 워크스페이스/워크트리 생성, `+` 탭 메뉴와 퀵런치, 자동화 에디터의 에이전트 피커, 온보딩, 소스컨트롤 AI 액션, 터미널 Quick Command, 설정 검색 키워드, 설정 → 단축키의 에이전트별 행이 모두 여기서 나옵니다. 이름·아이콘 조회는 의도적으로 **전체 카탈로그**(`getFullAgentCatalog()` / `getAgentLabel()`)를 쓰므로, 정책이 방금 숨긴 에이전트가 이미 실행 중이어도 자기 이름을 그대로 표시합니다.
- **탭 카탈로그가 아닌 로스터 2개도 같은 게이트를 탑니다.** 소스컨트롤 AI 텍스트 생성은 `COMMIT_MESSAGE_AGENT_SPECS`, AI Vault 필터는 `AI_VAULT_AGENTS`라는 **별개 상수**를 읽습니다 — 탭 카탈로그를 좁혀도 이쪽은 안 좁혀지므로 각각 따로 걸어야 합니다: `src/renderer/src/lib/use-commit-message-agent-capabilities.ts`(생성 다이얼로그 + feature-wall 설정 행), `AiVaultPanelControls.tsx`의 `visibleAgents`. 고정 테스트는 `agent-allowlist-text-generation-surfaces.policy.test.tsx`. AI Vault의 **저장된** 선택 목록은 일부러 안 좁힙니다 — 정책이 바뀔 때마다 사용자 설정을 덮어쓰게 되기 때문이고, 목록에 없으면 어차피 표시되지 않습니다.
- **자동 선택 폴백:** 탐지가 아직 진행 중일 때(`null`) 쓰이는 자동 선택 순서도 필터됩니다 (`quick-workspace-agent-selection.ts`). 이게 빠지면 목록은 필터됐는데 **미리 선택된 값이 차단된 에이전트**여서 그대로 실행되는 상태가 됩니다.
- **외부 자동화:** `hermes`·`openclaw`는 provider id가 곧 에이전트 CLI id라, `allowedAgents`가 자동화 페이지의 외부 소스와 에디터의 Orca/Hermes 대상 토글까지 함께 좁힙니다 (`src/main/automations/external-manager.ts`). 마스터 스위치로 끄고 싶다면 `disableExternalAutomations`를 쓰세요.
- **폴링 차단 (메인):** 허용되지 않은 벤더의 사용량 미터는 네트워크로 나가지 않습니다 — 예로 Codex는 `chatgpt.com`을 조회하지 않습니다 (`src/main/rate-limits/service.ts`의 `isUsageProviderAllowed`). `claude`는 Bedrock 에이전트라 여기서 게이트되지 않습니다 (Claude 사용량 폴링 자체를 끄려면 `disableUsagePolling`).
- **사내 self-hosted 모델:** 에이전트가 아니라 허용된 에이전트의 **모델 피커에 얹히는** 항목이므로(`corporate-llm-session-catalog.ts`) `allowedAgents`에 적지 않아도 그대로 유지됩니다. `llmEndpoints`(§3-2)로 배포하면 됩니다.
- **안전장치:** 빈 배열이나 전부 무효한 값은 "제한 없음(`null`)"으로 처리되고 경고가 나갑니다 (`enterprise-policy.ts`의 `readAgentAllowlist`) — 관리자의 오타가 피커를 완전히 비워 앱을 못 쓰게 만드는 사고를 막습니다. `lockdown`을 상속하지 않으므로 제한하려면 **명시**해야 합니다.

### 3-4. 사내 GHES 로그인 — 설정 UI에서 브라우저 로그인

`gh`가 회사에서 `github.com`에 닿지 못하면 사내 GHES 호스트로 `gh`를 로그인시켜야 합니다. 관리자가 `githubEnterpriseHost`를 배포하지 않았거나 사용자가 직접 로그인해야 하는 경우, **설정 → 연동 → "사내 GitHub (Enterprise)"(영문 UI: Integrations → Company GitHub (Enterprise))** 에서 처리할 수 있습니다 (`src/renderer/src/components/settings/GitHubEnterpriseSection.tsx`).

- **호스트 입력:** 정책의 `githubEnterpriseHost`가 있으면 그 값이 기본으로 채워지고, 없으면 사용자가 사내 호스트를 입력해 저장합니다. 저장 위치는 `%APPDATA%\Orca\github-enterprise-host.json` — 정책 파일이 아니라 사용자 프로파일입니다(`src/main/github/github-enterprise-host-store.ts`). 정책 호스트가 있으면 그쪽이 기본값으로 우선합니다. **`github.com`은 이 파일에 저장되지 않습니다** — 이 파일은 관리자의 `githubEnterpriseHost`보다 우선하고 TTL도 없어서, github.com 로그인 한 번이 기계를 영구히 벤더 호스트로 고정시키고 userData 삭제(=재설치)만이 유일한 해제 방법이었습니다.
- **`gh`만 설정한 기계:** 정책도 없고 앱에 입력한 적도 없지만 `gh auth login --hostname <ghes>`는 실행한 상태 — 사내에서 가장 흔한 순서입니다. 이 경우 Orca가 **`gh` 자신의 `hosts.yml`을 읽어** 그 호스트를 채택합니다(`src/main/github/gh-config-host.ts`, 로그인된 호스트가 정확히 하나일 때만). 그 전에는 `GH_HOST` 환경변수만 봤고, GUI로 실행된 앱은 셸 rc의 `export`를 상속하지 않으므로 이 조합이 영원히 `github.com`으로 보였습니다.
- **브라우저 로그인(device flow):** "Sign in with browser" 버튼이 `gh auth login --hostname <host> --git-protocol https --web`를 PTY로 실행합니다(`src/main/github/github-enterprise-login.ts`). gh가 출력하는 일회용 코드를 UI에 크게 띄우고, gh가 기본 브라우저를 열어 device 인증을 진행합니다.
- **토큰(PAT) 로그인:** 회사가 OAuth device endpoint를 막는다면, 같은 섹션의 "Connect with token"에 PAT를 붙여넣으면 `gh auth login --hostname <host> --git-protocol https --with-token`(stdin)으로 비대화식 로그인합니다.
- **공통:** **토큰은 앱이 저장하지 않습니다** — 두 방식 모두 `gh` 자신의 키링에 들어가므로, 로그인 후에는 기존 PR·체크·리뷰 상태 등 gh 기반 기능이 그대로 동작합니다.
- **네트워크 잠금과 함께 쓸 때:** `enforceNetworkAllowlist: true`라면 GHES 호스트가 허용목록에 있어야 브라우저/API 호출이 통과합니다. `githubEnterpriseHost`(또는 `allowedNetworkHosts`)로 반드시 포함하세요(§5).
- **"요청이 실제로 어디로 가는지" 확인:** 같은 읽기 전용 표시가 **설정 → Git 및 소스 제어**의 "Git 호스트" 항목에도 있습니다(`EffectiveGitHubHostSetting.tsx`). 입력 필드가 있는 §3-4 화면과 달리 이쪽은 표시만 하며, 사용자가 "내 코드가 어디로 나가나"를 확인하려고 여는 화면이 보통 이쪽이라 양쪽에 둡니다. 표시되는 값은 정책의 `githubEnterpriseHost`가 아니라 **`gh`가 실제로 향하는 호스트**입니다 — 정책 호스트는 `gh`를 리다이렉트하지 않기 때문입니다. 우선순위와 표시되는 출처는 `gh` 자신의 해석 순서를 그대로 따릅니다 (`src/main/github/effective-github-host.ts`):

  | 순위 | 출처 | UI 문구 |
  | --- | --- | --- |
  | 1 | 워크스페이스의 origin 리모트 | 이 워크스페이스의 git 리모트에서 |
  | 2 | `GH_HOST` 환경변수 | GH_HOST 환경변수에서 |
  | 3 | `gh`가 로그인되어 있는 단일 호스트 (`hosts.yml`) | gh가 로그인되어 있는 호스트에서 |
  | 4 | 사용자가 §3-4에서 저장한 호스트 | 여기서 저장한 호스트에서 |
  | 5 | 정책의 `githubEnterpriseHost` | 조직의 Orca 정책에서 |
  | 6 | 없음 | gh 기본값 — 사내 호스트가 설정되지 않음 |

  3순위가 4·5순위보다 위인 이유: `gh`는 자기 설정에 따라 요청을 보내므로, Orca가 저장/배포한 값을 표시하면 실제로는 다른 곳으로 나가는 요청에 사내 목적지 딱지를 붙이게 됩니다.

---

## 4. 예제

### 4-1. 이 배포에 그대로 쓸 수 있는 전체 예제

`github.samsungds.net` 사내 배포용. 일곱 개 스위치는 `lockdown: true`면 생략해도 같은 결과지만, **감사 담당자가 상속 규칙을 모르고 읽어도 되도록 전부 명시**했습니다.

> 📦 **이 예제는 저장소의 `resources/enterprise-policy.json`과 같은 내용입니다** — 그 파일이 설치 프로그램에 내장되어 §2 표의 2순위 후보로 실립니다. 즉 **아무 배포 작업을 하지 않아도 이 정책이 적용된 상태로 설치됩니다.** 아래 블록을 `%ProgramData%\Orca\`에 놓는 것은 이제 **중앙에서 값을 바꾸고 싶을 때**의 절차입니다(§6-1). 번들 파일 자체를 바꾸려면 저장소에서 고치고 다시 빌드하세요.

```jsonc
{
  // Orca 사내 배포 정책 — 관리자 소유. 사용자가 수정할 수 없어야 합니다.
  // 배치 위치: %ProgramData%\Orca\  (다른 OS는 §2 각주)
  // 파일명: enterprise-policy.json  (변경 시 앱 재시작 필요)

  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",

  // lockdown에서 상속되는 값들 — 감사를 위해 명시
  "disableTelemetry": true,    // PostHog + 진단/크래시 번들 업로드 (로컬 로그는 유지)
  "disableAutoUpdate": true,   // 죽은 스위치 — 업데이터는 코드에서 제거됨 (호환용으로만 유지)
  "disableStarNag": true,      // github.com SaaS로 나가는 star 조회/쓰기
  "disableCloudRelay": true,   // 죽은 스위치 — 클라우드 로그인·릴레이도 코드에서 제거됨 (호환용으로만 유지)
  "disableUsagePolling": true, // AI 벤더 사용량/rate-limit 폴링
  "disableManagedClaudeAccounts": true, // platform.claude.com OAuth 회전 + Bedrock 자격증명 스트립 (§3-1)
  "disableSpellcheck": true,   // Chromium 사전 CDN 다운로드
  "disableMobilePairing": true,          // 모바일 페어링 자체 (LAN 경로 포함 — disableCloudRelay로는 부족)
  "disableVendorProviderAccounts": true, // 벤더 AI 계정 등록 (사내 게이트웨이 로그인·사내 엔드포인트는 제외)
  "disableRemoteOrcaServer": true,       // 다른 Orca에 붙기 (SSH 호스트는 제외)
  "disableVoice": true,                  // 받아쓰기 전체
  "disablePlugins": true,                // 플러그인 시스템 전체 (사용자 설정을 덮어쓰는 유일한 스위치)
  "requireComputerUseApproval": true,    // Computer Use 변경 동작 전 사용자 확인
  "disableMobileEmulator": true,         // 로컬 시뮬레이터/AVD 스트리밍 (페어링과 다른 스위치)
  "disableExternalAutomations": true,    // hermes/openclaw 크론 레인
  "disableAgentInstallSuggestions": true, // "직접 설치하세요" 안내 표면
  "disableVendorLinks": true,            // Discord/X/공개 이슈 트래커/벤더 문서로 나가는 링크 (사내 GHES는 예외)

  // 사내에서 직접 서비스하는 모델 (§3-2). 토큰은 여기 넣지 않습니다 — 사용자가 앱에서 입력합니다.
  // 호스트는 allowedNetworkHosts에 자동 추가되므로 아래에 또 적을 필요가 없습니다.
  "llmEndpoints": [
    {
      "id": "ds-llm",
      "label": "사내 LLM (Qwen3-Coder)",
      "baseUrl": "https://llm.samsungds.net/v1", // https 필수 (루프백만 예외)
      "api": "openai",                            // 사내 서비스가 말하는 프로토콜
      "model": "qwen3-coder"
    }
  ],

  // Bedrock(claude) + 사내 게이트웨이 자격증명으로 연동되는 opencode + 위 사내 모델만 남기고
  // 나머지 벤더를 탐지·UI·폴링에서 제거 (§3-3).
  // ⚠️ "claude-agent-teams"는 "claude"와 별개 id입니다 — Agent Teams를 쓸 거면 함께 적으세요.
  // ⚠️ 이 키는 lockdown을 상속하지 않습니다. 적지 않으면 에이전트 제한이 전혀 걸리지 않습니다.
  "allowedAgents": ["claude", "opencode"],

  // 하드 허용목록은 옵트인입니다. 켜기 전에 반드시 §5를 읽으세요.
  "enforceNetworkAllowlist": false,
  "allowedNetworkHosts": []
}
```

### 4-2. 최소 예제

```jsonc
{ "lockdown": true }
```

일곱 개 스위치가 전부 켜집니다. `githubEnterpriseHost`가 없으므로 GHES 호스트는 `GH_HOST` → `gh` 자체 설정의 기본 호스트 순으로 폴백을 시도하고, 그것도 없으면 허용목록 자동 추가·로그인 대상 기본값·GHES 퍼머링크 인식이 동작하지 않습니다 — 사내 GHES를 쓴다면 §4-1처럼 반드시 명시하세요.

### 4-3. 잠그되 한 스위치만 예외로 허용

명시적 `false`가 상속을 이깁니다 (`enterprise-policy.ts:361`).

```jsonc
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",
  // 나머지는 lockdown을 상속해 계속 꺼짐
  "disableStarNag": false
}
```

⚠️ `disableAutoUpdate: false`는 예외로 쓸 수 없습니다 — 이 포크는 인앱 업데이터를 코드에서 제거했으므로(§3-0) 그 키를 되돌려도 살아날 코드가 없습니다. 업데이트 배포는 정책이 아니라 사내 재배포로 처리하십시오.

## 5. `enforceNetworkAllowlist` — 옵트인 하드 허용목록

**`lockdown: true`여도 자동으로 켜지지 않습니다.** 잘못된 허용목록은 다른 스위치들이 만들 수 없는 방식으로 배포를 망가뜨릴 수 있어서, 관리자가 명시적으로 켜도록 되어 있습니다 (`src/shared/enterprise-policy.ts:386-388`, `src/main/enterprise/enterprise-network-guard.ts:15-16`).

### 무엇을 덮는가

| 레인 | 구현 | 차단 방식 |
| --- | --- | --- |
| 렌더러/세션 요청 | `session.defaultSession.webRequest.onBeforeRequest` (`enterprise-network-guard.ts:87-97`) | `callback({ cancel: true })` — 조용히 취소 |
| 메인 프로세스 global `fetch` | 전역 `fetch` 래퍼 (`:99-122`) | Promise reject + 에러 메시지 |

설치 시점은 `src/main/index.ts:2211`(프록시 설정 적용 직후, `:2203`). 그 이전에 발생한 요청은 덮지 않습니다.

### 무엇을 덮지 않는가 (중요)

- **서브프로세스 트래픽 전부가 이 밖에 있습니다** — `gh`, `glab`, `git`, 에이전트 CLI(claude/codex/…), SSH 릴레이, agent-browser 헬퍼. 이들은 Electron 세션도, 메인 프로세스의 `fetch`도 쓰지 않습니다. 이 스위치는 **"Orca 자체 트래픽 통제"**이지 사내망 통제가 아닙니다. 망 차원 통제는 방화벽/프록시로 별도 수행해야 합니다.
- **임베디드 브라우저**는 설계상 예외입니다. `persist:` 파티션에서 돌고 그 자리의 `onBeforeRequest` 슬롯은 인증서 게이트가 이미 소유하고 있어, 여기에 두 번째 리스너를 걸면 그 게이트를 조용히 대체하게 됩니다 (`enterprise-network-guard.ts:9-13`).
- 루프백(`localhost`, `*.localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`)은 항상 통과 (`:47-55`). `http`/`https`가 아닌 스킴과 파싱 불가 URL도 통과 (`:58-71`).

### 매칭 규칙

`allowed.has(host)` — **정확한 호스트 문자열 일치입니다** (`:74-77`). 와일드카드도, 서브도메인 자동 포함도 없습니다. `example.com`을 올려도 `www.example.com`은 차단됩니다. 포트는 정규화 단계에서 제거되므로 매칭에 쓰이지 않습니다 (`enterprise-policy.ts:238`). `githubEnterpriseHost`는 자동으로 목록에 들어갑니다 (`:369-372`).

### 아바타·에셋 호스트를 빠뜨리고 켜면 깨지는 것

- **저장소/에이전트 카탈로그 파비콘**: `www.google.com` (`src/renderer/src/lib/agent-catalog.tsx:397`, `src/renderer/src/lib/open-in-app-catalog.tsx:66`) → 아이콘이 전부 깨집니다.
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

**설치 프로그램이 기본 정책을 이미 싣고 있습니다.** `orca-windows-setup.exe`를 돌린 PC는 별도 배포 단계 없이 §4-1 내용으로 잠깁니다. 아래 절차는 **그 기본값을 중앙에서 덮어쓰고 싶을 때**만 필요합니다.

### 6-1. Windows

배치 경로: `C:\ProgramData\Orca\enterprise-policy.json`

> ℹ️ **이 GPO 배치는 이제 선택입니다.** 설치만으로 §4-1 정책이 걸리므로(§2 표 2순위), 아래는 ① 사내 사정으로 값을 바꿔야 하는데 앱을 다시 빌드·재배포하고 싶지 않을 때, ② 일부 부서만 다른 값을 써야 할 때, ③ 관리자 소유 ACL이 걸린 파일로 준수 여부를 Intune 콘솔에서 감시하고 싶을 때 씁니다. 머신 전역 경로는 번들보다 **위**라서 언제든 이깁니다.
>
> 🔴 **바꿔 말하면, 배치하기로 했다면 그 파일의 문법을 반드시 검증하세요.** 문법이 깨진 파일은 무시되고 **번들 정책으로 되돌아갑니다**(§2) — 잠금이 풀리지는 않지만, 관리자가 의도한 예외(예: `disableStarNag: false`)가 조용히 사라진 채 잠긴 상태로 돕니다. 확인은 §7-2 트레이스의 `…source_path`와 `…warnings`입니다.

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

> 이 절은 **플릿에 배포된 앱**을 진단하는 방법입니다. 정책 파일을 작성하면서 반복 확인하는 단계라면 소스에서 띄운 개발 인스턴스가 훨씬 빠릅니다 — 임의 경로의 파일을 환경변수로 물릴 수 있고(§2), 아래 §7-3의 stderr 원문이 터미널에 그대로 보입니다. 절차는 [로컬 실행 가이드](./local-dev-run.md), 화면만 볼 때는 [macOS dev UI 확인 가이드](./macos-dev-ui-check.md).

### 7-1. 앱 동작으로 확인하기 (빠른 점검)

패키징된 앱의 stderr는 보기 어렵습니다(§7-3). 아래는 대체로 UI/동작만으로 확인하는 방법입니다 — 스위치가 실제로 어떤 값으로 해석됐는지 확정하는 것은 §7-2의 `enterprise.policy` 스팬이고, 이 표는 그 전의 빠른 점검용입니다.

| 확인 대상 | 방법 | 기대 결과 |
| --- | --- | --- |
| `disableCloudRelay` | 설정에서 Orca Cloud 프로필 연결 시도 | 정책과 무관하게 항상 실패합니다(v1.4.178~). 토스트 `Orca Cloud sign-in is not configured` + 설명 **`Orca Cloud sign-in is removed in this build. …`** — 문구가 "disabled by an enterprise policy"로 나오면 제거 가드가 리베이스에서 사라졌다는 뜻이므로 [감사 §3.1](./external-integrations-audit.md)의 검증 명령을 돌리십시오 |
| `disableAutoUpdate` | — | 확인할 것이 없습니다. 업데이트 표면은 정책과 무관하게 코드에 존재하지 않습니다 — 앱/Help 메뉴, 트레이, 사이드바 `?` 메뉴, 설정 → 일반 어디에도 "업데이트 확인" 항목이 없습니다 |
| `disableMobilePairing` | 사이드바·설정 → 모바일, Cmd+J에 `mobile` | 진입점이 전부 사라집니다. 이미 페어링된 폰은 RPC가 `forbidden`으로 거부됩니다 |
| `disableVendorProviderAccounts` | 설정 → AI 제공업체 계정 | Claude 구독/Codex/Gemini/OpenCode/MiniMax/Grok 섹션이 사라지고 **사내 게이트웨이 로그인과 사내 자체 호스팅 모델만** 남습니다. 이미 등록된 계정의 제거는 계속 가능합니다 |
| `disableRemoteOrcaServer` | 설정 → 원격 Orca 서버, 새 워크스페이스의 실행 대상 피커 | 섹션과 "Add Remote Orca Server" 항목이 사라집니다. **설정 → SSH 호스트는 그대로 남아야 정상입니다**. v1.4.162가 피커를 `components/new-workspace/RunTargetCombobox.tsx`로 추출한 뒤로 이 행의 게이트는 **부모가 `onAddRemoteServer`를 넘기지 않는 것**입니다 (`NewWorkspaceComposerCard.tsx`) — 자식 컴포넌트에는 정책 임포트가 없으니 그쪽만 grep하면 게이트가 없어 보입니다. 회귀 방지는 `NewWorkspaceComposerCard.policy.test.tsx` |
| `disableVoice` | 설정 → 음성, 컴포저의 마이크 버튼, `Mod+E` | 탭·버튼·단축키 행이 모두 사라집니다 |
| `disablePlugins` | 설정 → 플러그인, 우측 사이드바의 플러그인 패널 탭, Cmd+J의 `plugins` | 팬이 사이드바·설정 검색·Cmd+J·딥링크에서 모두 사라지고, 설치돼 있던 플러그인 패널 탭도 없어집니다. ⚠️ **정책 배포 전에 이미 플러그인을 켰던 기계**는 설정 파일에 `pluginSystemEnabled: true`가 남아 있으므로 렌더러도 정책을 직접 읽습니다(`right-sidebar/index.tsx`) — 안 그러면 없는 IPC 채널을 호출하는 탭이 그려집니다 |
| `requireComputerUseApproval` | 에이전트에게 다른 앱을 클릭/입력하라고 지시 | 동작 직전에 네이티브 확인 창. **거부가 기본 버튼이고 Esc도 거부**입니다. 읽기(스크린샷·트리)는 묻지 않습니다 |
| `disableTelemetry` | 설정 → Privacy | 진단 비활성 안내 박스 표시 (`src/renderer/src/components/settings/PrivacyDiagnosticsSection.tsx:240-241`) |
| `disableUsagePolling` | 설정 사이드바, Cmd+J에 `통계` / `usage`, 상태바 사용량 칩 | **설정 → 통계 및 사용량 팬이 사라집니다** (사이드바·Cmd+J·설정 검색 전부). 상태바 팝오버의 "Usage details & history" 항목도 없어집니다. 칩 자체는 남되 영구 스피너 없이 `unavailable` 상태 (`rate-limits/service.ts:1614`) |
| `disableMobileEmulator` | 설정 → 모바일 에뮬레이터, `+` 메뉴, 설정 → 단축키에 `simulator`, 터미널에서 `orca emulator devices` | 팬·메뉴 항목·단축키 행이 모두 사라지고, **이전에 열려 있던 시뮬레이터 탭도** 탭바에서 없어집니다. CLI는 `emulator_disabled_by_policy`로 거부합니다. ⚠️ 설정 → 모바일(페어링) 팬은 **그대로 남아야 정상**입니다 — 다른 스위치입니다 |
| `disableExternalAutomations` | 사이드바 → 자동화 | Hermes/OpenClaw 소스 행이 사라지고 Orca 자동화만 남습니다. 새 자동화 다이얼로그의 Orca/Hermes 대상 토글도 사라집니다(선택할 대상이 하나뿐이므로). ⚠️ 이미 등록된 `~/.hermes` 크론 잡은 **Hermes 자신의 스케줄러로 계속 실행됩니다** — `hermes cron rm`으로 제거하세요 |
| `disableAgentInstallSuggestions` | 설정 → 에이전트 하단, 설정 → Setup Guide | "설치 가능" 섹션이 사라집니다. 감지된 에이전트가 하나도 없으면 대신 "사내 소프트웨어 배포를 통해 설치한 뒤 새로 고침하세요" 안내가 뜹니다(빈 화면이 아니어야 정상). 감지된 에이전트 행의 링크는 `Docs`로 남습니다 — 설치 링크가 **전부** 사라지는 것은 아닙니다 |
| `disableVendorLinks` | 사이드바 하단 `?` 메뉴, `?` → 피드백 보내기 | `?` 메뉴에서 **Docs/Changelog/GitHub/Discord/X 블록이 통째로** 사라지고(구분선까지 함께 — 남으면 게이트가 반쪽입니다), 피드백 다이얼로그 상단의 커뮤니티 카드도 사라집니다. 남는 것은 설정·단축키·기능 투어 같은 로컬 항목뿐입니다. ⚠️ **설정 → Privacy의 "Privacy policy" 링크와 설정 → 일반의 GitHub 링크는 화면에 그대로 남습니다** — 눌러도 메인 프로세스 초크포인트가 막아 아무 일도 일어나지 않습니다(무반응). 표시까지 없애는 것은 후속 작업입니다(감사 문서 §0.2 #20) |
| `allowedAgents` | 설정 → 에이전트, `+` 메뉴, 워크트리 생성 다이얼로그 | 목록에 허용한 id만 남고, **워크트리 생성 다이얼로그에 미리 선택된 에이전트**도 허용 목록 안의 것이어야 합니다. `orca worktree create --agent <차단된 id>`는 그 에이전트가 감지되지 않으므로 선택되지 않습니다. ⚠️ 이 키는 `lockdown`을 상속하지 않습니다 — `{"lockdown": true}`만 있는 파일은 에이전트를 **전혀** 제한하지 않습니다. 화면에 차단했어야 할 에이전트가 보이면 **먼저 §7-2의 `enterprise.policy.allowed_agents`를 보세요**: `(unrestricted)`면 정책 파일 문제, 목록이 찍혀 있으면 화면 문제입니다. 번들 정책에 이 키가 빠지거나 형식이 깨진 채로 설치 파일이 만들어지는 것은 패키징 단계에서 막습니다(`config/scripts/verify-packaged-enterprise-policy.cjs`) |
| `disableSpellcheck` | 입력창에 오타 입력 | 빨간 물결 밑줄이 생기지 않음 (`createMainWindow.ts:306`) |
| `disableStarNag` | 앱을 한동안 사용 | star 요청 카드/토스트가 뜨지 않음 (`github/client.ts:341-343`) |
| `disableManagedClaudeAccounts` | WSL 런타임으로 Claude 세션 스폰 | **UI로는 확인할 수 없습니다** — 계정 스위처 화면은 그대로 뜹니다. 관측 가능한 신호는 WSL Claude 세션이 `AWS_BEARER_TOKEN_BEDROCK` 등을 이유로 스폰 실패하던 증상이 사라지는 것(`ipc/pty.ts:4576-4580`, `:6164-6168`)과, §7-2의 `enterprise.policy` 스팬에 찍힌 스위치 값입니다 |
| `githubEnterpriseHost` | GHES 리모트 저장소에서 PR 목록 열기 + 설정 → GitHub Enterprise 팬 열기 | 정상 조회. 팬의 로그인 대상 호스트가 정책 값으로 채워져 있어야 하고(`src/main/ipc/github-enterprise.ts:83-86`), GHES blob/commit URL이 파일 링크로 열려야 함(`src/main/git/hosted-remote-url.ts:38-42`). `enforceNetworkAllowlist`를 켰다면 그 호스트가 목록에 없어도 통과해야 함(자동 추가) |
| 호스트 폴백(정책 없이 `gh`만 로그인한 기계) | 설정 → Git 및 소스 제어 → "Git 호스트" | 출처가 **"gh가 로그인되어 있는 호스트에서"** 로 표시되고 값이 사내 호스트여야 합니다. `github.com`/"gh 기본값"으로 보이면 `gh auth status`에 사내 호스트가 없거나 두 개 이상 로그인돼 있는 것입니다(둘 이상이면 gh 자신도 `github.com`을 기본값으로 쓰므로 추정하지 않습니다) |

> Privacy 안내 박스는 정책 파일이 사유일 때 **`An enterprise policy file disables diagnostics on this machine.`** 를 표시합니다. 사유 코드 `enterprise_policy`(`observability/index.ts:128`)에 대응하는 전용 분기가 `PrivacyDiagnosticsSection.tsx:306-310`에 있습니다. 이 문구가 보이면 정책 파일이 적용된 것입니다 — 환경변수를 찾아볼 필요가 없습니다.

### 7-2. 로컬 로그로 확인하기

`disableTelemetry`가 켜져도 **로컬 NDJSON 로깅은 유지**되므로(`observability/index.ts:120-133`) 잠금 상태에서도 이 확인은 동작합니다. 단 §1의 `ORCA_DIAGNOSTICS_DISABLED`를 배포에 심으면 로컬 파일 기록까지 꺼져(`:113-119`) **이 절의 확인 수단이 통째로 사라집니다** — 그 변수는 이 검증과 양립하지 않습니다.

- 파일: `%APPDATA%\Orca\logs\main.trace.ndjson` — 즉 `<userData>/logs/main.trace.ndjson` (`src/main/observability/logs-directory.ts:27-29`, `:32-34`). macOS는 `~/Library/Application Support/Orca/logs/`, Linux는 `~/.config/Orca/logs/` 아래 같은 파일명입니다.
- **정책 해석 결과 자체가 이 파일에 스팬 하나로 남습니다.** 스팬 이름은 `enterprise.policy`이고, `initObservability()` 직후에 딱 한 번 기록됩니다 (`src/main/enterprise/enterprise-policy-trace.ts:36`, 호출부 `src/main/index.ts:2312`). 속성에 실제로 적용된 파일 경로(`enterprise.policy.source_path` — 못 찾았으면 `(none found)`, `enterprise-policy-trace.ts:18`), 탐색한 후보 목록(`…searched_paths`), `…lockdown`, 상속 스위치 전부(현재 17개, `…switches` — `LOCKDOWN_INHERITING_KEYS`를 그대로 순회하므로 스위치가 늘면 자동으로 함께 늘어납니다), `…github_enterprise_host`, `…enforce_network_allowlist`, `…allowed_network_hosts`, **`…allowed_agents`**, 그리고 §7-3의 경고 원문 전부(`…warnings`)가 들어갑니다 (`:39-58`).
- 🔎 **`enterprise.policy.allowed_agents`가 "에이전트 피커에 왜 codex가 보이나"의 답입니다.** 이 키는 `lockdown`을 상속하지 않으므로 나머지 속성이 전부 잠긴 것으로 보여도 여기만 `(unrestricted)`일 수 있습니다 — 그 값이면 정책은 적용됐지만 **에이전트 제한은 전혀 걸려 있지 않은 상태**이고, 원인은 키 누락·오타·배열 아님 중 하나입니다(`…warnings`에 원문이 있습니다). `["claude","opencode"]`처럼 목록이 찍혀 있는데도 화면에 다른 에이전트가 보인다면 그때는 정책이 아니라 화면 쪽 문제입니다.

```powershell
# 어떤 정책 파일이 적용됐고 어떤 스위치가 켜졌는지 — 플릿 검증의 1차 수단
Select-String -Path "$env:APPDATA\Orca\logs\main.trace.ndjson" -Pattern "enterprise.policy"
```

### 7-3. stderr 메시지 원문

정책 로더의 모든 출력은 `process.stderr`에 `[enterprise-policy] ` 접두사로, 한 줄씩 나갑니다 (`enterprise-policy-file.ts:131-136`). 같은 메시지가 최대 32개까지 버퍼링되어(`:120`, `:133-135`) §7-2의 `enterprise.policy` 스팬 `…warnings` 속성으로도 나가므로, **아래 표는 "무슨 메시지가 있는가"의 목록이고 실제로 읽는 곳은 트레이스 파일입니다.**

| 상황 | 정확한 출력 | 구현 |
| --- | --- | --- |
| 파일을 열 수 없음 (ENOENT 제외 — 권한/마운트 등) — **다음 후보로 넘어감** | `[enterprise-policy] could not read <경로>: <에러 문자열>` | `:172-178` |
| 파일 문법 오류 — **다음 후보로 넘어감**(§2) | `[enterprise-policy] <경로> is not valid JSON; ignoring it.` | `:187-194` |
| 최상위가 객체가 아님 | `[enterprise-policy] <경로>: Policy file must contain a JSON object; ignoring its contents.` | `enterprise-policy.ts:349` |
| 모르는 키 | `[enterprise-policy] <경로>: Unknown policy key "<키>" ignored.` | `:354` |
| boolean 자리에 이상한 값 | `[enterprise-policy] <경로>: "<키>" must be true or false; ignoring <값>.` | `:221` |
| 호스트 자리에 문자열이 아닌 값 | `[enterprise-policy] <경로>: "<키>" must be a string hostname; ignoring <값>.` | `:252` |
| 호스트가 빈 문자열 | `[enterprise-policy] <경로>: "<키>" is blank; ignoring it.` | `:257` |
| `allowedNetworkHosts`가 배열이 아님 | `[enterprise-policy] <경로>: "<키>" must be an array of hostnames; ignoring <값>.` | `:308` |
| 배열 원소가 호스트가 아님 | `[enterprise-policy] <경로>: "<키>" entry <값> is not a hostname; ignoring it.` | `:317` |

파일을 아예 못 찾은 경우 경로 자리에는 `(no file)`이 들어갑니다 (`enterprise-policy-file.ts:360`).

**Windows에서 이 메시지를 stderr로 직접 보는 방법 — 솔직하게 말하면 어렵습니다.** 패키징된 Orca는 GUI 서브시스템 앱이라 콘솔이 붙지 않고, 시작 메뉴로 띄운 프로세스는 fd 2에 내용 없는 스텁을 받아 이 줄들이 통째로 사라집니다 (`enterprise-policy-file.ts:127-130` 주석). **바로 그래서 §7-2의 스팬이 있습니다 — 정상적인 확인 경로는 그쪽입니다.** stderr를 굳이 원본 그대로 봐야 한다면 **cmd에서 파일로 리디렉션**해 띄우는 방법뿐입니다(자식 프로세스가 리디렉션된 핸들을 상속합니다).

```bat
"%LOCALAPPDATA%\Programs\<설치폴더>\Orca.exe" > "%TEMP%\orca-stderr.log" 2>&1
```

실행 파일 이름은 `Orca.exe`이고(`config/electron-builder.config.cjs:325`), `nsis` 블록에 `oneClick`/`perMachine`/`installDirectory`를 지정하지 않아(`:356-365`) electron-builder 기본값인 per-user 원클릭 설치가 적용되므로 설치 위치는 `%LOCALAPPDATA%\Programs\` 하위입니다 — 정확한 폴더명은 바탕화면 바로가기 속성에서 확인하세요([Windows 사내 빌드 가이드](./windows-corporate-build.md) 참고). 앱을 종료한 뒤 `%TEMP%\orca-stderr.log`를 확인하세요. 이 방식은 진단용 1회성이며, 플릿 검증에는 부적합합니다. **플릿 검증의 실질적 수단은 §7-2의 `enterprise.policy` 스팬과 §7-1의 동작 확인**이고, 배포 검증은 §6의 파일 해시 비교(Intune 검색 규칙 등)로 하는 것이 맞습니다.

### 7-4. 자주 밟는 함정

| 증상 | 원인 | 대처 |
| --- | --- | --- |
| 아무 잠금도 안 걸림, 경고도 없음 | 경로 오타/파일 없음. **ENOENT는 경고를 내지 않습니다** (`enterprise-policy-file.ts:172-178`) — 비기업 설치의 정상 경로이기 때문. **패키징 빌드에서 이 증상이 나온다면 번들 정책까지 없다는 뜻**이므로 사내 인스톨러가 아닌 공개 빌드를 깔았는지 먼저 의심하세요 | §7-2 스팬의 `…source_path`가 `(none found)`인지, `…searched_paths`에 어떤 경로를 뒤졌는지 확인. 그다음 경로를 문자 그대로 대조 (`%ProgramData%`는 보통 `C:\ProgramData`) |
| **머신 전역 파일을 배포했는데 그 안의 예외가 안 먹음** | 그 파일의 JSON 문법 오류. 파싱에 실패한 후보는 건너뛰고 **다음 후보(= 번들 정책)가 적용됩니다** (`:187-194`). 잠금이 풀리지는 않지만 관리자가 의도한 값은 사라집니다 | §7-2 스팬의 `…source_path`가 번들 경로를 가리키고 `…warnings`에 `is not valid JSON`이 있는지 확인. 배포 전 문법 검증을 파이프라인에 넣으세요. 검증 도구는 **JSONC를 이해하는 것**을 쓰세요 — 엄격한 JSON 파서는 주석과 후행 쉼표를 오류로 잡지만 앱은 둘 다 허용합니다 |
| **사용자가 설치 폴더의 번들 정책을 지움** | per-user NSIS 설치라 설치 폴더(`%LOCALAPPDATA%\Programs\…`)가 그 사용자 소유입니다 — 표준 사용자가 파일을 지울 수 있습니다 ([외부 연동 감사](./external-integrations-audit.md) §0.2 #21) | 머신 전역 경로에 ACL을 건 파일을 배포하면(§6-1) 번들이 지워져도 1순위가 남습니다. 탐지는 §7-2 스팬의 `…source_path` — 잠긴 플릿에서 `(none found)`이 보이면 그 PC입니다 |
| 특정 스위치만 안 먹음 | 키 오타 또는 값 오타. 둘 다 "부재"로 처리되어 `lockdown`을 상속 (`enterprise-policy.ts:221`, `:354`) | §7-2 스팬의 `…warnings`에서 경고 확인(원문은 §7-3). `lockdown: true`면 상속 덕에 결과적으로는 켜져 있습니다 |
| `enforceNetworkAllowlist: true`인데 안 막힘 | 루프백/비 http(s) 요청이거나, 서브프로세스 트래픽이거나, 임베디드 브라우저 | §5의 범위 표 확인 |
| 파일을 고쳤는데 그대로임 | 프로세스당 1회 읽고 캐시 (`enterprise-policy-file.ts:325-368`) | 앱 재시작 |
| 사용자가 자기 파일로 풀어버림? | 불가능. 머신 전역·번들이 먼저 읽히면 `%APPDATA%`의 사용자 파일은 읽히지 않음 (`:89-114`) | — |
| **사용자가 `setx ORCA_ENTERPRISE_POLICY off`로 풀어버림?** | 패키징 빌드에서는 불가능. 환경변수는 후보를 추가만 하고 머신 전역·번들이 항상 먼저 탐색됩니다 (`:99-113`, `:228-234`) | 단, **`pnpm dev`로 띄운 비패키징 인스턴스에는 그대로 듣습니다.** 사용자 PC에 개발 체크아웃을 두지 마세요 |
| 개발 인스턴스로 커스텀 경로를 지정했는데 무시됨 | 패키징 빌드로 시험했기 때문. 머신 전역·번들 파일이 있으면 환경변수 경로는 3순위라 읽히지 않습니다 (§2) | 커스텀 경로는 비패키징에서만 1순위입니다. 플릿에서는 번들 기본값 또는 머신 전역 경로를 쓰세요 |
| **설정 → 에이전트나 자동화 드롭다운에 `codex`·`gemini`·`copilot`이 그대로 보임** | 십중팔구 게이트 문제가 아니라 **정책이 하나도 적용되지 않은 인스턴스**를 보고 있는 것입니다. ① upstream Orca(사내 포크가 아닌 빌드)를 열었거나, ② `ORCA_ENTERPRISE_POLICY=off`가 걸려 있거나, ③ 이 포크 이전 버전의 `pnpm dev`. `allowedAgents`는 lockdown을 **상속하지 않으므로**, 정책 파일이 없으면 제한이 전혀 걸리지 않습니다 | §7-2 트레이스의 `…source_path`를 먼저 보세요 — `(none found)`이면 정책 자체가 없는 것이라 UI 코드를 아무리 고쳐도 바뀌지 않습니다. 그다음 `…allowed_agents`에 `claude`·`opencode`가 있는지 확인. 사내 포크의 체크아웃이라면 `pnpm dev`만으로 4순위 후보가 잡힙니다(§2) |
| **설치본은 최신인데 잠금은 걸렸고 에이전트 제한만 안 걸림** | `allowedAgents`가 없는 **옛 머신 전역 파일**이 채택된 것입니다. `lockdown`은 상속되므로 나머지 스위치는 전부 켜진 것처럼 보이고, 설정 → 에이전트에는 `disableAgentInstallSuggestions` 때문에 "설치 가능" 섹션이 비어 **감지된 에이전트 한 줄만** 남습니다 — 그 비대칭이 이 시나리오의 지문입니다 | v1.4.168 이후로는 §2-1 바닥선이 내장값을 채우므로 저절로 해결됩니다. 그 전 빌드라면 `…source_path`가 가리키는 파일에 `allowedAgents`를 추가해 재배포하거나 그 파일을 지우세요. 바닥선이 개입했는지는 `…baseline_applied_keys`로 확인합니다 |
| 테스트/CI에서 정책이 안 먹음 | 의도된 동작. `config/vitest-enterprise-policy-isolation.ts`가 `ORCA_ENTERPRISE_POLICY=off`, `GH_HOST` 삭제, `GH_CONFIG_DIR`을 없는 경로로 고정. 테스트 러너는 비패키징이라 이 값들이 유효합니다 | — |
| **`gh`를 사내 호스트로 바꿨는데 앱은 계속 github.com으로 보임** | 원인이 셋입니다. ①`gh auth login --hostname`은 환경변수가 아니라 `hosts.yml`에 씁니다 → 이제 앱이 그 파일을 읽습니다(§3-4). ②userData의 `github-enterprise-host.json`에 `github.com`이 저장돼 있으면 관리자 정책보다 우선했습니다 → 이제 벤더 호스트는 저장되지 않습니다. ③`gh`에 두 개 이상의 호스트가 로그인돼 있으면 `gh` 자신이 `github.com`을 기본값으로 쓰므로 앱도 추정하지 않습니다 | 설정 → Git 및 소스 제어의 "Git 호스트" **출처 문구**를 먼저 보세요(§7-1 표). 그다음 `gh auth status`로 로그인된 호스트가 사내 것 **하나뿐인지** 확인하고, 여러 개면 `gh auth logout --hostname github.com`. 확정적으로 못 박으려면 정책 파일에 `githubEnterpriseHost`를 적으세요 — 추론에 의존하지 않는 유일한 방법입니다 |
| 리포지토리를 추가한 뒤 origin을 사내 미러로 바꿨는데 계속 github.com으로 보임 | **위와 다른 문제입니다.** `Repo.gitRemoteIdentity`(`repo-git-remote-identity-enrichment.ts`)와 `Repo.upstream`(`repo-icon-autodetect.ts`)은 추가 시점에 1회만 판정하고 다시 프로브하지 않습니다 — 정책이나 `gh` 설정과 무관합니다 | 해당 프로젝트를 제거하고 다시 추가하세요. 이 증상이 "재설치해야 고쳐진다"로 보이는 두 번째 경로입니다 |

### 7-5. `llmEndpoints` 확인

**엔드포인트가 배포됐는지**: 설정 → AI 제공업체 계정 → "사내 자체 호스팅 모델"(영문 UI: Accounts → Self-hosted models)에 항목이 뜨는지 봅니다. 목록이 비어 있으면 정책 파일에 항목이 없거나 전부 검증에서 버려진 것이니, §7-2 스팬의 `…warnings`를 확인하세요.

⚠️ **목록에 있다는 것만으로 관리자가 배포했다는 뜻은 아닙니다** — 이 화면은 정책 엔드포인트와 사용자가 직접 추가한 엔드포인트를 구분 없이 함께 보여줍니다(§3의 사용자 직접 추가 레인). 관리자 배포분만 확정하려면 §7-2 스팬을 보세요.

**세션이 실제로 사내 LLM을 쓰는지**: 그 세션의 터미널에서 선택자를 직접 확인할 수 있습니다. 비밀이 아니라서 일부러 노출해 둔 값입니다.

```powershell
echo $env:ORCA_CORPORATE_LLM_ENDPOINT   # PowerShell 패널
```
```bash
echo "$ORCA_CORPORATE_LLM_ENDPOINT"     # WSL/bash 패널
```

**선택이 무시됐을 때**: 스폰은 죽지 않고 기존 백엔드를 유지하므로 증상이 조용합니다. 결과별로 1회씩 stderr에 다음이 나갑니다 (`src/main/enterprise/corporate-llm-launch-report.ts:30`, 문구는 `corporate-llm-launch-injection.ts:66-75`).

| 상황 | 메시지 (`[corporate-llm]` 접두) |
| --- | --- |
| 적용됨 | `using corporate LLM endpoint "<id>" (<baseUrl>)` |
| 목록에 없는 id | `ignoring unknown corporate LLM endpoint "<id>" — it is not a policy-provisioned or user-added endpoint` |
| 토큰 미저장 | `no token saved for corporate LLM endpoint "<id>" — the launch keeps its existing backend` |

> §7-2와 같은 한계가 여기도 적용됩니다 — 시작 메뉴로 띄운 Windows GUI 프로세스는 stderr가 빈 스텁이라 이 줄들이 보이지 않습니다. 실무적으로는 위 `echo`로 확인하세요.

**토큰이 저장됐는지**: UI가 "Token saved" / "No token"으로 표시합니다. 파일 존재로도 확인할 수 있지만 내용은 DPAPI로 암호화돼 있어 읽을 수 없습니다.

```powershell
Test-Path "$env:APPDATA\Orca\corporate-llm-tokens\ds-llm.token"
```

---

## 8. 정책 파일이 덮지 않는 것

과신하지 마세요. 아래는 §3의 **기능 스위치로는 막히지 않습니다**. 일부는 옵트인 `enforceNetworkAllowlist`(§5)로만 막히고, 나머지는 정책 파일의 사정 범위 밖입니다.

- **서브프로세스 트래픽 전부** — `gh`, `glab`, `git`, 에이전트 CLI, SSH 릴레이. 정책은 Orca 프로세스 안에서만 동작하므로 허용목록으로도 막히지 않습니다. 이들은 프록시(`HTTPS_PROXY`/`NO_PROXY`)·사내 CA(`NODE_EXTRA_CA_CERTS`)·방화벽으로 다뤄야 합니다.
- **사내 LLM 엔드포인트로 나가는 것(§3-2)** — 위 항목의 구체적인 사례입니다. 프롬프트와 소스는 **에이전트 CLI가** 보내므로 Orca의 어떤 네트워크 통제도 관여하지 않습니다. 유효한 토큰을 가진 사용자는 그 엔드포인트로 소스를 보낼 수 있고, 정책 파일은 **어느 엔드포인트가 목록에 오르는지만** 통제합니다. 전송 내용에 대한 통제는 엔드포인트 쪽 서비스의 로깅·감사에서 해야 합니다.
- **Claude Code CLI 자체의 Bedrock 트래픽** — Orca가 스폰한 CLI가 `bedrock-runtime.<region>.amazonaws.com`으로 나가는 것은 서브프로세스 트래픽이며 정책 파일 밖입니다. 이것은 의도된 정상 경로입니다.
- **받아쓰기(STT) → `api.openai.com`** (엔드포인트 `src/main/speech/openai-transcription-client.ts:8`, 전송은 `:118`) — 전용 스위치가 없습니다. 메인 프로세스의 global `fetch`라서 `enforceNetworkAllowlist`를 켜면 그 레인에서는 막히지만, 기본 상태가 3중 옵트인(`voice.enabled: false` + 모델 미선택 + API 키 미설정)이라 켜지 않는 편이 확실합니다([외부 연동 감사](./external-integrations-audit.md) §4).
- **렌더러의 외부 이미지** — 파비콘(`www.google.com`), 아바타, 티켓 첨부. `enforceNetworkAllowlist`를 켜야만 차단됩니다(§5).
- **임베디드 브라우저** — 설계상 허용목록 예외 (`enterprise-network-guard.ts:9-13`).
- **앱 설정(사용자 설정)** — 사이드바 카드의 PR/CI 백그라운드 갱신처럼 사용자 설정으로 켜지는 조회는 정책 파일이 강제하지 않습니다([외부 연동 감사](./external-integrations-audit.md) §1, §7 레벨 1).
- **빌드 시점 phone-home** — `ORCA_DISABLE_PUBLISH_TARGET=1`은 빌드 셸의 문제이며 정책 파일과 무관합니다 (`config/electron-builder.config.cjs:543-551`).

> **정정 — `platform.claude.com` OAuth 토큰 회전은 이제 이 목록에 없습니다.** 예전 판은 "전용 스위치가 없고, 관리형 Claude 계정을 안 쓰면 발생하지 않으니 코드로 막지 않았다"고 적었습니다. `disableManagedClaudeAccounts`(§3-1)가 그 구멍을 닫았습니다 — 회전(`src/main/claude-accounts/oauth-refresh.ts:131-133`에서 조기 차단)과, 관리형 계정이 Bedrock 자격증명을 PTY로 가는 길에 지우는 동작(`src/main/claude-accounts/environment.ts:22`, `src/main/claude-accounts/runtime-auth-service.ts:613-616`)이 같은 스위치로 함께 꺼집니다. `lockdown: true`면 자동입니다.

> 반대로 **오해하지 말 것**: Gemini/MiniMax/OpenCode/Kimi 사용량 조회는 "기본 옵트인"이지만 **`disableUsagePolling`이 확실히 덮습니다.** 이들의 fetcher는 `runFetchAllCycle`(`src/main/rate-limits/service.ts:1631`) 안의 한 곳(`:1714-1755`)에서만 호출되고, 그 사이클로 들어가는 경로(`:1016`, `:1088`, `:1153`, `:1215`)가 전부 §3의 게이트를 지납니다.

전체 외부 연동 목록, 각 항목의 발동 조건과 전송 내용, 그리고 여기서 다루지 않은 잔여 리스크는 [외부 연동 감사](./external-integrations-audit.md)에 있습니다.
