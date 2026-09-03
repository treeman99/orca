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

## 4. 완전 오프라인 시딩

레지스트리 접근이 아예 막혀 있고 **브라우저 다운로드만 되는** 환경용입니다.
파일 2개만 있으면 됩니다.

```
https://registry.npmjs.org/pnpm/-/pnpm-12.0.0.tgz                          (0.9MB)
https://registry.npmjs.org/@pnpm/exe.win32-x64/-/exe.win32-x64-12.0.0.tgz  (17.7MB)
```

두 번째가 실제 실행파일입니다. **첫 번째만으로는 동작하지 않습니다.**

```powershell
cd C:\경로\to\orca
$tgz = "$HOME\Downloads"        # 받은 파일이 있는 폴더

# 캐시 항목을 새로 만든다
$dest = "$env:LOCALAPPDATA\node\corepack\v1\pnpm\12.0.0"
Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dest | Out-Null
tar -xzf "$tgz\pnpm-12.0.0.tgz" -C $dest --strip-components=1

# 네이티브 실행파일을 pnpm-native.exe 라는 이름으로 배치한다
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

# 검증 — 네트워크를 끈 채로
$env:COREPACK_ENABLE_NETWORK = "0"
corepack pnpm --version         # → 12.0.0
Remove-Item Env:COREPACK_ENABLE_NETWORK

corepack pnpm install --frozen-lockfile
```

이후로는 `pnpm` 대신 **`corepack pnpm`** 을 쓰십시오.

**바이너리 탐색 순서**는 `resolveInstalledBinary()`(= `node_modules/@pnpm/exe.*`) →
`<캐시루트>\pnpm-native.exe` → 다운로드입니다. `pnpm-native.exe`가 제자리에 있으면 네트워크를 타지 않습니다.

---

## 부록 — 이 문서의 검증 범위

정직하게 적습니다.

**검증한 것**(macOS arm64, Node 26.5.0, corepack 0.33.0/0.36.0):

- `.corepack` 메타의 `.cjs` ↔ `.mjs` 차이가 §1 증상의 원인임 — 양쪽 값을 직접 확인.
- 캐시 삭제 → 새 corepack 1회 실행으로 복구되고, 그 뒤에는 번들 corepack으로도 동작함.
- corepack 번들에 `npmrc`/프록시 처리가 없음 — 정적 검사.
- §4 오프라인 시딩이 `COREPACK_ENABLE_NETWORK=0`에서 `12.0.0`을 출력하고
  실제 `pnpm install --frozen-lockfile`까지 통과함.
- `npm install -g pnpm@12.0.0`이 `@pnpm/exe.*`를 함께 설치하고 저장소 install을 통과함.
  `--ignore-scripts`를 붙이면 깨짐.

**검증하지 못한 것:**

- Windows에서의 실제 재현(위 경로들은 macOS 실측을 Windows 경로로 옮긴 것입니다).
- pnpm 자신의 자기관리(self-management)가 핀된 버전을 저장하는 디렉터리 구조.
  저장소 안에서 pnpm 11이 12로 바뀌는 동작은 재현했지만 저장 위치를 특정하지 못했습니다.
  그래서 §4는 pnpm의 `.tools`가 아니라 **corepack 캐시**를 시딩합니다.

관련 문서: [Windows 사내 빌드 가이드](./windows-corporate-build.md) ·
[로컬 개발 실행](./local-dev-run.md)
