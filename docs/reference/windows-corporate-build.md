# Windows 사내 빌드 가이드

사내 Windows 환경에서 Orca 설치 프로그램(`.exe`)을 만드는 절차입니다.
기준 버전: **v1.4.153** (브랜치 `enterprise/samsungds`).

**최종 산출물**: `dist\orca-windows-setup.exe`
NSIS 원클릭 설치 프로그램, x64, **per-user 설치**(관리자 권한 불필요, `%LOCALAPPDATA%\Programs\`에 설치), 기본적으로 **서명 없음**.

---

## 1. 사전 준비물

| 항목 | 요구사항 | 비고 |
| --- | --- | --- |
| OS | Windows 10 1809(빌드 17763) 이상, **x64** | ARM64 머신에서 빌드하면 x64 헬퍼가 섞인 잘못된 패키지가 나옵니다. §2 참고 |
| Node.js | **24 LTS 권장 / 최신 버전도 가능** | 상세는 §3 |
| pnpm | **10.24.0** | `corepack enable` 후 `corepack prepare pnpm@10.24.0 --activate` |
| Visual Studio | **VS 2022 Build Tools** + "C++를 사용한 데스크톱 개발" 워크로드 (MSVC v143 + Windows SDK) | **가장 큰 실패 요인.** §3-3 |
| Python | 3.x, PATH 등록 | node-gyp 요구사항 |
| .NET Framework 4.x | `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` | Windows 8 이상 기본 탑재. **없으면 빌드가 중단됩니다** (§6-2) |
| Windows PowerShell | 5.1 (`powershell.exe`) | Electron zip 압축 해제에 사용 |
| Git | 2.25 이상 | |
| 디스크 | 약 15 GB 이상 | `node_modules` + Electron 배포본 + `dist` |

> 작업 경로는 **공백과 한글이 없는 짧은 경로**를 쓰세요 (예: `C:\src\orca`). NSIS와 node-gyp는 긴 경로에서 자주 깨집니다.

---

## 2. 아키텍처 주의 (ARM64 Windows)

`config/electron-builder.config.cjs`의 `win.extraResources`는 `agent-browser-win32-x64.exe`(:214)와 x64 음성 네이티브 바인딩을 **하드코딩**하고 있습니다. 또한 산출물 이름이 `orca-windows-setup.${ext}`(:225)로 고정이라 **아키텍처가 파일명에 들어가지 않습니다.**

따라서 ARM64 Windows에서 빌드하면 arm64 앱 안에 x64 헬퍼가 들어간 채 **x64 빌드와 똑같은 파일명**으로 나옵니다. **반드시 `--x64`를 명시하세요.**

---

## 3. Node 버전 — 최신 Node를 써도 되는가

**결론: 됩니다. 다만 이 프로젝트가 실제로 테스트하는 유일한 구성은 Node 24입니다.**

### 3-1. 왜 되는가 (검증된 메커니즘)

패키지에 들어가는 네이티브 모듈(`node-pty`, `windows-native-registry`)은 **호스트 Node가 아니라 Electron 43 헤더로 컴파일**됩니다. `config/scripts/rebuild-native-deps.mjs:46-49`가 `node_modules/electron/package.json`에서 버전을 읽어 `@electron/rebuild`에 넘기고(:134-147), `config/electron-builder.config.cjs:393`이 이 스크립트를 `beforeBuild` 훅으로 매 빌드마다 실행합니다. 호스트 Node는 **스크립트 인터프리터 역할만** 합니다.

게다가 두 모듈 모두 **N-API(Node-API) 애드온**입니다 (`node-addon-api ^7.1.0` / `^4.3.0`). N-API는 `NODE_MODULE_VERSION` ABI에 묶이지 않으므로, Electron 43(ABI 148)로 빌드한 `.node`가 Node 26(ABI 147)에서 그대로 로드됩니다.

저장소 자체도 이를 전제로 합니다 — `config/electron-builder.config.cjs:157-162` 주석이 "it require()s the native (N-API) node-pty"라고 명시하고, 방어 분기도 런타임 버전이 아니라 **arch** 기준입니다(:162-174).

**Node 버전을 검사해 실패시키는 코드는 저장소 전체에 없습니다.** `process.versions.node` 사용처는 로그 문자열 두 곳(`config/scripts/ensure-native-runtime.mjs:406`, 벤치마크)뿐입니다. `.nvmrc` / `.node-version` / volta 핀 / `preinstall` 훅도 없습니다.

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

`pnpm install`은 `WARN Unsupported engine: wanted {"node":"24"}` 경고를 내지만 **계속 진행합니다** — `.npmrc`에 `engine-strict`가 없어 `engines` 핀이 강제되지 않기 때문입니다.

> **정직한 한계**: 위 실측은 macOS이고, Windows + 최신 Node 조합은 **CI에서도 저장소 이력에서도 한 번도 실행된 적이 없습니다.** 모든 CI 잡이 `node-version-file: package.json`으로 Node 24에 고정되어 있고 Windows 러너는 `windows-2022`만 씁니다.

### 3-3. 권장 운영 방식

사내 표준 Node를 그대로 쓰되, **첫 빌드 전에 5분짜리 사전 점검**을 하세요:

```powershell
pnpm install
node config/scripts/ensure-native-runtime.mjs --check-only      # 호스트 Node에서 로드 확인
node config/scripts/ensure-native-runtime.mjs --runtime=electron # Electron에서 로드 확인
```

**둘 다 exit 0이면 이후 빌드가 통과합니다.** 하나라도 실패하면 그때만 빌드 머신에 nvm-windows로 Node 24를 설치하세요.

준비 노력은 Node가 아니라 **Visual Studio에 쓰세요.** CI가 `windows-2022`를 명시적으로 고정하며 남긴 주석(`.github/workflows/release-cut.yml:722-724`)이 이유를 밝힙니다 — "windows-latest가 VS 2026 이미지로 넘어가면서 node-gyp가 VS 18을 탐지하지 못해 네이티브 설치가 깨졌다". 실제로 깨지는 건 이쪽입니다.

`engines` 값을 `>=24` 따위로 "고치지" 마세요. 모든 CI 잡이 이 값에서 Node 버전을 해석하므로, 릴리스 아티팩트를 만드는 Node 버전이 조용히 바뀝니다.

---

## 4. 빌드 절차

PowerShell에서 실행합니다.

```powershell
# 0) 클론 및 체크아웃
git clone <사내 저장소 URL> C:\src\orca
cd C:\src\orca
git checkout enterprise/samsungds      # 또는 v1.4.153

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

# 4) 앱 빌드
pnpm build:release

# 5) 네이티브 런타임 확인
node config/scripts/ensure-native-runtime.mjs --runtime=electron
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 6) 패키징 — --publish never 필수
pnpm exec electron-builder --config config/electron-builder.config.cjs --win --x64 --publish never
```

6번 명령은 CI가 실제로 쓰는 명령(`release-cut.yml:726`)과 동일하며, `--x64`만 안전을 위해 추가한 것입니다.

### `build:release` vs `build:win`

`pnpm build:win`이라는 원커맨드가 있지만 **그대로 쓰지 마세요** — `--publish never`가 빠져 있습니다(§5).

| | `build:release` (CI 경로, 권장) | `build:win` |
| --- | --- | --- |
| `typecheck` (tsc ×3) | 안 함 | 함 |
| `build:native` (Windows CLI 런처) | 함 | 안 함 — 단 `beforeBuild` 훅이 대신 실행하므로 결과는 같음 |
| `verify:computer-native` | 함 | 안 함 |
| `--publish never` | 명시해야 함 | **없음 (위험)** |

### 빌드 후 검증

CI와 동일한 sanity check입니다 (`release-cut.yml:908-923`).

```powershell
$rt = 'dist\win-unpacked\resources\node_modules\node-pty\build\Release'
@("$rt\conpty.node", "$rt\conpty\conpty.dll", "$rt\conpty\OpenConsole.exe") |
  ForEach-Object { if (-not (Test-Path $_)) { throw "missing $_" } }
Get-Item dist\orca-windows-setup.exe, dist\orca-windows-setup.exe.blockmap, dist\latest.yml
```

---

## 5. 절대 하지 말아야 할 것

### 5-1. `--publish never` 없이 패키징

`config/electron-builder.config.cjs:401-406`에 publish provider가 설정되어 있습니다:

```js
publish: { provider: 'github', owner: 'stablyai', repo: 'orca', releaseType: 'release' }
```

업로드 여부는 `--publish` 정책이 결정합니다:

| 상황 | 결과 |
| --- | --- |
| `--publish never` 명시 | 업로드 안 함 |
| 플래그 없음 + 개발자 PC (CI 환경변수 없음) | 업로드 안 함 |
| 플래그 없음 + **`CI=true`만 설정된 사내 러너** | `onTagOrDraft`로 해석되고 github provider는 스킵 대상에서 제외 → **업로드 시도** |
| 플래그 없음 + `GITHUB_REF_TYPE=tag` 등 태그 환경변수 | **업로드 시도** |

즉 사내 CI(Jenkins/GitLab 등 대부분 `CI=true`)에서 `pnpm build:win`을 그대로 돌리면 `github.com/stablyai/orca`로 draft 릴리스 업로드를 시도합니다. 토큰이 없으면 빌드가 실패하고, 토큰이 있으면 **사내 빌드가 외부로 나갑니다.**

방어책(강도 순):
1. **항상 `--publish never`를 붙인다** (코드 수정 불필요, 가장 확실)
2. 빌드 셸에서 `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_RELEASE_TOKEN` 제거
3. 사내 포크에서 `publish` 블록을 `publish: null`로 교체 — 이 경우 업데이터 메타(`latest.yml`, `app-update.yml`)도 생성되지 않습니다

> 3번은 **빌드 시점** phone-home만 막습니다. 앱이 실행 중에 GitHub 릴리스를 조회하는 **런타임 자동 업데이트**는 별개이며, 이 브랜치에서는 실행 환경에 `ORCA_ENTERPRISE_LOCKDOWN=1`(또는 `ORCA_DISABLE_AUTO_UPDATE=1`)을 설정하면 차단됩니다. 전체 외부 연동 잠금은 [외부 연동 감사](./external-integrations-audit.md) 참고.

### 5-2. `ORCA_MAC_RELEASE` 환경변수 남겨두기

`config/electron-builder.config.cjs:311`이 `forceCodeSigning: isMacRelease`이고 `isMacRelease`는 `process.env.ORCA_MAC_RELEASE === '1'`입니다. Windows 빌드 셸에 이 값이 남아 있으면 서명 정보가 없을 때 `InvalidConfigurationError`로 **빌드가 실패**합니다.

---

## 6. 사내망 / 프록시

### 6-1. 빌드 시점 네트워크 접점

| 단계 | 접속처 | 미러 / 우회 환경변수 |
| --- | --- | --- |
| `pnpm install` | `registry.npmjs.org` | `npm_config_registry`. ⚠️ `.npmrc`에 `minimum-release-age=4320`(3일)이 있어 **사내 미러가 패키지 `time` 메타데이터를 제공해야** 합니다 |
| postinstall → Electron 43.1.0 바이너리 | `github.com/electron/electron/releases/download/` | `ELECTRON_MIRROR`, `ELECTRON_CUSTOM_DIR`, `ELECTRON_CUSTOM_FILENAME` |
| node-gyp 헤더 | `nodejs.org/download/release/` | `npm_config_disturl`, `npm_config_nodedir` |
| Electron ABI 리빌드 헤더 | `www.electronjs.org/headers` | ⚠️ **환경변수로 못 바꿉니다.** `rebuild-native-deps.mjs`가 `headerURL`을 넘기지 않기 때문입니다. 우회: `%USERPROFILE%\.electron-gyp\`(=`ELECTRON_GYP_DIR`)에 Electron 43.1.0 헤더/`node.lib`를 미리 배치 |
| electron-builder 툴셋 (NSIS, rcedit) | `github.com/electron-userland/electron-builder-binaries/` | `ELECTRON_BUILDER_BINARIES_MIRROR`, `ELECTRON_BUILDER_CACHE`, `ELECTRON_BUILDER_NSIS_DIR`, `ELECTRON_BUILDER_RCEDIT_PATH` |

`winCodeSign` 번들은 **서명을 안 해도 필요합니다** — 아이콘/버전 리소스를 스탬핑하는 `rcedit`이 그 안에 들어 있습니다.

**빌드 시점에 음성 모델은 받지 않습니다.** sherpa-onnx 모델은 런타임에 사용자가 내려받는 구조입니다.

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

인증서 설정이 전혀 없으면 electron-builder는 `"no signing info identified, signing is skipped"`를 남기고 **서명을 건너뛴 뒤 빌드를 성공시킵니다.** `forceCodeSigning`이 Windows에서는 `false`이기 때문입니다(§5-2).

업스트림의 SignPath 연동은 **GitHub Actions 워크플로 안에만** 존재하며 `package.json`이나 electron-builder 설정에는 없습니다. 사내 빌드에서는 자동으로 완전히 건너뛰어지므로 별도 조치가 필요 없습니다.

### 사내 인증서로 서명하려면

환경변수만 설정하고 §4의 6단계를 다시 실행하면 `Orca.exe`, 내부 `.exe/.dll/.node`, 설치 프로그램까지 모두 서명됩니다.

```powershell
$env:WIN_CSC_LINK = "C:\path\to\cert.pfx"      # 또는 base64 문자열
$env:WIN_CSC_KEY_PASSWORD = "<password>"
```

인증서 저장소/HSM을 쓴다면 `win.signtoolOptions.certificateSubjectName` 또는 `.certificateSha1`을 설정합니다.

> ⚠️ **자동 업데이트와의 상호작용**: `win.signtoolOptions.publisherName`이 `'SignPath Foundation'`으로 하드코딩되어 있고(:198-200) 이 값이 `latest.yml` / `app-update.yml`에 기록됩니다. 즉 electron-updater가 **"SignPath Foundation" 서명만 수락**합니다. 사내 인증서로 서명하고 자동 업데이트도 쓸 계획이라면 이 값을 사내 CN으로 바꾸거나 `win.verifyUpdateCodeSignature: false`를 추가해야 합니다.

---

## 8. 실패 지점 트러블슈팅

패키징 중 `afterPack` 훅이 아래를 강제합니다 (`config/electron-builder.config.cjs:136-193`).

| 증상 | 원인 / 조치 |
| --- | --- |
| `pnpm install` 중 `cpu-features` 컴파일 에러 | **정상입니다. 무시하세요.** optional 의존성이며 `rebuild-native-deps.mjs:51`의 `ignoreModules`에도 등재되어 있습니다. ssh2가 순수 JS로 폴백합니다 |
| `beforeBuild`에서 node-gyp 실패 | MSVC/Python 미설치. VS 2022 Build Tools + Windows SDK + Python 3 설치. 단독 재현: `node config/scripts/rebuild-native-deps.mjs --platform=win32 --arch=x64 --force` |
| `csc.exe` 못 찾음 | .NET Framework 4.x 누락. `beforeBuild`가 Windows CLI 런처(`OrcaCliLauncher.cs`)를 컴파일하므로 **빌드가 중단됩니다** |
| `EPERM ... .node` | 실행 중인 Orca/Electron 프로세스가 파일을 잡고 있음. 전부 종료 후 재시도 |
| `conpty.dll` / `OpenConsole.exe` 없음 throw | node-pty 재빌드가 제대로 안 된 상태. `pnpm install` 재실행 |
| `Usage: daemon-entry` 검증 실패 | 패키징된 `daemon-entry.js`를 호스트 Node로 부팅하는 게이트(`verify-packaged-daemon-entry.cjs:33-55`). **호스트 Node 버전이 빌드에 영향을 주는 유일한 지점**이며, §3-3의 사전 점검이 이걸 미리 걸러냅니다 |
| `InvalidConfigurationError: GitHub Personal Access Token is not set` | `--publish never` 누락 (§5-1) |

`beforeBuild`는 매 빌드마다 `rebuild-native-deps.mjs --platform=win32 --arch=x64 --force`를 실행하므로 **`node-pty`와 `windows-native-registry`는 항상 소스에서 재컴파일**됩니다. 컴파일 툴체인은 선택이 아니라 필수입니다.

---

## 9. 참고

- CI가 실제로 하는 Windows 빌드: `.github/workflows/release-cut.yml` (Windows 잡)
- 산출물 이름/타깃 설정: `config/electron-builder.config.cjs` (`win`, `nsis` 블록)
- 네이티브 재빌드: `config/scripts/rebuild-native-deps.mjs`, `config/scripts/electron-builder-native-rebuild.cjs`
- 네이티브 로드 점검: `config/scripts/ensure-native-runtime.mjs`
