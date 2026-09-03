# pnpm 설치 (임시 문서 — 확인 후 `git rm temp.md`)

사내 Windows 에서 확인된 절차입니다. 정식 문서: `docs/reference/pnpm-12-corepack-install.md`

**저장소는 pnpm `12.0.0`에 핀되어 있습니다**(upstream 그대로). 한때 11.25.0으로 내렸다가
되돌렸습니다 — 막고 있던 것은 pnpm 12 자체가 아니라 corepack 과 설치 잔해였습니다.

---

## 설치

```powershell
# corepack shim 이 있으면 걷어낸다 (이게 있으면 corepack 이 다운로드를 맡는데
# corepack 은 .npmrc 를 읽지 않아 사내 미러·프록시를 못 탄다)
corepack disable pnpm
where.exe pnpm            # AppData\Roaming\npm\pnpm.cmd 가 첫 줄이어야 정상

npm install -g pnpm

cd C:\경로\to\orca
pnpm --version            # → 12.0.0 (저장소 핀을 pnpm 이 스스로 맞춘다)
pnpm install --frozen-lockfile
```

**`corepack enable` 을 하지 마십시오.** shim 이 되살아나 npm 으로 깐 pnpm 을 가립니다.

## 막힐 때

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| `.tgz` 다운로드가 `ECONNRESET` | corepack shim 이 PATH 앞에 있음 | `corepack disable pnpm` |
| `ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED` | 실패한 install 이 남긴 잔해 | `Remove-Item -Recurse -Force node_modules` 후 재설치 |
| Spectre 완화 라이브러리(MSB8040) | `@vscode/windows-process-tree` 패치 미적용 | `git pull` (2026-09-03 에 패치 수정됨) 후 재설치 |
| `pnpm --version` 이 `11.x` | 저장소 밖에서 실행함 | 저장소 안에서 실행 |

판정용:

```powershell
Select-String -Path node_modules\@vscode\windows-process-tree\binding.gyp -Pattern SpectreMitigation
# 출력이 없어야 정상
```

## 앞으로 정리할 것 (이번 삽질의 잔해)

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\pnpm-manual" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "D:\download\_exe" -ErrorAction SilentlyContinue
# 환경 변수 PATH 에 pnpm-manual\bin 을 넣었다면 제거
```

---

> 이 파일은 임시다. 확인 후 `git rm temp.md` 로 지울 것.
