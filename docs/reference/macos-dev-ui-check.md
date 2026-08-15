# macOS에서 dev 빌드로 사내 UI 확인하기

설치 프로그램(`.exe`)을 만들지 않고 **맥북에서 `pnpm dev`로 사내 커스터마이즈의 UI를 확인**하는 절차입니다.
배포는 여전히 Windows x64 전용이고([README §1](../../README.md)), 이 문서는 **화면 확인용 루프**만 다룹니다.

**핵심 1 — 아무 준비 없이 그냥 `pnpm dev`.** 체크아웃의 `resources/enterprise-policy.json`이 비패키징 탐색의
**마지막 후보**로 붙으므로([정책 문서 §2](./enterprise-policy.md)), 파일도 환경변수도 없이 띄우면 **플릿에
배포되는 것과 같은 정책**이 걸린 화면이 나옵니다. 잠금 **없는** 상태와 비교하고 싶을 때만
`ORCA_ENTERPRISE_POLICY=off`를 붙이세요.

> ⚠️ 확인하려는 화면이 **이 체크아웃에서 띄운 창인지** 먼저 확인하세요. `/Applications/Orca.app`(또는 사내 포크가
> 아닌 아무 빌드)에는 이 저장소의 커밋이 하나도 들어 있지 않습니다 — 거기서 "설정 → 에이전트에 codex가 아직
> 보인다"를 판정하면 코드를 몇 번을 고쳐도 그대로입니다. dev 인스턴스는 앱 이름이 **`Orca Dev`** 입니다
> (`src/main/startup/dev-instance-identity.ts`).

**핵심 2 — 값을 바꿔 보고 싶을 때.** `pnpm dev`는 비패키징이라 `ORCA_ENTERPRISE_POLICY`가 탐색의 **1순위**가
됩니다(`src/main/enterprise/enterprise-policy-file.ts`의 `enterprisePolicySearchPaths`). 즉 `%ProgramData%`도
`sudo`도 없이, 파일 하나를 만들고 환경변수로 가리키면 그 정책이 적용된 UI를 그대로 볼 수 있습니다(§3).

---

## 1. 확인할 수 있는 것과 없는 것

| 확인 가능 (macOS dev) | 확인 불가 — Windows 실기 필요 |
| --- | --- |
| 정책 파일 파싱·경고, 채택된 값 (trace 기록) | `%ProgramData%\Orca` ACL, 머신 전역 경로 우선순위 |
| 설정 → 연동의 **사내 GitHub (Enterprise)** 섹션과 정책 호스트 프리필 | `gh` 자격증명 저장소(맥은 Keychain, Windows는 gh 자체 저장소) |
| 설정 → AI 제공업체 계정의 **사내 자체 호스팅 모델** 섹션·추가·토큰 저장 | 토큰 암호화가 **DPAPI**로 되는지 (맥은 Keychain 항목 `Orca Dev Safe Storage`) |
| `allowedAgents`로 에이전트/모델 피커가 좁혀지는지 | NSIS per-user 설치, 무서명 실행 |
| **업데이트·피드백 항목이 메뉴·트레이·설정·사이드바에 아예 없는지** (정책 무관 — 코드에서 제거) | — |
| **설정 → 모바일 / 음성 / 원격 Orca 서버 탭이 사라지는지** | — |
| **AI 제공업체 계정에 사내 게이트웨이 로그인과 사내 모델만 남는지** (`disableVendorProviderAccounts`) | `gateway-cli` 실제 로그인 흐름(맥에 그 CLI가 없으면 미설치 경고까지만 확인 가능) |
| **Computer Use 승인 창** — 에이전트에게 다른 앱을 클릭시키면 확인 창이 뜨는지 | Windows `runtime.ps1` 경유 동작 |
| **"GitHub 요청이 가는 곳" 표시 — 설정 → 연동, 그리고 설정 → Git 및 소스 제어** | — |
| 잠금 상태의 화면 구성 전반(레이아웃·문구·번역) | WSL 런타임 패스스루, `powershell.exe` 기반 Computer Use |

정책 스위치 대부분은 **"네트워크로 안 나가는 것"** 이라 화면에 아무 변화가 없습니다. 그건 UI가 아니라 §4의 trace로 확인하세요.

> `pnpm dev:web`(브라우저에서 렌더러만)으로는 **정책 관련 화면을 확인할 수 없습니다.** 정책은 메인 프로세스가 읽고
> IPC로 넘기므로, Electron을 띄우는 `pnpm dev`여야 합니다.

---

## 2. 준비

```bash
corepack enable && corepack prepare pnpm@10.24.0 --activate
pnpm install            # postinstall이 네이티브 모듈을 Electron ABI로 컴파일합니다
```

`engines.node`는 24지만 강제되지 않습니다(경고만). Node 26에서도 동작합니다 — 이유는
[Windows 사내 빌드 가이드 §3](./windows-corporate-build.md)의 검증 내용과 같습니다(네이티브 모듈은 호스트 Node가 아니라
Electron 헤더로 빌드되고, 둘 다 N-API 애드온입니다).

`pnpm test`를 먼저 돌렸다면 `node-pty`가 Node ABI로 다시 맞춰져 있는데, `pnpm dev`가 앞단에서
`ensure:electron-runtime`을 실행해 Electron ABI로 되돌립니다. 따로 할 일은 없습니다.

---

## 3. 정책 파일 만들고 붙이기 — **값을 바꿔 볼 때만**

플릿과 **같은** 정책을 보고 싶은 거라면 이 절은 건너뛰세요. 4순위가 이미 그 파일입니다.

macOS의 탐색 후보는 이 순서입니다:

| 순위 (dev) | 경로 | 비고 |
| --- | --- | --- |
| 1 | `$ORCA_ENTERPRISE_POLICY` | **비패키징에서만** 1순위. 값을 바꿔 볼 때 쓰는 자리 |
| 2 | `/Library/Application Support/Orca/enterprise-policy.json` | 머신 전역. `sudo` 필요 |
| 3 | `~/Library/Application Support/orca-dev/enterprise-policy.json` | dev 인스턴스의 userData(§4). 환경변수 없이 쓰고 싶을 때 |
| 4 | `<체크아웃>/resources/enterprise-policy.json` | **저장소에 이미 있는 사내 기본값.** 아무것도 안 하면 이게 걸립니다 |

`ORCA_ENTERPRISE_POLICY=off`(또는 `none`/`disabled`/`false`/`0`)로 두면 탐색 자체를 끕니다 — 잠금 없는 상태와 비교할 때 씁니다.

저장소 밖에 파일을 하나 만듭니다 (실수로 커밋되지 않도록):

```bash
mkdir -p ~/orca-dev-policy
cat > ~/orca-dev-policy/enterprise-policy.json <<'JSON'
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",
  "allowedAgents": ["claude"],
  // 아래 다섯은 lockdown이 자동으로 켜지만, 화면 확인 중 하나씩 꺼 보려면 명시해 두면 편합니다.
  "disableMobilePairing": true,
  "disableVendorProviderAccounts": true,
  "disableRemoteOrcaServer": true,
  "disableVoice": true,
  "requireComputerUseApproval": true,
  "llmEndpoints": [
    {
      "id": "ds-internal-openai",
      "label": "사내 모델 (OpenAI 호환)",
      "baseUrl": "https://llm.samsungds.net/v1",
      "api": "openai",
      "model": "internal-code"
    }
  ]
}
JSON
```

> `enforceNetworkAllowlist`는 **켜지 마세요.** 렌더러 요청까지 허용목록으로 막히기 때문에 화면 확인 중에는 방해만 됩니다.
> 허용목록 자체를 검증할 때만 따로 켜세요([정책 레퍼런스 §5](./enterprise-policy.md)).

전체 스키마는 [엔터프라이즈 정책 파일 레퍼런스](./enterprise-policy.md)에 있습니다. JSONC이므로 `//` 주석과 후행 쉼표를 씁니다.

---

## 4. 실행

```bash
ORCA_ENTERPRISE_POLICY=~/orca-dev-policy/enterprise-policy.json pnpm dev
```

정책은 **프로세스당 한 번만 읽고 캐시**하므로(`enterprise-policy-file.ts:180-199`), 파일을 고쳤으면 앱을 **재시작**해야 합니다.

`pnpm dev`가 macOS에서 하는 일 (`config/scripts/run-electron-vite-dev.mjs`):

- `out/electron-dev/<hash>/Orca: <브랜치>.app`으로 Electron을 **복사·plist 수정·ad-hoc 서명**합니다(`:113-253`).
  Dock 이름이 브랜치별로 갈리고, 알림 권한은 `com.stablyai.orca.dev` 하나로 공유됩니다.
- **userData를 격리합니다** — `~/Library/Application Support/orca-dev` (`src/main/startup/configure-process.ts:171`).
  설치된 Orca의 프로필을 건드리지 않습니다. 격리된 새 프로필이 필요하면 `ORCA_DEV_USER_DATA_PATH`로 덮어씁니다(`:164-195`).
- Keychain 항목은 `Orca Dev Safe Storage`로 고정됩니다(브랜치마다 새로 묻지 않게 — `src/main/startup/dev-instance-identity.ts:11-16`).
- `[orca-dev] Remote debugging on http://127.0.0.1:<port>`를 찍습니다(워크트리별 결정적 포트, 충돌 시 스윕 — `:490-533`). §6에서 씁니다.
- `out/web`이 이미 있으면 페어링용 웹 클라이언트를 다시 빌드합니다(첫 실행이 느린 이유). 없으면 건너뜁니다(`:426-440`).

**두 가지 함정** (둘 다 실제로 밟았습니다):

- **dev가 떠 있는 동안 `pnpm test`를 돌리지 마세요.** 테스트는 앞단에서 `ensure-native-runtime.mjs --runtime=node`를
  실행해 `node-pty`를 **Node ABI로 다시 컴파일**합니다. 실행 중인 Electron 인스턴스가 쓰던 `.node`가 교체되면서 창이
  닫히고 앱이 조용히 종료됩니다. 테스트를 돌린 뒤 `pnpm dev`를 다시 실행하면 `ensure:electron-runtime`이 원복합니다.
- **dev 앱은 자기를 띄운 프로세스가 사라지면 스스로 종료합니다** (`configure-process.ts:204-233`의 부모 감시 워치독 —
  Ctrl+C로 electron-vite만 죽었을 때 창이 유령처럼 남는 걸 막는 장치). **자기 터미널에서 띄우고 그 터미널을 열어 두세요.**
  스크립트·에이전트가 띄운 셸이 끝나면 앱도 같이 내려갑니다.

사내 관련 사용자 데이터도 이 dev 프로필 안에 떨어집니다:

| 무엇 | 경로 |
| --- | --- |
| 사용자가 추가한 self-hosted 엔드포인트 | `~/Library/Application Support/orca-dev/corporate-llm-user-endpoints.json` |
| 엔드포인트 토큰 (safeStorage 암호화, `0600`) | `~/Library/Application Support/orca-dev/corporate-llm-tokens/<id>.token` |
| 사용자가 저장한 GHES 호스트 | 사용자 프로파일 (`~/Library/Application Support/orca-dev/profiles/`) |

---

## 5. 정책이 실제로 먹었는지 확인

화면보다 이게 먼저입니다. 채택된 정책은 시작 시 **한 번** NDJSON 로그에 기록됩니다
(`src/main/enterprise/enterprise-policy-trace.ts`):

```bash
grep -h enterprise.policy ~/Library/Application\ Support/orca-dev/logs/main.trace.ndjson \
  | tail -1 | python3 -m json.tool
```

실측 출력(위 §3 파일로 확인한 결과):

```json
{
  "enterprise.policy.source_path": "/Users/<you>/orca-dev-policy/enterprise-policy.json",
  "enterprise.policy.lockdown": true,
  "enterprise.policy.switches": { "disableTelemetry": true, "disableAutoUpdate": true, "disableStarNag": true,
                                   "disableCloudRelay": true, "disableUsagePolling": true,
                                   "disableManagedClaudeAccounts": true, "disableSpellcheck": true },
  "enterprise.policy.github_enterprise_host": "github.samsungds.net",
  "enterprise.policy.allowed_network_hosts": ["github.samsungds.net", "llm.samsungds.net"],
  "enterprise.policy.warnings": []
}
```

읽는 법:

- `source_path`가 내가 만든 파일인가. `(none found)`이면 경로/환경변수가 잘못된 것입니다.
- `warnings`가 비어 있는가. 오타 난 키·못 알아보는 값은 **조용히 무시되지 않고** 여기 남습니다.
- `allowed_network_hosts`에 GHES 호스트와 `llmEndpoints`의 호스트가 자동으로 들어왔는가 — `llmEndpoints`가 파싱됐다는 증거입니다.
- `ORCA_DIAGNOSTICS_DISABLED`를 켜 두면 이 기록도 사라집니다.

---

## 6. UI 체크리스트

앱 화면은 한국어입니다. 사내 커스터마이즈가 UI에 드러나는 지점은 네 곳뿐입니다.

| 어디 | 무엇이 보여야 하는가 |
| --- | --- |
| **설정 → 연동**, 맨 위 | **사내 GitHub (Enterprise)** 섹션. `githubEnterpriseHost`가 `GitHub 호스트`에 프리필. `브라우저로 로그인` + `토큰으로 연결`(개인용 액세스 토큰) 두 경로. `gh`가 없으면 노란 경고 배너 |
| **설정 → AI 제공업체 계정** | **사내 자체 호스팅 모델** 섹션. 정책 엔드포인트는 읽기 전용, 사용자가 추가한 것은 삭제 가능. 토큰은 저장 후 다시 표시되지 않음(`토큰 저장됨` 배지) |
| **설정 → AI 제공업체 계정**, 아래쪽 | **사내 게이트웨이 로그인** 섹션. `gateway-cli` 설치 감지, `verify` 결과로 그리는 상태 배지, 미설치 경고 배너. 프로필 선택 UI는 **없는 것이 정상**입니다 — `gateway-cli login`은 인자를 받지 않습니다. **맥에 `gateway-cli`가 없으면 경고 배너가 뜨는 것까지가 dev 확인 범위**이고, 실제 로그인·브라우저 띄우기는 `gateway-cli` 몫입니다 |
| **에이전트/모델 피커, 에이전트 설정, 하단 사용량 미터** | `allowedAgents`에 없는 벤더(codex/gemini/opencode/grok …)가 **사라짐** |
| **설정 → 개인정보 및 텔레메트리 / 고급** | 잠금 스위치들은 화면 문구를 바꾸지 않습니다. 여기서 확인하려 하지 말고 §5를 보세요 |

각 화면의 위치는 코드로: `IntegrationsPane.tsx:19`(GHES 섹션), `AccountsPane.tsx`(self-hosted 모델 섹션).
설정 검색(`⌘F`)은 제목·설명·키워드에 대한 부분 문자열 일치라(`settings-search.ts:82`) `사내`, `github`, `gh`, `호스트`,
`엔드포인트`로 찾힙니다. 검색 결과는 **섹션이 아니라 그 섹션이 있는 설정 화면**으로 데려갑니다.

> 문구가 영어로 보이면 그 키가 `ko.json`에 번역되지 않은 것입니다 — 화면이 없는 게 아닙니다.
> 사내 추가 섹션의 한국어는 `src/renderer/src/i18n/locales/ko.json`의
> `auto.components.settings.GitHubEnterpriseSection` / `…CorporateLlmEndpointsSection` / `…GatewaySection`에 있습니다.

---

## 7. 스크린샷·자동 확인 (선택)

`pnpm dev`가 열어 둔 원격 디버깅 포트로 렌더러를 그대로 붙잡을 수 있어, 화면을 파일로 남기거나 클릭을 스크립트로 재현할 수 있습니다.

```bash
curl -s http://127.0.0.1:9358/json/list        # webSocketDebuggerUrl 확인
```

이 WebSocket에 붙어 `Runtime.evaluate`로 특정 설정 화면을 열고 `Page.captureScreenshot`으로 PNG를 받는 방식이
E2E 스위트를 돌리지 않고 화면을 확인하는 가장 싼 방법입니다. 포트 번호는 워크트리마다 다르니 로그의
`[orca-dev] Remote debugging on …` 줄을 그대로 쓰세요.

> `Page.captureScreenshot`을 짧은 간격으로 반복 호출하다가 창이 내려앉는 것을 봤습니다(로그에는 아무것도 남지 않습니다).
> 화면 확인은 `Runtime.evaluate`로 `innerText`를 읽는 것으로 대부분 끝나므로, 스크린샷은 필요한 순간에 한 번씩만 찍으세요.

정식 회귀 검증이 필요하면 E2E를 쓰세요 — `pnpm exec electron-vite build --mode e2e` 후 `SKIP_BUILD=1 pnpm test:e2e`
(`tests/e2e/AGENTS.md`의 전제 조건을 먼저 읽으세요).

---

## 8. 정리

```bash
# 앱 종료 후
rm -rf ~/Library/Application\ Support/orca-dev     # dev 프로필 전체(터미널 히스토리·토큰 포함)
rm -rf out/electron-dev                            # 복사·서명된 dev Electron 번들
rm -rf ~/orca-dev-policy                           # 확인용 정책 파일
```

dev 프로필을 지워도 설치된 Orca(`~/Library/Application Support/Orca`)는 영향받지 않습니다.
Keychain의 `Orca Dev Safe Storage` 항목은 남습니다 — 지우면 다음 dev 실행 때 다시 만들어집니다.

---

## 9. 참고

- [엔터프라이즈 정책 파일 레퍼런스](./enterprise-policy.md) — 스키마, 게이트별 근거, 플릿 배포
- [Windows 사내 빌드 가이드](./windows-corporate-build.md) — 설치 프로그램을 실제로 만들 때
- [외부 연동 감사](./external-integrations-audit.md) — 무엇이 밖으로 나가고, 잠금이 무엇을 덮지 않는가
