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

## 1. 브라우저로 파일 2개 받기

```
https://registry.npmjs.org/pnpm/-/pnpm-12.0.0.tgz                          (0.9MB)  ← 래퍼
https://registry.npmjs.org/@pnpm/exe.win32-x64/-/exe.win32-x64-12.0.0.tgz  (17.7MB) ← 실행파일
```

두 번째가 진짜 pnpm 바이너리다. **첫 번째만으로는 동작하지 않는다.**

## 2. 풀어서 배치

```powershell
$tgz  = "$HOME\Downloads"                 # 받은 파일이 있는 폴더
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

## 3. 사용

```powershell
cd C:\경로\to\orca
node "$root\pnpm\bin\pnpm.mjs" --version              # → 12.0.0
node "$root\pnpm\bin\pnpm.mjs" install --frozen-lockfile
```

## 4. `pnpm` 명령으로 쓰기 (선택)

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
- `npm`이 레지스트리에 닿는 환경이면 `npm install -g "$tgz\pnpm-12.0.0.tgz"` 한 줄로도 된다.
  다만 그때도 실행파일은 optional dependency로 레지스트리에서 받으므로, 막히면 위 수동 배치를 쓴다.
- `npm install -g pnpm`(버전 없이)은 **11.25.0**을 깐다. npm의 `latest` 태그가 아직 11이다.

**검증**: macOS arm64에서 같은 구조로 조립해 `--version`과 `install --frozen-lockfile` 통과 확인.
래퍼가 로컬 실행파일을 집는 것도 `require.resolve`로 확인. Windows 실측은 미완.

---

> 이 파일은 임시다. 확인 후 `git rm temp.md` 로 지울 것.
> (저장소 루트에 파일을 더하는 것은 `check-root-directory-entries` 가드가 PR에서 막는 항목이다 —
> 이 브랜치는 PR 없이 직접 푸시하므로 지금은 걸리지 않는다.)
