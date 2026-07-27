# Windows 사내 빌드 가이드

사내 Windows 환경에서 Orca 설치 프로그램(`.exe`)을 만드는 절차입니다.
기준 버전: **v1.4.155** (브랜치 `enterprise/samsungds`).

**최종 산출물**: `dist\orca-windows-setup.exe`
NSIS 원클릭 설치 프로그램, x64, **per-user 설치**(관리자 권한 불필요, `%LOCALAPPDATA%\Programs\`에 설치), 기본적으로 **서명 없음**.

---

## 1. 사전 준비물

| 항목 | 요구사항 | 비고 |
| --- | --- | --- |
| OS | Windows 10 1809(빌드 17763) 이상, **x64** | ARM64 머신에서 빌드하면 x64 헬퍼가 섞인 잘못된 패키지가 나옵니다. §2 참고 |
| Node.js | **24 LTS 권장 / 최신 버전도 가능** | 상세는 §3 |
| pnpm | **10.24.0** | `packageManager`가 `pnpm@10.24.0`으로 핀되어 있습니다. `corepack enable` 후 `corepack prepare pnpm@10.24.0 --activate` |
| Visual Studio | **VS 2022 Build Tools** + "C++를 사용한 데스크톱 개발" 워크로드 (MSVC v143 + Windows SDK) | **가장 큰 실패 요인.** §3-3 |
| Python | 3.x, PATH 등록 | node-gyp 요구사항 |
| .NET Framework 4.x | `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` | Windows 8 이상 기본 탑재. 없으면 빌드가 중단됩니다 (§8). 탐색 경로는 `config/scripts/build-windows-cli-launcher.mjs:50-53` |
| Windows PowerShell | 5.1 (`powershell.exe`) | `verify:computer-native` 핸드셰이크(아래)와 **패키징 양쪽**에서 씁니다. electron-builder는 Windows에서 의존성 트리 수집용 `pnpm list`를 `powershell.exe -EncodedCommand`로 감싸 실행합니다(`node_modules/app-builder-lib/out/node-module-collector/nodeModulesCollector.js:324`, 호출부 `node_modules/app-builder-lib/out/util/appFileCopier.js:183`). 압축 해제 경로에는 쓰이지 않습니다 — Electron zip은 `@electron-internal/extract-zip`(`node_modules/electron/install.js:5`), electron-builder 툴셋은 `tar` / 내장 zip 스트리밍 / `7za`(`node_modules/app-builder-lib/out/util/electronGet.js:139`, `:159-160`, `:163-165`) |
| Git | 2.25 이상 | |
| 디스크 | 약 15 GB 이상 | `node_modules` + Electron 배포본 + `dist` |

> **`powershell.exe`는 선택 사항이 아닙니다.** §4가 권장하는 `pnpm build:release`는 `verify:computer-native`를 포함하고(`package.json:70`), 이 스크립트는 Windows에서 `native/computer-use-windows/runtime.ps1`을 **실제로 실행해** `{ok:true, capabilities.protocolVersion:1}` 응답을 요구합니다(`config/scripts/verify-computer-native.mjs:68-71`, `:143-178`). 해당 스크립트는 시작하자마자 `UIAutomationClient` / `UIAutomationTypes` / `System.Drawing` / `System.Windows.Forms` 어셈블리를 로드하므로(`native/computer-use-windows/runtime.ps1:12-15`) .NET Framework 기반의 Windows PowerShell 5.1이 있어야 합니다. 요구 강도는 두 단계입니다 — **`powershell.exe` 자체는 패키징(§4의 6단계)도 씁니다**(위 표), UI Automation 어셈블리까지 필요한 것은 `verify:computer-native`뿐입니다. 실패 시 조치는 §8을 보세요.

> 작업 경로는 **공백과 한글이 없는 짧은 경로**를 쓰세요 (예: `C:\src\orca`). NSIS와 node-gyp는 긴 경로에서 자주 깨집니다.

---

## 2. 아키텍처 주의 (ARM64 Windows)

`config/electron-builder.config.cjs`의 `win.extraResources`는 `agent-browser-win32-x64.exe`(:216)와 x64 음성 네이티브 바인딩(`sherpa-onnx-win-x64`, :48-51 → :206)을 **하드코딩**하고 있습니다. 또한 산출물 이름이 `orca-windows-setup.${ext}`(:227)로 고정이라 **아키텍처가 파일명에 들어가지 않습니다.**

따라서 ARM64 Windows에서 빌드하면 arm64 앱 안에 x64 헬퍼가 들어간 채 **x64 빌드와 똑같은 파일명**으로 나옵니다. **반드시 `--x64`를 명시하세요.**

---

## 3. Node 버전 — 최신 Node를 써도 되는가

**결론: 됩니다. 다만 이 프로젝트가 실제로 테스트하는 유일한 구성은 Node 24입니다.**

### 3-1. 왜 되는가 (검증된 메커니즘)

패키지에 들어가는 네이티브 모듈(`node-pty`, `windows-native-registry`)은 **호스트 Node가 아니라 Electron 43 헤더로 컴파일**됩니다. `config/scripts/rebuild-native-deps.mjs:46-49`가 `node_modules/electron/package.json`에서 버전을 읽어 `@electron/rebuild`에 넘기고(:134-147), `config/electron-builder.config.cjs:395`가 이 스크립트를 `beforeBuild` 훅으로 매 빌드마다 실행합니다. 호스트 Node는 **스크립트 인터프리터 역할만** 합니다.

게다가 두 모듈 모두 **N-API(Node-API) 애드온**입니다 (`node-addon-api ^7.1.0` / `^4.3.0`). N-API는 `NODE_MODULE_VERSION` ABI에 묶이지 않으므로, Electron 43(ABI 148, `node_modules/node-abi/abi_registry.json`)로 빌드한 `.node`가 Node 26(ABI 147)에서 그대로 로드됩니다. 직접 확인할 수 있습니다 — `node_modules/node-pty/build/config.gypi`의 `nodedir`가 `.electron-gyp\43.1.0`(Electron 헤더)을 가리키는 상태에서 `node -e "require('node-pty')"`가 호스트 Node 26.5.0으로 통과합니다.

저장소 자체도 이를 전제로 합니다 — `config/electron-builder.config.cjs:157-161` 주석이 "it require()s the native (N-API) node-pty"라고 명시하고, 방어 분기도 런타임 버전이 아니라 **arch** 기준입니다(:162-174).

**빌드 경로에서 호스트 Node 버전을 검사해 실패시키는 코드는 없습니다.** 저장소 소스(node_modules 제외)의 `process.versions.node` 사용처는 두 곳뿐이고 둘 다 빌드와 무관합니다:

| 위치 | 무엇인가 |
| --- | --- |
| `config/scripts/ensure-native-runtime.mjs:406` | 로그 라벨 문자열(`Node <ver>`) |
| `src/main/agent-hooks/wsl-hook-relay-launch.ts:88` | **런타임** WSL 게스트 안에서 `node` 후보를 훑으며 major ≥ 18인 것을 고르는 셸 게이트. 검사 대상은 WSL 게스트의 Node이지 빌드 호스트의 Node가 아닙니다 |

`.nvmrc` / `.node-version` / volta 핀 / `preinstall` 훅도 없습니다.

### 3-2. 실측 결과

macOS + **Node 26.5.0**에서 확인:

```
pnpm install                       → exit 0 (node-pty 소스 재빌드 + Electron 설치 완료)
pnpm build:desktop                 → 성공 (typecheck→relay→cli→electron-vite→web 전 단계)
  verify-web-build.mjs             → rc 0
  verify-cli-bin.mjs               → rc 0
  out/relay/win32-x64 포함 6개 플랫폼 번들 생성
pnpm test <단위 테스트>             → 통과
```

`pnpm install`은 `WARN Unsupported engine: wanted {"node":"24"}` 경고를 내지만 **계속 진행합니다** — `.npmrc`에 `engine-strict`가 없어 `package.json:250-252`의 `engines` 핀이 강제되지 않기 때문입니다.

> **정직한 한계**: 위 실측은 macOS이고, Windows + 최신 Node 조합은 **CI에서도 저장소 이력에서도 한 번도 실행된 적이 없습니다.** 데스크톱 CI 잡은 전부 `node-version-file: package.json`으로 Node 24를 해석하고(모바일 릴리스 두 잡만 `node-version: 24`로 직접 적습니다 — `mobile-ios-release.yml:51`, `mobile-android-release.yml:44`), **릴리스** Windows 잡은 `windows-2022`에 고정되어 있습니다(`release-cut.yml:724`). 다만 Windows 러너가 전부 2022인 것은 아닙니다 — `computer-e2e.yml:190-192`의 `windows` 잡은 `windows-latest`를 씁니다.

### 3-3. 권장 운영 방식

사내 표준 Node를 그대로 쓰되, **첫 빌드 전에 아래 두 명령을 확인**하세요:

```powershell
pnpm install
node config/scripts/ensure-native-runtime.mjs --check-only      # 읽기 전용: 호스트 Node에서 로드 확인
node config/scripts/ensure-native-runtime.mjs --runtime=electron # 확인 + 필요시 재빌드 (상태를 바꿉니다)
```

두 명령의 성격이 다릅니다.

- `--check-only`는 **읽기 전용**입니다. 현재 프로세스에서 `node-pty`(Windows에서는 `windows-native-registry`도)를 `require`해 보고 실패 목록을 stderr로 뱉은 뒤 exit 1 합니다 (`config/scripts/ensure-native-runtime.mjs:19-30`).
- `--runtime=electron`은 **점검이 아니라 보정 명령**입니다. Electron 바이너리로 같은 로드 검사를 돌린 뒤, 실패하거나 node-pty가 재빌드 대상으로 판정되면 `config/scripts/rebuild-native-deps.mjs`를 실행해 네이티브 모듈을 **Electron ABI로 다시 컴파일하고** 재검사합니다. 재검사도 실패할 때만 exit 1 입니다 (`:92-120`, 재빌드 호출은 `:110`). 즉 "통과"는 "원래 정상이었다"가 아니라 "지금은 정상이 되었다"는 뜻일 수 있습니다.

**둘 다 exit 0이면 호스트 Node 버전 때문에 빌드가 깨질 일은 없습니다** — 남은 실패 요인은 §8입니다. 하나라도 최종 실패하면 그때만 빌드 머신에 nvm-windows로 Node 24를 설치하세요.

> `pnpm test`도 같은 스크립트를 `--runtime=node`로 실행하지만(`package.json:19`), `ensureNodeRuntime`은 **로드 검사가 통과하면 아무것도 하지 않습니다**(`config/scripts/ensure-native-runtime.mjs:55-60`). 위의 N-API 성질 때문에 Electron ABI로 빌드된 모듈도 호스트 Node에서 로드되므로 Windows에서는 보통 no-op이고 — win32는 patched-source 재빌드 경로도 타지 않습니다(`:321-323`) — 재빌드는 로드가 실제로 깨졌을 때만 일어납니다(`:62-79`). 어느 쪽이든 패키징의 `beforeBuild`가 `--force`로 다시 Electron ABI로 컴파일하므로(`config/electron-builder.config.cjs:395` → `config/scripts/electron-builder-native-rebuild.cjs:28-38`) 테스트가 패키징 산출물의 ABI를 오염시킬 수는 없습니다. §4의 5단계는 그래서 **사전 확정 단계**이지 오염 복구 단계가 아닙니다. `pnpm build:win`은 이 단계를 `ensure:electron-runtime`이라는 이름으로 내장하고 있습니다(`package.json:43`, `:75`).

준비 노력은 Node가 아니라 **Visual Studio에 쓰세요.** CI가 `windows-2022`를 명시적으로 고정하며 남긴 주석(`.github/workflows/release-cut.yml:722-724`)이 이유를 밝힙니다 — "windows-latest가 VS 2026 이미지로 넘어가면서 node-gyp가 VS 18을 탐지하지 못해 네이티브 설치가 깨졌다". 실제로 깨지는 건 이쪽입니다.

`engines` 값을 `>=24` 따위로 "고치지" 마세요. 데스크톱 CI 잡이 전부 이 값에서 Node 버전을 해석하므로, 릴리스 아티팩트를 만드는 Node 버전이 조용히 바뀝니다.

---

## 4. 빌드 절차

PowerShell에서 실행합니다.

```powershell
# 0) 클론 및 체크아웃
git clone <사내 저장소 URL> C:\src\orca
cd C:\src\orca
git checkout enterprise/samsungds      # 또는 v1.4.155

# 1) 툴체인
corepack enable
corepack prepare pnpm@10.24.0 --activate
node -v ; pnpm -v

# 2) 안전장치 (§5 필수)
Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN, Env:GITHUB_RELEASE_TOKEN, Env:ORCA_MAC_RELEASE -ErrorAction SilentlyContinue
$env:ORCA_STRICT_ELECTRON_INSTALL = "1"
$env:NODE_OPTIONS = "--max-old-space-size=4096"

# 3) 의존성 설치 (postinstall이 Electron 다운로드 + 네이티브를 Electron ABI로 컴파일)
pnpm install --frozen-lockfile

# 4) 앱 빌드 — verify:computer-native가 powershell.exe를 요구합니다 (§1)
pnpm build:release

# 5) 네이티브 런타임을 Electron ABI로 확정 (필요하면 재빌드까지 수행)
node config/scripts/ensure-native-runtime.mjs --runtime=electron
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 6) 패키징 — --publish never 필수
pnpm exec electron-builder --config config/electron-builder.config.cjs --win --x64 --publish never
```

5·6번 명령은 CI의 Windows `release_command`(`release-cut.yml:726`)를 그대로 두 줄로 풀어 쓴 것입니다 — CI도 `ensure-native-runtime.mjs --runtime=electron` → `$LASTEXITCODE` 확인 → `electron-builder ... --publish never` 순서로 실행합니다. `--x64`만 안전을 위해 추가했습니다. `ORCA_STRICT_ELECTRON_INSTALL=1`은 Electron 바이너리 설치가 실패했을 때 postinstall이 경고만 남기고 통과하는 것을 막습니다(`config/scripts/rebuild-native-deps.mjs:281-291`). 폐쇄망에서 Electron 배포본을 못 받은 상태가 조용히 넘어가면 패키징 단계에서야 드러납니다.

### `build:release` vs `build:win`

`pnpm build:win`이라는 원커맨드가 있지만 **그대로 쓰지 마세요** — `--publish never`가 빠져 있습니다(§5).

| | `build:release` (CI 경로, 권장) | `build:win` |
| --- | --- | --- |
| `typecheck` (tsc ×3) | 안 함 | 함 (`build:desktop` 경유, `package.json:68`) |
| `build:native` (Windows CLI 런처) | 함 | 안 함 — 단 `beforeBuild` 훅이 win32에서 같은 `build-windows-cli-launcher.mjs`를 실행하므로 결과는 같음 (`config/scripts/electron-builder-native-rebuild.cjs:12-17`, `config/scripts/build-native-for-platform.mjs:5-6`) |
| `verify:computer-native` | 함 (`package.json:70`) — **powershell.exe 필요** | 안 함 |
| `ensure:electron-runtime` | 안 함 — §4의 5단계로 직접 수행 | 함 (`package.json:75`) |
| `--publish never` | 명시해야 함 | **없음 (위험)** |

### 빌드 후 검증

아래는 CI 검증의 **상위 집합**입니다. 패키징 직후 CI가 강제하는 것은 첫 블록(node-pty ConPTY 런타임 3종)뿐이고(`release-cut.yml:908-923`), 설치 프로그램·blockmap·`latest.yml`을 한꺼번에 확인하는 `Get-Item`은 같은 `build` 잡의 **SignPath 서명 이후 스텝**에만 있습니다(`release-cut.yml:1358`). 사내 빌드는 서명 스텝을 타지 않으므로 둘을 합쳐서 직접 돌리세요.

```powershell
$rt = 'dist\win-unpacked\resources\node_modules\node-pty\build\Release'
@("$rt\conpty.node", "$rt\conpty\conpty.dll", "$rt\conpty\OpenConsole.exe") |
  ForEach-Object { if (-not (Test-Path $_)) { throw "missing $_" } }
Get-Item dist\orca-windows-setup.exe, dist\orca-windows-setup.exe.blockmap, dist\latest.yml
```

`publish`를 껐다면(§5-1) `latest.yml`은 생성되지 않으므로 마지막 줄에서 제외하세요.

---

## 5. 절대 하지 말아야 할 것

### 5-1. `--publish never` 없이 패키징

`config/electron-builder.config.cjs:405-413`에 publish provider가 설정되어 있습니다:

```js
publish:
  process.env.ORCA_DISABLE_PUBLISH_TARGET === '1'
    ? null
    : { provider: 'github', owner: 'stablyai', repo: 'orca', releaseType: 'release' }
```

업로드 여부는 `--publish` 정책이 결정합니다(플래그를 안 줬을 때의 기본값 결정은 `node_modules/app-builder-lib/out/publish/PublishManager.js:46-64`, provider별 스킵 예외는 `:126`, 태그로 인정되는 환경변수 목록은 `node_modules/electron-publish/out/publisher.js:41-50`):

| 상황 | 결과 |
| --- | --- |
| `--publish never` 명시 | 업로드 안 함 |
| 플래그 없음 + 개발자 PC (CI 환경변수 없음) | 업로드 안 함 |
| 플래그 없음 + **`CI=true`만 설정된 사내 러너** | `onTagOrDraft`로 해석되고 github provider는 스킵 대상에서 제외 → **업로드 시도** |
| 플래그 없음 + `GITHUB_REF_TYPE=tag` 등 태그 환경변수 | **업로드 시도** |

즉 사내 CI(Jenkins/GitLab 등 대부분 `CI=true`)에서 `pnpm build:win`을 그대로 돌리면 `github.com/stablyai/orca`로 draft 릴리스 업로드를 시도합니다. 토큰이 없으면 빌드가 실패하고, 토큰이 있으면 **사내 빌드가 외부로 나갑니다.**

방어책(강도 순):

1. **항상 `--publish never`를 붙인다** (설정 변경 불필요, 가장 확실)
2. 빌드 셸에서 `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_RELEASE_TOKEN` 제거
3. **빌드 셸에 `ORCA_DISABLE_PUBLISH_TARGET=1`을 설정한다.** 소스를 고칠 필요 없이 `publish`가 `null`이 됩니다(`config/electron-builder.config.cjs:405-413`, 의도는 `:403-404` 주석). `publish: null`이면 `getPublishConfigs`가 곧바로 `null`을 반환해(`node_modules/app-builder-lib/out/publish/PublishManager.js:354-358`) 저장소 정보로부터의 기본 github 폴백조차 타지 않고(`:212-214`), `app-update.yml`은 publish 설정이 있을 때만 기록되므로(`:87-90`) 업데이터 메타(`latest.yml`, `app-update.yml`)가 아예 나오지 않습니다. **다만 이것을 런타임 차단으로 오해하지 마십시오** — Orca는 피드 URL을 `app-update.yml`이 아니라 코드에서 직접 지정하므로(`src/main/updater.ts:1485-1488`, `setFeedURL`이 provider를 선주입해 `app-update.yml` 조회를 건너뜁니다 — `node_modules/electron-updater/out/AppUpdater.js:247`, `:382-383`), 업데이트 **조회는 그대로 업스트림에 나갑니다.** 메타가 없으면 다운로드 단계에서 `app-update.yml`을 읽다 실패할 뿐입니다(`AppUpdater.js:545`)

`ORCA_DISABLE_PUBLISH_TARGET`은 **빌드 셸 전용 변수**입니다. 앱 런타임 환경변수가 아니며 설치된 Orca는 이 값을 읽지 않습니다.

> 3번은 **빌드 시점** phone-home과 업데이터 메타 생성만 막습니다. 앱이 실행 중에 GitHub 릴리스를 조회하는 **런타임 자동 업데이트**는 별개이며, 관리자 정책 파일의 `disableAutoUpdate`(또는 마스터 스위치 `lockdown`)로 끕니다 — `src/shared/enterprise-policy.ts:19`, 차단 지점은 `src/main/updater.ts:1179` / `:1251` / `:1458`. 정책 파일은 머신 전역 경로가 우선 탐색되며 Windows에서는 `%ProgramData%\Orca\enterprise-policy.json`입니다(`src/main/enterprise/enterprise-policy-file.ts:37-47`, 탐색 순서 `:59-83`). 전체 외부 연동 잠금은 [외부 연동 감사](./external-integrations-audit.md) 참고.

### 5-2. `ORCA_MAC_RELEASE` 환경변수 남겨두기

`config/electron-builder.config.cjs:313`이 `forceCodeSigning: isMacRelease`이고 `isMacRelease`는 `process.env.ORCA_MAC_RELEASE === '1'`입니다(:16). Windows 빌드 셸에 이 값이 남아 있으면 서명이 실제로 이뤄지지 않았을 때 `App is not signed and "forceCodeSigning" is set to true` `InvalidConfigurationError`로 **빌드가 실패**합니다(`node_modules/app-builder-lib/out/winPackager.js:129-130`).

---

## 6. 사내망 / 프록시

### 6-1. 빌드 시점 네트워크 접점

| 단계 | 접속처 | 미러 / 우회 환경변수 |
| --- | --- | --- |
| `pnpm install` | `registry.npmjs.org` | `npm_config_registry`. ⚠️ `.npmrc`에 `minimum-release-age=4320`(3일)이 있어 **사내 미러가 패키지 `time` 메타데이터를 제공해야** 합니다 |
| postinstall → Electron 43.1.0 바이너리 | `github.com/electron/electron/releases/download/` | `ELECTRON_MIRROR`, `ELECTRON_CUSTOM_DIR`, `ELECTRON_CUSTOM_FILENAME` |
| node-gyp 헤더 | `nodejs.org/download/release/` | `npm_config_disturl`, `npm_config_nodedir` |
| Electron ABI 리빌드 헤더 | `www.electronjs.org/headers` | ⚠️ **환경변수로 못 바꿉니다.** `rebuild-native-deps.mjs`의 `rebuild()` 호출(:134-147)이 `headerURL`을 넘기지 않아 @electron/rebuild의 기본값이 그대로 `--dist-url`로 들어갑니다(`node_modules/@electron/rebuild/lib/rebuild.js:43`, `lib/module-type/node-gyp/node-gyp.js:19`). 우회: 캐시 디렉터리 `%USERPROFILE%\.electron-gyp\43.1.0\`에 헤더와 `node.lib`를 미리 배치 — 이 경로 역시 코드 상수라 환경변수로 옮길 수 없습니다(`lib/constants.js:3`) |
| electron-builder NSIS 번들 (+ **서명할 때만** `winCodeSign`) | `github.com/electron-userland/electron-builder-binaries/` | `ELECTRON_BUILDER_BINARIES_MIRROR`(`node_modules/app-builder-lib/out/util/electronGet.js:509-522`, 기본 저장소는 `node_modules/app-builder-lib/out/binDownload.js:54`), `ELECTRON_BUILDER_CACHE`(`electronGet.js:37`), `ELECTRON_BUILDER_NSIS_DIR`(`node_modules/app-builder-lib/out/toolsets/windows.js:202`) |

**서명하지 않는 빌드가 폐쇄망에서 반드시 필요한 electron-builder 툴셋은 NSIS 번들뿐입니다.** 아이콘/버전 리소스 스탬핑에는 다운로드가 필요 없습니다 — 이 버전은 `rcedit.exe`를 쓰지 않고 번들된 JS 패키지 `resedit`으로 PE 리소스를 직접 편집합니다(`node_modules/app-builder-lib/out/util/resEdit.js:6-11`, 호출부 `node_modules/app-builder-lib/out/winPackager.js:196`). `getRceditBundle()`은 정의만 남아 있고 호출하는 곳이 없습니다(`node_modules/app-builder-lib/out/toolsets/windows.js:136`). `winCodeSign` 번들은 실제로 서명할 때만 받습니다 — Windows 호스트에서 `signtool.exe`가 거기서 나옵니다(`node_modules/app-builder-lib/out/toolsets/windows.js:101-102`).

**빌드 시점에 음성 모델은 받지 않습니다.** sherpa-onnx 모델은 런타임에 사용자가 내려받는 구조입니다(`src/main/speech/model-catalog.ts:15-16` 외 `downloadUrl` 목록).

### 6-2. 폐쇄망 전략

인터넷 가능한 머신에서 위 단계를 한 번 수행한 뒤 아래를 통째로 옮기는 방식이 가장 확실합니다.

```
node_modules\
%LOCALAPPDATA%\electron\Cache\
%LOCALAPPDATA%\electron-builder\Cache\
%USERPROFILE%\.electron-gyp\
```

옮긴 뒤 `ELECTRON_BUILDER_CACHE`를 해당 위치로 지정하세요.

---

## 7. 코드 서명

### 기본 동작: 서명 없이 성공

인증서 설정이 전혀 없으면 electron-builder는 **서명을 건너뛴 뒤 빌드를 성공시킵니다.** `forceCodeSigning`이 `ORCA_MAC_RELEASE=1`이 아닌 한 `false`이기 때문입니다(§5-2). 건너뛴 사실은 `"no signing info identified, signing is skipped"`로 기록되지만 `log.debug` 레벨이라(`node_modules/app-builder-lib/out/codeSign/windowsSignToolManager.js:156`) 기본 출력에는 보이지 않습니다 — **로그가 조용하다고 서명된 것이 아닙니다.**

업스트림의 SignPath **서명 단계**는 GitHub Actions 워크플로 안에만 있습니다 — 사내 빌드는 그 워크플로를 타지 않으므로 자동으로 건너뛰어집니다. 다만 electron-builder 설정이 SignPath와 **완전히 무관하지는 않습니다**: `win.signtoolOptions.publisherName`의 기본값이 `'SignPath Foundation'`으로 박혀 있어(`config/electron-builder.config.cjs:200-202`) 아래 자동 업데이트 주의사항으로 이어집니다.

### 사내 인증서로 서명하려면

환경변수를 설정하고 §4의 6단계를 다시 실행합니다.

```powershell
$env:WIN_CSC_LINK = "C:\path\to\cert.pfx"      # 또는 base64 문자열
$env:WIN_CSC_KEY_PASSWORD = "<password>"
```

인증서 저장소/HSM을 쓴다면 `win.signtoolOptions.certificateSubjectName` 또는 `.certificateSha1`을 설정합니다 (`node_modules/app-builder-lib/out/options/winOptions.d.ts:96`, `:100`).

### ⚠️ 기본 서명 범위는 `.exe`뿐입니다

**`WIN_CSC_LINK`만 설정하면 `.exe`만 서명되고 `.dll` / `.node`는 미서명으로 남습니다.** electron-builder의 `shouldSignFile()`은 `win.signExts`가 비어 있을 때 `isExe || fallbackValue`를 반환하는데(`node_modules/app-builder-lib/out/winPackager.js:203-219`), `signExts`의 기본값은 `null`이고(`node_modules/app-builder-lib/out/options/winOptions.d.ts:64-70`) `config/electron-builder.config.cjs`의 `win` 블록은 이 키를 설정하지 않습니다.

경로별 실제 동작:

| 위치 | 서명 대상 |
| --- | --- |
| `win-unpacked\Orca.exe` | 서명 + 아이콘/버전 리소스 스탬핑 (`winPackager.js:244-248`) |
| `win-unpacked\` 나머지 최상위 파일 | `.exe`만. Electron이 함께 푸는 `*.dll`은 대상이 아님 (`winPackager.js:249-251`) |
| `resources\app.asar.unpacked\**` | `walkSignableFiles`가 같은 술어로 걸러 `.exe`만 통과 (`winPackager.js:256-260`, `:266-268`). sherpa-onnx의 `onnxruntime.dll` / `sherpa-onnx-c-api.dll` / `sherpa-onnx.node` 제외 — 이 패키지는 `asarUnpack`(`config/electron-builder.config.cjs:134`)과 `extraResources`(`:206`) 양쪽에 들어가므로 두 사본 모두 미서명입니다 |
| `extraResources` 복사본 | 복사 트랜스포머가 `.exe`만 서명 (`winPackager.js:220-233`, 호출부 `node_modules/app-builder-lib/out/platformPackager.js:239-240`). `bin\orca.exe`, `agent-browser-win32-x64.exe`는 **서명됨**; 같은 트리의 `pty.node`, `conpty.node`, `conpty_console_list.node`, `conpty\conpty.dll`, `winpty.dll`은 **서명 안 됨** |

node-pty의 `conpty\OpenConsole.exe`는 **복사 시점에 따라 갈립니다.** 리빌드가 이미 `build\Release\conpty\`를 채워 둔 상태면 extraResources 복사와 함께 트랜스포머를 통과해 서명되지만, 비어 있으면 `afterPack`이 `third_party\conpty\...\win10-x64`에서 뒤늦게 채우므로(`config/electron-builder.config.cjs:155` → `config/packaged-runtime-node-modules.cjs:397-398`, `:275-301`) 그 사본은 트랜스포머를 지나지 않아 미서명으로 남습니다. 서명 여부를 가정하지 말고 `Get-AuthenticodeSignature`로 확인하세요.

즉 서명되지 않는 것은 **네이티브 애드온과 DLL**입니다. 업스트림 CI도 electron-builder만으로는 이걸 못 덮어서, 패키징 후 내부 PE 파일만 따로 모아 SignPath에 **두 번째 서명 요청**을 보내고 설치 프로그램을 다시 만듭니다(`.github/workflows/release-cut.yml:1004-1012`, 스테이징 스텝 `:1016-1053`). 그 체인이 생긴 계기가 바로 node-pty의 `conpty_console_list.node`이며, 스테이징 스텝은 지금도 그 파일명을 하드 체크합니다.

사내 빌드에서는 그 두 단계 체인을 재현할 필요 없이 `win` 블록에 한 줄만 추가하면 됩니다:

```js
win: {
  signExts: ['.dll', '.node'],
  // ...
}
```

**왜 중요한가**: AppLocker / WDAC의 DLL 규칙은 게시자(Publisher) 기준으로 평가되므로, 경로 예외를 따로 열어 주지 않는 한 미서명 `.dll` / `.node`는 로드가 거부됩니다. node-pty의 `pty.node`나 `conpty.dll`이 막히면 터미널이 아예 뜨지 않고, 사내 백신 화이트리스트도 대개 서명자 기준이라 미서명 애드온이 격리 대상이 됩니다.

> 참고: electron-builder의 서명 경로에는 "이미 서명된 파일은 건너뛴다"는 분기가 없습니다(`winPackager.js:106-122` — `signExts`/`signExecutable` 두 가지만 봅니다). 따라서 트랜스포머를 타는 한 Microsoft가 서명해 배포하는 `OpenConsole.exe`도 사내 인증서로 덧서명됩니다. 업스트림 CI는 이를 피하려고 스테이징 단계에서 `Get-AuthenticodeSignature` 상태가 `Valid`인 파일을 명시적으로 제외합니다(`release-cut.yml:1014-1015`).

### ⚠️ 자동 업데이트와의 상호작용

`win.signtoolOptions.publisherName`이 `app-update.yml`에 기록되고(`node_modules/app-builder-lib/out/codeSign/windowsSignToolManager.js:18-29`를 거쳐 `node_modules/app-builder-lib/out/publish/PublishManager.js:202-207`; `verifyUpdateCodeSignature`를 끄지 않는 한 이 경로를 탑니다 — `node_modules/app-builder-lib/out/winPackager.js:26-28`), electron-updater는 **그 이름으로 서명된 설치 프로그램만 수락**합니다(`node_modules/electron-updater/out/NsisUpdater.js:84-99`). 기본값 `'SignPath Foundation'`을 그대로 두면 공개 배포판 설치 프로그램이 사내 빌드를 덮어쓸 수 있으므로, 빌드 셸에서 사내 인증서 CN을 반드시 지정하십시오.

```powershell
$env:ORCA_WIN_PUBLISHER_NAME = "<사내 인증서 CN>"
```

이 항목은 **`publish`를 살려 둔 빌드에만** 해당합니다. §5-1의 3번(`ORCA_DISABLE_PUBLISH_TARGET=1`)을 적용하면 `app-update.yml` 자체가 없어지지만, 이것을 자동 업데이트 차단으로 세지 마십시오 — 조회는 그대로 나가고(§5-1), 실제로 멈추는 지점은 다운로드가 그 없는 파일을 읽다 실패하는 곳입니다(`AppUpdater.js:585` → `:545`). Authenticode 게시자 확인은 그보다 **뒤에** 있으므로(`NsisUpdater.js:52`) 이 구성에서는 아예 도달하지 않습니다. 반대로 파일은 있는데 `publisherName`만 비어 있으면 `verifySignature`가 곧바로 `null`을 반환해 게시자 확인을 건너뜁니다(`NsisUpdater.js:84-99`). 즉 어느 쪽이든 이 경로에 서명 검증을 기대해서는 안 됩니다. **자동 업데이트를 끄는 유일하게 확실한 수단은 정책 파일의 `disableAutoUpdate`입니다.**

`win.verifyUpdateCodeSignature: false`는 **추가하지 마십시오** — Windows에서 유일한 Authenticode 검증을 꺼서 임의의 설치 프로그램을 수락하게 됩니다. 자동 업데이트 자체를 끄려면 정책 파일의 `disableAutoUpdate`를 쓰십시오(§5-1).

---

## 8. 실패 지점 트러블슈팅

아래 증상 중 `daemon-entry` 부팅 게이트와 패키징된 런타임 의존성 검증은 `afterPack` 훅이 강제하는 것이고(`config/electron-builder.config.cjs:136-193`), 나머지는 설치·빌드·서명 단계에서 각각 발생합니다.

| 증상 | 원인 / 조치 |
| --- | --- |
| `pnpm install` 중 `cpu-features` 컴파일 에러 | **정상입니다. 무시하세요.** optional 의존성이며 `rebuild-native-deps.mjs:51`의 `ignoreModules`에도 등재되어 있습니다. ssh2가 순수 JS로 폴백합니다 |
| `beforeBuild`에서 node-gyp 실패 | MSVC/Python 미설치. VS 2022 Build Tools + Windows SDK + Python 3 설치. 단독 재현: `node config/scripts/rebuild-native-deps.mjs --platform=win32 --arch=x64 --force` |
| `csc.exe` 못 찾음 | .NET Framework 4.x 누락. `beforeBuild`가 Windows CLI 런처(`native/windows-cli-launcher/OrcaCliLauncher.cs`)를 컴파일하므로 **빌드가 중단됩니다**. 탐색 경로 `config/scripts/build-windows-cli-launcher.mjs:50-53` |
| `pnpm build:release`가 `[computer-native] Windows provider handshake`에서 실패 | `powershell.exe`(Windows PowerShell 5.1)가 없거나 UI Automation 어셈블리를 못 여는 경우. `native/computer-use-windows/runtime.ps1:12-15`가 `UIAutomationClient`/`UIAutomationTypes`/`System.Drawing`/`System.Windows.Forms`를 로드합니다. 단독 재현: `pnpm verify:computer-native`. 패키징 자체와는 무관한 단계이므로, 급하면 §4의 4단계를 `pnpm build:relay && pnpm build:native && pnpm build:cli && pnpm build:electron-vite && pnpm build:web`으로 풀어 실행해 우회할 수 있습니다. 단 이 우회는 **어셈블리 로드만 실패할 때** 유효합니다 — `powershell.exe` 자체가 없으면 패키징 단계도 못 넘어갑니다(§1) |
| `EPERM ... .node` | 실행 중인 Orca/Electron 프로세스가 파일을 잡고 있음. 전부 종료 후 재시도 |
| `Packaged node-pty is missing ...conpty.dll` / `...OpenConsole.exe` throw | `afterPack`이 `third_party\conpty\...\win10-x64`에서 ConPTY 런타임을 채우려다 원본을 못 찾은 것 (`config/packaged-runtime-node-modules.cjs:275-301`, 던지는 지점 `:295`). node-pty가 제대로 재빌드되지 않은 상태이므로 `pnpm install` 재실행. 해당 arch 페이로드 자체가 없으면 `Packaged node-pty has no ConPTY payload for win10-...`가 대신 뜹니다(`:272`) |
| `Usage: daemon-entry` 검증 실패 | 패키징된 `daemon-entry.js`를 호스트 Node로 부팅하는 게이트(`config/scripts/verify-packaged-daemon-entry.cjs:33-56`). **호스트 Node가 패키징 산출물을 직접 실행하는 유일한 지점**입니다. §3-3의 사전 점검은 이 중 네이티브 모듈 로드 부분만 미리 걸러 줍니다 — asar-unpack/번들 그래프 회귀는 패키징 시점에야 드러납니다 |
| `InvalidConfigurationError: GitHub Personal Access Token is not set` | `--publish never` 누락 (§5-1). 던지는 지점은 `node_modules/electron-publish/out/gitHubPublisher.js:27` — 즉 **업로드를 시도했다는 증거**입니다 |
| 설치 후 터미널이 안 뜨고 AppLocker/WDAC 로그에 `.node` 차단 | 미서명 네이티브 애드온. §7의 `signExts` 참고 |

`beforeBuild`는 매 빌드마다 `rebuild-native-deps.mjs --platform=win32 --arch=x64 --force`를 실행하므로 **`node-pty`와 `windows-native-registry`는 항상 소스에서 재컴파일**됩니다. 컴파일 툴체인은 선택이 아니라 필수입니다.

---

## 9. 참고

- CI가 실제로 하는 Windows 빌드: `.github/workflows/release-cut.yml`의 `build` 잡(`:713`부터 다음 잡 `build-mac`(`:1509`) 직전까지가 전부 한 잡), 러너/명령 매트릭스는 `:718-741`
- 내부 PE 파일 서명 체인 (사내 빌드는 타지 않음): `.github/workflows/release-cut.yml:1004-1012`, `.github/workflows/windows-signing-rehearsal.yml`
- 산출물 이름/타깃 설정: `config/electron-builder.config.cjs` (`win`, `nsis` 블록)
- 네이티브 재빌드: `config/scripts/rebuild-native-deps.mjs`, `config/scripts/electron-builder-native-rebuild.cjs`
- 네이티브 로드 점검/보정: `config/scripts/ensure-native-runtime.mjs`
- 설치 프로그램 없이 화면만 확인하기(맥북 `pnpm dev`): [`macos-dev-ui-check.md`](./macos-dev-ui-check.md)
- 사내 정책 파일 스키마와 탐색 순서: `src/shared/enterprise-policy.ts`, `src/main/enterprise/enterprise-policy-file.ts`
