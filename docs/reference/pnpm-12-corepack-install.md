# pnpm 12 설치 — 사내망에서 막힐 때

upstream **v1.4.194**가 pnpm을 `10.24.0` → `12.0.0`으로 올렸습니다(`package.json`의 `packageManager` 핀).
그 전까지 잘 되던 `pnpm install`이 갑자기 깨진다면 거의 전부 이 전환 때문입니다.

같은 판에서 pnpm 설정 전체가 `package.json` → **`pnpm-workspace.yaml`** 로 이사했고
`.npmrc` / `mobile/.npmrc` 가 삭제됐습니다. `patchedDependencies`·`overrides`를 찾을 때는
`pnpm-workspace.yaml`을 보십시오.

> **pnpm 12는 2단 다운로드입니다.** ① corepack(또는 npm)이 `pnpm@12.0.0` **래퍼** tarball(약 0.9MB)을 받고,
> ② 그 래퍼가 **네이티브 실행파일**을 `@pnpm/exe.<platform>-<arch>`(win32-x64는 약 17.7MB)로 따로 받습니다.
> 둘 중 어느 쪽이 막혀도 비슷한 `.tgz` 실패로 보이므로, 아래 절차는 항상 **둘 다** 확보합니다.

---

## 0. 먼저 이것부터 — 저장소 **밖**에서 버전 확인

```powershell
cd C:\
pnpm --version
```

저장소 밖에는 `packageManager` 핀이 없어 pnpm이 자기 버전을 맞추려 들지 않습니다.
따라서 **실제로 깔린 버전이 그대로** 찍힙니다.

| 결과 | 뜻 | 갈 곳 |
| --- | --- | --- |
| `11.x` | `npm install -g pnpm`은 npm의 `latest` 태그(=11.25.0)를 깝니다. 12가 아닙니다 | [§3](#3-npm으로-직접-설치) |
| `12.0.0` | 설치는 정상. 저장소 안에서만 막히는 것 | [§1](#1-corepack-캐시-메타데이터-오염--cannot-find-module-pnpmcjs) / [§2](#2-사내망에서-다운로드가-끊길-때--econnreset--fetch-failed) |
| 실행 자체가 안 됨 | corepack 캐시 오염 | [§1](#1-corepack-캐시-메타데이터-오염--cannot-find-module-pnpmcjs) |
| `npm i -g pnpm@12.0.0` 을 했는데도 다운로드를 시도 | 다른 `pnpm`이 PATH에서 앞선다 | [§0-2](#0-2-pnpm이-여러-개일-때--어느-것이-실행되는지부터) |
| 다운로드만 막힘 (브라우저로는 받아짐) | 프록시가 Node의 직접 요청을 막음 | [§4](#4-브라우저로-받은-tgz를-직접-넣기-권장-오프라인-경로) |

---

## 0-2. `pnpm`이 여러 개일 때 — 어느 것이 실행되는지부터

**실제로 가장 흔한 원인입니다.** `npm install -g pnpm@12.0.0`이 성공했는데도 `pnpm --version`이
다운로드를 시도한다면, 그 `pnpm`이 npm이 깐 것이 아닙니다.

```powershell
where.exe pnpm
```

**맨 위 줄이 실행되는 것**입니다. 흔한 결과:

```
d:\Programs\nodejs\pnpm            ← corepack shim (Node 설치 폴더). 이게 이깁니다
d:\Programs\nodejs\pnpm.CMD
C:\Users\<u>\AppData\Roaming\npm\pnpm      ← npm 이 깐 pnpm 12. 가려져 있습니다
C:\Users\<u>\AppData\Roaming\npm\pnpm.cmd
```

`corepack enable`을 한 번이라도 했다면 Node 설치 폴더에 `pnpm`/`pnpm.cmd` shim이 생기고,
PATH에서 대개 그쪽이 앞섭니다. 그 shim은 corepack을 태우므로 **§1·§2의 corepack 문제를 그대로 겪습니다.**

**고침 — 둘 중 하나만 고르십시오.**

- **npm 전역 설치를 쓰기로 했다면** corepack shim을 걷어냅니다:

  ```powershell
  corepack disable pnpm      # Node 설치 폴더 쓰기 권한 필요. 안 되면 관리자 PowerShell
  where.exe pnpm             # 이제 AppData\Roaming\npm\pnpm.cmd 가 첫 줄이어야 정상
  ```

- **corepack을 쓰기로 했다면** shim은 두고 §1·§2·§5로 corepack 쪽을 고칩니다.

> ⚠️ `README.md` §1의 빌드 절차는 `corepack enable ; corepack prepare pnpm@12.0.0 --activate`로
> 시작합니다. npm 전역 설치를 쓰기로 했다면 **그 줄을 실행하지 마십시오** — shim이 되살아나
> 다시 가려집니다.

---

## 1. corepack 캐시 메타데이터 오염 — `Cannot find module ...pnpm.cjs`

```
Error: Cannot find module 'C:\Users\...\corepack\v1\pnpm\12.0.0\bin\pnpm.cjs'
```

`pnpx.cjs`로 뜨기도 합니다. **corepack을 업데이트해도 그대로 재발하는 것이 이 증상의 특징입니다.**

**원인.** pnpm 12는 `bin/pnpm.mjs`만 담고 있고 `.cjs`는 없습니다. 그런데 옛 corepack
(Node 26 번들 = 0.33.0)이 `.cjs`라고 단정해 **캐시 항목의 `.corepack` 메타데이터에 그대로 박아 넣습니다.**
한 번 박히면 새 corepack도 그 메타를 재사용하므로 계속 죽습니다.

```jsonc
// 옛 corepack이 쓴 값 (깨짐)
{"bin":{"pnpm":"./bin/pnpm.cjs","pnpx":"./bin/pnpx.cjs"}}
// 새 corepack이 쓰는 값 (정상)
{"bin":{"pnpm":"./bin/pnpm.mjs","pnpx":"./bin/pnpx.mjs"}}
```

**고침 — 순서가 전부입니다. 캐시를 지운 뒤 반드시 *새* corepack으로 먼저 실행하십시오.**

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\node\corepack\v1\pnpm" -ErrorAction SilentlyContinue
cd C:\경로\to\orca                       # 저장소 안에서
npx -y corepack@latest pnpm --version    # 전역 설치 없이 캐시 메타를 다시 씀
```

한 번 고치면 **번들 corepack으로도 그대로 동작합니다.** 다만 다음 pnpm 범프 때 같은 항목이 다시 오염되므로,
가능하면 `npm i -g corepack@latest`로 영구히 올려 두십시오.

확인:

```powershell
type "$env:LOCALAPPDATA\node\corepack\v1\pnpm\12.0.0\.corepack"   # .mjs 두 개가 보여야 정상
```

---

## 2. 사내망에서 다운로드가 끊길 때 — `ECONNRESET` / `fetch failed`

```
error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-12.0.0.tgz
[cause] TypeError: fetch failed ... read ECONNRESET
```

**원인. corepack은 `.npmrc`를 읽지 않습니다.** corepack 0.36.0 번들을 검사한 결과 `npmrc` 문자열 0건,
`HTTPS_PROXY`/`ProxyAgent`/`NODE_EXTRA_CA_CERTS` 처리 0건입니다. 맨 `fetch()`로 `registry.npmjs.org`에
**직접** 갑니다. 그래서 **`npm`/`npx`는 되는데 corepack 다운로드만 리셋됩니다** — npm은 `.npmrc`의
미러·프록시·CA를 쓰고 corepack은 안 쓰기 때문입니다.

```powershell
cd C:\경로\to\orca

$env:COREPACK_NPM_REGISTRY = (npm config get registry)   # 사내 미러를 그대로 사용
$env:NODE_OPTIONS          = "--use-env-proxy"           # 프록시를 쓴다면 (+ $env:HTTPS_PROXY)
# 사내 미러가 재배포형이면 서명 검증이 깨지므로:
# $env:COREPACK_INTEGRITY_KEYS = "{}"

corepack pnpm install --frozen-lockfile
```

관련 환경변수: `COREPACK_NPM_REGISTRY`, `COREPACK_NPM_TOKEN`,
`COREPACK_NPM_USERNAME`/`COREPACK_NPM_PASSWORD`, `COREPACK_INTEGRITY_KEYS`,
`COREPACK_ENABLE_NETWORK`.

> **반드시 저장소 디렉터리 안에서 실행하십시오.** 밖에서 `corepack pnpm ...`을 치면 프로젝트 핀을 못 보고
> corepack **기본 버전**을 받으러 갑니다 — 엉뚱한 버전의 `.tgz` URL이 에러에 찍혀 원인을 오독하게 됩니다.

---

## 3. npm으로 직접 설치

npm이 사내망에서 이미 되고 있다면 이 방법이 제일 단순합니다. **버전을 반드시 명시하십시오.**

```powershell
npm install -g pnpm@12.0.0      # ← @12.0.0 을 빼면 11.25.0 이 깔립니다
pnpm --version                  # → 12.0.0
cd C:\경로\to\orca
pnpm install --frozen-lockfile
```

npm의 `pnpm` `latest` 태그는 이 문서 기준 **11.25.0**이고 12는 `latest-12`에만 있습니다.
`npm install -g pnpm`(버전 없이)은 11을 깔고, 그 11이 저장소 안에서 12를 받으러 나갔다가 막힙니다.

- 설치 시 플랫폼 실행파일(`@pnpm/exe.win32-x64`)이 optional dependency로 **자동으로 함께** 깔립니다.
- ⚠️ **`--ignore-scripts`를 붙이지 마십시오.** 붙이면 실행파일 연결이 안 돼 `pnpm`이 깨진 스크립트로 남습니다.
  npm이 install script를 막는 정책이면 pnpm에 대해서만 허용해야 합니다.

---

## 4. 브라우저로 받은 tgz를 직접 넣기 (권장 오프라인 경로)

프록시/보안 장비 때문에 **Node가 직접 하는 다운로드만** 막히고 브라우저 다운로드는 되는 환경용입니다.
레지스트리 접근이 한 번도 필요 없습니다.

> **pnpm의 자기관리 store에는 손으로 넣을 수 없습니다.** 그 store는 파일 해시로 인덱싱된
> content-addressable 저장소라 `.tgz`를 떨궈 넣을 자리가 없습니다. 대신 **pnpm 자체를 손으로 배치**해
> 저장소 핀과 버전을 일치시키면, pnpm이 더 받을 것이 없어져 다운로드 자체가 사라집니다.

브라우저로 받을 파일 **2개**:

```
https://registry.npmjs.org/pnpm/-/pnpm-12.0.0.tgz                          (0.9MB)  ← 래퍼
https://registry.npmjs.org/@pnpm/exe.win32-x64/-/exe.win32-x64-12.0.0.tgz  (17.7MB) ← 실행파일
```

**첫 번째만으로는 동작하지 않습니다.** 두 번째가 진짜 pnpm 바이너리입니다.

받은 뒤 경로와 크기를 확인하십시오 — 사내 PC는 Downloads가 OneDrive로 리다이렉트된 경우가 많고,
보안 장비가 차단 페이지(HTML)를 `.tgz` 이름으로 저장해 두기도 합니다.

```powershell
Get-ChildItem "$HOME\Downloads\*.tgz" | Select-Object Name, Length   # 0.9MB / 17.7MB 여야 정상
```

### 4-1. npm으로 전역 설치 (권장 — tar 불필요)

```powershell
npm install -g "C:\받은경로\pnpm-12.0.0.tgz" "C:\받은경로\exe.win32-x64-12.0.0.tgz"

pnpm --version                     # → 12.0.0
cd C:\경로\to\orca
pnpm install --frozen-lockfile
```

**두 파일을 반드시 한 명령에 같이 넘기십시오.** 그래야 실행파일이 전역
`node_modules/@pnpm/exe.win32-x64`에 깔리고 pnpm 래퍼가 상위 탐색으로 찾아냅니다.

⚠️ **다만 이것만으로는 부족할 수 있습니다.** npm은 로컬 tarball을 넘겨받아도 optional dependency인
`@pnpm/exe.<platform>`을 **레지스트리에서 다시 해석하려 합니다.** 레지스트리가 막힌 환경에서는
그 단계가 조용히 실패해 실행파일이 없는 채로 설치가 끝나고, `pnpm --version`이 다시 다운로드를
시도합니다. 그래서 설치 직후 아래를 이어서 하십시오 — **이걸로 다운로드 경로가 완전히 사라집니다.**

```powershell
$g = npm root -g          # 보통 %APPDATA%\npm\node_modules
# 실행파일 tarball 을 풀어 얻은 pnpm.exe 를 pnpm 패키지 루트에 이 이름으로 둔다
Copy-Item "<추출한 경로>\pnpm.exe" "$g\pnpm\pnpm-native.exe"
```

탐색 순서가 `node_modules/@pnpm/exe.*` → **`<pnpm 패키지 루트>\pnpm-native.exe`** → 다운로드이므로,
2순위에 직접 놓으면 1순위 해석이 실패해도 다운로드까지 가지 않습니다.

설치 중 `allow-scripts` 경고는 무시해도 됩니다 — 실행파일이 이미 옆에 있어 install script 없이 동작합니다.

**이걸로 끝입니다.** 아래 4-2는 `npm install -g`를 쓸 수 없을 때만 봅니다.

### 4-2. (대안) 손으로 풀어서 배치

```powershell
$tgz  = "C:\받은경로"                     # 받은 파일이 있는 폴더 (경로를 정확히)
$root = "$env:LOCALAPPDATA\pnpm-manual"   # 풀어 둘 위치 (아무 데나 가능)

Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$root\pnpm" | Out-Null
tar -xzf "$tgz\pnpm-12.0.0.tgz" -C "$root\pnpm" --strip-components=1

# ★ 실행파일은 반드시 이 경로 (래퍼가 여기서 찾습니다)
New-Item -ItemType Directory -Force "$root\pnpm\node_modules\@pnpm\exe.win32-x64" | Out-Null
tar -xzf "$tgz\exe.win32-x64-12.0.0.tgz" -C "$root\pnpm\node_modules\@pnpm\exe.win32-x64" --strip-components=1
```

완성된 배치는 이 모양이어야 합니다:

```
%LOCALAPPDATA%\pnpm-manual\pnpm\
├─ bin\pnpm.mjs                                    ← 진입점
├─ native-binary.mjs
└─ node_modules\@pnpm\exe.win32-x64\pnpm.exe      ← 실제 실행파일
```

사용:

```powershell
cd C:\경로\to\orca
node "$root\pnpm\bin\pnpm.mjs" --version              # → 12.0.0
node "$root\pnpm\bin\pnpm.mjs" install --frozen-lockfile
```

`pnpm`을 평소처럼 쓰고 싶으면 셸 래퍼를 하나 만들어 PATH에 넣으십시오:

```powershell
$bin = "$root\bin"
New-Item -ItemType Directory -Force $bin | Out-Null
Set-Content "$bin\pnpm.cmd" "@echo off`r`nnode `"$root\pnpm\bin\pnpm.mjs`" %*"
$env:Path = "$bin;$env:Path"          # 영구 적용은 시스템 환경변수 PATH에 $bin 추가
pnpm --version
```

**왜 이걸로 다운로드가 사라지나.** pnpm은 저장소의 `packageManager` 핀과 자기 버전이 다르면
핀된 버전을 내려받아 그걸로 실행합니다(`pnpm --version`조차 그렇습니다). 손으로 배치한 pnpm이
이미 `12.0.0`이라 그 단계가 통째로 없어집니다. 바이너리 탐색도
`node_modules/@pnpm/exe.*` → `<루트>\pnpm-native.exe` → 다운로드 순이라, 위 배치면 첫 단계에서 끝납니다.


---

## 5. (대안) corepack 캐시 시딩

`corepack pnpm`을 쓰는 흐름이라면 corepack 캐시 쪽에 같은 두 tarball을 심어도 됩니다.

```powershell
cd C:\경로\to\orca
$tgz = "$HOME\Downloads"

$dest = "$env:LOCALAPPDATA\node\corepack\v1\pnpm\12.0.0"
Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dest | Out-Null
tar -xzf "$tgz\pnpm-12.0.0.tgz" -C $dest --strip-components=1

$tmp = Join-Path $env:TEMP "pnpmexe"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null
tar -xzf "$tgz\exe.win32-x64-12.0.0.tgz" -C $tmp --strip-components=1
Copy-Item "$tmp\pnpm.exe" "$dest\pnpm-native.exe"

# 메타데이터 — bin 이 .mjs 여야 한다. ConvertTo-Json 대신 문자열로 조립한다
$sha  = ((Get-Content .\package.json -Raw | ConvertFrom-Json).packageManager -split '\+')[1]
$meta = '{"locator":{"name":"pnpm","reference":"12.0.0+' + $sha + '"},' +
        '"bin":{"pnpm":"./bin/pnpm.mjs","pnpx":"./bin/pnpx.mjs"},"hash":"' + $sha + '"}'
[IO.File]::WriteAllText("$dest\.corepack", $meta)
type "$dest\.corepack"          # .mjs 두 개 확인

$env:COREPACK_ENABLE_NETWORK = "0"
corepack pnpm --version         # → 12.0.0
Remove-Item Env:COREPACK_ENABLE_NETWORK
```

이후로는 `pnpm` 대신 **`corepack pnpm`** 을 쓰십시오.

---

## 부록 — 이 문서의 검증 범위

정직하게 적습니다.

**검증한 것**(macOS arm64, Node 26.5.0, corepack 0.33.0/0.36.0):

- `.corepack` 메타의 `.cjs` ↔ `.mjs` 차이가 §1 증상의 원인임 — 양쪽 값을 직접 확인.
- 캐시 삭제 → 새 corepack 1회 실행으로 복구되고, 그 뒤에는 번들 corepack으로도 동작함.
- corepack 번들에 `npmrc`/프록시 처리가 없음 — 정적 검사.
- §4-1의 `pnpm-native.exe` 드롭인이 실행파일 해석을 대체함 — `@pnpm/exe.*`를 지운 상태에서도
  `pnpm --version` → `12.0.0`, `install --frozen-lockfile` 통과함.
- **정정**: `npm install -g <래퍼 tgz> <실행파일 tgz>`는 레지스트리 요청 0회가 **아닙니다.**
  npm이 optional dependency를 레지스트리에서 다시 해석합니다(네트워크가 열린 맥에서 조용히
  받아오는 것을 처음에 오독했습니다). 그래서 §4-1에 드롭인 단계를 덧붙였습니다.
- §4-2 수동 배치(두 tarball을 풀어 `node_modules/@pnpm/exe.*`에 실행파일을 둠)가 `12.0.0`을 출력하고
  실제 `pnpm install --frozen-lockfile`까지 통과함. 래퍼가 로컬 실행파일을 집는 것도 `require.resolve`로 확인.
- §5 corepack 시딩이 `COREPACK_ENABLE_NETWORK=0`에서 `12.0.0`을 출력하고 install까지 통과함.
- `npm install -g pnpm@12.0.0`이 `@pnpm/exe.*`를 함께 설치하고 저장소 install을 통과함.
  `--ignore-scripts`를 붙이면 깨짐.

**검증하지 못한 것:**

- Windows에서의 §4-1 재현(경로 표기만 옮긴 것입니다). §4-2 수동 배치는 사용자가 Windows에서 동작을 확인했습니다.
- **pnpm 자기관리 store에 tarball을 손으로 주입하는 방법은 없습니다**(확인함). 저장 위치는
  `<PNPM_HOME>/store/v11/`의 content-addressable 저장소이고 파일 해시로 인덱싱되어 있어
  `.tgz`를 놓을 자리가 없습니다. `manage-package-manager-versions=false`를 rc·환경변수·
  `pnpm-workspace.yaml` 세 형태로 시도했지만 `--version`에는 적용되지 않았습니다.
  그래서 §4는 **pnpm 자체를 핀과 같은 버전으로 배치해 자기관리를 무력화**하는 방식을 씁니다.

관련 문서: [Windows 사내 빌드 가이드](./windows-corporate-build.md) ·
[로컬 개발 실행](./local-dev-run.md)
