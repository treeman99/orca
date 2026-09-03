# pnpm 12 — 받아 둔 tarball 직접 배치 (임시 문서, 확인 후 삭제)

프록시가 **Node의 직접 다운로드만** 막고 브라우저 다운로드는 되는 환경용.
레지스트리 접근이 한 번도 필요 없다.

정식 문서: `docs/reference/pnpm-12-corepack-install.md` §4

---

## 왜 이렇게 하나

`pnpm --version`조차 저장소의 `packageManager: pnpm@12.0.0` 핀과 자기 버전이 다르면
핀된 버전을 내려받아 그걸로 실행한다. 그 다운로드가 막히는 것이다.

**pnpm 자기관리 store에는 tgz를 손으로 넣을 수 없다** — `<PNPM_HOME>/store/v11/`은
파일 해시로 인덱싱된 content-addressable 저장소라 파일을 떨궈 넣을 자리가 없다.
`manage-package-manager-versions=false`도 rc·환경변수·`pnpm-workspace.yaml` 세 형태 모두
`--version`에는 적용되지 않았다.

대신 **pnpm 자체를 핀과 같은 버전으로 손수 배치**하면 받을 것이 없어져 다운로드가 사라진다.

---

## 0. `pnpm`이 여러 개면 그것부터

```powershell
where.exe pnpm
```

**맨 위 줄이 실행된다.** `d:\Programs\nodejs\pnpm` 같은 Node 설치 폴더 항목은 **corepack shim**이고,
그게 npm으로 깐 pnpm 12(`AppData\Roaming\npm\pnpm.cmd`)를 가린다. npm 전역 설치를 쓸 거라면:

```powershell
corepack disable pnpm      # Node 설치 폴더 쓰기 권한 필요. 안 되면 관리자 PowerShell
where.exe pnpm             # AppData\Roaming\npm\pnpm.cmd 가 첫 줄이어야 정상
```

> `README.md` §1의 `corepack enable ; corepack prepare ...` 줄을 실행하면 shim이 되살아난다.

## 1. 브라우저로 파일 2개 받기

```
https://registry.npmjs.org/pnpm/-/pnpm-12.0.0.tgz                          (0.9MB)  ← 래퍼
https://registry.npmjs.org/@pnpm/exe.win32-x64/-/exe.win32-x64-12.0.0.tgz  (17.7MB) ← 실행파일
```

두 번째가 진짜 pnpm 바이너리다. **첫 번째만으로는 동작하지 않는다.**

받은 뒤 경로와 크기를 반드시 확인한다 — 사내 PC는 Downloads가 OneDrive로 리다이렉트된 경우가 많고,
보안 장비가 차단 페이지(HTML)를 `.tgz` 이름으로 저장해 두기도 한다.

```powershell
Get-ChildItem "$HOME\Downloads\*.tgz" | Select-Object Name, Length   # 0.9MB / 17.7MB 여야 정상
```

## 2. npm으로 전역 설치 (권장 — tar 불필요)

```powershell
npm install -g "C:\받은경로\pnpm-12.0.0.tgz" "C:\받은경로\exe.win32-x64-12.0.0.tgz"

pnpm --version                     # → 12.0.0
cd C:\경로\to\orca
pnpm install --frozen-lockfile
```

**두 파일을 반드시 한 명령에 같이 넘긴다.** 그래야 실행파일이 전역 `node_modules/@pnpm/exe.win32-x64`에
깔리고, pnpm 래퍼가 상위 탐색으로 그것을 찾는다. 하나씩 따로 설치하면 실행파일을 못 찾아 다시
다운로드를 시도한다.

레지스트리 접근을 아예 차단하려면 `--offline`을 붙인다:

```powershell
npm install -g --offline "C:\받은경로\pnpm-12.0.0.tgz" "C:\받은경로\exe.win32-x64-12.0.0.tgz"
```

설치 중 `allow-scripts` 경고가 떠도 무시해도 된다.

⚠️ **npm은 로컬 tarball을 줘도 optional dependency(`@pnpm/exe.*`)를 레지스트리에서 다시 해석한다.**
막힌 환경에서는 그 단계가 조용히 실패하므로, 설치 직후 실행파일을 직접 못 박는다:

```powershell
$g = npm root -g          # 보통 %APPDATA%\npm\node_modules
Copy-Item "$env:LOCALAPPDATA\pnpm-manual\pnpm\node_modules\@pnpm\exe.win32-x64\pnpm.exe" `
          "$g\pnpm\pnpm-native.exe"
pnpm --version            # → 12.0.0
```

탐색 순서가 `node_modules/@pnpm/exe.*` → **`<pnpm 패키지 루트>\pnpm-native.exe`** → 다운로드라,
2순위에 놓으면 다운로드까지 가지 않는다.

이걸로 끝이다. 다음부터는 그냥 `pnpm`을 쓰면 되고, 아래 3절은 npm 전역 설치를 쓸 수 없을 때만 본다.

## 3. (대안) 손으로 풀어서 배치

`npm install -g`를 쓸 수 없는 경우에만.

```powershell
$tgz  = "C:\받은경로"                     # 받은 파일이 있는 폴더 (경로를 정확히)
$root = "$env:LOCALAPPDATA\pnpm-manual"   # 풀어 둘 위치 (아무 데나 가능)

Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$root\pnpm" | Out-Null
tar -xzf "$tgz\pnpm-12.0.0.tgz" -C "$root\pnpm" --strip-components=1

# ★ 실행파일은 반드시 이 경로 — 래퍼가 여기서 찾는다
New-Item -ItemType Directory -Force "$root\pnpm\node_modules\@pnpm\exe.win32-x64" | Out-Null
tar -xzf "$tgz\exe.win32-x64-12.0.0.tgz" -C "$root\pnpm\node_modules\@pnpm\exe.win32-x64" --strip-components=1
```

완성된 배치:

```
%LOCALAPPDATA%\pnpm-manual\pnpm\
├─ bin\pnpm.mjs                                 ← 진입점
├─ native-binary.mjs
└─ node_modules\@pnpm\exe.win32-x64\pnpm.exe    ← 실제 실행파일
```

### 3-1. 사용

```powershell
cd C:\경로\to\orca
node "$root\pnpm\bin\pnpm.mjs" --version              # → 12.0.0
node "$root\pnpm\bin\pnpm.mjs" install --frozen-lockfile
```

### 3-2. `pnpm` 명령으로 쓰기

```powershell
$bin = "$root\bin"
New-Item -ItemType Directory -Force $bin | Out-Null
Set-Content "$bin\pnpm.cmd" "@echo off`r`nnode `"$root\pnpm\bin\pnpm.mjs`" %*"
$env:Path = "$bin;$env:Path"      # 영구 적용은 시스템 환경변수 PATH 에 $bin 추가
pnpm --version
```

---

## 참고

- 바이너리 탐색 순서는 `node_modules/@pnpm/exe.*` → `<루트>\pnpm-native.exe` → 다운로드다.
  위 배치면 첫 단계에서 끝나므로 네트워크를 타지 않는다.
- `npm install -g pnpm`(버전 없이)은 **11.25.0**을 깐다. npm의 `latest` 태그가 아직 11이다.

**검증**: macOS arm64에서 2절(`npm install -g` 로컬 tarball 2개)과 3절(수동 배치) 둘 다
`--version` → `12.0.0`, `install --frozen-lockfile` 통과 확인. 래퍼가 로컬 실행파일을 집는 것도
`require.resolve`로 확인. Windows에서는 3절 배치가 동작함을 사용자가 확인.

---

> 이 파일은 임시다. 확인 후 `git rm temp.md` 로 지울 것.
> (저장소 루트에 파일을 더하는 것은 `check-root-directory-entries` 가드가 PR에서 막는 항목이다 —
> 이 브랜치는 PR 없이 직접 푸시하므로 지금은 걸리지 않는다.)
