# Windows: 앱을 껐다 켜면 claude 세션이 죽어 있을 때

**이 문서는 "왜 내 claude 세션이 앱 재시작을 못 넘기나"를 사용자가 자기 Windows PC에서
직접 판정하기 위한 절차다.** 명령은 전부 그대로 복붙해 돌릴 수 있고, 각 명령 밑에
"이 결과가 나오면 무엇이 참인지"가 붙어 있다.

증상: 사내 Windows 설치본에서 Orca를 껐다 켜면 claude를 돌리던 터미널이 **그냥 셸**이 되어 있다.
화면에 이전 대화가 남아 있는 것은 렌더러가 영속화한 스크롤백을 다시 그린 것일 뿐이고,
그 위에서 입력이 셸처럼 동작한다면 **claude 프로세스는 이미 죽은 것**이다.

**3분 판정:** [§4-1](#4-1-claude가-도는-상태에서-소유자를-확인한다-가장-빠른-판정)을 claude가
도는 상태에서 한 번 돌리면 대부분 여기서 끝난다. 배경이 궁금하면 §1을, 로그로 원인까지
좁히려면 §4-4 → §5를 본다.

## 1. 왜 이렇게 되는가 — 인과 사슬

세션이 앱 재시작을 넘겨 살아남는 유일한 경로는 **PTY 데몬**이다. 데몬이 PTY를 소유하면
Orca가 죽어도 claude는 데몬의 자식으로 계속 돈다. 데몬 레인이 실패하면 Orca는 조용히
in-process `LocalPtyProvider`로 폴백하고, 종료 시 `will-quit`의 `killAllPty()`가
**그 로컬 PTY를 전부 죽인다** (`src/main/ipc/pty.ts`의 `killAllPty`, upstream #5232).

    데몬 레인 실패/열화  →  터미널이 LocalPtyProvider에서 뜸  →  종료 시 killAllPty()  →  claude 사망
                                                                     →  다음 실행에서 fresh 셸

이 폴백은 **사용자에게 아무것도 보이지 않는다.** 터미널은 평소처럼 잘 동작하고,
차이는 앱을 끄는 순간에만 드러난다. 그래서 "재부착이 실패했다"가 아니라
"애초에 데몬이 세션을 갖고 있지 않았다"가 맞는 진술이다.

데몬 레인이 실패/열화하는 경로는 셋뿐이다.

| 경로 | 결과 | 로그 이벤트 |
| --- | --- | --- |
| 데몬 launch 자체가 실패 | 이번 실행의 **모든** 터미널이 로컬 | `lane-unavailable` |
| degraded 모드로 데몬 채택 | **새로 여는** 터미널만 로컬 (기존 데몬 세션은 생존) | `adopted` + `mode: degraded-new-pty-fallback` |
| 데몬이 앱과 함께 죽음 | 다음 실행에서 cold start | `endpoint-health: unreachable` + 데몬 프로세스 부재 |

## 2. 코드로 좁혀 놓은 것 (실기 없이 판정 가능한 부분)

- **후보에서 제외됨 — `daemon-incarnation-evidence*.ts`.** `windows_process_missing` /
  `windows_creation_time_mismatch` / `windows_named_pipe_missing` 판정은
  `daemon-audit-classifier.ts` → `trackDaemonAuditEligibility`(텔레메트리)로만 흘러간다.
  이 판정이 틀려도 데몬을 교체하거나 세션을 죽이지 않는다.
- **후보에서 제외됨 — `daemon-endpoint-ownership.ts`.** win32에서
  `readDaemonEndpointOwnershipState()`는 항상 `'indeterminate'`를 반환하고
  `publishDaemonEndpoint()`는 즉시 `published`를 반환한다. Windows 데몬은
  소유권 워치독으로는 **절대 은퇴하지 않는다**.
- **살아 있는 후보 1 — `daemon-host-relocation.ts` (수정함, 아래 §5).**
  win32 packaged에서만 도는 경로. `%LOCALAPPDATA%\Orca\daemon-host\<ver>\orca-terminal-daemon.exe`
  로 복사한 이미지를 fork한다. **복사 실패는 fail-open이었지만 실행 실패는 fail-closed였다** —
  AppLocker/WDAC/SRP가 사용자 쓰기 가능 디렉터리 실행을 막거나, AV가 격리하거나,
  이미지가 잘리면 데몬 레인 전체가 죽었다. 사내 Windows에서 가장 있을 법한 원인이다.
  **재설치와 무관하게 데몬을 새로 fork할 때마다 돈다** (기존 데몬을 채택하는 실행에서는 돌지 않는다).
- **살아 있는 후보 2 — `degraded-daemon-fresh-spawn-routing.ts`.** 한 번 degraded로 떨어지면
  새 터미널이 로컬에서 뜨고, 그게 종료 시 죽고, 다음 실행에서 또 새 터미널을 열게 되는
  **자기 지속적** 루프가 된다.
- **판정 불가 — Job Object.** `fork(..., { detached: true })`는 libuv에서
  `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`만 세우고 `CREATE_BREAKAWAY_FROM_JOB`은
  세우지 않는다. Orca 자신이 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 잡에 들어가 있으면
  (앱 가상화/EDR/일부 런처) 데몬은 앱과 함께 죽는다. Node에서 breakaway 플래그를 줄 방법이
  없으므로 코드로는 고칠 수 없고, §4의 프로세스 확인이 유일한 판정 수단이다.

## 3. 로그 위치

데몬 로그는 NDJSON이고 5MB에서 회전한다.

```powershell
$log = "$env:APPDATA\Orca\logs\daemon.log"    # + daemon.log.1, daemon.log.2
```

`"src":"daemon"` 줄은 데몬 자신이 쓴 것이고, `"src":"main"` 줄은 **Orca 본체가 쓴 것**이다.
후자는 데몬이 아예 뜨지 못한 경우에도 남는다 — 그게 이번에 추가한 부분이다.

## 4. 실기 검증 절차 (그대로 복붙)

### 4-1. claude가 도는 상태에서 소유자를 확인한다 (가장 빠른 판정)

```powershell
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*claude*' } | Select-Object -First 1
if (-not $p) { "claude 프로세스를 못 찾음 - 이미 죽었거나 다른 이름으로 돈다" }
for ($i = 0; $p -and $i -lt 12; $i++) {
  $tag = if ($p.CommandLine -like '*daemon-entry.js*') { '   <== PTY 데몬' } else { '' }
  "{0,-8} {1}{2}" -f $p.ProcessId, $p.Name, $tag
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.ParentProcessId)"
}
```
claude에서 위로 올라가는 조상 체인을 찍는다. 데몬은 이름이 두 가지(`orca-terminal-daemon.exe`
또는 설치 디렉터리에서 뜬 `Orca.exe`)라 이름만으로는 앱 본체와 구분되지 않으므로,
명령줄에 `daemon-entry.js`가 있는 줄에 `<== PTY 데몬` 표시를 붙였다.

- 체인 어딘가에 **`<== PTY 데몬`이 있다** → 데몬이 소유한 세션이다. 이 세션은 종료를 넘겨
  살아남아야 정상이고, 그래도 죽는다면 §4-2로 "앱 종료 직후 데몬이 살아 있는지"를 본다.
- **표시 없이 `Orca.exe`(앱 본체)에서 끝난다** → **로컬 PTY다. 앱을 끄는 순간 죽는다.**
  원인 확정은 §4-4 → §5.

이 한 번이 §5 표를 보기 전에 결론을 내주는 가장 빠른 판정이다.

### 4-2. 데몬 프로세스가 있는지 (앱 실행 중 / 앱 종료 직후 각각 한 번씩)

```powershell
Get-CimInstance Win32_Process -Filter "Name='orca-terminal-daemon.exe' OR Name='Orca.exe'" |
  Where-Object { $_.CommandLine -like '*daemon-entry.js*' } |
  Select-Object ProcessId, Name, CreationDate | Format-Table -AutoSize
```
→ `Get-Process`는 명령줄을 못 보여줘서 데몬을 다른 Orca 프로세스와 구분할 수 없다.
`Get-CimInstance Win32_Process`(PowerShell 3.0+, Windows 기본 탑재)만 쓴다. WMIC는
Windows 11 24H2에서 제거되었으므로 쓰지 않는다.
→ PowerShell을 못 여는 상황이면 cmd.exe에서 이미지 이름만이라도 확인한다(명령줄은 안 나온다):
`tasklist /FI "IMAGENAME eq orca-terminal-daemon.exe"`
→ **Orca를 닫은 직후에도 이 줄이 남아 있어야 정상.** 사라지면 데몬이 앱과 함께 죽은 것이다(§2 Job Object).
→ 이름이 `Orca.exe`로 나오면 재배치 호스트가 아니라 설치 디렉터리 호스트로 뜬 것이다(§4-5).

### 4-3. named pipe가 남아 있는지 (앱 종료 직후)

```powershell
[System.IO.Directory]::GetFiles('\\.\pipe\') | Where-Object { $_ -like '*orca-terminal-host*' }
```
(PowerShell 7이면 `Get-ChildItem \\.\pipe\ | Where-Object Name -like '*orca-terminal-host*'`도 된다.
Windows PowerShell 5.1에서는 `Get-ChildItem \\.\pipe\`가 실패하므로 위의 .NET 호출을 쓴다.)
→ 파이프가 남아 있으면 데몬이 살아서 듣고 있다는 뜻이다(파이프는 프로세스와 함께 사라진다).
→ 프로세스는 있는데 파이프가 없으면 데몬이 살아 있으나 서비스를 접은 상태 = 은퇴/idle shutdown 진행 중.

### 4-4. 재시작 후 로그에서 main 쪽 줄만 뽑기

```powershell
Get-Content "$env:APPDATA\Orca\logs\daemon.log" |
  Where-Object { $_ -like '*"src":"main"*' } | Select-Object -Last 20
```
→ 여기 찍히는 `event` 값을 §5 표에서 찾으면 어느 가설이 참인지 나온다. 줄이 하나도 없으면
이 수정이 들어가기 전 빌드이거나 `ORCA_DIAGNOSTICS_DISABLED`가 켜져 있는 것이다.
→ 로그 파일 자체가 없으면 Orca가 로그 디렉터리를 못 만든 것이다(권한/폴더 리디렉션).

### 4-5. 재배치 이미지가 실제로 실행되는지 (AppLocker/AV 판정)

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Orca\daemon-host" | Select-Object Name, LastWriteTime   # 없으면 복사 자체가 안 된 것
$exe = (Get-ChildItem "$env:LOCALAPPDATA\Orca\daemon-host\*\orca-terminal-daemon.exe" -ErrorAction SilentlyContinue |
  Select-Object -First 1).FullName
if (-not $exe) { "재배치 이미지가 없음 - 복사 단계에서 이미 실패했다" } else {
  $env:ELECTRON_RUN_AS_NODE = "1"
  & $exe -e "process.stdout.write('daemon-host-executable')"
  Remove-Item Env:ELECTRON_RUN_AS_NODE
}
```
→ `daemon-host-executable`이 찍히면 이미지는 정상.
→ "이 프로그램은 그룹 정책에 의해 차단되었습니다" / 접근 거부 / 아무 출력 없이 종료면
   **정책 또는 AV가 `%LOCALAPPDATA%` 실행을 막고 있다** = 이번 수정이 겨냥한 원인.

### 4-6. 결정적 실험 — 종료를 넘겨 살아남는지 직접 본다

1. claude가 도는 터미널을 하나 열어 둔다.
2. §4-1을 돌려 claude의 **PID**와 `<== PTY 데몬` 표시 유무를 적는다.
3. Orca를 정상 종료한다(트레이 아이콘까지 사라질 때까지 기다린다).
4. 아래를 돌린다.

```powershell
Get-CimInstance Win32_Process -Filter "ProcessId = <2번에서 적은 claude PID>" |
  Select-Object ProcessId, Name, CommandLine
Get-CimInstance Win32_Process -Filter "Name='orca-terminal-daemon.exe' OR Name='Orca.exe'" |
  Where-Object { $_.CommandLine -like '*daemon-entry.js*' } |
  Select-Object ProcessId, Name
```

| 4번 결과 | 결론 |
| --- | --- |
| claude 있음 + 데몬 있음 | 정상. 재시작 후에도 셸이 된다면 문제는 **재부착/바인딩** 쪽이지 세션 생존이 아니다 |
| claude 없음 + 데몬 있음 | 데몬은 살았는데 세션만 죽었다 → 데몬 쪽 세션 종료. `daemon.log`의 `src:"daemon"` 줄을 본다 |
| claude 없음 + 데몬 **없음** | 데몬이 앱과 함께 죽었다 → **Job Object 가설(§2)**. 앱 가상화/EDR/런처를 의심한다 |
| claude 없음 + 데몬이 애초에 없었음(§4-1에 표시 없음) | **로컬 PTY 폴백**이 원인. §4-4 → §5로 왜 데몬 레인이 실패했는지 좁힌다 |

## 5. 로그 문자열 → 가설 대응표

`daemon.log`의 `event` 값으로 읽는다.

| 보이는 줄 | 뜻 | 결론 |
| --- | --- | --- |
| `"src":"main","event":"endpoint-health","health":"healthy"` 다음 `"event":"adopted","mode":"daemon-backed"` | 이전 데몬을 그대로 재사용 | **데몬은 무죄.** 세션이 죽었다면 원인은 데몬 밖(파일 소유권/렌더러 바인딩) |
| `"event":"adopted","mode":"degraded-new-pty-fallback"` | 데몬은 살렸지만 **새 PTY는 로컬** | degraded 확정. 이 실행에서 연 터미널은 종료 시 죽는다. Manage Sessions → Restart로 해소 |
| `"event":"launch-host-fallback","from":"relocated","to":"install-dir"` | 재배치 이미지가 안 떠서 설치 디렉터리로 우회 (**이번 수정으로 새로 생긴 구제 경로**) | 같은 줄의 `stage`로 원인 확정: `spawn`+`code:"EACCES"`/`"EPERM"`=실행 차단, `child-exited`=부트스트랩 실패, `timeout`=AV 스캔 지연 |
| `"event":"launch-failed","host":"relocated"` **뒤에 fallback 줄이 없음** | 우회조차 못 함 | 수정 전 빌드이거나, 설치 디렉터리 호스트도 같이 막힘 |
| `"event":"lane-unavailable"` | 데몬 레인 포기 | **원인 확정.** 이 실행의 모든 터미널이 로컬 PTY → 종료 시 claude 사망 |
| `"event":"endpoint-health","health":"unreachable"` + §4-2에서 데몬 프로세스 **없음** | 데몬이 앱과 함께 죽었다 | Job Object 가설(§2). 앱 종료 직후 §4-2를 다시 찍어 확인 |
| `"event":"endpoint-health","health":"unreachable"` + §4-2에서 데몬 프로세스 **있음** | 데몬은 살아 있는데 파이프에 못 붙음 | 보안 제품의 파이프 개입 / 데몬 wedge. §4-3으로 파이프 존재 확인 |
| `"event":"endpoint-health","health":"rejected"` | 핸드셰이크 거부 (토큰/프로토콜 불일치) | 프로토콜 버전이 다른 데몬이 남아 있다 |
| `"src":"daemon","event":"shutdown","reason":"idle"` | 데몬이 스스로 종료 | 데몬이 세션을 0개로 봤다는 뜻 — 세션이 그 전에 이미 죽었다 |

## 6. 이번 변경으로 달라지는 것

- **`resolveDaemonLaunchHosts()` (`src/main/daemon/daemon-launch-hosts.ts`)** — 재배치 이미지가
  실행되지 않으면 설치 디렉터리 호스트로 **한 번 더** 시도한다. 업데이트 생존 성질은 잃지만
  데몬 자체는 뜬다. win32 packaged 밖에서는 재배치 호스트가 애초에 `null`이라 시도가 하나뿐이고,
  동작이 바뀌지 않는다(`daemon-launch-hosts.test.ts`, `daemon-init-relocated-host-fallback.test.ts`가 고정).
  엔드포인트를 다른 데몬이 가져간 경우(`endpoint-occupied` / ownership)는 재시도하지 않고 채택한다.
- **`daemon-launch-log.ts`** — 위 표의 `src: "main"` 줄을 남긴다. 경로/토큰/터미널 내용은 찍지 않고,
  분류된 `stage`와 exit code/errno만 남긴다. `ORCA_DIAGNOSTICS_DISABLED=1`이면 데몬의 `--log-file`과
  똑같이 꺼진다.

## 7. 보고할 때 보낼 것

1. `%APPDATA%\Orca\logs\daemon.log` (+ `.1`, `.2`)
2. §4-2를 **앱 실행 중 / 앱 종료 직후** 각각 실행한 출력 두 벌
3. §4-3, §4-5 출력
