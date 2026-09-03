# pnpm 12 설치 런북 (임시 문서 — 확인 후 `git rm temp.md`)

받아 둔 파일이 **`D:\download`** 에 있다는 전제로 그대로 붙여 넣을 수 있게 적었다.
정식 문서: `docs/reference/pnpm-12-corepack-install.md`

배경: upstream v1.4.194가 pnpm을 `10.24.0` → `12.0.0`으로 올렸다(`packageManager` 핀).
사내망에서는 Node가 직접 하는 다운로드가 막혀 pnpm이 자기 버전을 맞추지 못한다.

---

## 0단계 — 받은 파일 확인

```powershell
Get-ChildItem D:\download\*.tgz | Select-Object Name, Length
```

이 두 개가 있어야 하고, 크기가 맞아야 한다.

| 파일 | 크기 | 받는 곳 |
| --- | --- | --- |
| `pnpm-12.0.0.tgz` | 약 **967,029** B (0.9MB) | `https://registry.npmjs.org/pnpm/-/pnpm-12.0.0.tgz` |
| `exe.win32-x64-12.0.0.tgz` | 약 **17,689,441** B (17.7MB) | `https://registry.npmjs.org/@pnpm/exe.win32-x64/-/exe.win32-x64-12.0.0.tgz` |

- 파일명이 다르면 아래 명령의 이름을 실제 이름으로 바꾼다.
- 크기가 몇 KB면 보안 장비가 차단 페이지(HTML)를 `.tgz` 이름으로 저장한 것이다 — 다시 받아야 한다.
- **두 번째가 진짜 pnpm 실행파일이다. 첫 번째만으로는 동작하지 않는다.**

---

## 1단계 — 앞을 가로막는 pnpm 치우기

```powershell
where.exe pnpm
```

지금 상태에서는 이렇게 나온다:

```
d:\Programs\nodejs\pnpm            ← corepack shim. 맨 위라 이게 실행된다
d:\Programs\nodejs\pnpm.CMD
C:\Users\<사용자>\AppData\Roaming\npm\pnpm       ← npm 이 깐 pnpm. 가려져 있다
C:\Users\<사용자>\AppData\Roaming\npm\pnpm.cmd
```

Node 설치 폴더의 `pnpm`은 `corepack enable`이 만든 shim이고, 이게 corepack을 태워 매번
tarball을 받으러 나간다. npm 전역 설치를 쓸 것이므로 걷어낸다.

```powershell
corepack disable pnpm
where.exe pnpm          # AppData\Roaming\npm\pnpm.cmd 가 첫 줄이면 성공
```

> `d:\Programs\nodejs` 쓰기 권한이 없으면 **관리자 PowerShell**로 다시 실행한다.
> 그래도 안 되면 이 단계를 건너뛰고 맨 아래 「1단계가 막혔을 때」로 간다.

---

## 2단계 — pnpm 12 전역 설치

```powershell
npm install -g "D:\download\pnpm-12.0.0.tgz" "D:\download\exe.win32-x64-12.0.0.tgz"
```

두 파일을 **한 명령에 같이** 넘긴다. `allow-scripts` 경고는 무시해도 된다.

---

## 3단계 — 실행파일 못 박기 (이 단계를 빼면 다시 다운로드한다)

npm은 로컬 tarball을 받아도 optional dependency(`@pnpm/exe.win32-x64`)를 **레지스트리에서 다시
해석하려 한다.** 막힌 환경에서는 그 단계가 조용히 실패해 실행파일 없이 설치가 끝난다.
그래서 실행파일을 직접 놓는다.

```powershell
# 실행파일 tarball 풀기
$tmp = "D:\download\_exe"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null
tar -xzf "D:\download\exe.win32-x64-12.0.0.tgz" -C $tmp --strip-components=1

# pnpm 패키지 루트에 pnpm-native.exe 라는 이름으로 복사
$g = npm root -g                       # 보통 C:\Users\<사용자>\AppData\Roaming\npm\node_modules
Copy-Item "$tmp\pnpm.exe" "$g\pnpm\pnpm-native.exe" -Force

Get-ChildItem "$g\pnpm\pnpm-native.exe" | Select-Object FullName, Length   # 17.7MB 확인
```

실행파일 탐색 순서가 `node_modules/@pnpm/exe.*` → **`<pnpm 패키지 루트>\pnpm-native.exe`** →
다운로드라서, 2순위에 직접 놓으면 1순위 해석이 실패해도 다운로드까지 가지 않는다.

> 이미 `%LOCALAPPDATA%\pnpm-manual`에 풀어 두었다면 tar 없이 그것을 복사해도 된다:
>
> ```powershell
> Copy-Item "$env:LOCALAPPDATA\pnpm-manual\pnpm\node_modules\@pnpm\exe.win32-x64\pnpm.exe" `
>           "$g\pnpm\pnpm-native.exe" -Force
> ```

---

## 4단계 — 확인

```powershell
where.exe pnpm            # AppData\Roaming\npm\pnpm.cmd 가 첫 줄
pnpm --version            # → 12.0.0  (다운로드 시도 없이 즉시)

cd C:\경로\to\orca
pnpm install --frozen-lockfile
```

여기까지 되면 끝이다. 다음부터는 그냥 `pnpm`을 쓰면 된다.

---

## 뒷정리 (선택)

```powershell
Remove-Item -Recurse -Force "D:\download\_exe"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\pnpm-manual"   # 임시 배치를 썼다면
```

임시로 PATH에 넣었던 `pnpm-manual\bin` 항목이 있으면 그것도 제거한다.

---

## 주의 — `README.md` §1과 충돌한다

빌드 가이드 §1이 `corepack enable ; corepack prepare pnpm@12.0.0 --activate` 로 시작한다.
**이 런북대로 npm 전역 설치를 쓰기로 했다면 그 줄을 실행하면 안 된다** — corepack shim이
되살아나 다시 `d:\Programs\nodejs\pnpm`이 이기고 원점으로 돌아간다.

corepack을 쓰고 싶다면 그 반대로, npm 전역 pnpm을 지우고
`docs/reference/pnpm-12-corepack-install.md` §1·§2·§5로 corepack 쪽을 고친다. **둘 중 하나만 고른다.**

---

## 1단계가 막혔을 때 — `corepack disable`이 안 되는 경우

Node 설치 폴더에 쓸 수 없으면 shim을 지울 수 없다. 그러면 shim이 계속 이기므로,
**shim이 쓰는 corepack 캐시 쪽에 실행파일을 심는다.** (2·3단계 대신 이것만 한다.)

```powershell
cd C:\경로\to\orca

# 실행파일을 미리 풀어 둔다
$tmp = "D:\download\_exe"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null
tar -xzf "D:\download\exe.win32-x64-12.0.0.tgz" -C $tmp --strip-components=1

$dest = "$env:LOCALAPPDATA\node\corepack\v1\pnpm\12.0.0"
Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dest | Out-Null
tar -xzf "D:\download\pnpm-12.0.0.tgz" -C $dest --strip-components=1
Copy-Item "$tmp\pnpm.exe" "$dest\pnpm-native.exe" -Force

# 메타데이터 — bin 이 .mjs 여야 한다 (ConvertTo-Json 쓰지 말 것)
$sha  = ((Get-Content .\package.json -Raw | ConvertFrom-Json).packageManager -split '\+')[1]
$meta = '{"locator":{"name":"pnpm","reference":"12.0.0+' + $sha + '"},' +
        '"bin":{"pnpm":"./bin/pnpm.mjs","pnpx":"./bin/pnpx.mjs"},"hash":"' + $sha + '"}'
[IO.File]::WriteAllText("$dest\.corepack", $meta)
type "$dest\.corepack"          # .mjs 두 개 보이면 정상

$env:COREPACK_ENABLE_NETWORK = "0"
pnpm --version                  # → 12.0.0 (shim 이 실행되지만 캐시를 쓰므로 다운로드 없음)
Remove-Item Env:COREPACK_ENABLE_NETWORK

pnpm install --frozen-lockfile
```

---

**검증 범위**: 위 구조(pnpm 패키지 루트의 `pnpm-native` 드롭인, corepack 캐시 시딩)는
macOS arm64에서 `@pnpm/exe.*`를 지운 상태로 `pnpm --version` → `12.0.0` 과
`install --frozen-lockfile` 통과를 확인했다. Windows 경로 표기는 옮긴 것이며 실측은 미완.

> 이 파일은 임시다. 확인 후 `git rm temp.md` 로 지울 것.
