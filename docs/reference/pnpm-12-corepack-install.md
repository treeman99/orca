# pnpm 설치 — 사내 Windows 에서 막힐 때

upstream **v1.4.194**가 pnpm을 `10.24.0` → `12.0.0`으로 올렸습니다(`package.json`의 `packageManager` 핀).
그 전까지 잘 되던 `pnpm install`이 갑자기 깨진다면 거의 전부 이 전환 때문입니다.
같은 판에서 pnpm 설정 전체가 `package.json` → **`pnpm-workspace.yaml`** 로 이사했고
`.npmrc` / `mobile/.npmrc` 가 삭제됐습니다.

**포크는 upstream 핀(12.0.0)을 그대로 따릅니다.** 한때 11.25.0으로 내렸다가 되돌렸습니다 —
막고 있던 것이 pnpm 12 자체가 아니었기 때문입니다(아래 §1·§2).
사내 Windows 에서 install 부터 설치 프로그램 생성까지 통과하는 것을 확인했습니다(2026-09-03).

---

## 설치 — 이 한 줄입니다

```powershell
npm install -g pnpm

cd C:\경로\to\orca
pnpm --version                 # → 12.0.0  (저장소 핀을 pnpm 이 스스로 맞춥니다)
pnpm install --frozen-lockfile
```

`npm install -g pnpm`은 npm의 `latest`(11.x)를 깔지만, 저장소 안에서 pnpm이
`packageManager` 핀을 보고 12를 스스로 받아 실행합니다. **그 다운로드는 pnpm 자신이 하므로
`.npmrc`의 사내 미러·프록시·CA 설정을 그대로 탑니다.**

> ⚠️ **`corepack enable` 을 하지 마십시오.** 이유는 §1.

---

## §1. `corepack enable` 이 원인입니다 — 다운로드가 끊길 때

증상: `pnpm --version` 또는 `pnpm install` 이 `registry.npmjs.org/pnpm/-/pnpm-12.0.0.tgz`
같은 주소에서 `ECONNRESET` / `fetch failed` 로 죽습니다. **브라우저로는 같은 파일이 받아집니다.**

원인: `corepack enable` 은 **Node 설치 폴더**(예: `d:\Programs\nodejs`)에 `pnpm`/`pnpm.cmd`
shim 을 만듭니다. PATH 에서 대개 그쪽이 `%APPDATA%\npm\pnpm.cmd` 보다 앞서므로,
`pnpm` 을 쳐도 **corepack 이 실행되어 corepack 이 다운로드를 맡습니다.**
그리고 **corepack 은 `.npmrc` 를 읽지 않습니다** — 번들을 정적으로 검사하면 `npmrc` 참조 0건,
`HTTPS_PROXY`/`ProxyAgent`/`NODE_EXTRA_CA_CERTS` 처리도 0건입니다. 맨 `fetch()` 로
`registry.npmjs.org` 에 직접 나갑니다.

| | `.npmrc`(미러·프록시·CA) 읽나 |
| --- | --- |
| `npm` | ✅ |
| `pnpm` | ✅ |
| `corepack` | ❌ |

**고침:**

```powershell
where.exe pnpm            # 맨 위 줄이 실행됩니다
corepack disable pnpm     # Node 폴더 쓰기 권한 필요. 안 되면 관리자 PowerShell
where.exe pnpm            # AppData\Roaming\npm\pnpm.cmd 가 첫 줄이어야 정상
```

corepack 을 계속 써야 한다면 §2·§3·§6 으로 corepack 쪽을 고칩니다. **둘 중 하나만 고르십시오.**

---

## §2. `ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED` — 잔해입니다

권한 문제가 아닙니다. 실패한 install 들이 남긴 `node_modules` 가 원인입니다.

```powershell
cd C:\경로\to\orca
Remove-Item -Recurse -Force node_modules
pnpm install --frozen-lockfile
```

이 에러 코드는 **pnpm 12 네이티브 바이너리에만** 존재합니다(pnpm 11 JS 번들에는 없음).
여기서 `PACKAGE_MANAGER` 는 pnpm 내부 크레이트 이름이지 "패키지 매니저 심링크"가 아닙니다.
그래도 계속 나면 Windows 개발자 모드(설정 → 개인 정보 및 보안 → 개발자용) 또는
관리자 PowerShell 을 시도하십시오.

---

## §3. Spectre 완화 라이브러리 에러(MSB8040)

`@vscode/windows-process-tree` 패치가 적용되지 않은 상태입니다. 2026-09-03 에 원인을 고쳤습니다 —
그 패치의 hunk 헤더가 본문과 어긋나 있었고(`-12 +11` 선언 / `-14 +13` 본문), pnpm 12 는 관대해서
적용했지만 pnpm 11 은 조용히 건너뛰었습니다. `git pull` 로 수정을 받은 뒤 다시 설치하십시오.

판정:

```powershell
Select-String -Path node_modules\@vscode\windows-process-tree\binding.gyp -Pattern SpectreMitigation
# 출력이 없어야 정상 (있으면 패치 미적용)
```

**패치 파일을 손대면 `pnpm install --lockfile-only` 로 lockfile 의 `patch_hash` 를 함께 갱신해야
합니다.** 안 하면 `--frozen-lockfile` 이 거부합니다. 이 저장소의 패치는 LF-only 여야 하며
(`windows-process-tree-patch-contract.test.mjs`), hunk 헤더 정합성은
`pnpm-patch-integrity.test.mjs` 가 양방향으로 검사합니다.

---

## §4. 그래도 레지스트리가 막힌 머신

여기까지 해도 다운로드가 안 되는 머신을 위한 예비 경로입니다. **위 §1~§3 으로 해결되면 필요 없습니다.**

### 4-A. 받아 둔 tgz 를 직접 넣기

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

#### npm 으로 전역 설치 (tar 불필요)

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

#### 손으로 풀어서 배치

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

### 4-B. corepack 캐시 시딩 (corepack shim 을 못 지우는 머신용)

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

## 부록 — 검증 범위

**사내 Windows 실측(2026-09-03).** `corepack disable pnpm` → `npm install -g pnpm` →
`node_modules` 삭제 → `pnpm install --frozen-lockfile` → **설치 프로그램 생성까지 통과.**
`pnpm --version` 은 12.0.0 을 찍습니다(핀을 pnpm 이 스스로 맞춘 결과).

**macOS arm64 실측.** corepack 이 `.npmrc`/프록시를 읽지 않는다는 것은 번들 정적 검사로,
`ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED` 가 pnpm 12 전용 코드라는 것은 바이너리 문자열로
확인했습니다. §3 의 패치 수정은 pnpm 12·11 양쪽에서 install 로 Spectre 제거를 확인했고,
`pnpm-patch-integrity` 게이트는 옛 패치를 되돌려 빨개지는 것까지 검증했습니다(뮤테이션 검증).
§4 의 오프라인 배치도 `COREPACK_ENABLE_NETWORK=0` 에서 동작을 확인했습니다.

**확인하지 못한 것.** §4 경로들의 Windows 실측(경로 표기만 옮겼습니다).
pnpm 자기관리 store 에 tarball 을 손으로 주입하는 방법은 **없습니다** — 파일 해시로 인덱싱된
content-addressable 저장소입니다. `manage-package-manager-versions=false` 는 rc·환경변수·
`pnpm-workspace.yaml` 세 형태 모두 `--version` 에 적용되지 않았습니다.

**한때 pnpm 11.25.0 으로 핀을 내렸다가 되돌렸습니다**(`0094c08896` → `4e8f5d6199`).
pnpm 11 은 순수 JS 라 네이티브 실행파일을 받지 않아 매력적이었지만, 실제 원인이 §1·§2 로
드러나 upstream 핀과 갈라설 이유가 없어졌습니다. 다시 검토하게 되면 그때 확인한 것들:
lockfile 9.0 은 pnpm 11 이 그대로 읽고 재작성하지 않으며, `pnpm-workspace.yaml` 의
`minimumReleaseAge`·`allowBuilds`·`supportedArchitectures`·`shamefullyHoist` 를 모두 수용하고,
전체 스위트 회귀가 0 이었습니다. 함께 움직여야 하는 곳은 `package.json`,
`config/scripts/pr-workflow-parallelism.test.mjs`, `config/docker/headless-pairing/Dockerfile.build`
세 곳이고 CI 워크플로는 `pnpm/setup@v2` 가 `packageManager` 를 읽으므로 손댈 것이 없습니다.

관련 문서: [Windows 사내 빌드 가이드](./windows-corporate-build.md) ·
[로컬 개발 실행](./local-dev-run.md)
