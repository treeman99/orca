# pnpm 설치 (임시 문서 — 확인 후 `git rm temp.md`)

**이 저장소는 이제 pnpm `11.25.0`에 고정됩니다.** 사내 프록시 환경 때문에 upstream의 pnpm 12를
따라가지 않기로 했습니다 — 배경은 `README.md` §6 「pnpm 버전을 upstream보다 낮게 고정합니다」.

pnpm 11은 **순수 JavaScript**라 네이티브 실행파일을 따로 받지 않습니다. 그래서 지금까지 겪던
tarball 다운로드·서명 없는 exe 차단 문제가 **전부 사라집니다.**

---

## 설치 — 이 한 줄이 전부

```powershell
npm install -g pnpm@11.25.0
```

## 그 전에 정리할 것 (지금까지 시도한 것 되돌리기)

```powershell
# 1) corepack shim 제거 — 이게 살아 있으면 npm 으로 깐 pnpm 을 계속 가립니다
corepack disable pnpm

# 2) 수동으로 깔았던 pnpm 12 제거
npm uninstall -g pnpm

# 3) 손으로 풀어 둔 배치 제거
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\pnpm-manual" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "D:\download\_exe" -ErrorAction SilentlyContinue

# 4) 오염됐던 corepack 캐시 제거
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\node\corepack\v1\pnpm" -ErrorAction SilentlyContinue

# 5) PATH 에 직접 추가했던 항목이 있으면 제거
#    시스템 속성 → 환경 변수 에서 pnpm-manual\bin 같은 항목을 지웁니다.
#    (이번 세션에서 $env:Path 로만 넣었다면 새 터미널을 열면 사라집니다)
```

그 다음:

```powershell
npm install -g pnpm@11.25.0

where.exe pnpm            # AppData\Roaming\npm\pnpm.cmd 하나만 나와야 정상
pnpm --version            # → 11.25.0  (다운로드 시도 없음)

cd C:\경로\to\orca
git pull
pnpm install --frozen-lockfile
```

## 확인 포인트

| 증상 | 뜻 |
| --- | --- |
| `where.exe pnpm` 첫 줄이 `d:\Programs\nodejs\pnpm` | corepack shim 이 아직 살아 있음 → `corepack disable pnpm` 다시 |
| `pnpm --version` 이 `12.x` | 옛 pnpm 이 남아 있음 → `npm uninstall -g pnpm` 후 재설치 |
| `pnpm --version` 이 다운로드를 시도 | 설치된 버전과 `packageManager` 핀이 다름. `git pull` 로 새 핀을 받았는지 확인 |
| Spectre 완화 라이브러리 에러(MSB8040) | 패치 미적용. `git pull` 로 고친 패치를 받았는지 확인 후 `pnpm install --frozen-lockfile` |

**Spectre 에러는 이번에 원인을 잡아 고쳤습니다** — `@vscode/windows-process-tree` 패치의 hunk 헤더가
깨져 있어 pnpm 11이 조용히 건너뛰고 있었습니다(pnpm 12는 관대해서 적용했습니다).
패치를 재생성했고 lockfile 해시도 맞췄으니, `git pull` 후 다시 설치하면 해결됩니다.

## 앞으로

- **`corepack enable` 을 하지 마십시오.** shim 이 되살아나 npm 으로 깐 pnpm 을 가립니다.
- `README.md` §1 빌드 절차와 `docs/reference/windows-corporate-build.md` 도 이 방식으로 고쳐 두었습니다.
- upstream 이 pnpm 을 또 올려도 이 포크는 11.25.0 을 유지합니다. 판정 순서는 README §6 에 있습니다.

---

> 이 파일은 임시다. 확인 후 `git rm temp.md` 로 지울 것.
> 항구적인 문서는 `docs/reference/pnpm-12-corepack-install.md` 와 `README.md` §6.
