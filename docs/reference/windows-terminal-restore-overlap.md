# Windows: 재시작·프로젝트 전환 뒤 터미널에 이전 내용이 남은 채 커서가 맨 위로 가서 글씨가 겹칠 때

**이 문서는 "어느 복원 경로가 그 화면을 만들었나"를 사용자 PC 의 진단 로그로 판정하는 절차다.**
증상은 세 번 신고됐고 두 번 고쳐졌지만(아래 §2), 두 수정 모두 헤드리스 재현은 있었으나 사용자
경로는 아니었다. macOS 에서는 재현되지 않으므로, 세 번째부터는 **로그로 경로를 먼저 확정한다.**

## 1. 증상과 판정 전에 물어볼 것

증상: Orca 를 껐다 켜거나 다른 프로젝트에 갔다 오면, 터미널에 이전 대화가 그대로 보이는 채로
커서가 화면 맨 위로 가 있고 새 출력이 그 위에 겹쳐 그려진다.

먼저 두 가지를 확인한다. 답에 따라 볼 로그 줄이 달라진다.

1. **그 페인에 글자를 치면 claude 로 들어가는가, 셸로 들어가는가?** 셸이면 프로세스가 죽어
   fresh 셸이 뜬 것이고(§3 의 `fresh-spawn-blank`), claude 면 살아 있는 세션에 재부착된 것이다
   (§3 의 `reattach-*` / `snapshot-*`). 배경은 `windows-daemon-session-survival.md`.
2. **창 크기를 조금 바꾸면 겹침이 풀리는가?** 풀리면 ConPTY 가 다시 그린 것이 맞는 화면이고,
   겹친 것은 xterm 쪽에 **나중에** 써진 복원 바이트다. 안 풀리면 ConPTY 자신이 그 위치에 그리고
   있는 것이다.

## 2. 이미 닫힌 경로 (다시 파지 말 것)

| 커밋 | 닫은 경로 | 재현 |
| --- | --- | --- |
| `76c3108665` | payload 없는 재부착이 복원된 행 위에 이전 실행의 커서를 남김 → 뷰포트를 스크롤백으로 밀어냄 | 헤드리스 |
| `a122a4becb` | 죽은 에이전트 TUI 의 짝 없는 `?1049h` 때문에 blanking 이 alt 버퍼에서 돌아 normal 버퍼의 대화가 남음 → 조건부 `?1049l` + 모드 그라운딩 | 헤드리스 |
| (2026-09-08, 커밋 안 함) | "blanking 뒤 페인이 커지면 xterm 이 스크롤백을 뷰포트로 다시 끌어내린다" | **반증** — xterm `Buffer.resize` 는 커서 아래에 빈 행이 있으면 스크롤백을 당기지 않는다 |

## 3. 진단 로그로 경로를 잡는다

설정 → 진단 로그를 켠다(파일 위치는 설정 화면에 표시된다). 재현한 뒤 `terminal-restore` 줄만 걸러 본다.

```powershell
Select-String -Path "$env:APPDATA\Orca\logs\orca-diagnostic.log" -Pattern "terminal-restore" |
  ForEach-Object Line
```

한 줄은 `event=… tab=… pty=… grid=<cols>x<rows> baseY=<스크롤백 행 수> cursor=<row>,<col>
alt=<대체 화면 여부> conpty=<네이티브 ConPTY 여부> visible=…` 에 이벤트별 필드가 붙는다.

| event | 뜻 | 겹침과의 관계 |
| --- | --- | --- |
| `layout-restore` | TerminalPane 마운트에서 영속화된 스크롤백을 새 xterm 에 그림 (`buffers`=복원한 페인 수, `refs`=디스크 스크롤백 참조 여부, `generation`=탭 세대) | **같은 tab 에 두 번 나오면** 재마운트다 — 두 번째 복원이 살아 있는 ConPTY 위에 써진다 |
| `fresh-spawn-blank` | 죽은 세션 자리에 새 셸을 띄우기 전 뷰포트 정리 (`blanked`, `marker`=복원 행이 있었는지, `forced`) | `blanked=false` 인데 이전 내용이 보이면 마커 유실이다 |
| `reattach-payloadless` | 살아 있는 PTY 에 붙었는데 스냅샷이 없음 (`blanked`, `marker`, `repainted`) | `blanked=false marker=true` 는 76c3108665 가 못 잡은 순서다 |
| `reattach-snapshot` / `reattach-replay` | 데몬·릴레이가 준 화면을 지우고 다시 그림 (`dims`, `cold`, `owner`) | `dims` 가 `grid` 와 다르면 fit 후 ConPTY 재그림을 기다려야 한다 |
| `cold-restore-repaint` | main 체크포인트로 지우고 다시 그린 뒤 blanking (`dims`, `blankRows`, `chars`) | |
| `snapshot-restore` | 숨김 중 버린 바이트를 main 헤드리스 모델 스냅샷으로 복구 (`dims`, `image`, `owner`, `frame`) | **프로젝트 전환 경로.** `image=false` 면 모델이 비어 있어 아무것도 다시 그리지 못한 것이다 |
| `snapshot-unavailable` | 복구 스냅샷을 못 받아 경고만 출력 | 이 뒤의 라이브 출력은 어긋난 커서로 들어온다 |

**읽는 법:** 겹침이 난 페인의 `pty` 로 줄을 모아 **시간 순서**를 본다. ConPTY 는 항상 절대 좌표로
그리므로, 겹침은 conhost 가 그린 **뒤에** xterm 에 복원 바이트가 써질 때만 생긴다. 즉 마지막
`layout-restore` / `snapshot-restore` / `reattach-*` 줄과 그 직전 줄의 순서가 답이다.

## 4. 로그를 받으면

`orca-windows-terminal-restore-overlap` 메모리와 이 표를 대조해 경로를 하나로 좁힌 다음에야
코드를 고친다. 후보는 세 가지다: (a) 프로젝트 전환 시 모델 스냅샷이 비었거나 커서가 틀림,
(b) 재시작 시 `setActiveWorktree` 의 지연 `prepareTerminalTabs` 가 `allDead` 를 두 번 판정해
fresh spawn 도중 TerminalPane 을 재마운트함, (c) 아직 못 본 경로.
