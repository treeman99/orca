# 외부 연동 감사 및 차단 계획 (사내 배포용)

기준: **v1.4.155** (브랜치 `enterprise/samsungds`).
목적: 사내(폐쇄망/보안) 환경에서 Orca를 배포할 때, 외부 인터넷으로 나가는 기능을 파악하고 필요 시 차단한다.

> **조사 방식**: 10개 카테고리를 병렬로 정적 분석(스윕) → 누락 항목 크리틱 → 항목별 적대적 검증(“실제로 소켓을 여는가 / 언제 발동하는가 / 끌 수 있는가”). 후보 103건 중 44건이 실제 외부 호출로 확정됐습니다.
>
> **⚠️ 표시는 미검증이거나 운영상 주의가 필요한 항목**입니다. 이 중 **코드로 확인하지 못한 것은 세 건**입니다(§7 레벨 3의 `net.fetch` 경유 여부, §8의 컴포넌트 업데이터 실측, 그리고 2026-08-15에 추가된 §8의 `gateway-cli` 동작 — 이 저장소 밖의 CLI 계약이라 원리적으로 확인할 수 없습니다). 나머지 ⚠️는 코드는 확인했으나 배포 시 조작이 필요한 항목입니다. 모든 `파일:라인` 인용은 **v1.4.155 리베이스 이후의 트리에서 해당 파일을 다시 열어** 확인했습니다. 이전 판에 있던 존재하지 않는 환경변수(`ORCA_DISABLE_UPDATES`)와 자기모순 서술은 제거했습니다.
>
> **v1.4.178 갱신 (2026-08-10).** 이 판에서 재검증한 것은 **v1.4.176 → v1.4.178 구간의 델타**입니다(추가 라인 52,890줄 전수 grep + 신규 파일 271건 검토). 나머지 44건의 확정 항목은 위 기준 시점의 서술이며 이번에 다시 열어보지 않았습니다.
>
> 이 구간에서 **신규 외부 목적지 1건**이 들어왔고(Artifacts 공유 → 벤더 공유 호스트), **그에 대응해 벤더 클라우드 레인 3종을 코드에서 제거**했습니다 — Artifacts 공유, Orca Cloud 로그인, 모바일 페어링 릴레이 디렉터. 셋 다 정책 스위치가 아니라 소스에서 차단했으므로 §3과 같은 성격입니다(§3.1). 그 외 신규 egress는 없었습니다: `net.fetch`/`WebSocket`/`axios`/`sendBeacon`/`openExternal` 신규 사용 0건, 신규 쉘아웃(`curl`/`wget`/`npx`/`gh api`) 0건, 프로덕션 신규 도메인 리터럴 2건은 모두 목적지가 아니라 매처입니다(§6).
>
> **v1.4.180 갱신 (2026-08-12).** 이 판에서 재검증한 것은 **v1.4.178 → v1.4.180 구간의 델타**입니다(128 파일, +10,799/−1,719, 신규 파일 32건 — 추가 라인 전수 호스트명 추출 + 프로덕션 신규 파일 12건 전문 검토). 나머지 확정 항목은 각자의 기준 시점 서술이며 이번에 다시 열어보지 않았습니다.
>
> 이 구간에 **신규 외부 목적지는 0건**입니다. 추가 라인에서 호스트명 형태의 토큰을 전수 추출한 결과 `example.com` 계열(테스트 픽스처)과 `github.com`(테스트 픽스처 + `config/reliability-gates.jsonc`의 이슈 링크 메타데이터)만 나왔고, 신규 `fetch`/`axios`/`https.request`/`net.connect`/`WebSocket`/`EventSource` 0건, 신규 쉘아웃 0건, 신규 의존성 0건, 신규 에이전트 CLI 0건입니다. 들어온 것은 **기존 GitHub 레인의 확장 4건**뿐이고(§1) 목적지는 전부 origin 리모트에서 유도되므로 GHES 플릿에서는 사내 호스트입니다. 그중 하나는 egress가 아니라 **쓰기 범위의 확장**이었고 — 스택 PR 병합의 자동 승격 — **이 포크가 `d02dd048a1`에서 닫았습니다**(§0.2 #24).
>
> ⚠️ **이 구간의 판정은 정적 분석입니다.** 앱을 실행하거나 네트워크를 캡처해 실측한 것이 아니라 코드 경로로 판정했습니다. 특히 **사내 GHES가 `pullRequest{stack}` GraphQL 필드와 `merge-async` REST 엔드포인트를 지원하는지는 확인하지 못했습니다** — 미지원이면 응답이 오류로 떨어져 기능만 조용히 죽고 요청 자체는 나갑니다(§1). 테스트 파일 약 20건은 URL 스윕 대상에는 넣었으나 로직을 감사하지 않았고(빌드 산출물이 아니므로), `mobile/` 워크스페이스는 이 델타에서 변경되지 않아 #24의 도달 경로 확인 외에는 재감사하지 않았습니다.
>
> **사내 인증 방식 전환 갱신 (2026-08-15).** 사내 인증이 `aws sso login --profile <name>`(AWS CLI 토큰 캐시 → Bedrock 자격 체인)에서 **`gateway-cli login`(인자 없음) → OIDC 브라우저 로그인 → virtual key 자동 발급**으로 바뀌었고, Orca의 AWS SSO 레인은 **삭제되고 게이트웨이 레인으로 완전히 교체**됐습니다. 이 판에서 갱신한 것은 **그 레인에 대한 서술뿐**이며(§0 요약표 1행, §0.2 #25 신규, §4의 Bedrock 절), 다른 항목은 각자의 기준 시점 서술 그대로입니다. **Orca의 책임 경계는 바뀌지 않았습니다** — 자격증명을 읽지도, 저장하지도, 주입하지도 않습니다. **바뀐 것은 두 가지**입니다: 상태 확인이 파일 읽기에서 **CLI 실행**으로 바뀌었고(§4), 자식 프로세스의 목적지가 AWS 하나에서 **IdP + 게이트웨이 둘**로 늘었습니다(#25).
>
> ⚠️ **이 전환에서 확인하지 못한 것**: `gateway-cli verify`의 출력 형식(그래서 파서가 방어적입니다), virtual key의 저장 위치와 수명, `gateway-cli logout`의 존재 여부(그래서 로그아웃을 구현하지 않았습니다), WSL 게스트·SSH 원격에서의 동작, `gateway-cli`의 설치 경로·프록시·사설 CA 처리. **이 문서는 확인된 것만 단정하고 나머지는 미확인으로 표시합니다.**
>
> **v1.4.184 갱신 (2026-08-17).** 이 판에서 재검증한 것은 **v1.4.183 → v1.4.184 구간의 델타**입니다(트리 diff 561 파일, +33,214/−8,252, 신규 파일 119건 — 추가 라인 전수 grep(`fetch`/`net.fetch`/`https?://`/`new URL`/`WebSocket`/`openExternal`/`child_process`/`gh`/`curl`/`npx`/업데이터·텔레메트리 토큰/새 IPC·RPC 이름) + 신규 파일 도메인 훑기 + `mobile/src` 31건). 나머지 확정 항목은 각자의 기준 시점 서술이며 이번에 다시 열어보지 않았습니다.
>
> 이 구간에 **신규 외부 목적지는 0건**, 통째로 들어온 신규 기능 도메인도 0건입니다(신규 119파일 전부 기존 도메인의 확장·리팩터). 프로덕션 추가 라인에서 호스트명 리터럴은 하나도 나오지 않았습니다. 새로 생긴 것은 **기존 레인 위의 트리거 표면 2건**뿐입니다 — ① Cmd+J 팔레트에 `linear.app/<org>/issue/<ID>` URL을 붙여넣으면 즉시 이슈를 조회합니다(`WorktreeJumpPalette.tsx` → `lib/linear-issue-url-lookup.ts` → `linear:getIssue` → `src/main/linear/client.ts`, `api.linear.app` GraphQL — 저장된 Linear 자격증명이 있을 때만, 전용 스위치는 여전히 없고 `enforceNetworkAllowlist`의 fetch 가드만 적용, §부록 "이슈" 항목과 통제 수단 동일), ② 같은 팔레트에 GitHub 이슈/PR URL을 붙여넣으면 제목을 조회합니다(`lib/cmd-j-github-url-lookup.ts` → `gh:workItemByOwnerRepo` → `src/main/github/client.ts`, URL의 host/owner/repo가 저장소 리모트와 다르면 `gh`를 띄우지 않으므로 목적지는 리모트 호스트(사내 GHES)로 고정 — §0.2 #1의 `gh` 자식 프로세스 잔여 위험과 동일 레인). 반대로 upstream이 **git/gh attribution shim을 제거**해(`src/main/attribution/*`, `src/shared/orca-attribution.ts` 삭제, PTY env 8개 키 스트립, `enableGitHubAttribution` 설정 제거) `Co-authored-by: Orca` 트레일러·"Made with Orca" 푸터가 git 호스트로 나가던 경로는 사라졌습니다 — egress 감소. 업데이터 표면 유입은 0건(§3 수행 이력).
>
> ⚠️ **이 구간의 판정도 정적 분석입니다.** 코드 경로로 판정했고 패킷 캡처는 하지 않았습니다.
>
> **v1.4.185 갱신 (2026-08-19).** 이 판에서 재검증한 것은 **v1.4.184 → v1.4.185 구간의 델타**입니다(트리 diff 3,199 파일, +75,171/−25,572, 신규 383건 · 삭제 13건 · 이름변경 54건 — 추가 라인 전수 스윕(`https?://`/`wss?://`·호스트 리터럴·`fetch(`/`net.fetch`/`https?.get|request`/`new WebSocket`/`axios`/`dns.`/`tls.connect`·`child_process`·`shell.openExternal`/`loadURL`·다운로드 경로) + 양 태그의 프로덕션 네트워크 호출지점 **집합 대조** + 신규 파일 디렉터리 훑기). 나머지 확정 항목은 각자의 기준 시점 서술이며 이번에 다시 열어보지 않았습니다. **델타의 대부분은 egress와 무관한 디렉터리 재편입니다** — `src/shared/types.ts` 해체(3,947줄 → 45개 신규 타입 모듈), `src/preload/api-types.ts` 분할(3,720줄 → `src/preload/api/*.ts` 47개), 사이드바 `WorktreeList.tsx` 폭발(-6,759줄 → `worktree-list/*` 70개), workspace-cleanup 재작성. GitHub·GitLab·Linear·Jira 클라이언트 변경은 **전부 import 경로 치환**이고 호출은 한 줄도 바뀌지 않았습니다.
>
> 이 구간에 **신규 외부 목적지는 0건**(앱 런타임), 통째로 들어온 신규 기능 도메인도 0건입니다. 프로덕션 네트워크 호출지점은 44 → 46으로 늘었고 **증가분 2건은 전부 한 파일**(`src/main/runtime/relay/relay-region-preference.ts:182,218` — 릴레이 리전 카탈로그 조회와 셀 지연 프로브)이며, §3.1에서 이미 **소스에서 제거한 릴레이 레인 위에 얹힌 코드라 이 빌드에서는 도달하지 않습니다**(`ORCA_CLOUD_REMOVED`가 `DesktopRelayService` 생성 자체를 막습니다 — 아래 §3.1 경고 참조). `shell.openExternal` 호출지점 40 → 40, 에이전트 CLI 목록 36 → 36, 신규 쉘아웃 0건, 신규 의존성 0건, 프로덕션 추가 라인의 호스트명 리터럴 0건입니다(`ssh.github.com`/`altssh.gitlab.com`은 목적지가 아니라 SSH-over-443 별칭을 접는 **매처**이며, 그나마 신규가 아니라 `github-remote-identity-parsing.ts`에서 `src/shared/git-remote-host-alias.ts`로 **이동**한 것입니다). 제거된 egress도 0건입니다(삭제된 `mobile/src/transport/rpc-client-activity-probe.ts`는 신규 `rpc-session-liveness-watchdog.ts`로 대체됐고 목적지는 그대로). 다만 **CI 레인에는 신규 목적지 1건**이 생겼습니다(§8 신설 항목 — Docker Hub + Ubuntu 아카이브, 배포 산출물에는 미포함). 엔터프라이즈 게이트 라인 대조는 **486라인/139파일 유실 0**이었고, 게이트가 보호하던 대상의 이사도 0건입니다(-1,000줄 이상 삭제된 4개 파일은 전부 게이트 무보유 파일의 분할이었습니다). 업데이터 표면 유입은 upstream 신규 2파일(`src/preload/api/updater-api.ts`, `src/shared/update-status-types.ts`)이 전부이며 **둘 다 머지 트리에 넣지 않았습니다**(§3 수행 이력).
>
> ⚠️ **이 구간의 판정도 정적 분석입니다.** 코드 경로로 판정했고 패킷 캡처는 하지 않았습니다. 특히 `relay-region-preference`의 도달 불가는 호출 그래프 추적으로 판정한 것이지 실행으로 확인한 것이 아닙니다. `.github/`는 판정 범위 밖이었고, 새 Docker 스텝의 CI 실행 여부를 확인하기 위해서만 `pr.yml`을 열었습니다.
>
> **v1.4.188 갱신 (2026-08-22).** 이 판에서 재검증한 것은 **v1.4.186 → v1.4.188 구간의 델타**이며, 판정 기준은 태그 델타가 아니라 **포크 유입 델타**(fork tip → v1.4.188)입니다 — 태그는 릴리스 브랜치에서 잘리는데 포크는 `upstream/main`을 머지하므로 태그에는 "신규"로 보이는 것이 이미 우리 트리에 있는 경우가 있습니다(실례: `relay-region-preference.ts`는 태그 diff에서 A로 잡히지만 blob이 fork tip과 동일합니다).
>
> **Artifacts는 이번 릴리스에서 커지지 않았습니다** — `src/main/artifacts/` 트리는 v1.4.186과 바이트 동일하고 CLI·RPC도 같습니다. 신규 11파일은 전부 `ArtifactListPane.tsx` 하나를 쪼갠 렌더러 분해라 포크의 기존 제거가 표면 전부를 계속 덮습니다. **반면 upstream은 "에이전트 스킬 공유"라는 기능 도메인을 통째로 들여왔습니다** — `src/main/skills` 43 → 165 파일, `src/renderer/src/components/skills` 16 → 101, IPC +21, RPC +13, 릴레이 핸들러 +1, CLI 서브커맨드 +2. **실질 신규 목적지는 `storage.googleapis.com` 1건**이고, 여기에 더해 기존 호스트 `share.onorca.dev`로 가는 **새로운 무인증 경로**가 1건 생겼습니다. 그 무인증 경로는 포크의 기존 제거장치(`ORCA_CLOUD_REMOVED`, `ARTIFACT_SHARING_REMOVED`, `disableCloudRelay`) 중 **어느 것으로도 막히지 않았습니다** — 전부 인증 초크포인트에 걸려 있고 이 경로는 인증을 지나지 않기 때문입니다. §3.1에서 소스 제거로 닫았습니다. 그 밖에 신규 에이전트 CLI 0건, 신규 런타임 의존성 0건, 벤더 호스트를 때리는 신규 쉘아웃 0건, 새 벤더 목적지를 여는 `openExternal` 0건입니다.
>
> ⚠️ **호출지점 계수법의 사각지대를 하나 고쳐야 합니다.** 표준 정규식(`fetch(`/`net.fetch`/`https?.get|request`/`new WebSocket`/`axios`)은 **주입형 fetcher 패턴을 놓칩니다.** v1.4.188의 신규 스킬 레인은 세 곳 전부가 이 형태입니다 — `(input.fetcher ?? fetch)(url, …)`, `input.fetcher!(url, …)`(`skill-cloud-request.ts:36`, `skill-cloud-direct-upload.ts:101`, `skill-package-download.ts:84`). 다음 동기화부터 `\?\? *fetch|\?\?= *fetch|fetcher!\(`를 정규식에 넣으십시오. 넣지 않으면 이번 릴리스에서 가장 중요한 세 호출지점이 통째로 보이지 않습니다.
>
> ⚠️ **이 구간의 판정도 정적 분석입니다.** 코드 경로로 판정했고 패킷 캡처는 하지 않았습니다. `share.onorca.dev`/`storage.googleapis.com`의 서버측 로깅은 소스로 알 수 없고, 업로드 방향의 서명 POST 정책 URL은 **오리진 허용목록이 없습니다**(`https:`와 자격증명 부재만 검사) — 그 경로는 `withAuth` 아래라 이 빌드에서 도달하지 않지만, "업로드는 오리진 고정이 아니다"는 사실 자체는 적어 둡니다.

> **⚠️ 델타 판정의 기준은 `git log`가 아니라 트리 diff입니다.** 업스트림은 릴리스 브랜치에 태그를 달고 그 태그들은 서로의 자손이 아닙니다. 같은 변경이 main과 릴리스 브랜치에 다른 SHA로 존재하면 `git log <old>..<new>`에는 나타나되 트리에는 차이가 없으므로, **로그는 델타를 과대 계상합니다.** 실례: `git log v1.4.178..v1.4.180`에는 Artifacts 관련 커밋 3건(`24c68087bd` 수동 공유 #13369, `05160cd08e` 능력 게이팅 #13368, `2f221bdbfe` 관리 UI #13356)이 보이지만 `git diff --name-only v1.4.178 v1.4.180 -- '*artifact*' '*Artifact*'`는 **비어 있습니다** — 두 태그의 artifact 트리는 동일하며 그 기능들은 이미 v1.4.178 트리에 있었습니다(§3.1). 그러므로 델타 감사는 `git diff --name-status <old> <new>` 기준으로 하고 로그는 맥락 파악에만 쓰십시오. **함정은 양방향입니다** — 로그만 보고 "이번에 새로 들어왔다"고 오판하는 것과, 트리가 같은 것을 보고 "업스트림이 이 레인을 접었다"고 안심하는 것 둘 다 틀립니다(후자의 경우 업스트림은 계속 개발 중이며, 다만 그 작업이 더 이른 태그에 이미 들어와 있었을 뿐입니다).

---

## 0. 한눈에 보기 — 사내 배포 시 판단

| 분류 | 기본 상태 | 이 브랜치의 잠금 | 잔여 위험 |
| --- | --- | --- | --- |
| **정책 적용 자체 (배포 형태)** | 설치 프로그램이 기본 정책을 **내장**하므로 설치만으로 잠김 (§0.1) | ✅ 번들 정책 (`resources/enterprise-policy.json` → `<resourcesPath>`), `%ProgramData%` 배치는 이제 선택 | 🔴 per-user 설치라 설치 폴더가 사용자 소유 — 표준 사용자가 번들 파일을 지우면 그 PC는 풀립니다 (§0.2 #21) |
| **프록시 / 사설 CA** | Orca가 지원 (Electron 세션 한정) | — | 🔴 Node `fetch`/`node:https` 경로는 프록시를 안 탐 (§5) |
| **텔레메트리 / 진단 / 크래시** | opt-in(기본 꺼짐) + 공식 빌드에서만 전송 | ✅ `disableTelemetry` | 없음 (로컬 NDJSON 로깅은 유지, 망 밖으로 안 나감) |
| **자동 업데이트 / 넛지 (onorca.dev, github.com)** | 로그인 무관하게 나감 | 🚫 **코드에서 제거됨** | 없음 (정책이 아니라 소스에서 삭제, §3). ⚠️ 대신 **사내 GHES 릴리스 태그 조회 1건**이 새로 있습니다 — 알림 전용, 다운로드·설치 없음, `disableAutoUpdate`로 차단(§3.0) |
| **star-nag (github.com SaaS 고정)** | 랜딩·설정 화면 진입, 에이전트 완료, 온보딩 완료, 스폰 임계치에서 발동 | ✅ `disableStarNag` | 없음 (`gh` 호출 함수 자체에서 차단, §1) |
| **Orca Cloud 로그인 / 모바일 페어링 릴레이** | 로그인 안 하면 안 나감 | 🚫 **코드에서 제거됨** (v1.4.178~, §3.1) | 없음. LAN/Tailscale 페어링 QR은 **여전히 발급됩니다** — 릴레이가 아니라 모바일 자체를 닫는 건 `disableMobilePairing`입니다 |
| **Artifacts 공유 (v1.4.178 신규)** — HTML/Markdown 파일 본문을 벤더 호스트로 발행 | 업스트림 기본값은 사용자 설정으로 꺼져 있으나 UI에서 두 번 클릭이면 켜짐 | 🚫 **코드에서 제거됨** (§3.1) | 없음 (정책이 아니라 소스에서 차단) |
| **에이전트 스킬 공유 (v1.4.188 신규)** — 선택한 스킬 디렉터리를 tar.gz으로 벤더 호스트에 발행하고, 공유 링크로 다시 내려받아 설치 | 🔴 **발행만 사용자 설정(`agentSkillSharingEnabled`, 기본 꺼짐)에 걸려 있고 설치·조회 레인은 로그인조차 필요 없음** | 🚫 **코드에서 제거됨** (§3.1) | 없음. 단 **로컬 레인은 의도적으로 살려 두었습니다** — 스킬 탐색, 프레시니스 갱신, 관리형 설치 조회·제거 (§0.2 #26) |
| **에이전트 스킬 설치·업데이트 (npmjs + github.com)** | 설정/온보딩이 `npx skills add <업스트림 저장소>`를 인쇄·실행 | 🚫 **코드에서 제거됨** (§3.2) — 스킬 바이트가 패키지에 동봉되고 설치는 로컬 복사 | 없음 (사용자가 커뮤니티 CLI를 직접 쓰는 것은 #1과 같은 사각지대) |
| **AI 벤더 사용량 폴링 (Claude/Codex/Grok/…)** | 🔴 **Orca 계정 연동과 무관 — 로컬 벤더 CLI 자격증명만 있으면 15분마다 폴링** | ✅ `disableUsagePolling` | 없음 (§4) |
| **Claude OAuth 토큰 회전 (platform.claude.com)** | Orca 관리 Claude 계정을 쓸 때만 | ✅ `disableManagedClaudeAccounts` | egress는 없음. 단 이 스위치는 **Bedrock 플릿에서 선택이 아니라 필수**입니다 — 끄면 WSL 세션이 관리형 계정 없이도 인증 env를 스트립하고, 런치 env에 `AWS_BEARER_TOKEN_BEDROCK` 등이 있으면 스폰이 하드 실패합니다 (§4) |
| **git 호스팅 (GitHub/GitLab)** | 사용자 열람 + 일부 자동 폴링 | ➖ `githubEnterpriseHost`는 허용목록 자동 추가·GHES 로그인 대상 기본값·GHES 퍼머링크 인식뿐(호스트 전환도, 트래픽 차단도 아님). Bitbucket·Azure DevOps·Gitea 연동은 **코드에서 제거**(커밋 `4d58e5f21c`, §1) | `gh` 목적지는 여전히 origin 리모트/`GH_HOST`/`gh` 자체 설정이 결정 (§1, §7 레벨 2) |
| **맞춤법 사전 다운로드 (Chromium)** | Windows/Linux에서 자동 | ✅ `disableSpellcheck` | 없음 (§8) |
| **DNS-over-HTTPS 자동 승격 (Chromium)** | 머신 리졸버가 알려진 DoH 제공자면 자동 | ✅ `lockdown` (OS 리졸버로 고정) | 없음 (§8). 개별 스위치 없이 `lockdown`에만 달려 있습니다 |
| **렌더러 외부 이미지 (Google favicon / 아바타 / 마크다운 인라인)** | 아이콘·본문 표시 시 자동 | ➖ `enforceNetworkAllowlist` opt-in 시에만 | 기본값은 차단 안 됨 (§6) |
| **서브프로세스 (gh/glab/git/에이전트 CLI)** | 사용자 조작 | ❌ Orca 측 통제 수단 없음 | 🔴 프록시·방화벽으로만 통제 (§0.2) |
| **사내 게이트웨이 로그인 (`gateway-cli`)** — AWS SSO 레인을 대체 | 사용자가 로그인 버튼을 누를 때 + **상태 배지를 새로 고칠 때마다**(`verify`) | ❌ Orca 측 통제 수단 없음 (자식 프로세스) | 🔴 사내 IdP·게이트웨이 두 곳으로 나가며 망 계층에서만 통제 (§0.2 #25, §4). Orca는 자격증명을 읽지도 저장하지도 주입하지도 않습니다 |
| **플러그인 시스템 (v1.4.162 신규)** — 벤더 마켓플레이스 `git clone` + kill-list `fetch` | 사용자가 설정 → 플러그인을 켠 순간 (기본 꺼짐) | ✅ `disablePlugins` | **이 스위치가 없으면 통제 불가**였습니다 — clone은 `git` 자식 프로세스라 `enforceNetworkAllowlist`가 못 봅니다 (§0.2 #19) |
| **벤더 커뮤니티·문서 링크 (Discord, X, 공개 이슈 트래커, onorca.dev 문서)** | `?` 메뉴·피드백·에러 토스트 등에서 클릭 시 **기본 브라우저**로 나감 | ✅ `disableVendorLinks` | 표시 게이트를 못 단 설정 화면 링크 2곳이 **무반응 상태로 남습니다** (초크포인트가 막으므로 열리지는 않음, §0.2 #20) |
| **에셋 다운로드 — scrcpy 서버 jar** | 사용자가 Android 스트리밍을 켤 때만 | ✅ `lockdown` (직접 다운로드 거부 가드) | 없음 (§0.2 #9) |
| **에셋 다운로드 — STT(sherpa-onnx) 모델** | 사용자가 모델을 명시적으로 내려받을 때만 | ❌ 코드 차단 없음 | 기능 미사용 시 미발생 (§0.2 #10) |

**결론**: 이 브랜치의 정책 파일은 **벤더 SaaS로 나가는 Orca 자체 호출**(텔레메트리·업데이트·넛지·star-nag·클라우드·사용량 폴링·관리형 Claude 계정 OAuth 회전)을 코드 차원에서 차단합니다. 다만 **차단 범위는 Orca 프로세스가 직접 여는 소켓까지**입니다. 서브프로세스(`gh`/`glab`/`git`/에이전트 CLI), 렌더러 외부 이미지(기본값), SSH 릴레이의 원격 `npm install`, 그리고 STT 모델 다운로드는 정책 파일로 막히지 않습니다 — 이들은 §0.2의 잔여 위험 목록으로 관리하고 망 계층(프록시·방화벽)에서 통제해야 합니다. (`node:https` 다운로더 중 scrcpy jar 하나만 `lockdown`이 명시적으로 거부합니다 — §0.2 #9.)

### 0.1 ✅ 관리자 정책 파일 (`enterprise-policy.json`)

이 브랜치는 잠금 설정을 **환경변수가 아니라 관리자 소유 JSON 파일**로 관리합니다. 이유는 코드 주석에 그대로 있습니다 (`src/shared/enterprise-policy.ts:4-8`): Orca가 `env`에서 읽는 값은 **Orca가 스폰하는 모든 프로세스(에이전트 CLI, `gh`, `git`, 릴레이)에 그대로 상속**되고, 같은 머신의 무관한 도구까지 오염시킵니다. 실제로 agent-browser 서브프로세스는 `process.env` 전체를 상속합니다(`src/main/browser/agent-browser-bridge.ts:2670-2672`). 그래서 런타임 환경변수는 **딱 하나**만 둡니다.

#### 런타임 환경변수 (이 포크가 추가하는 것: 1개)

| 환경변수 | 값 | 패키징 빌드(배포된 `.exe`) | 비패키징(`pnpm dev`·vitest) |
| --- | --- | --- | --- |
| `ORCA_ENTERPRISE_POLICY` | 정책 파일 경로 (그대로 `readFileSync`에 넘어가므로 **절대경로 권장**) | 후보 목록에 **추가**만 됨 — 머신 전역 파일과 **번들 정책 뒤** 순위 (`enterprise-policy-file.ts:110-113`) | 이 값이 있으면 나머지는 아예 후보에 오르지 않습니다 (`:99-106`) |
| `ORCA_ENTERPRISE_POLICY` | `off` / `none` / `disabled` / `false` / `0` (`:36`) | **무시됨** — 머신 전역 또는 번들 정책이 그대로 적용 | 탐색 자체를 무효화. 테스트 스위트가 이 값을 씁니다 (`config/vitest-enterprise-policy-isolation.ts:6`) |

> 🔒 **패키징 빌드에서 환경변수가 정책을 이길 수 없다는 것은 보안 속성입니다.** Windows에서 표준 사용자는 관리자 권한 없이 자기 계정 환경변수를 만들 수 있으므로, 무조건 듣는 옵트아웃이었다면 사내 잠금이 `setx ORCA_ENTERPRISE_POLICY off` **한 줄로 우회**됩니다. 그래서 패키징 빌드에서는 이 변수가 후보를 추가만 하고 머신 전역 파일이나 번들 정책을 대체하거나 끄지 못합니다 (`enterprise-policy-file.ts:70-88` 주석, 분기 `:110-113`). 판정은 `app.isPackaged`로 합니다 — 표준 사용자가 조작할 수 없는 유일한 신호입니다 (`:228-234`). 옛 무조건 옵트아웃은 개발·테스트를 위해 **비패키징에서만** 남아 있습니다.
>
> **배포 결론**: 설치 프로그램의 번들 정책이 기본선이고, 값을 중앙에서 바꾸려면 머신 전역 기본 경로에 파일을 두고 ACL로 사용자 쓰기를 막으세요. 환경변수 커스텀 경로는 **개발·검증용이지 플릿 배포 수단이 아닙니다.**

이 포크가 **추가하지 않는** 것 중 여전히 유효한 값:

- `GH_HOST` — `gh` CLI 자신의 변수. `githubEnterpriseHost`가 비었을 때 폴백으로 읽습니다 (`src/shared/enterprise-policy.ts`).
- `GH_CONFIG_DIR` / `XDG_CONFIG_HOME` — `gh` CLI 자신의 변수. `GH_HOST`도 없을 때 **`gh`의 `hosts.yml` 위치**를 결정하고, 그 파일에 로그인된 호스트가 정확히 하나면 `githubEnterpriseHost`의 마지막 폴백이 됩니다 (`src/main/github/gh-config-host.ts`). 읽기 전용이며 이 포크가 설정하지 않습니다.
- `DO_NOT_TRACK`, `ORCA_TELEMETRY_DISABLED` — 업스트림 원래의 텔레메트리 킬스위치. 이 브랜치가 건드리지 않았습니다 (`src/main/telemetry/consent.ts:79,83`).
- `ORCA_DIAGNOSTICS_DISABLED` — 업스트림 변수. 위 둘보다 강해서 **로컬 NDJSON 기록까지** 끕니다 (`src/main/observability/index.ts:102,113-119`).

빌드 시점에만 쓰이는 값(이 포크가 추가한 `ORCA_WIN_PUBLISHER_NAME`(`config/electron-builder.config.cjs:331`)·`ORCA_DISABLE_PUBLISH_TARGET`(`:544`), 업스트림의 `ORCA_MAC_RELEASE`/`WIN_CSC_*`/`ORCA_POSTHOG_WRITE_KEY`/`ORCA_BUILD_IDENTITY`)은 **빌드 셸의 변수이며 앱 런타임 환경에는 들어가지 않습니다**. [윈도우 빌드 가이드](./windows-corporate-build.md) 참고.

#### 파일 탐색 순서 — **먼저 파싱에 성공한 파일이 이깁니다**

`src/main/enterprise/enterprise-policy-file.ts:89-114`

**패키징 빌드 — 플릿에서 유일하게 의미 있는 순서**

1. **머신 전역** — 이 배포의 대상인 **Windows: `%ProgramData%\Orca\enterprise-policy.json`** (`enterprise-policy-file.ts:60-62`). *(코드는 세 OS를 그대로 지원합니다 — macOS `/Library/Application Support/Orca/…`(`:64-66`), Linux `/etc/orca/…`(`:67`). 이 플릿에는 Mac이 없으므로 배포 대상은 Windows 경로뿐입니다.)*
2. **번들** — `<resourcesPath>/enterprise-policy.json` (`:236-244`). 설치 프로그램에 내장된 기본값이며, 저장소 원본은 `resources/enterprise-policy.json`, 실리는 지점은 `config/electron-builder.config.cjs`의 `commonExtraResources`(3 OS 공통)입니다.
3. `ORCA_ENTERPRISE_POLICY` 명시 경로 (무효화 값은 무시)
4. **사용자별**: `<userData>/enterprise-policy.json`

**비패키징(`pnpm dev`·vitest)** — `ORCA_ENTERPRISE_POLICY`가 1순위이고, 무효화 값으로 탐색 전체를 끌 수 있습니다(`:99-106`). 번들 후보(체크아웃의 `resources/enterprise-policy.json`, `devCheckoutPolicyPath` `:258-272`)는 **최후순위**로만 들어옵니다(`:110-111`, 의도는 `:80-87` 주석) — `pnpm dev`가 플릿 UI를 보여 주게 하려는 것이며, `config/vitest-enterprise-policy-isolation.ts`가 무효화 값을 쓰므로 사내 빌드 머신의 테스트는 여전히 lockdown으로 돌지 않습니다.

**2번이 3·4번보다 위인 것이 이 설계의 요점입니다.** 3번 아래였다면 표준 사용자가 `setx ORCA_ENTERPRISE_POLICY C:\Users\me\open.json` 한 줄로, 4번 아래였다면 `%APPDATA%\Orca\enterprise-policy.json`에 `{}` 하나로 사내 잠금을 통째로 풀 수 있습니다. 두 경로 모두 그 사용자가 쓸 수 있는 자리입니다. 1번을 위에 남긴 이유는 반대로, GPO/Intune으로 중앙에서 덮어쓰는 길을 막지 않기 위해서입니다.

머신 전역을 먼저 보는 것이 이 재설계의 핵심입니다 (`enterprise-policy-file.ts:9-11`). Windows에서 `setx`는 **사용자별** 상태를 씁니다 — 즉 같은 PC의 다른 프로필, 서비스 계정, 새로 만든 프로필은 전부 잠기지 않은 채로 남습니다. 반대 방향도 막혀 있습니다: 사용자별 파일은 머신 전역·번들 정책을 **완화할 수 없습니다**(먼저 파싱에 성공한 파일에서 탐색이 끝나므로).

> ✅ **해소됨 — 실기기에서 확인됐던 배포 격차.**
> 사내 테스트에서 "PC마다 모바일 항목이 보이기도 하고 안 보이기도 한다"는 증상의 **1차 원인은 정책 파일이 아예 배포되지 않은 것**이었습니다. 두 가지가 겹쳤습니다: ① 예전 `.exe` 인스톨러는 정책 파일을 싣지 않았고 GPO/SCCM/Intune 같은 별도 경로로 배포해야 했습니다. ② 1순위 경로 `C:\ProgramData\Orca\enterprise-policy.json`은 머신 전역이라 **per-user NSIS 인스톨러가 쓸 수 없습니다**(관리자 권한 없이 설치되므로). 따라서 앱만 설치한 PC는 정책 없이 = **업스트림 그대로** 동작했습니다.
>
> **지금은 위 2순위(번들)가 그 구멍을 메웁니다** — 설치 프로그램이 `resources/enterprise-policy.json`을 설치 폴더에 실어 나르고 앱이 `process.resourcesPath`에서 읽으므로, 아무 배포 작업을 하지 않은 PC도 잠긴 상태로 뜹니다. 다만 **`%ProgramData%` 배치가 무의미해진 것은 아닙니다** — 번들 파일은 사용자 소유 폴더에 있어 지울 수 있고(§0.2 #21), 중앙에서 값을 바꾸는 유일한 길도 1순위 경로입니다.
>
> **관리자 확인 방법**: 해당 PC의 `main.trace.ndjson`에서 `enterprise.policy` 스팬을 찾아 `enterprise.policy.source_path`를 봅니다. 잠긴 플릿에서 그 값이 `(none found)`이면 번들 파일까지 없어진 PC입니다 — 파일은 있는데 파싱에 실패한 경우와 구분됩니다(후자는 다음 후보의 경로가 찍히고 `…warnings`에 사유가 남습니다). 스팬 위치와 전체 속성 목록은 `docs/reference/enterprise-policy.md` §7-2를 보세요.

#### 스키마 (JSONC — `//` 주석과 후행 쉼표 허용)

파싱은 `jsonc-parser`로 하며(`enterprise-policy-file.ts:184-186`), **파싱 에러가 하나라도 있으면 그 파일을 통째로 거부**합니다 — 절반만 적용되는 상태를 만들지 않습니다(`:187-194`).

> ⚠️ 거부된 후보는 **다음 후보로 넘어갑니다**(`:193`) — 읽기 실패(ENOENT 외 권한/마운트 오류, `:172-178`)와 같은 처리입니다. 즉 GPO로 뿌린 파일에 오타가 있어도 아래의 번들 정책이 적용되므로 그 PC가 통째로 풀리지는 않습니다. **예전에는 여기서 탐색을 중단해 `lockdown`이 `false`가 되는 fail-open이었고, 그것이 번들 정책 도입과 함께 고쳐진 부분입니다.** 다만 관리자가 그 파일에 넣은 값(예외·엔드포인트·GHES 호스트)은 **조용히 사라진 채 잠긴 상태로** 돌게 되므로, stderr/트레이스의 `is not valid JSON; ignoring it.` 경고를 **배포 스크립트가 확인하도록** 하세요. 아래의 "인식할 수 없는 *값*은 lockdown을 상속" 규칙은 파일이 파싱에 성공한 뒤에만 적용됩니다.

| 키 | 타입 | 기본값 | 효과와 **구현 위치** |
| --- | --- | --- | --- |
| `lockdown` | boolean | `false` | 마스터 스위치. 아래 `disable*` 상속 스위치들(`LOCKDOWN_INHERITING_KEYS`)의 기본값이 됩니다 (`src/shared/enterprise-policy.ts:157-175`, `:358-362`) |
| `githubEnterpriseHost` | string | `GH_HOST` → `gh` 자체 설정의 기본 호스트(`src/main/github/gh-config-host.ts`) → `null` | 허용목록 자동 추가(`src/shared/enterprise-policy.ts:370-371`) · 설정 → GitHub Enterprise 팬의 로그인 대상 기본값(`src/main/ipc/github-enterprise.ts:83-86`, 사용자가 저장한 호스트가 없을 때) · GHES 퍼머링크(blob/commit URL) 인식(`src/main/git/hosted-remote-url.ts:38-42`) · `disableVendorLinks`의 GHES 예외(`src/main/enterprise/enterprise-vendor-link-guard.ts:80-83`). 예전의 "Gitea 폴백 후보에서 제외" 역할은 Gitea 연동 자체가 제거되어(커밋 `4d58e5f21c`) 사라졌습니다. **`gh`의 대상 호스트는 바꾸지 않습니다** (§7 레벨 2) |
| `disableTelemetry` | boolean | = `lockdown` | PostHog 레인 (`src/main/telemetry/consent.ts:88`) **및** 진단/크래시 번들 업로드 (`src/main/observability/index.ts:103,120-133`). 로컬 NDJSON 로깅은 유지(`localFileEnabled: true`, `:130`) |
| `disableAutoUpdate` | boolean | = `lockdown` | ✅ **살아 있는 스위치 (2026-08-21~).** 사내 GHES 릴리스 태그 조회와 "새 버전 있음" 팝업을 끕니다(§3.0). 초크포인트는 `AppUpdateCheckService.check()` 하나. 벤더 업데이터를 되살리는 키가 **아닙니다** — `false`여도 다운로드·설치 코드는 저장소에 없습니다. 리베이스가 업스트림 업데이터를 되살려도 `lockdown`이 이 키로 다시 덮습니다 |
| `disableStarNag` | boolean | = `lockdown` | `checkOrcaStarred()` (`src/main/github/client.ts:341`) / `starOrca()` (`:527`) |
| `disableCloudRelay` | boolean | = `lockdown` | 🔴 **사실상 죽은 스위치 (v1.4.178~).** 같은 함수 `getOrcaCloudAuthConfig()`에서 **정책 검사보다 앞에** 무조건 차단이 들어갔으므로(§3.1), 이 키가 무엇이든 클라우드는 미구성입니다. 예전 `disableAutoUpdate`와 같은 이유로 키만 유지합니다 — 리베이스 안전판 겸 기존 정책 파일 호환. (`disableAutoUpdate` 쪽은 §3.0으로 다시 살아났습니다.) ⚠️ 예전에도 지금도 **LAN 전용 페어링은 계속 동작합니다** — 모바일 자체를 막는 건 `disableMobilePairing`입니다 |
| `disableUsagePolling` | boolean | = `lockdown` | `src/main/rate-limits/service.ts:824`의 술어를 `start()`(`:353`), `fetchAll`/`fetchCodexOnly`/`fetchClaudeOnly`/`fetchGrokOnly`(`:998,1063,1125,1190`), 계정 스위처 프리뷰 2종(`:572,652`), Codex 리셋 크레딧 POST(`:478`)에서 검사 |
| `disableManagedClaudeAccounts` | boolean | = `lockdown` | Orca 관리형 Claude 계정. 게이트 3곳: `platform.claude.com` 회전 함수 진입부(`src/main/claude-accounts/oauth-refresh.ts:131-133`), 인증 준비에서 활성 계정을 `null`로 고정(`src/main/claude-accounts/runtime-auth-service.ts:613-616`), 환경 스트립 최후 방어선(`src/main/claude-accounts/environment.ts:22`) (§4) |
| `disableSpellcheck` | boolean | = `lockdown` | `webPreferences.spellcheck`를 끄는 지점 **5곳**: 메인 창(`src/main/window/createMainWindow.ts:306`), `will-attach-webview` 게스트(`:494`), 대시보드 팝아웃 창(`src/main/window/dashboard-popout-window.ts:181`), 오프스크린 브라우저 백엔드(`src/main/browser/offscreen-browser-backend.ts:45`), PDF 내보내기 WebContents(`src/main/lib/html-to-pdf.ts:46`) |
| `enforceNetworkAllowlist` | boolean | **`false`** (lockdown이어도) | 호스트 허용목록 하드 게이트 (`src/main/enterprise/enterprise-network-guard.ts`) |
| `allowedNetworkHosts` | string[] | `[]` + GHES 호스트 | 위 게이트가 켜졌을 때만 의미 있음 (`src/shared/enterprise-policy.ts:369-372`) |
| `updateReleaseRepository` | string | `null` → 빌드 상수 `DPI/Orcads` | §3.0의 릴리스 조회 대상 `OWNER/REPO`. `lockdown`을 상속하지 않습니다(스위치가 아니라 값). URL이나 호스트는 받지 않습니다 — 붙여 넣은 릴리스 페이지 링크가 조회 대상을 `githubEnterpriseHost` 밖으로 돌리지 못하게 `OWNER/REPO` 형식만 통과시키고, 형식이 어긋나면 경고 후 빌드 기본값이 그대로 섭니다 (`src/shared/enterprise-policy.ts`의 `readRepositoryCoordinate`) |

동작 규칙:

- **개별 스위치가 마스터보다 우선합니다.** `"lockdown": true` + `"disableStarNag": false` 조합으로 한 기능만 되살릴 수 있습니다. (`disableAutoUpdate: false`는 사내 GHES 릴리스 조회만 되살립니다 — 벤더 업데이터는 코드에 없습니다, §3·§3.0)
- **인식할 수 없는 값은 “없음”으로 취급**되어 `lockdown`을 상속하며, 절대 “꺼짐”으로 읽지 않습니다 — 관리자 오타가 머신을 조용히 풀어버리는 것을 막기 위함입니다 (`src/shared/enterprise-policy.ts:200-223`). stderr에 경고를 냅니다.
- **모르는 키도 경고**를 냅니다 (`:352-356`).
- `enforceNetworkAllowlist`만 `lockdown` 상속에서 제외됩니다 (`:386-388`). 하드 허용목록은 기능 스위치와 달리 배포를 통째로 망가뜨릴 수 있어 관리자가 명시적으로 켜야 합니다.

정책은 프로세스당 한 번만 읽고 캐시합니다 (`enterprise-policy-file.ts:325-368`). 세션 도중 파일을 바꿔도 반영되지 않습니다 — 앱 재시작이 필요합니다.

예시 (`%ProgramData%\Orca\enterprise-policy.json`):

```jsonc
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net",
  // 개별 스위치만 예외로 되살릴 수 있음 (disableAutoUpdate: false는 사내 GHES 릴리스 조회만 되살림 — §3.0)
  // "disableStarNag": false,
  "enforceNetworkAllowlist": false,
  "allowedNetworkHosts": ["github.samsungds.net"]
}
```

관련 모듈:

| 파일 | 역할 |
| --- | --- |
| `src/shared/enterprise-policy.ts` | 순수 리졸버 + 타입 (I/O 없음, 단위 테스트 가능) |
| `src/main/enterprise/enterprise-policy-file.ts` | 탐색 / 파싱 / 캐시 |
| `src/main/enterprise/enterprise-network-guard.ts` | opt-in 허용목록 |
| `src/shared/enterprise-policy-fixture.ts` | 테스트 전용 픽스처 (`makeEnterprisePolicy` / `makeLockdownPolicy`) |
| `config/vitest-enterprise-policy-isolation.ts` | 빌드 머신의 머신 전역 파일이 테스트 스위트를 잠그지 않도록 무효화 |
| `resources/enterprise-policy.json` | 설치 프로그램에 내장되는 기본 정책 (위 2순위 후보의 원본) |
| `config/scripts/verify-packaged-enterprise-policy.cjs` | `afterPack` 검사 — 번들 정책이 실제 산출물에 있고, JSONC로 파싱되며, `lockdown: true`인지. 아니면 패키징 실패 |

### 0.2 🔴 이 브랜치의 잠금이 덮지 **않는** 것 (잔여 위험 등록부)

보안 검토자는 이 표 하나로 경계선을 판단할 수 있어야 합니다. **정책 파일은 Orca 메인 프로세스가 직접 여는 소켓과 렌더러의 기본 세션까지만 통제합니다.**

| # | 나가는 트래픽 | 목적지 | 발동 조건 | 왜 잠금이 못 막나 | 확인 위치 |
| --- | --- | --- | --- | --- | --- |
| 1 | **서브프로세스 전체** (`gh`, `glab`, `git`, 에이전트 CLI, agent-browser) | 각 도구의 목적지 | 사용자 조작 / 에이전트 실행 | Electron 세션 밖에서 자체 소켓을 엽니다. `enforceNetworkAllowlist`는 `session.defaultSession`과 메인 프로세스 global `fetch`만 감쌉니다 | `enterprise-network-guard.ts:87-122` |
| 2 | **렌더러 외부 이미지 — 에이전트 카탈로그 아이콘** | `www.google.com/s2/favicons` | 에이전트 목록 표시 시 자동 | 기본값에는 게이트가 없습니다. `enforceNetworkAllowlist`를 켜야 막힙니다 | `src/renderer/src/lib/agent-catalog.tsx:397` |
| 3 | **렌더러 외부 이미지 — "다른 앱으로 열기" 아이콘** | `www.google.com/s2/favicons` | 앱 프리셋 표시 시 자동 | 동일 | `src/renderer/src/lib/open-in-app-catalog.tsx:66` |
| 4 | **렌더러 외부 이미지 — 저장소 아이콘 자동감지** | `www.google.com/s2/favicons` | 저장소 웹사이트 URL이 있을 때 | 동일 | `src/shared/repo-icon.ts:17-32` |
| 5 | **렌더러 외부 이미지 — GitHub 아바타** | `avatars.githubusercontent.com` 또는 **GHES 호스트** | PR/이슈/프로젝트 렌더 시 | 동일. 단 저장소 아이콘용 아바타는 GHES 호스트를 따라가므로(`repo-icon.ts:51-60`) 사내 호스트로만 나갈 수 있음 | `src/renderer/src/components/github/github-user-avatar.tsx:38,82` |
| 6 | **마크다운 본문의 인라인 이미지** (`variant="document"`) | 본문에 적힌 임의의 http(s) URL — GitHub/Jira 첨부 등 | PR·이슈·Jira 설명 본문 렌더 시 | 동일. `document` 변형만 원격 `src`를 그대로 `<img>`로 로드합니다 | `src/renderer/src/components/sidebar/comment-markdown-element-renderers.tsx:271,290` / 호출측 `JiraIssueWorkspace.tsx:661-663` |
| 6b | **Linear/Jira 사용자 아바타** | 각 벤더 아바타 CDN | 이슈·코멘트 목록 렌더 시 | 동일 (렌더러 `<img>`) | `src/renderer/src/components/LinearIssueWorkspace.tsx:116`, `JiraIssueWorkspace.tsx:578,727` |
| 6c | **native-chat 이미지 블록의 원격 URL** (`image-ref`) | 블록에 실린 임의의 `https://` URL (Codex 트랜스크립트의 `input_image` 등에서 유래) | 페어링된 **모바일 클라이언트**가 native-chat을 렌더할 때 | 동일 — 렌더러 이미지 로드라 `enforceNetworkAllowlist`를 켜야 막히고, 폰은 그 세션 밖입니다. **범위가 좁습니다**: 실제로 URL을 로드하는 것은 모바일뿐이고(`<Image source={{ uri }}>`), **데스크톱 렌더러는 파일명 칩만 그립니다**(`<img>` 없음). **v1.4.180에서 오히려 좁아졌습니다** — 이전에는 정리가 모바일 클라이언트에만 적용됐지만 이제 `image-ref` 블록이 **모든 클라이언트 종류**에 대해 정리되어, 인라인 `data:` URL(base64 이미지 본문)이 RPC에서 제거되고 메타데이터가 512자로 제한됩니다. 즉 페어링 레인으로 나가는 데이터가 **줄어드는** 변경이었습니다. `https://` URL이 통과하는 것은 그 이전부터 동일하며 이 델타가 새로 연 경로가 아닙니다 | 정리 `src/main/runtime/rpc/methods/native-chat-rpc-image-block.ts`(`isInlineDataUrl` 제거 + 512자 상한), 호출부 `native-chat.ts`의 `sanitizeBlock`, 모바일 로드 `mobile/src/session/MobileNativeChatMessage.tsx:167`, 데스크톱 대조군 `NativeChatMessageList.tsx:40-66` |
| 7 | **SSH 릴레이의 원격 `npm install`** | 원격 호스트의 npm 레지스트리 (기본 `registry.npmjs.org`) | 원격 호스트 최초 연결 시 | 릴레이 번들은 SCP로 보내지만 `node-pty`/`@parcel/watcher`는 네이티브 애드온이라 **원격에서 설치**합니다. 정책 파일은 원격 머신에 없습니다 | `src/main/ssh/ssh-relay-deploy.ts:948-1010`(`npm install` `:997,1009`, 대상 `:700-702`) |
| 8 | **Node `fetch` / `node:https` 프록시 우회** | 아래 §5 목록 | 해당 기능 사용 시 | `proxy-settings.ts`는 **Electron 세션에만** 프록시를 겁니다 | `src/main/network/proxy-settings.ts:41-79` |
| ~~9~~ | ~~**scrcpy 서버 jar 다운로드**~~ | ~~`github.com/Genymobile/scrcpy/releases`~~ | — | **해소됨**: `node:https`를 직접 쓰는 것은 맞지만, 다운로드 직전에 `lockdown`(또는 허용목록 밖 호스트)이면 거부하고 `EmulatorError`를 던집니다. 관리자가 미리 배치한 jar은 그대로 씁니다 | 가드 `src/main/enterprise/enterprise-direct-download-guard.ts:17-32`, 적용부 `src/main/emulator/android/scrcpy-server-download.ts:42-46` |
| 10 | **STT(sherpa-onnx) 모델 다운로드** | `huggingface.co/<repo>/resolve/<revision>` (v1.4.159에서 GitHub Releases → Hugging Face로 이전) | 사용자가 로컬 받아쓰기 모델을 명시적으로 내려받을 때 | ✅ `disableVoice` — `getSpeechModelManager()`가 정책 확인 후 던지므로 `ModelManager` 자체가 생성되지 않습니다 (`src/main/speech/speech-runtime-service.ts`). 스위치를 끄면 여전히 가드가 없고, Electron `net.request`를 쓰므로 §5 프록시는 탑니다 | `src/main/speech/model-download-catalog.ts:12`(URL 조립), `model-manager.ts:2,792`(`net.request`) (가드 미사용) |
| ~~11~~ | ~~**Claude OAuth 토큰 회전**~~ | ~~`platform.claude.com`~~ | — | **해소됨**: `disableManagedClaudeAccounts`가 덮습니다 (§4). 이전 판의 "정책 스위치 없음"은 더 이상 사실이 아닙니다 | 게이트 `src/main/claude-accounts/oauth-refresh.ts:131-133` |
| 12 | **임베디드 브라우저** | 사용자가 방문하는 임의의 사이트 | 사용자 조작 | 허용목록은 `persist:` 파티션을 의도적으로 제외합니다 — 그 슬롯은 인증서 게이트가 이미 점유 중이고, 임의 사이트 열람이 이 기능의 목적이기 때문 | `enterprise-network-guard.ts:9-13` |
| ~~13~~ | ~~**Gitea/Forgejo 폴백 직접 fetch**~~ | ~~origin 리모트에서 동적 유도된 호스트~~ | ~~미지정 git 호스트를 쓸 때~~ | ✅ **해소 — Gitea 연동을 코드에서 제거했습니다**(커밋 `4d58e5f21c`, `src/main/gitea/**` 9파일 삭제, Bitbucket·Azure DevOps와 함께 62파일/−9,029줄). 미지정 리모트 호스트는 이제 어느 provider에도 배정되지 않고 `unsupported`로 남습니다(`src/main/source-control/forge-provider.ts:201`) — 요청이 나가지 않습니다 | (삭제됨) |
| ~~14~~ | ~~**사내 LLM 엔드포인트로 가는 프롬프트·소스**~~ | ~~관리자 배포 사내 호스트 또는 사용자가 직접 추가한 임의의 https 호스트~~ | — | ✅ **해소 — 사내 자체 호스팅 모델 레인을 코드에서 제거했습니다.** 정책 필드·IPC·설정 UI·토큰 저장소·실행 주입·모델 카탈로그 등록·WSL 전달이 전부 사라졌고, 이 항목의 🔴였던 **사용자 자가등록 레인**도 함께 닫혔습니다. ⚠️ 리다이렉션 능력 자체가 사라진 것은 아닙니다 — 같은 사용자는 셸 rc나 per-agent 환경변수로 `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL`을 여전히 직접 넣을 수 있습니다(#1). 없어진 것은 Orca가 공식 UI로 제공하던 경로입니다 | 아래 "⛔ 제거됨" 절 |

| 15 | **외부 자동화 CLI를 스케줄로 실행** (`hermes`, `openclaw`) | 해당 벤더가 정한 목적지 (Orca는 목적지를 모릅니다) | 자동화 페이지에서 외부 잡을 만들거나, 이미 등록된 잡의 크론 시각이 되었을 때 | ✅ `disableExternalAutomations`(또는 `allowedAgents`)가 **Orca 쪽 진입점**(발견·생성·수정·실행)을 전부 거부합니다 (`src/main/automations/external-manager.ts`). 🔴 **잔여**: Orca는 스케줄러가 아니라 조작 UI일 뿐이므로, 이미 `~/.hermes/cron`에 등록된 잡은 **Hermes 자신의 스케줄러로 계속 실행됩니다** — Orca를 잠근 뒤에도 남아 있는 잡은 `hermes cron rm`으로 직접 제거해야 하고, 잠근 뒤에는 앱 안에서 그 목록을 볼 수 없습니다. 로컬 읽기(`~/.hermes/cron/jobs.json`, `state.db`, 출력 마크다운)와 SSH 호스트별 릴레이 레인도 같은 게이트로 함께 닫힙니다 | 게이트 `external-manager.ts`의 `isExternalAutomationProviderAllowed`, 릴레이 레인 `src/relay/external-automations-handler.ts` |
| 16 | **사용량 통계를 X(구 Twitter)로 공유** | `x.com/intent/post` (사용자의 **기본 브라우저**로 열림) | 설정 → 통계 및 사용량에서 공유 버튼을 눌렀을 때 | ✅ **이중 차단**: `disableUsagePolling`이 그 팬을 없애 도달 불가로 만들고, `disableVendorLinks`가 버튼 자체를 숨기는 동시에 메인 프로세스 초크포인트에서 URL을 거부합니다 — 둘 중 하나만 켠 플릿에서도 닫힙니다. 기본 브라우저로 나가므로 `enforceNetworkAllowlist`가 **원리적으로 볼 수 없다는 점은 그대로**이고, 그래서 판정이 링크를 여는 시점(`shell:openUrl`)에 있어야 했습니다 | `ShareUsageButton.tsx`, 초크포인트 `src/main/ipc/shell-open-url.ts`, 규칙표 `src/main/enterprise/enterprise-vendor-link-guard.ts` |
| 17 | **에이전트 벤더 홈페이지 링크** | 각 에이전트 CLI의 홈페이지 | 설정 → 에이전트 / 온보딩에서 링크 클릭 | ✅ `disableAgentInstallSuggestions`가 "설치 가능" 목록과 온보딩 설치 안내를 없애 링크 수를 크게 줄입니다. 🔴 **잔여**: Orca가 에이전트 CLI를 직접 내려받는 코드는 없고 링크만 열지만, **감지된** 에이전트 행의 링크는 `Docs`로 남아 그대로 클릭 가능합니다. ⚠️ `disableVendorLinks`는 **이것을 막지 않습니다 — 의도적입니다**: 그 규칙표는 Orca가 스스로 광고하는 벤더 목적지(Discord/X/`github.com/stablyai`/`onorca.dev`)만 판정하고, 플릿이 실제로 실행하는 제3자 도구의 홈페이지(`cli.github.com` 등)는 정당한 도움말로 남깁니다. ~~`npx skills add`는 별개 레인이고 어느 스위치도 덮지 않습니다~~ → **해소됨**: 스킬 설치·업데이트가 `npx`/GitHub를 전혀 타지 않는 오프라인 복사로 바뀌었습니다 (§3.2) | `AgentsPane.tsx`(행의 `<a href>`), `src/main/window/privileged-window-navigation.ts` |
| 18 | **렌더러 게이트가 보이지 않는 클라이언트** | — (도달 범위 문제) | `pnpm dev:web`, `orca serve`의 브라우저 클라이언트 | 웹 preload에는 `enterprisePolicy` API가 **없어서** 정책 뷰가 항상 "제한 없음"으로 떨어집니다. `disableVoice`·`disableMobilePairing`·`disableRemoteOrcaServer`·`disableUsagePolling` 등 **표시 게이트 전부**가 그 클라이언트에서는 무효입니다 — 그래서 메인 쪽 거부(에이전트 탐지 필터, 에뮬레이터 RPC 거부, 외부 자동화 거부)가 belt-and-braces가 아니라 **유일한 방어선**입니다 | `src/renderer/src/web/web-preload-api.ts`(해당 키 없음), `src/renderer/src/enterprise/enterprise-policy-access.ts` |
| 19 | **플러그인 시스템** — 벤더 마켓플레이스 인덱스 `git clone` / 벤더 kill-list `fetch` / 플러그인 워커의 자체 트래픽 | `github.com/stablyai/orca-plugins.git`, `onorca.dev/plugins/kill-list.json`, 사용자가 등록한 임의 Git URL, 워커 코드가 여는 임의 목적지 | 사용자가 설정 → 플러그인을 켠 순간(첫 활성화 시 clone + fetch, 이후 패키지 빌드 매 시작마다 kill-list 갱신). 주기 폴링은 없음 | ✅ **해소됨**: `disablePlugins`가 네 겹으로 덮습니다 — 기능 플래그 대체(`isPluginSystemAllowed`), egress 초크포인트 `runPluginGit()`, `fetchPluginKillList()`, IPC/RPC 미등록. **egress 게이트가 별도로 필요한 이유**: `plugins:install`과 `plugins:refreshMarketplaces`는 기능 플래그를 보지 않고 Git에 도달하고, 그 clone은 자식 프로세스라 #1과 같은 사각지대에 있습니다. 🔴 **잔여**: `disablePlugins: false`로 되돌린 플릿에서는 플러그인 워커(평범한 자식 프로세스)의 트래픽을 어떤 Orca 측 스위치로도 못 막습니다 — 동의 다이얼로그가 이 사실을 사용자에게 명시합니다. 반면 **플러그인 패널은 CSP로 봉인**돼 있습니다(`default-src 'none'; connect-src 'none'; img-src data:`, `src/shared/plugins/plugin-panel-shell.ts:21-22`) 그리고 워커 환경변수는 화이트리스트 17개로 토큰을 상속하지 않습니다(`plugin-worker-env.ts`) | 게이트 `src/main/plugins/plugin-system-policy.ts`, `plugin-git-repository.ts:16`, `plugin-kill-list-service.ts:104`, `src/main/ipc/register-core-handlers.ts:201`, `src/main/index.ts:2703` |

| 20 | **벤더 커뮤니티·문서 링크** (`?` 메뉴의 Discord/X/Docs/Changelog/GitHub, 터미널 에러 토스트의 "file an issue", 프로젝트 뷰의 기능 요청, 첫 실행 배너의 개인정보 처리방침, 피처월 문서 링크) | `discord.gg`, `x.com/orca_build`, `x.com/intent/*`, `github.com/stablyai/*`, `onorca.dev` — 전부 사용자의 **기본 브라우저**로 열림 | 사용자가 해당 항목을 클릭할 때 | ✅ `disableVendorLinks`. 표시 게이트(JSX)와 **메인 프로세스 초크포인트 2곳**(`shell:openUrl` IPC 전체 + `setWindowOpenHandler`/`will-navigate`)을 함께 둡니다 — 후자가 없으면 #18의 웹 클라이언트에서 아무 방어가 없고, 생 `<a href>`는 IPC를 타지 않기 때문입니다. **그 2곳은 "OS 브라우저로 나가는" 레인만 덮습니다** — 판정 함수 `isEnterpriseBlockedVendorLink`의 호출부는 저장소 전체에서 정확히 그 둘입니다. **이것은 egress 차단이 아니라 유출·오지시 차단입니다**: 목적지가 OS 브라우저라 `enforceNetworkAllowlist`가 원리적으로 볼 수 없고, 위험은 트래픽 자체가 아니라 사용자가 공개 채널에 사내 맥락을 적는 것과 이 플릿에 맞지 않는 문서를 읽는 것입니다. 🔴 **잔여 4건**: ① **설정 → Privacy의 "Privacy policy"와 설정 → 일반의 GitHub 링크는 화면에 그대로 남습니다** — 초크포인트가 막으므로 눌러도 아무 일도 일어나지 않지만, 무반응 링크는 그 자체로 결함입니다(표시 게이트 미적용). ② **웹 필터가 아닙니다 — 의도된 범위입니다**(가드 헤더와 정책 타입 주석이 "Not a web filter"라고 못 박습니다). 내장 브라우저 주소창 직접 입력과 PR 본문 링크뿐 아니라, **사용자 설정 `openLinksInApp`이 켜진 플릿에서는 터미널 출력·마크다운 프리뷰·체크 패널에서 클릭한 벤더 링크도 `shell:openUrl` 대신 인앱 브라우저 탭으로 열려 두 초크포인트를 지나지 않습니다.** 기본값은 `false`이지만 첫 터미널 링크 클릭 시 뜨는 라우팅 다이얼로그의 autoFocus 기본 버튼이 "Open in Orca"라 사용자의 한 번의 선택으로 영구 전환됩니다. 목적지가 임베디드 브라우저라 #12의 의도된 예외와 같은 자리이지만, **이 스위치의 실효 범위가 정책 파일이 아니라 사용자 설정에 좌우된다**는 사실은 적어 둘 값이 있습니다. ③ 예전에는 업데이터가 `net.fetch`로 `github.com/stablyai/orca/releases`와 `onorca.dev` 넛지에 나갔고 그것은 이 스위치가 아니라 `disableAutoUpdate`의 몫이었습니다 — 지금은 **그 코드 자체가 없습니다**(§3). 새로 생긴 §3.0 레인이 여는 링크는 **사내 GHES 릴리스 페이지 하나뿐**이고 이 초크포인트를 정상적으로 지나가며, 벤더 규칙표에 없으므로 통과합니다. ④ **정책을 보지 않는 세 번째 `shell.openExternal`이 있습니다** — 내장 브라우저 게스트의 `setWindowOpenHandler`(`browser-manager.ts:749`). 사용자가 이미 연 페이지의 **스크립트 팝업**(클릭 앵커가 아닌 `window.open`)이, 그 게스트가 브라우저 탭에 아직 또는 더 이상 등록되지 않은 좁은 상태(`browserTabId === null`)에서만 이 분기로 떨어집니다. 정상 등록 상태에서는 같은 URL이 OS 브라우저가 아니라 Orca 내부 origin-bar 팝업 창으로 열립니다. **Orca가 스스로 광고하는 벤더 링크는 이 레인을 하나도 지나가지 않으므로 통제 실패가 아니라 레인 일관성 문제**이지만, `grep shell.openExternal`을 돌리는 검토자가 반드시 마주치므로 "초크포인트 2곳"이라는 표현과 함께 여기 적어 둡니다(닫으려면 1줄 — 그 파일은 이미 `getEnterprisePolicy`를 import합니다) | 규칙표 `src/main/enterprise/enterprise-vendor-link-guard.ts`, 초크포인트 `src/main/ipc/shell-open-url.ts:28`·`src/main/window/privileged-window-navigation.ts:9`, 잔여 ① `settings/PrivacyPane.tsx:107`·`settings/GeneralSupportSection.tsx:49`, ② `src/renderer/src/lib/http-link-routing.ts:115-145`·`src/shared/constants.ts:263`·`link-routing-preference-dialog.tsx:234`, ④ `src/main/browser/browser-manager.ts:744-788` |

| 21 | **번들 정책 파일 자체의 변조·삭제** (egress가 아니라 **잠금의 무결성** 항목입니다) | — (로컬 파일) | 사용자가 설치 폴더의 `enterprise-policy.json`을 지우거나 내용을 바꿀 때 | 🔴 **막지 못합니다.** `nsis` 블록이 `perMachine`을 설정하지 않아 electron-builder 기본값인 **per-user 원클릭 설치**가 적용되고, 설치 위치가 `%LOCALAPPDATA%\Programs\…` — 즉 **그 사용자가 소유한 폴더**입니다. 표준 사용자가 관리자 권한 없이 그 안의 번들 정책을 삭제하거나 `{}`로 덮어쓸 수 있고, 그러면 그 PC는 다음 후보로 내려가 (`%ProgramData%` 파일도 없다면) **업스트림 그대로** 동작합니다. 코드로 닫을 수 있는 구멍이 아닙니다 — 정책 파일을 읽는 프로세스가 그 파일과 같은 신뢰 경계 안에 있기 때문입니다. **대응은 둘뿐입니다**: ① `%ProgramData%\Orca\enterprise-policy.json`에 ACL을 건 파일을 배포하면(§0.1 1순위) 번들이 지워져도 잠금이 남습니다 — 이 경우 GPO 배치는 여전히 필요합니다. ② `nsis.perMachine: true`로 전환해 설치 폴더를 관리자 소유로 만듭니다(설치에 관리자 권한이 필요해지므로 배포 채널이 바뀝니다). **탐지**: 잠긴 플릿의 `main.trace.ndjson`에서 `enterprise.policy.source_path`가 `(none found)`인 PC | `config/electron-builder.config.cjs`의 `nsis` 블록(`perMachine` 미설정), 후보 순서 `enterprise-policy-file.ts:110-113` |

| 22 | **인바운드 runtime-scope 페어링 토큰 발급** (상시 WebSocket 리스너 + `mobile:getRuntimePairingUrl` IPC) | — (나가는 트래픽이 아니라 **들어오는 접속을 여는** 항목입니다). 발급된 베어러 토큰은 이 PC의 `0.0.0.0:6768`(dev 6769, STA-1511 폴백 포트 포함)에 도달할 수 있는 기기에 **모바일 허용목록이 아니라 전체 RPC 표면**(`terminal.create`·`terminal.send` 포함)을 엽니다 | 데스크톱은 정책과 무관하게 리스너를 띄우고 이 IPC를 등록합니다. 완전 잠금 플릿에서 **GUI 생성 경로는 사라지지만**(생성·조회 UI가 `disableRemoteOrcaServer`로 언마운트되는 Remote Orca Servers 패널 안에 있음) 보기 메뉴의 개발자 도구(패키지 빌드에도 있는 `role: 'toggleDevTools'`) 콘솔에서 `window.api.mobile.getRuntimePairingUrl()` 한 줄이면 페어링 URL·웹 클라이언트 URL·엔드포인트가 반환됩니다 — 관리자 권한도 정책 파일 변조(#21)도 필요 없습니다. `disableMobilePairing`만 켜고 `disableRemoteOrcaServer`를 끈 **부분 잠금** 플릿에서는 그 패널이 살아 있어 GUI 클릭만으로 발급됩니다. `orca serve`는 `--no-pairing`이 없으면 기동 시 기본으로 runtime 오퍼를 만들어 readiness 출력에 싣습니다 | 🔴 **이 레인을 소유하는 스위치가 없습니다 — 게이트를 빠뜨린 것이 아니라 애초에 없는 것입니다.** 집행 지점 세 곳(오퍼 생성 거부, 요청별 거부, 메서드 허용목록)이 전부 `scope === 'mobile'` 조건이라 `disableMobilePairing`은 QR·폰 레인만 덮습니다. `disableRemoteOrcaServer`는 가드 헤더가 "OUTBOUND 전용 … 인바운드 `orca serve` 리스너는 별개 레인이고 의도적으로 건드리지 않는다"고 **소유권을 명시적으로 부인**하므로, 이것은 그 스위치가 커버한다고 주장한 적 없는 **범위(scope) 진술**입니다. 이 포크 자신의 행동 테스트도 "잠금에서도 runtime 오퍼는 계속 발급된다"를 계약으로 못 박고 있습니다 — CLI와 데스크톱 웹 클라이언트가 그 스코프로 붙기 때문입니다. **정직한 경계**: egress 통제 실패가 아니고, 실제 LAN 도달 여부는 호스트 방화벽에 달려 있습니다(Windows 인바운드 규칙 `Orca.MobilePairing`을 추가해 주는 헬퍼는 `disableMobilePairing`이 등록조차 하지 않습니다). **부수 결함**: 잠금에서도 발급·조회(`mobile:listRuntimeAccessGrants`)·취소(`mobile:revokeRuntimeAccess`) IPC는 모두 살아 있는데 이를 보여 주는 유일한 UI가 `servers` 섹션과 함께 사라져 **앱 안에서 발급된 토큰을 목록으로 보거나 취소할 수 없습니다.** 닫으려면 새 opt-in 스위치(예: `disableInboundRuntimePairing`, `enforceNetworkAllowlist`처럼 **`lockdown` 비상속** — 상속시키면 `orca serve` 헤드리스 배포와 위 계약이 함께 깨집니다)를 `createPairingOffer()`에 걸거나, 망 계층에서 그 포트를 막아야 합니다(#1·#7과 같은 답) | 무조건 등록 `src/main/ipc/mobile.ts:180-203`(`scope: 'runtime'`), 모바일 한정 게이트 `src/main/runtime/runtime-rpc.ts:712`·`:1670`·`:1676`, 리스너 `runtime-rpc.ts:1255-1264`(`resolveInitialWebSocketBindHost()`)·`:1376-1394`(`ensureNetworkExposure()`/`widenWebSocketBind()`)·`src/main/index.ts:2909`(`enableWebSocket: true`), `orca serve` 오퍼 `src/main/index.ts:1844-1854`, 스코프 선언 `src/main/enterprise/remote-orca-server-guard.ts:3-9`, 계약 테스트 `src/main/runtime/mobile-pairing-enterprise-policy.test.ts:100-107`, 전권 확인 `src/main/runtime/runtime-rpc.test.ts:3523`, 표시 게이트 `settings/Settings.tsx:1711`(→ `RuntimeEnvironmentsPane` 렌더 `:1733`) |

| 23 | **GitHub 레이트리밋 스냅샷 프로브** (`gh api rate_limit --hostname github.com`) | `api.github.com` — origin에서 유도하는 것이 아니라 **Orca 코드가 문자열로 고정**합니다 | 사이드바 워크트리 행의 **백그라운드** PR/CI 갱신에서, 그 저장소의 GitHub 신원이 확정되지 않았을 때(`getOriginGitHubApiRepository()`가 `null`) 자동으로 나갑니다. 즉 ① 사내 GHES에 `gh auth login`이 안 된 PC(§1 주의 1이 경고하는 바로 그 상태), ② 사내 GitLab·Gerrit·일반 git 서버 저장소, ③ origin 리모트가 없는 로컬 저장소나 폴더 워크스페이스. 후보 검증(`validateCandidate`)은 저장소가 GitHub인지 보지 않습니다. 빈도는 30초 캐시(실패도 30초 네거티브 캐시)가 상한 | 🔴 **스위치가 없습니다.** 신원 미확정(`repository === null`)을 github.com으로 읽는 `spendsSharedGitHubComQuota` 술어가 원인이고(`isDefaultGitHubHost(undefined) === true`), `src/main/github/`에서 정책을 읽는 곳은 `disableStarNag` 두 군데뿐입니다. `githubEnterpriseHost`는 트래픽 스위치가 아니며(§7 레벨 2), 여기서는 호스트가 코드에 고정돼 `GH_HOST`로도 우회되지 않습니다 — 그 고정은 프로세스 전역 `GH_HOST` 무력화를 **의도한** 것입니다. `gh`는 자식 프로세스라 `enforceNetworkAllowlist`가 원리적으로 못 봅니다(#1). **#1과 다른 점**은 목적지를 Orca가 고정하고 사용자 조작 없이 자동으로 나간다는 것이라 #1의 "각 도구의 목적지 / 사용자 조작" 서술로는 덮이지 않습니다. **정직한 경계**: 페이로드는 예산 수치뿐이고 저장소 정보는 실리지 않습니다. 다만 그 PC에 github.com 자격증명이 있으면 사용자의 토큰이 실린 인증 요청으로, 없으면 익명 요청으로 나갑니다. **의도된 범위가 아닙니다** — 같은 술어의 헤더 주석이 "이 스냅샷은 네이티브 github.com만 덮고 GHES·WSL은 스코프 브레이커가 보호한다"고 설계 의도를 밝히고 있고, 같은 술어를 쓰는 다른 호출부는 `null`을 술어 앞에서 걸러냅니다. **업스트림 결함이며 이 포크가 만든 것이 아닙니다.** 초크포인트는 `fetchRateLimitSnapshot()` 한 곳 — `githubEnterpriseHost`가 설정된 플릿이면 스폰하지 않고 실패-오픈(`{ ok: false }`)시키면 IPC·RPC·코디네이터·브레이커 네 경로가 함께 닫힙니다(게이트를 IPC에 두면 안 됩니다 — 살아 있는 경로는 IPC가 아닙니다) | 고정 `src/main/github/rate-limit.ts:298-306`, 술어 `rate-limit.ts:129-141` + `src/shared/github-repository-identity-key.ts:4-6`, 살아 있는 자동 경로 `src/main/github/pr-refresh-coordinator.ts:741-750`, 대조군(정상 처리) `src/main/github/client.ts:289-295`. `gh:rateLimit` IPC(`src/main/ipc/github.ts:1230`)와 원격 RPC(`src/main/runtime/rpc/methods/github.ts:353`)는 이 포크가 API Budget 팬을 지운 뒤 **렌더러 소비자가 없는 죽은 레인**이지만 게이트도 없어, 리베이스가 팬을 되살리면 조용히 부활합니다. **v1.4.180 재확인 — 변화 없음.** 이 항목의 근거 파일(`rate-limit.ts`, `pr-refresh-coordinator.ts`, `shared/github-repository-identity-key.ts`)은 이 델타의 변경 목록에 없습니다. 새로 들어온 PR 스택 조회가 `noteRepositoryRateLimitSpend(repository, 'graphql', …)`로 예산을 소모하지만 그 가드는 **저장소 스코프**라 github.com 고정 프로브를 새로 유발하지 않습니다 |

| ~~24~~ | ~~**GitHub 스택 PR 병합의 쓰기 증폭**~~ (egress가 아니라 **의도보다 넓은 파괴적 쓰기** 항목입니다) | ~~사내 GHES — origin에서 유도~~ | ~~`github.mergePR`(IPC/RPC 공용) 호출 시 대상 PR이 스택에 속하면 자동 승격~~ | **v1.4.180에서 발견 → 이 포크가 `d02dd048a1`에서 닫았습니다.** **무엇이었나**: 메인 프로세스의 `mergePR()`이 대상 PR의 스택 메타데이터를 읽어 스택이면 **묻지도 알리지도 않고** 단일 PR 병합 요청을 스택 전체 병합(`PUT …/pulls/N/merge-async` — GitHub이 그 PR과 **그 아래 모든 PR을 원자적으로** 병합하는 엔드포인트)으로 교체했습니다. 확인 다이얼로그는 **렌더러 전용**이었고 `github.mergePR`은 `MOBILE_RPC_METHOD_ALLOWLIST`에 등재돼 모바일 앱이 실제로 호출하므로, 이 델타에서 갱신되지 않은 모바일 UI는 **단일 PR 병합처럼 보이면서 스택 전체를 병합**할 수 있었습니다. **모바일만의 문제가 아니었습니다** — 데스크톱 표면 셋(`PullRequestPage`·`GitHubItemDialog`·`TaskPage`)도 `"This will update the pull request on GitHub."`이라는 일반 확인만 띄운 채 같은 승격을 겪었고, 그 셋이 다루는 work item 타입에는 `stack` 필드 자체가 없어 **무엇이 병합되는지 보여줄 방법이 없었습니다.** 어떤 관리자 스위치도 이 경로를 보지 않았습니다(`LOCKDOWN_INHERITING_KEYS` 17개 중 없음). **어떻게 닫았나**: 정책 스위치가 아니라 코드로 닫았습니다 — 승격을 명시적 옵트인(`stackMergeIntent`)으로 바꾸고, 게이트를 `mergeGitHubPRStack`의 **유일한 호출부**인 `client.ts`의 `mergePR()`에 두었습니다. 옵트인은 스택 범위를 실제로 고지하는 리뷰 사이드바 확인 직후에만 전달되고, 나머지 경로(모바일·구버전 클라이언트·고지할 수 없는 데스크톱 표면 셋)는 **fail-closed**로 거부되며 몇 건짜리 스택인지와 어디서 범위를 볼 수 있는지를 오류로 안내합니다. 조용한 단일 PR 강등은 **의도적으로 하지 않습니다** — 호출자가 자기 요청과 실제 쓰기의 차이를 알아야 하기 때문입니다. **왜 스위치가 아닌가**: "허용"이 기본인 스위치를 만들면 구멍이 기본으로 열린 채 남습니다. 이것은 정책 선택이 아니라 안전성 수정입니다. **#18과 같은 구조의 문제였습니다**(렌더러 게이트가 보이지 않는 클라이언트) — 그래서 방어선을 렌더러가 아니라 메인으로 옮긴 것이 수정의 핵심입니다. **`disableMobilePairing`으로는 닫히지 않았습니다** — #22가 기록한 대로 runtime-scope 페어링 토큰은 잠금에서도 계속 발급되고 그 스코프는 모바일 허용목록이 아니라 전체 RPC 표면을 엽니다 | 게이트 `src/main/github/client.ts`의 `mergePR()`(스택 분기), 의도 타입·오류 문구 `src/main/github/github-pr-stack-merge-gate.ts`, 엔드포인트 `github-pr-stack-async-merge.ts`, 옵트인 전달 `src/renderer/src/components/right-sidebar/use-hosted-review-actions.ts`. 회귀 방지 `src/main/github/github-pr-stack-merge-optin.test.ts` — **옵트인 없이는 `mergeGitHubPRStack`에도 `merge-async` 엔드포인트에도 도달하지 않는다**를 네거티브로 고정하므로, 업스트림 동기화가 자동 승격을 되살리면 red가 됩니다(§3·§3.1의 소스 감사 테스트와 같은 목적) |

| 25 | **사내 게이트웨이 CLI의 egress** (`gateway-cli login` / `gateway-cli verify` — AWS SSO 레인을 대체) | **사내 OIDC IdP**와 **사내 게이트웨이** 두 곳. 실제 호스트명은 `gateway-cli` 자신의 설정이 정하며 **Orca는 목적지를 알지 못합니다** | ① 설정 → AI 제공업체 계정에서 "사내 게이트웨이 로그인"을 눌렀을 때(`gateway-cli login`, 인자 없음), ② **상태 배지를 새로 고칠 때마다**(`gateway-cli verify`) — ②는 사용자가 로그인을 누르지 않아도 발생하는 자동 경로입니다 | 🔴 **#1과 같은 사각지대입니다.** Orca가 **자식 프로세스로 스폰**하므로 `enforceNetworkAllowlist`(`session.defaultSession` + 메인 프로세스 global `fetch`)가 그 소켓을 **구조적으로 볼 수 없습니다.** AWS CLI 시절과 성격이 같은 잔여 위험이지만 **목적지가 하나에서 둘로 늘었습니다**(IdP + 게이트웨이). ⚠️ **미확인 항목이 많습니다**: `verify`가 매번 실제로 네트워크를 타는지(로컬 캐시만 읽을 수도 있습니다), 호출 빈도, virtual key의 저장 위치와 수명, `gateway-cli`의 프록시·사설 CA 처리, WSL 게스트·SSH 원격에서의 동작. **권고**: 사내 IdP·게이트웨이 호스트를 이 표에 **실명으로 적어 두고**, 통제는 망 계층(프록시 강제·방화벽·TLS 검사)에서 하십시오 — `allowedNetworkHosts`에 넣어도 자식 프로세스에는 아무 효과가 없습니다(#1). **Orca 쪽 경계는 확인됐습니다**: 토큰·virtual key를 읽지도 저장하지도 않고, 에이전트 환경에 자격증명 변수를 주입하지도 않으며, CLI는 PATH에서만 해석합니다. 로그아웃 레인은 존재하지 않습니다 | 계약 `src/shared/gateway-auth.ts`, 실행 `src/main/gateway/gateway-cli-command.ts`(`resolveGatewayCommand`)·`gateway-login.ts`(`runGatewayLogin`)·`gateway-verify.ts`(`runGatewayVerify`)·`gateway-cli-availability.ts`(`detectGatewayCli`), 출력 파서 `src/shared/gateway-cli-output.ts`, IPC `src/main/ipc/gateway.ts`(`gateway:getStatus`·`gateway:login`·`gateway:cancelLogin` + 이벤트 `gateway:loginProgress`), 화면 `settings/GatewaySection.tsx` |
| 26 | **에이전트 스킬의 로컬 레인 — 의도적으로 차단하지 않음** (egress가 아니라 **제거 범위의 경계선** 항목입니다) | — (전부 로컬 파일시스템. 이 레인들은 소켓을 열지 않습니다) | 스킬 페이지를 열 때(탐색), 번들 스킬 갱신 넛지(프레시니스), 설치 관리 다이얼로그(조회·제거) | ✅ **막지 않는 것이 의도입니다.** §3.1의 제거는 **벤더 레인만** 잘라냅니다. 계속 사는 것: ① 스킬 탐색(`skills:discover` / RPC `skills.discover` — 호스트·WSL·SSH의 `~/.agents/skills`·`~/.claude/skills` … 스캔), ② 프레시니스 인벤토리와 업데이트 실행(§3.2의 오프라인 번들 복사 레인), ③ 관리형 설치 조회·미리보기·제거(`skills:listManagedInstalls`/`previewInstall`/`removeInstall`/`listWslDistros` — `src/main/ipc/skill-install-management-ipc-handlers.ts`, 네트워크 없음). **같이 죽이면 이 머신에 무엇이 설치돼 있는지 보는 화면과, 이미 들어온 것을 지우는 유일한 수단이 함께 사라집니다** — Artifacts에서 `list`/`unshare`/`delete`를 남긴 업스트림 판단과 같은 자리입니다. 🔴 **잔여 두 가지**: ① 설치 관리 다이얼로그의 버전 선택·재설치 버튼은 `skills:getPackage`(벤더)가 상세를 돌려줄 때만 렌더되는데 그 호출이 가드에 막히므로 **화면에 나타나지 않습니다** — 즉 도달 불가 코드로 남아 있고, 리베이스가 가드를 풀면 UI가 함께 되살아납니다. ② 사용자가 **직접** 스킬 디렉터리에 파일을 넣는 것은 Orca가 막지 않습니다(#1과 같은 사각지대). 이 항목이 보장하는 것은 **Orca가 스스로 벤더 호스트에서 스킬을 받아 오지 않는다**는 것입니다 | 남긴 레인 `src/main/skills/discovery.ts`·`skill-freshness-inventory.ts`·`skill-update-run.ts`·`src/main/ipc/skill-install-management-ipc-handlers.ts`, 남긴 UI `src/renderer/src/components/skills/SkillsPage.tsx`·`SkillInstallManagementDialog.tsx`·`SkillFreshness*` |
| 27 | **무인 에이전트 실행 — 봇 루틴 / 예약 자동화** (egress가 아니라 **감독 부재** 항목입니다) | 실행되는 에이전트 CLI가 정한 목적지 (Orca는 목적지를 모릅니다 — #1과 같은 자식 프로세스 레인) | 봇 상세에서 만든 루틴이나 자동화 페이지의 예약이 시각에 도달했을 때. 사람이 화면 앞에 없어도, 창이 없어도(헤드리스 `orca serve`) 실행됩니다 | ✅ **v1.4.188 신설 `disableUnattendedAgentRuns`가 이 레인을 소유합니다** — `AutomationService.requestDispatch` 한 곳에서 60초 틱과 헤드리스 디스패처를 함께 거부하고, 실행 기록에 `skipped_policy`를 남깁니다. 그 전에는 Orca 자신의 스케줄러에 정책 게이트가 **하나도 없었습니다**. 🔴 **잔여 1**: 이 스위치는 번들 정책에서 **기본 `false`**입니다 — 도입만으로 이미 쓰던 예약 자동화가 꺼지지 않게 한 선택이며, 무인 실행을 막으려면 플릿 정책에서 명시해야 합니다(`docs/reference/enterprise-policy.md` §3). 🔴 **잔여 2**: **"지금 실행"(수동)은 의도적으로 남습니다** — 키보드 앞에 사람이 있는 실행이고, 막아도 같은 프롬프트를 터미널에 직접 칠 수 있어 위험이 줄지 않습니다. 🔴 **잔여 3**: 실행되는 것은 에이전트 CLI 자식 프로세스이므로 `enforceNetworkAllowlist`가 그 소켓을 **구조적으로 볼 수 없습니다**(#1과 동일). 이 스위치는 egress 통제가 아니라 **"사람 없이 시작되는가"** 통제입니다 | 게이트 `src/main/enterprise/unattended-agent-run-guard.ts`, 호출 지점 `src/main/automations/service.ts`의 `requestDispatch`, 동작 테스트 `src/main/automations/service-enterprise-policy.test.ts`, 봇 레인 설계 `docs/reference/bot-lane.md` |
| 28 | **봇 로스터는 로컬 전용 — 의도적으로 열지 않음** (경계선 항목입니다) | — (소켓을 열지 않습니다. 봇 정의는 `orca-data.json` 안에만 있습니다) | — | ✅ 상류 Hermes Bot Mode가 가진 **메신저 게이트웨이(Telegram/Slack/Discord)**, **봇↔봇 peer 게이트웨이**, **크로스머신 방 동기화**는 이 포크에 **구현하지 않았습니다**. 사내 소스가 사외 메신저로 나가는 레인이자, 자식 프로세스로 붙일 경우 #1과 같은 허용목록 사각지대이기 때문입니다. 🔴 **이 항목은 "막았다"가 아니라 "만들지 않았다"입니다** — 나중에 추가한다면 별도 opt-in 스위치(예: `disableChatGatewayIntegration`)와 함께 이 표에 **목적지를 실명으로** 적어야 하고, 인바운드 웹훅을 연다면 #22와 같은 성격의 항목이 하나 더 늘어납니다 | 봇 레인 범위 `docs/reference/bot-lane.md`, 저장 위치 `src/main/persistence/rostering-bots/bot-roster-operations.ts` |
| 29 | **Confluence 연결 테스트** (설정 → 연동의 "저장하고 연결 테스트") | 관리자가 정책이 아니라 **사용자가 설정 화면에 입력한** 자체 호스팅 Confluence 호스트 (기본 `confluence-mirror.samsungds.net`) | 사용자가 저장 버튼을 누를 때만. 자동 폴링·백그라운드 재시도 없음. 요청 1건, 15초 타임아웃 | ✅ **메인 프로세스 global `fetch`이므로 `enforceNetworkAllowlist`가 볼 수 있는 몇 안 되는 레인입니다**(#1의 자식 프로세스 사각지대와 반대). 목적지가 사내 호스트이고 요청은 `GET /rest/api/space?limit=1` 하나입니다. 🔴 **잔여 1**: 호스트를 **사용자가 입력**합니다 — `githubEnterpriseHost`처럼 정책 소유 키가 아니라 설정값이라, 사용자가 아무 http(s) 호스트나 적으면 토큰이 그리로 갑니다. `*.atlassian.net`만 거부합니다. 호스트를 고정하려면 정책 키 신설이 필요합니다(미구현). 🔴 **잔여 2**: 토큰은 `PROTECTED_SECRET_SLOT.confluenceApiToken`으로 이 PC에만 저장되지만, **봇이 Confluence를 읽는 경로는 이 레인이 아닙니다** — 에이전트가 자기 도구로 직접 호출하며 그쪽은 #1과 같은 사각지대입니다 | 테스트 `src/main/confluence/confluence-connection-test.ts`, IPC `src/main/ipc/confluence.ts`, 저장 `PROTECTED_SECRET_SLOT.confluenceApiToken`, 화면 `settings/confluence-integration-card.tsx` |

**#2~#6b는 `enforceNetworkAllowlist: true`로 닫을 수 있습니다** — 메인 창은 파티션을 지정하지 않아 `session.defaultSession`을 쓰므로 렌더러 `<img>` 요청이 가드의 `onBeforeRequest`를 지나갑니다 (`createMainWindow.ts:302-308`에 `partition` 없음). **#6c는 예외입니다** — 로드하는 주체가 데스크톱 렌더러가 아니라 페어링된 모바일 앱이고 그 앱은 이 Electron 세션 밖에 있으므로, 허용목록으로 닫히지 않습니다(데스크톱은 애초에 URL을 로드하지 않습니다). #1, #7, #23, #25는 어떤 Orca 측 스위치로도 닫히지 않으며 망 계층에서만 통제됩니다 — #23은 `gh` 자식 프로세스라 #1과 같은 사각지대이고, 유일한 코드 통제는 `fetchRateLimitSnapshot()` 한 곳에 게이트를 다는 것입니다. #22는 나가는 트래픽이 아니라 **들어오는 접속**을 여는 항목이라 허용목록의 대상이 아니며, 이 레인을 소유하는 스위치가 없으므로 통제는 망 계층(`6768`/dev `6769` 및 폴백 포트의 인바운드 차단)뿐입니다. #21은 네트워크 항목이 아니라 잠금 자체의 무결성 항목이며, 코드가 아니라 배포 형태(ACL 또는 perMachine 설치)로만 닫힙니다. #10은 Electron `net.request`를 쓰므로 허용목록이 덮는지 여부가 §7 레벨 3의 미검증 항목과 같습니다.

**v1.4.176에서 #22의 기본 노출면이 좁아졌습니다(레인이 사라진 것은 아닙니다).** 예전에는 리스너를 무조건 `0.0.0.0`으로 띄웠지만, 이제 `resolveInitialWebSocketBindHost()`가 `orca serve`/E2E가 아니고 **네트워크로 붙은 적 있는 기기가 하나도 없으면 `127.0.0.1`로 바인드**합니다("이 컴퓨터만" 스코프 grant는 계산에서 제외 — STA-2370). LAN/QR 오퍼가 실제로 발급될 때에만 `ensureNetworkExposure()`가 `0.0.0.0`으로 재바인드합니다. 즉 **한 번도 폰을 페어링한 적 없는 PC는 LAN에 리스너를 노출하지 않습니다.** 다만 `window.api.mobile.getRuntimePairingUrl()` IPC는 여전히 정책과 무관하게 등록되고, 그것이 호출되면 리스너가 넓어지므로 **🔴 판정과 망 계층 통제 권고는 그대로입니다.**

**#14·#20·#22·#23은 v1.4.167 머지가 만든 것이 아닙니다.** 네 항목 모두 머지 직전 커밋(`db999ab975`)에 이미 존재하며, 사용자 LLM 엔드포인트 레인(#14)을 뺀 셋은 업스트림 `v1.4.163`에도 그대로 있습니다. #14의 사용자 레인만 이 포크가 `0b6d420f35`에서 추가한 것이고, 그것도 머지 이전입니다.

---

## 1. Git 호스팅 (GitHub / GitLab — Bitbucket·Azure DevOps·Gitea는 코드에서 제거)

### GitHub — `gh` CLI 서브프로세스 (직접 fetch 아님)

- **호스트**: `api.github.com`, `github.com`, 설정 시 사내 GHES(`github.samsungds.net`)
- **발동**: 대부분 사용자 조작(PR/이슈 열람). **일부 자동**: 사이드바에 보이는 워크트리 행의 PR/CI 백그라운드 갱신, 그리고 star-nag. star-nag 서비스는 부팅 시 기동하지만(`src/main/index.ts:2757-2758`) `start()`는 스폰 카운터 리스너만 등록할 뿐 즉시 네트워크를 쓰지 않습니다(`src/main/star-nag/service.ts:65-70`) — 실제 `gh` 호출 시점은 아래 4개 경로입니다.
- **전송**: repo owner/name, 브랜치, 커밋 SHA, PR/이슈 번호·제목·본문, 리뷰 코멘트, CI 로그. 인증 토큰은 `gh`가 보관하고 **Orca 프로세스를 통과하지 않음** (긍정적).
- **GHES 지원**: 이미 있음. origin 리모트에서 호스트를 유도하거나 `GH_HOST`/`options.host`로 `gh api --hostname <host>`를 주입합니다 (`src/main/git/runner.ts:1641-1674` `applyGhHostToArgs`, 레이트리밋 스코프도 같은 호스트를 따름 `:1706-1722`). **PR·이슈 열람 레인은 github.com 하드코딩이 아닙니다.** 다만 github.com으로 **고정된** `gh` 호출이 둘 있습니다: star-nag(아래 주의 2, `disableStarNag`로 닫힘)와 레이트리밋 스냅샷 프로브(`src/main/github/rate-limit.ts:305`, **스위치 없음** — §0.2 #23).

#### v1.4.180에서 늘어난 `gh` 엔드포인트 3종 (PR 스택)

이 구간에 GitHub **스택 PR** 기능이 들어오면서 `gh` 서브프로세스가 호출하는 엔드포인트가 셋 늘었습니다. **새 목적지가 아니라 기존 GitHub 레인의 확장**입니다 — 셋 다 `githubHostExecOptions()`로 저장소의 `host`를 그대로 넘기고 그 값은 origin 리모트에서 유도되므로, **GHES 플릿에서는 사내 호스트로만 나갑니다.** §0.2 #23처럼 코드에 `github.com`이 고정된 경우와 다릅니다 — 여기에는 고정 호스트가 없습니다.

| 호출 | 무엇이 나가나 | 발동 | 빈도 상한 |
| --- | --- | --- | --- |
| GraphQL `repository.pullRequest { stack { … } }` | owner, repo, PR 번호. 응답으로 스택 내 PR 목록(번호·제목·URL·상태·머지 가능성) 수신 | **자동** — 사이드바 PR 배경 갱신이 PR을 번호로 조회하는 순간. 기능 플래그도 사용자 설정도 **없습니다**(`getDefaultSettings()`·`shared/types.ts`에 관련 키 부재) | 요약 캐시 60초 / 상세 캐시 30초, in-flight 중복 제거. 실패(`null`)도 캐시하므로 폭주는 아닙니다 |
| GraphQL `repository.ref { rules { … } }` | owner, repo, 대상 브랜치명. 머지 큐 필요 여부 판정용 | 스택 병합 직전 1회 | 베이스 브랜치별 캐시 |
| REST `PUT repos/{owner}/{repo}/pulls/{N}/merge-async` + 상태 폴링 | `merge_action`, `merge_method`, head SHA / 이후 병합 작업 UUID | 사용자가 병합을 확인한 뒤 | 제출 1회 + **최대 180회 × 1초 = 3분**간 `gh api` 자식 프로세스 반복 스폰. 렌더러 타임아웃도 30초 → 4분으로 늘었습니다 |

- **정책 판정**: 앞의 둘은 조치 불요입니다 — 승인된 GitHub 레인 안이고 목적지가 사내 호스트이며, `gh`는 자식 프로세스라 원래 §0.2 #1의 사각지대에 있습니다. 세 번째(`merge-async`)는 **egress가 아니라 쓰기 범위**의 문제였고 별도로 닫았습니다 — §0.2 #24.
- **미확인**: 사내 GHES 버전이 `pullRequest{stack}`과 `merge-async`를 지원하는지 확인하지 못했습니다(정적 분석만 수행). 미지원이면 GraphQL 오류가 `catch`로 삼켜져 기능만 조용히 죽지만 **요청 자체는 나갑니다.**
- 제출 요청은 기존 `gh` 호출과 동일하게 `env: { ...process.env, GH_PROMPT_DISABLED: '1' }`로 **전체 프로세스 환경을 `gh`에 전달**합니다(`github-pr-stack-async-merge.ts`). 신규 관행이 아니라 기존과 같은 관행이지만, 이 포크의 "런타임 환경변수를 쓰지 않는다" 원칙(§0.1)과 인접한 지점이라 적어 둡니다.

### ⚠️ 주의 1: GHES 감지가 `gh auth status`에 의존

사내 GHES가 `gh`에 로그인돼 있지 않으면 GHES 감지(`src/main/github/github-enterprise-repository.ts:151-152`)가 실패하고 저장소가 **어느 provider에도 배정되지 않아(`unsupported`) PR·이슈가 보이지 않습니다** — 예전에 있던 Gitea 폴백은 코드에서 제거됐으므로 이 상태에서 잘못된 호스트로 요청이 나가지는 않습니다. → 배포 시 `gh auth login --hostname github.samsungds.net`을 선행하세요. 정책 파일의 `githubEnterpriseHost`는 그 로그인의 대상 호스트를 미리 채워 줄 뿐(§0.1 표), `gh` 로그인 자체를 대신하지는 않습니다.

반대 방향도 정리됐습니다: **`gh`만 사내 호스트로 로그인하고 정책 파일은 없는 기계**에서, 이제 `githubEnterpriseHost`가 `gh`의 `hosts.yml`을 마지막 폴백으로 읽습니다(`src/main/github/gh-config-host.ts`). `gh auth login --hostname`은 환경변수가 아니라 그 파일에만 쓰고, GUI로 실행된 Electron 앱은 셸 rc의 `export GH_HOST`를 상속하지 않으므로 — 사내에서 가장 흔한 설치 순서에서 이 경로가 유일한 단서였습니다. 로그인된 호스트가 **둘 이상이면 채택하지 않습니다**(`gh` 자신의 `DefaultHost()`와 동일하게 `github.com`으로 떨어집니다). 확정적으로 못 박으려면 여전히 정책 파일에 `githubEnterpriseHost`를 적는 것이 유일한 방법입니다 — 추론에 의존하지 않기 때문입니다.

### ✅ 주의 2 (해결됨): star-nag의 github.com 고정 호출 — 게이트는 `gh` 호출 함수 자체에 있음

`src/main/github/client.ts:141` — `const ORCA_REPO = 'stablyai/orca'`
`:341` — `checkOrcaStarred()`: `disableStarNag`면 `true` 반환 후 즉시 종료. 이후 `gh api --include user/starred/stablyai/orca` (읽기)
`:527` — `starOrca()`: `disableStarNag`면 `false` 반환 후 즉시 종료. 이후 `gh api -X PUT user/starred/stablyai/orca` (쓰기)

이 경로는 공용 러너(`ghExecFileAsync`)를 우회하는 **raw `execFileAsync`**라 `--hostname` 주입도, GHES 라우팅도 타지 않습니다. **github.com SaaS로 고정된 호출입니다.**

이전 판은 이 게이트가 `StarNagService.start()`에 있고 “에이전트 스폰 임계치”가 유일한 발동 경로라고 적었는데, **둘 다 틀렸습니다.** 게이트는 `src/main/github/client.ts`로 옮겨졌고, 이 함수들에 도달하는 경로는 **4개**입니다. star-nag 서비스는 그중 1개(내부 트리거 2종)에 불과합니다:

| # | 경로 | 진입점 |
| --- | --- | --- |
| 1 | `gh:checkOrcaStarred` / `gh:starOrca` IPC — 랜딩 화면 | `src/main/ipc/github.ts:1210-1211` ← `src/renderer/src/components/Landing.tsx:39,80` |
| 2 | 같은 IPC — 설정 → Support 섹션 | 같은 IPC ← `src/renderer/src/components/settings/GeneralSupportSection.tsx:44,71` |
| 3 | 에이전트 완료 “value moment” 트리거 | `src/main/star-nag/agent-value-moment.ts:46` |
| 4 | star-nag 서비스: 스폰 임계치(`service.ts:105`)와 온보딩 완료(`:240`) → `maybeShow()` (선언 `:108`, `gh` 호출 `:121`) | `src/main/star-nag/service.ts` |

`starOrca()` 쓰기 경로는 위 1·2번 IPC 외에 `src/main/star-nag/direct-star-attempt.ts:9`에서도 호출됩니다. 게이트를 `client.ts`의 두 함수에 둔 덕분에 이 호출 지점 전부가 한 번에 막힙니다 — `StarNagService.start()`에만 걸었다면 1·2·3번은 그대로 github.com으로 나갔습니다.

### 다른 provider

| Provider | 방식 | 호스트 | 폴백 위험 |
| --- | --- | --- | --- |
| **GitLab** | `glab` CLI 서브프로세스 | `gitlab.com` / self-hosted | 자체 self-hosted 감지 있음 |
| ~~Bitbucket~~ | 🚫 **코드에서 제거** (커밋 `4d58e5f21c`) | ~~`api.bitbucket.org`~~ | — |
| ~~Azure DevOps~~ | 🚫 **코드에서 제거** (커밋 `4d58e5f21c`) | ~~`dev.azure.com`, `*.visualstudio.com`~~ | — |
| ~~Gitea/Forgejo~~ | 🚫 **코드에서 제거** (커밋 `4d58e5f21c`) | ~~origin 리모트에서 동적 유도~~ | 폴백 provider 자체가 없어졌습니다 — 미지정 호스트는 `unsupported` |

**✅ Gitea 폴백 리스크는 해소됐습니다(이력).** v1.4.183 동기화 직후 커밋 `4d58e5f21c`가 Bitbucket·Azure DevOps·Gitea 연동을 통째로 삭제했습니다(62파일, −9,029줄; `src/main/bitbucket/**` 16, `src/main/azure-devops/**` 10, `src/main/gitea/**` 9 등). 삭제 전에는 알려진 호스트와 정책의 `githubEnterpriseHost`를 뺀 **모든 리모트 호스트를 Gitea로 간주해 `<host>/api/v1/...`로 무인증 GET을 보냈고**, 그래서 `githubEnterpriseHost` 지정이 필수였습니다. 지금은 provider 탐색이 GitLab → GitHub 둘뿐이고 어느 쪽도 아니면 `unsupported`로 끝나므로(`src/main/source-control/forge-provider.ts:201`), GHES 외의 사내 git 호스트가 있어도 오인 요청은 나가지 않습니다. `githubEnterpriseHost`의 현재 역할은 §0.1 표를 보십시오. 잔여: `src/main/source-control/hosted-review-api-request.ts`(global fetch 래퍼)는 호출부가 전부 삭제돼 **현재 import하는 곳이 없는 사장 코드**로 남아 있습니다(§5 표) — 다음 정리에서 지우는 편이 안전합니다.

---

## 2. 텔레메트리 / 진단 / 크래시 리포트

| 기능 | 호스트 | 기본 상태 |
| --- | --- | --- |
| PostHog 제품 텔레메트리 | `us.i.posthog.com` | **opt-in(기본 꺼짐)** + 공식 CI 빌드에서만 키 주입 |
| 진단 번들 업로드 (설정 → Privacy) | `www.onorca.dev/v1/feedback` | 사용자 명시적 클릭 |
| ~~크래시 리포트 + 인앱 피드백~~ | ~~동일~~ | 🚫 **코드에서 제거됨** — 다이얼로그·`feedback:submit` IPC·preload 계약 전부 삭제 |
| star-nag 프롬프트 텔레메트리 | `us.i.posthog.com` | 위 PostHog 게이트에 종속 |

**게이트는 세 레인 모두에 있습니다.**

PostHog 레인 (`src/main/telemetry/consent.ts:77-96`):
1. `DO_NOT_TRACK` truthy → 무조건 차단 (최우선, `:79`)
2. `ORCA_TELEMETRY_DISABLED` truthy → 차단 (`:83`)
3. **정책 파일 `disableTelemetry` → 차단** (`:88`)
4. CI 환경변수 존재 → 차단 (`:94`, 값이 빈 문자열만 아니면 됨)
5. 사용자 opt-in 배너에 동의하지 않으면 기본 **미전송**

진단 번들 레인 (`src/main/observability/index.ts:97-140`): `disableTelemetry`가 켜지면 `bundleEnabled: false`로 **망 전송만 차단**하고 `localFileEnabled: true`는 유지합니다 (`:120-133`). 로컬 NDJSON 트레이스는 머신을 떠나지 않으므로 그대로 두는 설계이며, 소비자는 `src/main/ipc/diagnostics.ts:221,253,263`입니다.

피드백/크래시 **제출 본문** 레인은 **더 이상 존재하지 않습니다.** 예전에는 `disableTelemetry`가 `submitFeedback()` 진입부에서 제출을 거부했지만, 이 포크는 그 함수와 두 진입점(사이드바 `?` 메뉴의 "피드백 보내기", 크래시 리포트 다이얼로그)을 코드에서 삭제했습니다. `src/main/ipc/feedback*.ts`, `src/renderer/src/components/crash-report/`, `src/renderer/src/components/sidebar/SidebarFeedback*` 이 전부 없어졌고 `window.api.feedback`·`crashReports.submit`·`crashReports.copyLatestDiagnostics` preload 계약도 함께 제거됐습니다. **크래시 기록 자체는 로컬에 남습니다** — 브레드크럼 저장(`crashReports:recordBreadcrumb`)과 렌더러 오류 기록(`crashReports:recordRendererError`)은 디스크에만 쓰고 망으로 나가지 않습니다.

게다가 전송 키(`ORCA_POSTHOG_WRITE_KEY`)는 **공식 CI 릴리스 빌드에만 컴파일타임에 주입**되고, 사내에서 직접 빌드한 exe는 이 값이 리터럴 `null`로 접히므로 애초에 전송 경로가 죽습니다 (`electron.vite.config.ts:41-54,266-267`).

**→ 사내 조치**: 정책 파일 `"lockdown": true`(또는 `"disableTelemetry": true`)로 봉인. 업스트림 `ORCA_TELEMETRY_DISABLED=1`을 병행해도 되지만 필수는 아닙니다.

---

## 3. 자동 업데이트 / 넛지 (🚫 벤더 레인은 코드에서 제거됨 · ✅ 사내 GHES 릴리스 조회 1건 신설)

**이 포크에는 인앱 업데이터가 없습니다.** 정책으로 막는 것이 아니라 소스에서 삭제했으므로, 정책 파일이 없거나 파싱에 실패해도 아래 벤더 레인은 되살아나지 않습니다.

**대신 §3.0의 사내 전용 레인 하나가 새로 생겼습니다** — 사내 GHES의 릴리스 태그를 읽어 "새 버전이 있다"고 알리기만 하는 레인입니다. 다운로드도 설치도 자가교체도 없고 `electron-updater`도 되살아나지 않았습니다. 아래 표의 벤더 목적지는 여전히 전부 삭제 상태입니다.

| 예전 기능 | 예전 호스트 | 지금 상태 |
| --- | --- | --- |
| electron-updater 자동 업데이트 피드 | `github.com`, `objects.githubusercontent.com` | `src/main/updater.ts` 외 업데이터 모듈 전부 삭제. `electron-updater` 의존성도 `package.json`·`config/packaged-runtime-node-modules.cjs`에서 제거 |
| 업데이트 넛지(30분 폴링) | `onorca.dev/whats-new/nudge.json` | `src/main/updater-nudge.ts` 삭제. 스케줄러·`powerMonitor`/포커스 리스너를 등록하는 코드가 없습니다 |
| 릴리스 매니페스트/프리릴리스 피드 | `github.com/stablyai/orca/releases/download` | `src/main/updater-prerelease-feed.ts` 삭제 |
| 변경사항("what's new") fetch | `onorca.dev/whats-new/changelog.json` | `src/main/updater-changelog.ts` 삭제 |
| 릴리스 채널 빌드 선택기 | `api.github.com/repos/stablyai/orca{,-hourly}/releases` REST | `src/main/updater-release-builds.ts`와 설정 → 릴리스 채널 섹션 삭제 |
| macOS 로컬 빌드 교체 | (로컬 피드 서버) | `src/main/local-builds/` 삭제 |
| 원격 Orca 서버 업데이트 (`updater.remote-control.v1`) | 원격 호스트의 업데이터 | RPC 메서드·capability·렌더러 표면 전부 삭제. `status.get`은 더 이상 `remoteUpdateSupport`를 반환하지 않습니다 |

UI 표면도 함께 사라졌습니다 — 앱/Help 메뉴, 트레이, 사이드바 `?` 메뉴, 설정 → 일반, 상태바 업데이트 칩, 업데이트 카드, `window.api.updater.*` preload 계약.

**검증**: `rg -n "electron-updater" package.json pnpm-lock.yaml config/packaged-runtime-node-modules.cjs` 와 `rg -n "from 'electron-updater'|autoUpdater|autoUpdater\.(check|download|install)" src` 가 둘 다 비어 있어야 합니다. (`electron-updater`라는 **문자열** 자체는 §3.0 레인과 정책 타입의 주석에 "여전히 의존성이 아니다"라는 설명으로 남아 있으므로, `src` 전체를 그 단어로 grep하면 주석이 잡힙니다 — 판정은 위 두 명령으로 하십시오.) 회귀 방지 테스트는 `src/main/menu/register-app-menu.test.ts`(메뉴에 업데이트 항목 없음), `src/main/runtime/mobile-rpc-allowlist.test.ts`(`updater.*` RPC 자체가 없음), `src/main/startup/serve-desktop-activation-wiring.test.ts`(설치 정책 배선 없음), `src/preload/renderer-restart-wiring.test.ts`(`updater:status` 릴레이 없음)입니다.

**남은 관련 사항 2건**:
1. `disableAutoUpdate` 정책 키는 **다시 살아 있는 스위치**입니다(2026-08-21~). 예전 판에서 "죽은 스위치"였던 서술은 더는 맞지 않습니다 — §3.0의 사내 릴리스 조회 레인이 이 키를 읽습니다. 벤더 업데이터를 되살리는 키가 아니라는 점은 그대로입니다: 이 키가 `false`여도 다운로드·설치 코드는 저장소에 존재하지 않습니다.
2. `config/electron-builder.config.cjs`의 `publish` 설정은 그대로입니다. 이것은 **런타임 조회가 아니라 릴리스 업로드 대상**이고, 빌드 셸의 `ORCA_DISABLE_PUBLISH_TARGET=1`로 끕니다. 런타임에 이 값을 읽는 코드는 더 이상 없습니다.

**⚠️ 업데이터 표면은 리베이스마다 새로 들어옵니다.** 삭제는 일회성 작업이 아니라 **머지마다 반복해야 하는 작업**입니다. v1.4.167 → v1.4.176 한 구간에서만 업스트림이 Linux 패키지 설치/복구 업데이터 표면 파일 8종을 새로 들여왔고(`linux-package-install-diagnostic.ts`, `linux-package-update-recovery.ts`, `linux-update-package-type.ts`, `linux-package-install-command.ts`, `updater-linux-package-recovery-actions.test.ts`, `window/updater-package-recovery-ipc.test.ts`, `components/LinuxPackageInstallRecoveryCard.tsx`, `components/UpdateErrorCardContent.tsx`), 그 안에 `github.com/stablyai/orca/releases/tag/…`를 여는 코드가 포함돼 있었습니다. 이 포크는 머지 커밋 `e25a3f0f93`에서 전부 삭제했습니다. **머지 후에는 위 검증 명령에 더해 `git diff --diff-filter=A --name-only <이전태그> <새태그> -- src/ | grep -iE 'updater|update-recovery|release-channel'`도 돌리십시오** — 충돌 없이 조용히 들어오므로 테스트도 타입체크도 잡지 못합니다.

**수행 이력** (이 지시는 기록이 남아야 살아 있습니다 — 점검했는데 기록이 없으면 다음 검토자가 다시 의심합니다):

| 구간 | 결과 |
| --- | --- |
| v1.4.167 → v1.4.176 | 🔴 업데이터 표면 파일 8종 유입 — 머지 커밋 `e25a3f0f93`에서 전부 삭제 |
| v1.4.178 → v1.4.180 | ✅ **0건.** 신규 파일과 추가 라인 양쪽에서 `updater`/`update-recovery`/`release-channel`/`feedUrl`/`autoUpdate`/`releases/tag`/`downloadUrl` 모두 매치 없음 |
| v1.4.180 → v1.4.182 | ✅ **신규 파일 0건.** 추가 라인 매치 9건은 전부 포크가 이미 삭제한 파일(`ReleaseChannelSection.tsx`, `shared/release-channel.ts`, `updater-release-builds.test.ts`)에 대한 upstream 수정이라 머지에서 삭제 상태가 유지됨(사후 기록, 2026-08-17 확인) |
| v1.4.182 → v1.4.183 | ✅ **0건.** 신규 파일·추가 라인 모두 매치 없음(사후 기록, 2026-08-17 확인) |
| v1.4.183 → v1.4.184 | ✅ **0건.** 신규 파일·추가 라인 모두 매치 없음 |
| v1.4.184 → v1.4.185 | 🔴 **신규 파일 2종 유입** — `src/preload/api/updater-api.ts`(preload 47분할 과정에서 되살아난 `UpdaterApi` 타입 껍데기)와 `src/shared/update-status-types.ts`(`types.ts` 해체로 분리된 `UpdateStatus`/`UpdateCheckOptions`/`LinuxPackageInstallRecovery`). **머지 커밋 `cf73207b45`에서 둘 다 제외**했고, `api-types.ts`의 `updater: UpdaterApi` 키와 도달 불가해진 e2e 스펙(`tests/e2e/update-install-renderer-checkpoint-recovery.spec.ts`)도 같이 지웠습니다. 머지 트리에 남은 매치는 `SkillUpdateRow.tsx`(스킬 업데이트 UI, 앱 업데이터 무관) 하나뿐이고 `electron-updater`/`autoUpdater`/`checkForUpdates` grep은 0건입니다 |

빌드 단계의 phone-home(electron-builder가 github에 업로드 시도)은 [윈도우 빌드 가이드 §5](./windows-corporate-build.md)에서 `--publish never`로 이미 다룹니다.

---

## 3.0 사내 GHES 릴리스 조회 (✅ 신설 — 나가는 목적지 1건 증가)

**2026-08-21에 추가된 유일한 신규 egress입니다.** 사내 요구사항은 "업데이트 팝업을 다시 보되, 버전은 사내 GHES의 태그에서 읽는다"였습니다. 아래가 그 레인의 전부입니다 — 과장 없이 읽으십시오.

| 항목 | 사실 |
| --- | --- |
| **목적지** | `https://<githubEnterpriseHost>/api/v3/repos/<updateReleaseRepository>/releases?per_page=30`, 그리고 비어 있거나 404일 때만 `…/tags?per_page=30`. 기본 좌표는 `DPI/Orcads`, 기본 호스트는 정책의 `githubEnterpriseHost`. **벤더 호스트는 코드에서 거부합니다** — 해석 결과가 `github.com`/`api.github.com`이면 조회 자체를 하지 않습니다(`resolveEnterpriseReleaseHost()`의 `isVendorGitHubHost` 검사) |
| **누가 소켓을 여는가** | Orca가 아니라 **`gh` 자식 프로세스**입니다(`ghExecFileAsync(['api', …], { host })`). 새 HTTP 클라이언트도 새 토큰 저장소도 만들지 않았고, 자격증명은 `gh` 자신의 키링에 있는 기존 GHES 토큰입니다 |
| **나가는 내용** | 인증된 GET 두 종뿐입니다. 요청 본문 없음, 쿼리에 실리는 사용자·머신·워크스페이스 정보 없음, 실행 중인 버전을 서버에 알리지 않습니다(비교는 전부 로컬) |
| **주기** | 핸들러 등록 60초 뒤 1회, 이후 6시간 간격. 렌더러가 `appUpdate:check`로 즉시 확인을 요청할 수도 있습니다 |
| **하지 않는 것** | 다운로드 없음, 설치 없음, 앱 자가교체 없음, 재시작 없음, 릴리스 채널 선택 없음, changelog fetch 없음. `electron-updater`는 **여전히 의존성이 아닙니다**(`package.json`·`pnpm-lock.yaml`·`config/packaged-runtime-node-modules.cjs` 0건). UI가 제공하는 유일한 동작은 사내 릴리스 페이지를 OS 브라우저로 여는 것입니다 |
| **정책 게이트** | `disableAutoUpdate`. 초크포인트는 `AppUpdateCheckService.check()` 하나이고, 스케줄러·IPC·수동 확인이 전부 그리로 들어갑니다. `lockdown: true`면 기본으로 켜지므로(=레인 차단) 조회 자체가 일어나지 않습니다 |
| **릴리스 페이지 열기** | `openExternalUrlUnderPolicy()`를 그대로 지납니다 — 즉 §0.2 #20의 `disableVendorLinks` 초크포인트를 통과합니다. 사내 GHES 호스트는 벤더 규칙표에 없으므로 열립니다. 렌더러가 URL을 넘기지 못하게 IPC는 **인자를 받지 않고** 메인이 해석해 둔 URL만 엽니다 |
| **URL 검증** | API가 준 `html_url`은 우리가 물어본 호스트와 origin이 같을 때만 씁니다. 다르면 `https://<host>/<owner>/<repo>/releases/tag/<tag>`로 직접 조립합니다 |
| **실패 시** | 조용합니다. `gh` 없음 / 미인증(401) / 네트워크 없음 / 빈 목록 / 파싱 불가한 태그 — 전부 알림 없이 끝나고 사용자에게 오류를 띄우지 않습니다. **파싱 불가한 태그가 "새 버전 있음"으로 읽히지 않는다**는 것을 테스트로 고정했습니다 |
| **드래프트·프리릴리스** | 둘 다 제외합니다. 릴리스 채널 선택기가 없어 이 플릿의 사용자는 프리릴리스를 고를 수 없고, 태그 폴백에는 플래그가 없으므로 태그의 semver 프리릴리스 suffix(`-rc.1` 등)로도 한 번 더 거릅니다 |
| **저장하는 것** | "이 버전은 다시 알리지 않음" 한 줄뿐입니다 — `<userData>/app-update-dismissed.json`. 사용자 프로파일이고 정책 파일이 아닙니다 |

**코드 위치**: `src/main/app-update/`(`enterprise-release-lookup.ts` 조회·호스트 해석, `release-tag-selection.ts` 순수 태그 판정, `app-update-check-service.ts` 게이트·스케줄, `update-notice-dismissals.ts` 무시 기록), IPC `src/main/ipc/app-update.ts`, UI `src/renderer/src/components/AppUpdateAvailableDialog.tsx`.

🔴 **잔여 위험 2건** (§0.2와 같은 등급으로 읽으십시오):

1. **`enforceNetworkAllowlist`가 이 레인을 보지 못합니다.** 소켓을 여는 것은 `gh` 자식 프로세스이므로 §0.2 #1의 사각지대와 정확히 같습니다. 목적지가 사내 GHES 하나뿐이고 그 호스트는 어차피 허용목록에 자동 포함되므로 실질 위험은 낮지만, "허용목록이 막아 준다"고 말할 수 있는 항목은 **아닙니다**.
2. **`disableAutoUpdate`를 `false`로 되돌린 플릿에서는 6시간마다 GHES에 요청이 나갑니다.** 사내 호스트 한 곳이고 인증된 읽기지만, 조회 빈도와 대상 저장소는 `updateReleaseRepository`로 관리자가 지정하는 값이므로 배포 전에 확인하십시오.

---

## 3.2 스킬 설치·업데이트 — **번들 스킬 레인** (🚫 코드에서 제거됨)

> **⚠️ 이 절과 §3.1의 스킬 레인은 서로 다른 두 개입니다. 혼동하면 이 문서가 실제보다 안전하게 읽힙니다.**
>
> | | **이 절 (§3.2)** | **§3.1의 스킬 공유 레인** |
> | --- | --- | --- |
> | 무엇 | Orca **자신의** 번들 스킬(`orca-cli`, `computer-use`, …)을 에이전트 홈에 설치·갱신 | **임의의 제3자**가 만든 스킬 패키지를 공유 링크로 받아 설치 |
> | 언제 들어왔나 | v1.4.178 이전부터 | **v1.4.188 신규** |
> | 옛 목적지 | `registry.npmjs.org` + `github.com/stablyai/orca` | `share.onorca.dev` + `storage.googleapis.com` |
> | 어떻게 처리했나 | **대체** — 같은 바이트를 패키지에 동봉하고 로컬 복사로 설치 | **제거** — 대체할 오프라인 경로가 없습니다(패키지 자체가 벤더 호스트에만 존재) |
> | 초크포인트 | `src/shared/agent-feature-install-commands.ts` | `skillCloudRequest()` + `downloadSkillPackageGrant()` (§3.1) |
>
> **이 절이 v1.4.188의 설치 레인을 덮는다고 읽지 마십시오.** 두 레인은 코드도, 목적지도, 처리 방식도 공유하지 않습니다.

Orca 자신의 에이전트 스킬(`orca-cli`, `computer-use`, `orchestration`, …)을 설치·갱신하는 레인입니다. §3·§3.1과 같은 성격 — 정책이 아니라 소스에서 바꿨습니다.

| | 이전 | 지금 |
| --- | --- | --- |
| 설정/온보딩이 인쇄하던 명령 | `npx skills add https://github.com/stablyai/orca --skill <name> --global` | `orca skills install --skill <name>` |
| 업데이트 실행기(메인 프로세스) | `npx --yes skills update <names> --global -y` | 번들 CLI를 스폰: `orca skills update --skill <name>` |
| 목적지 | `registry.npmjs.org`(커뮤니티 `skills` 패키지) + `github.com/stablyai/orca`(스킬 원본) | **없음** |

**나가던 것**: 패키지 이름과 저장소 URL뿐입니다. 사내 소스나 자격증명이 나간 적은 없습니다. 문제는 유출이 아니라 **폐쇄망에서 설치가 완주 불가능**하다는 것이었고, 부수적으로 사내 포크가 아니라 **업스트림 저장소**의 스킬을 받아 왔다는 점입니다.

**차단 지점**: 명령 문자열을 만드는 유일한 초크포인트 `src/shared/agent-feature-install-commands.ts` — 설치/업데이트를 인쇄하는 7개 UI 표면(설정 CLI/Browser Use/Linear/에뮬레이터, 피처월, 피처팁 터미널, 온보딩)이 전부 이 한 곳을 지납니다. 업데이트 실행기는 `src/main/skills/skill-update-run.ts`에서 `npx` 대신 이 빌드의 CLI를 스폰합니다.

**스킬 본문은 패키지에 함께 실립니다.** `skills/` 트리(SKILL.md 8개, 44KB)가 `extraResources`로 `Resources/skills/packages`에 복사됩니다 — 프레시니스 매니페스트(`Resources/skills/current-manifest.json`)와 같은 리소스 루트입니다. 설치는 그 바이트를 에이전트 홈(`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, …)으로 복사하고, `~/.agents/.skill-lock.json`에 설치 기록을 남깁니다(업데이트 자격 판정이 이 락을 읽습니다).

**왜 정책 스위치가 아닌가.** 스위치를 켜면 스킬 설치가 *불가능해질* 뿐입니다. 필요한 것은 차단이 아니라 **같은 일을 망 없이 하는 것**이었고, 오프라인 경로는 사내·비사내 어느 플릿에서도 손해가 없습니다(같은 바이트를, 더 빠르게, 버전이 어긋날 여지 없이).

**Windows npx 프리플라이트도 함께 제거**했습니다 — `where.exe npx` 래퍼와 "Install Node.js LTS" 안내는 npx를 쓸 때만 의미가 있었습니다.

**검증**:

```bash
# 빈 결과여야 합니다. 스킬 본문 자체를 담고 있는 생성 파일은 제외합니다.
git grep -nE "npx (--yes )?skills|skills add https" -- src/ \
  | grep -v '\.test\.\|bundled-skill-guides\.ts'

# 패키지에 스킬 바이트가 실리는지 (설치 시점에 받아올 것이 없어야 하므로)
git grep -n "from: 'skills'" -- config/electron-builder.config.cjs
```

회귀 방지 테스트: `src/shared/agent-feature-install-commands.test.ts`(인쇄되는 모든 명령에 `npx`/`github.com`/`http` 부재), `src/shared/bundled-skill-install.test.ts`(설치된 바이트의 git tree sha가 동봉 매니페스트와 일치 — 어긋나면 설치 직후부터 "알 수 없는 내용"으로 표시됩니다), `src/main/skills/bundled-skill-install-root-parity.test.ts`(설치 대상 디렉터리가 프레시니스 스캐너가 보는 홈 루트와 정확히 일치).

**⚠️ 잔여**: 사용자가 커뮤니티 `skills` CLI를 **직접** 설치해 쓰는 것은 Orca가 막지 않습니다(그건 #1과 같은 사각지대 — 사용자가 터미널에서 실행하는 임의의 도구입니다). 이 항목이 보장하는 것은 **Orca가 스스로 그 명령을 인쇄하거나 실행하지 않는다**는 것입니다.

---

## 3.1 벤더 클라우드 레인 4종 (🚫 코드에서 제거됨, v1.4.178~)

§3과 같은 성격입니다 — 정책이 아니라 소스에서 차단했으므로, 정책 파일이 없거나 파싱에 실패해도 되살아나지 않습니다.

| 기능 | 목적지 | 나가던 것 | 차단 지점 |
| --- | --- | --- | --- |
| **Artifacts 공유** (v1.4.178 신규) | `share.onorca.dev` (인증 갱신은 벤더 로그인 호스트) | **파일 본문 전체**(최대 800KB), 파일 basename, 선택적 제목, `Bearer` 토큰(계정 신원). 절대경로·워크트리명·텔레메트리는 아님 | `ArtifactCloudService.withAuth` (`src/main/artifacts/artifact-cloud-service.ts`) |
| **에이전트 스킬 공유** (v1.4.188 신규) | **양방향 두 호스트** — 메타데이터는 `share.onorca.dev`(`/v1/skill-shares/…`), 아카이브 자체는 `storage.googleapis.com`(**업로드·다운로드 모두**) | **선택한 스킬 디렉터리 전체를 tar.gz으로 압축한 바이트**(상한 `SKILL_PACKAGE_MAX_COMPRESSED_BYTES`) — SKILL.md 본문, 딸린 스크립트·참조 파일이 그대로 포함됩니다. 메타 레인으로는 공유 id, 선택적 버전 id, `installTarget`(`local`/`remote`), 그리고 요청이 드러내는 소스 IP·TLS SNI. **발행 방향에만 `Bearer` 토큰이 붙고 설치 방향에는 붙지 않습니다** | 요청 함수 `skillCloudRequest()` (`src/main/skills/skill-cloud-request.ts`) + 다운로드 `downloadSkillPackageGrant()` (`src/main/skills/skill-package-download.ts`) + 링크 파서 `parseSkillShareId()` (`src/shared/skill-share-link.ts`) |
| **Orca Cloud 로그인** | 벤더 로그인 호스트 `/v1/desktop/auth/{authorize,session,refresh,capabilities,profile,org,logout,relay-token}` | OAuth 세션·프로필·조직 정보 | `getOrcaCloudAuthConfig()` (`src/main/orca-profiles/profile-cloud-auth-config.ts`) |
| **모바일 페어링 릴레이 디렉터** | 벤더 릴레이 호스트 | 릴레이 초대 토큰, 릴레이 경유 터미널 브리지, **(v1.4.185~) 리전 카탈로그 조회 `GET {director}/v1/regions`와 셀 origin별 지연 프로브 `GET {origin}/health`**(3샘플 × 최대 2 origin × 2 리전, 24h 캐시 — `src/main/runtime/relay/relay-region-preference.ts:182,218`) | 동일 — `DesktopRelayService`는 이 호출이 `configured`일 때만 생성됩니다 (`src/main/index.ts`). 리전 프로브도 그 생성자 안에서 배선되므로 같은 초크포인트가 덮습니다 |

**⚠️ Artifacts — v1.4.180 재확인: 로그와 트리가 어긋납니다.** `git log v1.4.178..v1.4.180`에는 Artifacts 후속 커밋 3건(수동 공유 #13369, 능력 게이팅 #13368, 관리 UI #13356)이 보이지만 **트리는 v1.4.178과 동일합니다** — `git diff --name-only v1.4.178 v1.4.180 -- '*artifact*' '*Artifact*'`가 비어 있습니다. 그 작업은 이미 v1.4.178 트리에 들어와 있었고, 포크의 제거(`f259c8d780`)가 여전히 표면 전부를 덮습니다. **로그만 보고 "이번에 새로 들어왔다"고 읽지 마십시오**(문서 상단 방법론). 반대로 **트리가 같다고 해서 업스트림이 이 레인을 접은 것도 아니므로**, 아래 소스 감사 테스트는 계속 필요합니다.

**왜 정책 스위치가 아니라 제거인가.**

- **Artifacts**: API 클라이언트가 목적지를 `onorca.dev` 호스트로 **잠가 둡니다**(`artifact-cloud-config.ts`). 사내 호스트로 돌릴 수 없으므로, 사내 소스를 사내 인프라에 두면서 이 기능을 켜는 설정 조합이 존재하지 않습니다. 업스트림의 off-by-default(`artifactSharingEnabled`)는 **에이전트가 공개 링크를 만들지 못하게 하는 사용자 설정**이지 배포 통제 수단이 아닙니다 — UI에서 두 번 클릭이면 켜집니다.
- **에이전트 스킬 공유**: 세 가지가 겹칩니다. ① 목적지 잠금은 Artifacts와 **같은 코드**입니다 — `skill-cloud-request.ts`가 `resolveArtifactCloudApiUrl()`을 재사용하므로 사내 호스트로 돌릴 수 없고, 아카이브는 `storage.googleapis.com`에서만 받습니다. ② 업스트림의 `agentSkillSharingEnabled`는 **발행 방향만** 보는 사용자 설정이고, 설치 방향에는 검사 자체가 없습니다. ③ **결정적인 이유는 릴레이입니다** — `getEnterprisePolicy()`는 `electron`을 import하므로 릴레이 esbuild 번들에 들어갈 수 없고, 정책 파일은 원격 SSH 호스트에 배포되지도 않습니다(그 호스트에서는 `lockdown: false`로 해석됩니다). 반면 `src/shared`의 컴파일타임 상수는 **가드하는 코드와 함께 릴레이 번들에 실립니다.** 즉 이 레인에서는 **정책 스위치라는 선택지가 물리적으로 존재하지 않습니다.** 같은 이유로 `enforceNetworkAllowlist`도 답이 아닙니다 — 그 가드는 `session.defaultSession`과 **메인 프로세스의** global `fetch`만 감싸므로(§0.2 #1) 원격 호스트에서 릴레이 자신이 여는 소켓을 **구조적으로 볼 수 없습니다.**
- **클라우드/릴레이**: `disableCloudRelay`로 이미 덮여 있었지만, 그건 관리자의 선택입니다. **모바일 페어링을 쓰려고 그 스위치를 끄는 것은 정당한 구성인데, 그러면 벤더 로그인과 릴레이가 같이 되살아납니다.** 이 빌드는 둘 다 쓰지 않으므로 정책 한 줄 뒤에 두지 않습니다.

**초크포인트 선택이 중요했습니다.** Artifacts는 `share`/`publish`/`update`만 업스트림 capability 게이트를 통과하고 `list`/`getPublishedLink`/`unshare`/`delete` 4종은 **의도적으로 무게이트**입니다(옛 링크를 감사·회수할 수 있어야 한다는 이유). 7개 RPC가 전부 지나가는 `withAuth`에 걸어야 다 막힙니다. 특히 dev 빌드의 `authToken` 우회는 인증 설정 검사를 건너뛰므로 **그 분기보다 앞**에 두어야 합니다.

**스킬 공유는 그보다 나쁩니다 — `withAuth`에 걸었다면 설치 레인이 통째로 살아 있었을 것입니다.** Artifacts는 게이트가 없는 4종도 최소한 **인증 클래스 안에** 있었습니다. 스킬 공유에서는 `SkillCloudService`가 `withAuth` 말고 **`withoutAuth`라는 두 번째 진입로**를 갖고 있고, 그 경로는 `getOrcaCloudAuthConfig()`를 아예 부르지 않습니다. 그 위에 올라탄 두 메서드가 하필 설치 레인의 전부입니다 — `resolveShare`(공유 링크 해석)와 `createDownloadGrant`(다운로드 그랜트 발급). **업스트림은 이것을 의도로 문서화합니다**: 링크를 받은 사람이 로그인 없이 설치할 수 있어야 한다는 것이 이 기능의 설계 목표입니다. 따라서 이 포크에서 그것은 곧 **로그인하지 않은 사내 PC가 링크 하나로 제3자 코드를 받아 `~/.agents/skills`에 푸는 경로**를 뜻하고, 포크의 기존 방어(`ORCA_CLOUD_REMOVED`)는 인증 초크포인트에 걸려 있어 이 경로를 **하나도 보지 못했습니다**. 그래서 가드를 인증 계층이 아니라 **요청 함수 `skillCloudRequest()` 본문 첫 줄**에 두었습니다 — 12개 호출자가 전부 이 함수를 지나므로 `withAuth`와 `withoutAuth`를 한 번에 덮고, dev 빌드의 `authToken` 우회 분기(그 분기는 인증 설정 검사를 건너뜁니다)도 실제 소켓을 열려면 여기를 지나야 하므로 순서 문제가 소멸합니다.

**두 번째 가드가 따로 필요했던 이유**는 그랜트 URL이 **호출자 제공**이기 때문입니다. RPC `skills.install`/`skills.installBundle`과 릴레이의 설치 핸들러는 `ingress: { kind: 'download-grant', url, … }`를 그대로 받고 업스트림 게이트가 없습니다. 즉 메타 레인을 막아도 **URL을 이미 들고 있는 호출자**(페어링된 클라이언트, 릴레이 호출자)는 그대로 내려받습니다. 데스크톱·릴레이·헤드리스 `orca serve` 세 실행 형태가 공유하는 단 하나의 함수가 `downloadSkillPackageGrant()`이므로 거기에 두 번째 가드를 두었습니다. 호출자 4곳에 각각 두는 안은 **"초크포인트가 아니라 호출자"** 규칙 위반이라 채택하지 않았습니다.

**세 번째 가드는 딥링크 파서입니다.** `parseSkillShareId()`가 항상 `null`을 반환하므로 `orca://skills/share/<id>`와 `https://app.orca.dev/skills/share/<id>`가 argv나 `open-url`로 들어와도 해석되지 않습니다 — 호출자 3곳(초기 argv 캡처, 두 번째 인스턴스의 argv, 렌더러의 붙여넣기 검증)이 한 번에 죽습니다. 이 가드가 없으면 **사용자 클릭 없이** 앱 기동만으로 `share.onorca.dev`에 요청이 나갔습니다.

**⚠️ 목적지 리터럴은 남아 있습니다.** `src/shared/skill-share-link.ts`의 `PRODUCTION_HOSTS`(`app.orca.dev`, `share.onorca.dev`)는 매처이지 목적지가 아니며, 파서가 그 앞에서 반환하므로 도달하지 않습니다. Artifacts에서 하드코딩 상수를 **삭제**한 것과 달리 여기서는 남겨 두었습니다 — 이 파일은 업스트림이 계속 손대는 곳이라 다음 동기화의 충돌 표면을 늘리지 않는 쪽을 택했습니다. 대신 아래 grep 검증에 두 호스트를 넣었습니다.

**UI 표면도 함께 제거**했습니다: 발행 다이얼로그, 링크 붙여넣기 설치 다이얼로그, 번들 설치 플로, "내 공유 링크" 뷰, 설정 → Share Skills 페인(레지스트리 + 딥링크 + 검색 인덱스), 스킬 행·상세 다이얼로그의 "Share skill", 공유 선택 모드 전체, 그리고 딥링크를 받던 스토어 액션(`openSkillShare`/`openSkillsSharedLinks`)과 `useIpcEvents`의 `ui:openSkillShare`/`ui:consumePendingSkillShare` 처리. **Artifacts와 달리 영속 뷰 복원(`activeView: 'skills'`)은 건드리지 않았습니다** — Skills 페이지 자체는 로컬 인벤토리로 남기 때문입니다(§0.2 #26). 번역 카탈로그에서도 286개 키를 지웠는데, 그중 하나(`auto.components.skills.SkillInstallReviewContent.66cff7a804`)는 값이 `https://app.orca.dev/skills/share/…` 리터럴이라 **출하되는 번역 파일 안에 벤더 호스트가 들어 있었습니다.**

**하드코딩 상수도 삭제했습니다.** 벤더 로그인 호스트, `orca-desktop` OAuth client id, 릴레이 디렉터 origin의 패키지 빌드용 폴백을 지웠습니다. 번들에서 문자열 자체가 사라져 검토자가 grep할 대상이 없고, 가드가 리베이스로 사라지더라도 폴백할 엔드포인트가 없습니다. 환경변수(`ORCA_CLOUD_API_URL`, `ORCA_RELAY_URL`)로도 복구되지 않습니다 — env var는 Orca가 스폰하는 모든 프로세스에 상속되므로(§0.1) 그걸 존중하는 빌드는 `export` 한 번이면 뚫립니다.

**⚠️ v1.4.185: 이 레인의 *도달 불가 코드*가 늘었습니다.** 업스트림이 릴레이 리전 선택(`relay-region-preference.ts`)을 새로 넣었고, 이 포크는 그것을 **지우지 않고 도달 불가 상태로 두었습니다** — `getOrcaCloudAuthConfig()`가 `ORCA_CLOUD_REMOVED`로 조기 반환하므로 `DesktopRelayService` 자체가 생성되지 않기 때문입니다. 차단은 여전히 유효하지만 **이 레인의 코드 표면은 릴리스마다 커집니다.** 즉 "제거됨"은 *호출 경로가 끊겼다*는 뜻이지 *코드가 없다*는 뜻이 아니며, 리베이스가 `ORCA_CLOUD_REMOVED` 가드를 잘못 해소하면 문서에 없던 요청 형태까지 함께 살아납니다. 아래 소스 감사 테스트를 계속 유지해야 하는 이유가 하나 늘었습니다.

**UI 표면도 함께 제거**했습니다(Artifacts): 사이드바 행, 설정 페인(레지스트리 + 딥링크), 에디터·브라우저 패널의 publish 버튼, artifacts 뷰 라우팅. 뷰 라우팅은 **영속 상태 복원 경로까지** 막았습니다 — 페이지를 켜둔 채 종료한 PC는 디스크에 `activeView: 'artifacts'`가 남아 다음 실행에서 다시 마운트되기 때문입니다(모바일 뷰에서 겪은 것과 같은 패턴).

**검증**:

```bash
# 빈 결과여야 합니다. 두 호스트를 이름으로 부르는 것이 존재 이유인 파일 2개만 제외합니다 —
# 제거 사실을 문서화하는 모듈과, 그 부재를 검사하는 테스트 자신.
git grep -n 'login\.onorca\.dev\|relay\.onorca\.dev' -- src/ \
  | grep -v 'shared/orca-cloud-removal.ts\|orca-cloud-host-absence.test.ts'

# 스킬 공유의 두 목적지. 여기서 나오는 것은 **매처와 허용목록뿐**이어야 하고,
# `fetch(`/`fetcher` 호출부에 이 호스트가 있으면 가드가 풀린 것입니다.
git grep -n 'app\.orca\.dev\|share\.onorca\.dev\|storage\.googleapis\.com' -- src/ \
  | grep -v 'skill-sharing-removal\.ts\|-removed\.test\.'

# 제거 가드가 제자리에 있는지 (없으면 정책만 남았다는 뜻)
git grep -n 'ARTIFACT_SHARING_REMOVED\|ORCA_CLOUD_REMOVED\|SKILL_SHARING_REMOVED' -- src/

# 벤더 호스트가 출하되는 번역 카탈로그에 되살아났는지
git grep -n 'orca\.dev' -- src/renderer/src/i18n/locales/
```

**`SKILL_SHARING_REMOVED`의 기대 소비처(9곳)**: `src/main/skills/skill-cloud-request.ts`(가드 A), `src/main/skills/skill-package-download.ts`(가드 B), `src/shared/skill-share-link.ts`(딥링크 파서), `src/renderer/src/components/settings/settings-pane-policy-visibility.ts`(설정 딥링크), 그리고 회귀 테스트. 이보다 적으면 리베이스가 가드를 하나 삼킨 것입니다.

스킬 공유의 회귀 방지 테스트는 `src/main/skills/skill-sharing-removed.test.ts`(`SkillCloudService` 전 메서드가 `fetch`에 도달하지 않음 — 사용자 토글이 켜진 경우와 `authToken`을 직접 넘긴 dev 우회 포함, `downloadSkillPackageGrant`가 유효한 GCS URL·정상 그랜트에도 받지 않음, `parseSkillShareId`가 프로덕션 링크에 `null`), 렌더러 쪽은 `src/renderer/src/components/settings/settings-pane-policy-visibility.test.ts`(`share-skills`가 레지스트리에 없고 설정 딥링크도 거부됨 — 레지스트리에서 빠지는 것이 곧 설정 검색과 Cmd+J에서 빠지는 것입니다)와 `src/renderer/src/components/skills/SkillsPage.test.tsx`(로컬 인벤토리는 계속 렌더되지만 발행·링크설치 진입점은 없음)입니다. Artifacts 쪽 회귀 방지 테스트는 `src/main/artifacts/artifact-sharing-removed.test.ts`(7개 메서드 전부 `fetch` 미호출 — 사용자 토글이 켜진 경우와 호출자가 직접 loopback URL+토큰을 넘긴 경우 포함), `src/main/orca-profiles/profile-cloud-auth-config.test.ts`(환경변수·정책 조합 전수 거부, `disableCloudRelay: false` 포함), `src/main/orca-profiles/orca-cloud-host-absence.test.ts`(소스 감사)입니다.

**⚠️ 마지막 것이 소스 감사인 이유**: 가드가 엔드포인트 해석 **전에** 반환하므로, 벤더 호스트 상수가 트리에 되살아나도 **동작 테스트로는 관측할 수 없습니다.** 업스트림 머지가 상수만 복원하고 가드를 건드리지 않으면 나머지 스위트는 전부 초록입니다. §3의 업데이터와 같은 함정입니다.

**업스트림 테스트 6종을 제거했습니다** — 벤더 왕복 자체를 검증하던 것이라 이 빌드를 서술하지 않습니다(`artifact-cloud-service{,-races}.test.ts`, `profile-cloud-{service,service-auth-retry,service-refresh,org-members-service}.test.ts`). 머지마다 "deleted by us" 충돌로 다시 올라오므로 삭제를 유지하십시오.

---

## 4. AI 벤더 사용량/인증 (Orca 자체 호출)

Orca가 스폰하는 에이전트 CLI(claude/codex/…)의 트래픽이 아니라, **Orca가 직접 거는 호출**입니다.

| 기능 | 호스트 | 기본 상태 | 정책 차단 |
| --- | --- | --- | --- |
| 🔴 **Claude 사용량/rate-limit 폴링** | **`api.anthropic.com/api/oauth/usage`** (Electron `net.fetch`, `claude-fetcher.ts:355`) | **기본 켜짐.** 창 생성 직후 서비스 시작(`src/main/index.ts:1457`), 창이 보이고 포커스된 동안 **15분 주기**(`src/main/rate-limits/service.ts:82`, 가시성 술어 `:873-882`) | ✅ `disableUsagePolling` |
| 🔴 **Claude OAuth 리프레시 토큰 회전** | `platform.claude.com/v1/oauth/token` (Electron `net.fetch`, `oauth-refresh.ts:10,149`) | Orca 관리 Claude 계정을 추가하지 않으면 안 나감 | ✅ `disableManagedClaudeAccounts` |
| 🔴 **Codex 사용량** | `chatgpt.com/backend-api/wham/usage` (`src/main/rate-limits/codex-fetcher.ts:544`) | Claude와 동일 구조 — 로컬 `~/.codex/auth.json`(또는 `CODEX_HOME`)만 있으면 발생 (`:208,360`) | ✅ `disableUsagePolling` |
| 🔴 **Grok 사용량** | `cli-chat-proxy.grok.com` (`src/main/rate-limits/grok-fetcher.ts:17`) | 로컬 `<GROK_HOME>/auth.json`만 있으면 발생 (`src/main/rate-limits/grok-auth.ts:11`) | ✅ `disableUsagePolling` |
| 🔴 **Kimi 사용량** | `api.kimi.com/coding/v1` (`src/main/rate-limits/kimi-fetcher.ts:20`) | 로컬 `<KIMI_HOME>/credentials/kimi-code.json`만 있으면 발생 (`:27-32,109-118`) | ✅ `disableUsagePolling` |
| Gemini CLI 쿼터 + Google OAuth 갱신 | `cloudcode-pa.googleapis.com`, `oauth2.googleapis.com` (`src/main/rate-limits/gemini-usage-fetcher.ts:19`, `gemini-oauth-sources.ts:9-10`) | **기본 꺼짐** — `geminiCliOAuthEnabled: false` (opt-in, `src/shared/constants.ts:338`) | ✅ `disableUsagePolling` |
| MiniMax 사용량 | `platform.minimax.io` (`src/main/rate-limits/minimax-request-context.ts:4`) | **기본 꺼짐** — 세션 쿠키 미설정 시 무전송 | ✅ `disableUsagePolling` |
| OpenCode 사용량 | `opencode.ai/_server` (`src/main/rate-limits/opencode-go-usage-fetcher.ts:12`) | **기본 꺼짐** — 세션 쿠키 필요 | ✅ `disableUsagePolling` |
| 🔴 **받아쓰기(STT) → OpenAI** | `api.openai.com` (`src/main/speech/openai-transcription-client.ts:118`, global fetch) | **기본 꺼짐** — `voice.enabled: false` + 모델 미선택 + API 키 미설정, 3중 게이트 | ✅ `disableVoice`. STT 런타임이 아예 생성되지 않고 `registerSpeechHandlers`도 등록되지 않습니다. global fetch라서 opt-in `enforceNetworkAllowlist`도 덮습니다 (§5 표) |

### 🔴 정정: 사용량 폴링은 “Orca 계정 연동에 종속”되지 않습니다

이전 판은 사용량 폴링이 Orca 관리 Claude 계정 연동에 종속된다고 적었으나 **사실이 아닙니다.** Claude가 가장 위험하지만, Codex·Grok·Kimi도 **읽는 파일만 다를 뿐 구조가 같습니다** — 전부 사용자의 로컬 벤더 CLI 자격증명을 직접 읽습니다.

- 목적지는 `platform.claude.com`이 아니라 **`https://api.anthropic.com/api/oauth/usage`** 입니다 (`src/main/rate-limits/claude-fetcher.ts:46`, 호출은 `:355`). 이 호스트는 이전 판 어디에도 등장하지 않았습니다 — **방화벽 허용목록에서 빠지기 쉬운 지점입니다.**
- 자격증명은 Orca 계정이 아니라 **사용자의 기존 Claude CLI 자격증명**에서 읽습니다: macOS Keychain을 먼저 보고, 없으면 **`~/.claude/.credentials.json`** 으로 폴백합니다 (`claude-fetcher.ts:193-201`, 경로 조립은 `:194`, 순서는 `:207-233`).
- 즉 **사내 개발자가 Claude Code CLI에 이미 로그인해 있기만 하면**, Orca에 아무 계정도 추가하지 않아도 창이 포커스된 동안 15분마다 `api.anthropic.com`으로 나갑니다.

이 경로는 `disableUsagePolling`으로 닫힙니다. 게이트 술어는 `isUsagePollingDisabled()` (`src/main/rate-limits/service.ts:824`)이고, 9개 진입점에서 검사합니다(`함수 선언줄` / `게이트줄`): `start()` `:351`/`:353` — 폴링 타이머 자체를 무장하지 않음, `fetchAll()` `:997`/`:998`, `fetchCodexOnly()` `:1062`/`:1063`, `fetchClaudeOnly()` `:1124`/`:1125`, `fetchGrokOnly()` `:1189`/`:1190`, 계정 스위처 프리뷰 `fetchInactiveClaudeAccountsOnOpen()` `:571`/`:572`, `fetchInactiveCodexAccountsOnOpen()` `:651`/`:652`, Codex 리셋 크레딧 POST `:472`/`:478`, UI 상태 표기 `:1614`.

**Gemini/OpenCode/Kimi/MiniMax도 같은 게이트에 덮입니다.** 이 네 페처는 모두 `runFetchAllCycle()`(`:1631`) 안의 단일 `Promise.allSettled` 배치에서 호출되고(`:1715-1755`, 네 페처는 `:1734,1737,1744,1750`), `runFetchAllCycle`의 호출자는 위에 나열한 4개 게이트 메서드뿐입니다(`:1016,1088,1153,1215`). 즉 별도 페처 경로가 아니라 전부 하나의 초크포인트 아래에 있습니다.

### ✅ 정정(해소됨): Claude OAuth 토큰 회전 — `disableManagedClaudeAccounts`

`refreshClaudeOauthCredentials()` (`src/main/claude-accounts/oauth-refresh.ts:125`)는 사용자의 refresh_token으로 `platform.claude.com/v1/oauth/token`에 POST합니다 (`:10`, 전송은 `:149`). 호출 지점은 두 곳입니다: 사용량 페처(`src/main/rate-limits/claude-fetcher.ts:1204-1205` — `disableUsagePolling`이 위에서 이미 막음)와 **에이전트 스폰 시 런타임 인증 준비**(`src/main/claude-accounts/runtime-auth-service.ts:1054,1057`).

**이전 판은 두 번째 경로에 "차단 설정 없음"이라고 적었습니다. 더 이상 사실이 아닙니다** — 정책 파일에 `disableManagedClaudeAccounts`가 추가됐고, 다른 `disable*`와 같이 `lockdown`을 상속합니다 (`src/shared/enterprise-policy.ts:35-41`, `:157-175`).

이 스위치는 관리형 계정 기능을 통째로 끄므로 **두 가지가 함께 닫힙니다.**

1. **egress** — 위의 `platform.claude.com` 토큰 회전. 게이트가 **함수 진입부**(`oauth-refresh.ts:131-133`)에 있어 호출자를 가리지 않고, 소켓을 열기 전에 `null`을 반환합니다. `null`은 원래 "기존 자격증명 유지"라 예외가 나지 않습니다.
2. **에이전트 환경 재작성** — 관리형 계정이 활성일 때 자식 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`·`CLAUDE_CODE_OAUTH_TOKEN`·**`AWS_BEARER_TOKEN_BEDROCK`** 및 인증성 `ANTHROPIC_CUSTOM_HEADERS`를 삭제하는 동작 (`src/main/claude-accounts/environment.ts:3-8,22-29`, 적용부 `src/main/rate-limits/claude-pty.ts:244-247`, `src/main/text-generation/commit-message-agent-environment.ts:131-132`). 게이트는 두 겹입니다 — 인증 준비에서 활성 계정을 `null`로 고정(`src/main/claude-accounts/runtime-auth-service.ts:613-616`, 호스트 세션의 `stripAuthEnv`는 여기서 유도되므로 `:667`이 자동으로 `false`)하고, `stripAuthEnv: true`를 하드코딩해 넘기는 호출자에 대비해 `environment.ts:22`에서 한 번 더 막습니다.

두 번째는 **Bedrock 플릿에서 egress가 아니라 기능 장애로 나타납니다.** WSL 런타임을 고른 세션은 **관리형 계정이 하나도 없어도** 스트립이 켜집니다 — 두 분기의 값이 `stripAuthEnv: !managedAccountsDisabled`이기 때문입니다 (`src/main/claude-accounts/runtime-auth-service.ts:647,657` — WSL 홈을 찾은 경우와 못 찾은 경우). 그 상태에서 런치 환경에 위 변수가 있으면 PTY 스폰이 에러로 **하드 실패**합니다 (`src/main/ipc/pty.ts:4576-4580`, `:6164-6168`).

> 🔴 **읽는 방향을 헷갈리지 마세요.** 이 실패 조건은 코드에서 사라진 것이 아니라 **`disableManagedClaudeAccounts`가 켜져 있을 때만** 성립하지 않습니다. 스위치를 끄면(또는 `lockdown` 없이 배포하면) WSL Claude 세션은 예전 그대로 하드 실패합니다. **그래서 Bedrock + WSL 플릿에서 이 스위치는 권장이 아니라 필수입니다.** Windows 호스트 세션은 원래도 관리형 계정을 선택한 동안에만 스트립됩니다 (`runtime-auth-service.ts:667`).

**요점**: 손봐야 하는 건 **로컬 CLI 자격증명만으로 발동하는 사용량 폴링 4종(Claude·Codex·Grok·Kimi → `disableUsagePolling`)** 과 **관리형 Claude 계정(→ `disableManagedClaudeAccounts`)** 이며, `lockdown: true` 하나로 둘 다 켜집니다. Gemini/MiniMax/OpenCode/Kimi는 기본 opt-in이라 켜지 않으면 나가지 않고, **켜더라도 `disableUsagePolling`이 덮습니다** — 이들의 fetcher는 `runFetchAllCycle` 안에서만 호출되고 그 사이클로 들어가는 경로가 전부 게이트를 지납니다. **받아쓰기 계열 두 경로**(전사 `api.openai.com`, 로컬 모델 다운로드 `huggingface.co` — §0.2 #10)는 이제 `disableVoice`가 덮습니다. 두 경로 모두 STT 런타임/모델 매니저를 거치는데, `disableVoice`면 그 두 게터가 생성 전에 던지기 때문입니다.

### ⛔ 제거됨: 사내에서 직접 서비스하는 모델 (`llmEndpoints`)

이전 리비전은 Bedrock 외에 **사내 자체 호스팅 모델**을 두 번째 승인 백엔드로 지원했습니다. **이 레인은 코드에서 제거되었습니다** — 정책 필드, IPC 표면, 설정 UI, 토큰 저장소, 실행 주입, 모델 카탈로그 등록, WSL 전달까지 전부입니다.

| | |
| --- | --- |
| 제거 이유 | 주입되는 변수(`OPENAI_*` / `ANTHROPIC_*`)를 읽는 것은 에이전트 CLI 쪽 계약이라, 실제로 쓰려면 그 이름을 읽는 별도 에이전트가 필요했습니다. 승인된 백엔드는 Bedrock 하나로 좁혔습니다 |
| 사라진 것 | **사용자가 임의 URL을 엔드포인트로 자가등록하던 레인**(이전 §0.2 #14의 🔴 항목). 이제 그 UI가 없습니다 |
| 사라진 디스크 비밀 | `%APPDATA%\Orca\corporate-llm-tokens\<id>.token` — 더 이상 쓰이지도 읽히지도 않습니다. 기존 배포에서 남은 파일은 수동 삭제 대상입니다 |
| 정책 파일 호환 | `llmEndpoints` 키는 **인식 목록에 남겨** 두었습니다. 이미 배포된 정책 파일이 그 키를 들고 있어도 "알 수 없는 키" 경고가 나지 않고, 값은 무시됩니다 (`src/shared/enterprise-policy.ts`) |

⚠️ **이것이 사내 모델로의 리다이렉션 자체를 막지는 않습니다.** 같은 사용자는 셸 rc나 설정 → 에이전트의 per-agent 환경변수로 `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL`을 직접 넣어 같은 일을 할 수 있습니다(§0.2 #1). 없어진 것은 **Orca가 공식 UI로 제공하던 경로**이지 능력이 아닙니다. 실질 통제는 여전히 망 계층(프록시 강제·방화벽·TLS 검사)입니다.
### AWS Bedrock으로 Claude를 쓰는 경우

사내가 Bedrock을 쓴다면 인증은 Orca가 스폰하는 **Claude Code CLI 자체**가 처리합니다(`bedrock-runtime.<region>.amazonaws.com`). Orca는 셸/워크스페이스 환경변수를 PTY에 전달하므로, 아래를 사용자 셸 또는 per-workspace 환경에 넣으면 됩니다.

```
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION
ANTHROPIC_MODEL=<Bedrock inference profile ARN 또는 모델 ID>
```

> **자격증명 자체는 사내 게이트웨이가 소유합니다** — 사용자가 `gateway-cli login`(인자 없음)으로 OIDC 로그인을 마치면 게이트웨이가 virtual key를 발급하고, 그 키를 CLI까지 전달하는 것도 `gateway-cli`의 몫입니다. 개별 AWS 프로필을 관리하지 않으므로 `AWS_PROFILE`도 설정하지 않습니다. 그래도 문제는 없습니다 — **Orca 프로덕션 코드는 `AWS_PROFILE`을 어디서도 읽지 않습니다**(저장소 전체에서 이 이름이 나오는 곳은 테스트 픽스처 `src/main/claude-accounts/environment.test.ts:13,72`뿐). PTY 스폰 경로에는 env 허용목록이 없어 셸 환경이 그대로 상속되고, Orca가 삭제하는 유일한 AWS 변수는 `AWS_BEARER_TOKEN_BEDROCK`입니다 (`src/main/claude-accounts/environment.ts:3-8`). ⚠️ **virtual key가 그 변수로 전달되는지는 미확인**입니다 — 전달된다면 `disableManagedClaudeAccounts`를 켜지 않은 플릿에서 WSL 세션이 스폰 실패합니다(아래 운영 결함 #3).

#### 사내 게이트웨이 로그인 레인 (AWS SSO 레인을 대체)

Orca의 책임 경계는 **AWS SSO 시절과 동일합니다** — 로그인 명령을 실행하고 상태를 표시할 뿐, **토큰·virtual key를 읽지도 저장하지도 않고 환경변수도 주입하지 않습니다**(계약은 `src/shared/gateway-auth.ts` 헤더 주석). `gateway-cli`는 PATH에서만 해석하고(`resolveGatewayCommand()`) 설치 경로를 추측하지 않습니다. **로그아웃 레인은 없습니다** — `gateway-cli logout`의 존재가 확인되지 않아 구현하지 않았습니다.

감사 관점에서 **AWS SSO 시절과 달라진 것은 두 가지**입니다.

1. **상태 확인이 파일 읽기에서 프로세스 실행으로 바뀌었습니다.** 예전 배지는 AWS CLI 토큰 캐시의 `expiresAt`을 네트워크 없이 파일에서 읽었지만, 지금은 `gateway:getStatus`가 불릴 때마다 CLI를 **최대 두 번 스폰**합니다 — 설치 감지용 `gateway-cli --version`(`detectGatewayCli()`)과 `gateway-cli verify`(`runGatewayVerify()`). 그 실행이 네트워크를 타는지, 탄다면 어느 호스트로 가는지는 `gateway-cli` 구현에 달려 있어 **미확인**이고, 호출 빈도(화면 진입·수동 새로고침·폴링 여부)도 이 문서의 판정 대상이 아닙니다.
2. **목적지가 하나에서 둘로 늘었습니다** — OIDC IdP와 게이트웨이. 둘 다 자식 프로세스의 egress이므로 §0.2 #25로 등록했습니다.

`verify`의 출력 형식이 확정되지 않아 파서(`src/shared/gateway-cli-output.ts`)는 JSON → 텍스트 → 종료 코드 순으로 방어적으로 읽고, 알아보지 못한 항목은 `null`로 둡니다. **`expiresAt: null`은 "만료를 알 수 없음"이지 "만료됨"이 아닙니다** — 검토자가 화면만 보고 세션 만료를 판정하면 안 되는 이유입니다. 화면으로 올라가는 `detail` 문자열은 파서의 `redactSecrets()`가 비밀 후보(키·토큰 형태의 대입문, 숫자를 포함한 20자 이상 불투명 문자열)를 `***`로 가린 뒤 넘기므로, **CLI가 출력에 키를 흘리더라도 그대로 화면·로그에 남지는 않습니다.** 다만 이것은 알려진 형태에 대한 방어이지 형식을 모르는 출력에 대한 보장이 아닙니다.

`platform.claude.com`으로 가는 OAuth 갱신은 **Orca 관리 Claude 계정을 추가하지 않는 한 발생하지 않지만, 그 "추가하지 않음"을 사용자 선의에 맡기지 말고 `disableManagedClaudeAccounts`로 못 박으세요.** Bedrock 플릿에서 이 스위치는 egress 차단인 동시에 **기능 안정화**입니다 — 위 절에서 본 대로 관리형 계정의 환경 스트립은 `AWS_BEARER_TOKEN_BEDROCK`을 지우고, WSL 세션에서는 관리형 계정 없이도 켜져 Claude 스폰을 하드 실패시킵니다.

**`api.anthropic.com` 사용량 폴링은 별개 경로**이며 Bedrock 사용 여부와 무관하게 로컬 Claude CLI 자격증명만 있으면 발생하므로, `disableUsagePolling`도 함께 켜야 합니다. 둘 다 `lockdown: true`에 포함됩니다. AWS 자격증명이 프록시/사설 CA를 타야 하면 §5의 환경변수를 함께 설정하세요.

#### ⚠️ 이 플릿에서 실측으로 확인된 운영 결함 4건

egress가 아니라 **환경변수가 에이전트까지 도달하는 경로**의 문제입니다. 배포 검토자는 네 건 모두 알고 있어야 합니다.

| # | 증상 | 원인 | 확인 위치 | 대응 |
| --- | --- | --- | --- | --- |
| 1 | `setx`로 `AWS_REGION` 등을 넣었는데 **에이전트에는 안 보임** | 상주 PTY 데몬은 앱 재시작을 넘어 살아남고 **fork 시점의 `process.env`를 계속 씁니다.** 매 스폰마다 레지스트리에서 다시 읽는 값은 **`PATH` 하나뿐**입니다 | 데몬이 자기 `process.env`를 권위로 삼음 `src/main/daemon/pty-subprocess.ts:113`, 스폰 env 조립 `:624` / `PATH`만 재병합 `src/main/ipc/pty.ts:1695` ← `src/main/pty/windows-environment-path.ts:24-27`(레지스트리 키 2개) | `setx` 뒤에 **데몬 재시작 또는 재로그온**. 앱만 재시작하는 것으로는 부족 |
| 2 | 설정에서 만든 per-agent 환경변수의 **값을 비워 두면 OS 값까지 사라짐** | 빈 문자열이 정상 값으로 저장되고(`nextEnv[key] = raw`) 스폰 시 OS 값 위에 덮어써서 **빈 문자열로 가려집니다** | 정규화 `src/shared/tui-agent-launch-defaults.ts:62-68`(빈 문자열을 거르지 않음), 해석 `:96-104` → 스폰 플랜의 `env`로 전달 `src/shared/tui-agent-startup.ts:92` → 병합 `src/main/daemon/pty-subprocess.ts:624`(`opts.env`가 `process.env`를 덮음) | 쓰지 않을 변수는 **값을 비우지 말고 행 자체를 삭제** |
| 3 | WSL Claude 세션이 **스폰 즉시 에러로 종료** | `disableManagedClaudeAccounts`가 꺼져 있으면 WSL 분기가 관리형 계정 없이도 `stripAuthEnv`를 켜고, 런치 env에 인증 변수가 있으면 하드 실패 | `src/main/claude-accounts/runtime-auth-service.ts:647,657` → `src/main/ipc/pty.ts:4576-4580`, `:6164-6168` | `disableManagedClaudeAccounts: true` (= `lockdown: true`). **필수** |
| 4 | Windows에서 설정한 `AWS_*`가 **WSL 게스트 안에서 안 보임** | `wsl.exe`는 `WSLENV`에 이름이 적힌 변수만 넘기는데, Orca가 등록하는 목록에 `AWS_*`가 **하나도 없습니다**(`ORCA_*`·`CODEX_HOME`·`CLAUDE_CONFIG_DIR` 계열뿐) | `src/main/pty/wsl-orca-env.ts:77-102`, 추가 등록 지점 `src/main/providers/local-pty-provider.ts:748,765,769,773,787` | 게스트 배포판 안에서 별도 설정(`~/.bashrc`, `/etc/environment`) + **게스트 안에서 `gateway-cli login`을 따로 실행** — 호스트 로그인은 게스트에 보이지 않습니다 |

---

## 5. 사내 프록시 / 사설 CA (⚠️ 부분 지원 — 전 경로를 덮지 않음)

- **프록시**: 부팅 시 호출되는 것은 `applyElectronProxySettings(store.getSettings())`입니다 (`src/main/index.ts:2203`). Dock/런치패드 실행은 셸 env를 못 물려받으므로 **앱 내 프록시 설정값이 우선**이고(`proxy-settings.ts:90-113`), 설정이 비었을 때만 `ensureElectronProxyFromEnvironment`로 폴백해 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`/`NO_PROXY`(소문자 변형 포함)를 읽습니다 (`:92-97,119-124`, 이름 목록은 `src/shared/network-proxy.ts:13-21`). 단, 시스템 프록시가 이미 잡혀 있으면(`resolveProxy !== 'DIRECT'`) env는 무시됩니다 (`proxy-settings.ts:54-57`).
- **앱 내 프록시 설정은 자식 프로세스로 전파됩니다**: PTY로 스폰되는 에이전트 CLI의 환경에 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY`(대·소문자 6+2종)를 주입합니다 (`src/shared/network-proxy.ts:115-140`, 변수 목록은 `:123-137` ← `src/main/ipc/pty.ts:1696`, `src/main/rate-limits/claude-pty.ts:253`). **env에서 유도한 프록시는 이 주입 대상이 아닙니다** — 그 경우 자식은 부모 셸의 env를 그대로 상속할 뿐입니다.
- **사설 CA / TLS 검사**: 임베디드 브라우저에 인증서 신뢰 컨트롤러 존재(`browser-certificate-trust-controller.ts`). Node 계층은 표준 `NODE_EXTRA_CA_CERTS`를 따르므로 사내 루트 CA를 이 환경변수로 주입(Electron `net`은 이 변수가 아니라 OS 신뢰 저장소를 씁니다).

### 🔴 한계: 프록시는 **Electron 세션에만** 적용됩니다

두 진입점 모두 `proxySession.setProxy(...)`를 호출할 뿐이고, 대상은 기본적으로 `session.defaultSession`입니다 (`proxy-settings.ts:53,68-72` 및 `:89,102-106`). 따라서 **Electron `net.fetch`/`net.request`는 프록시를 타지만, Node의 global `fetch`(undici)와 `node:https`는 타지 않습니다.**

메인 프로세스의 global `fetch` 호출 지점은 `src/main/global-fetch-call-site-audit.test.ts:17-36`에 전수 열거되어 있습니다(이 테스트는 원래 undici의 미소비 응답 바디 크래시를 막으려고 만든 것이지만, 프록시 우회 목록으로도 그대로 쓸 수 있습니다). 실제 HTTP를 거는 항목은 다음과 같습니다:

| 파일 | 목적지 |
| --- | --- |
| `main/orca-profiles/profile-cloud-client.ts` | Orca Cloud — 🚫 도달 불가 (§3.1) |
| `main/orca-profiles/profile-cloud-org-members-client.ts` | Orca Cloud — 🚫 도달 불가 (§3.1) |
| `main/artifacts/artifact-cloud-request.ts` | Artifacts 공유 (v1.4.178 신규) — 🚫 도달 불가 (§3.1) |
| `main/rate-limits/codex-fetcher.ts` | Codex 사용량 |
| `main/runtime/relay/relay-http-client.ts` | SSH 릴레이 HTTP |
| `main/source-control/hosted-review-api-request.ts` | 호스팅형 리뷰 API 래퍼 — Bitbucket·Azure DevOps 삭제(`4d58e5f21c`) 이후 **호출부 없음**(사장 코드, §1) |
| `main/speech/openai-transcription-client.ts` | `api.openai.com` |

(같은 표의 나머지 항목 — `main/amp/hook-service.ts`, `main/opencode/hook-service.ts`, `main/pi/agent-status-extension-source.ts`, `main/ipc/worktree-remote.ts`, `relay/git-handler.ts` — 은 주입 스크립트 문자열 / `git fetch` 식별자라 실제 HTTP 호출이 아닙니다.)

`node:https`를 직접 쓰는 다운로더도 프록시를 우회합니다. **두 곳뿐이며, 둘 다 정책으로 닫힙니다**:

- `src/main/emulator/android/scrcpy-server-download.ts:4,15` — `github.com`에서 scrcpy 서버 jar 다운로드. `lockdown`이면 소켓을 열기 전에 거부합니다 (`enterprise-direct-download-guard.ts:17-32` ← `scrcpy-server-download.ts:42-46`). 가드의 근거 주석(`:1-7`)이 이 절과 같은 사실을 적고 있습니다 — 프록시 우회 + 허용목록 비가시 + Node 자체 CA 번들 사용.
- `src/main/observability/diagnostic-upload-http.ts:1-2` — 진단 번들 업로드 (`disableTelemetry`로 차단됨)

⚠️ 이 가드는 **scrcpy 한 곳에만 배선**돼 있습니다. §0.2 #10의 STT 모델 다운로드는 Electron `net.request`라 프록시는 타지만 정책 게이트는 없습니다.

**사내 조치**: 아래를 설정하되, 위 경로들은 **프록시가 아니라 방화벽/라우팅 또는 `enforceNetworkAllowlist`로 통제**해야 한다는 점을 전제하세요.

```
HTTPS_PROXY / HTTP_PROXY / NO_PROXY
NODE_EXTRA_CA_CERTS=C:\path\to\corp-root-ca.pem
```

⚠️ 스폰되는 에이전트 CLI와 `gh`/`glab`도 이 env를 물려받아야 하니, 사용자 셸 프로파일 또는 per-workspace env에 반영하세요(앱 내 프록시 설정을 쓰면 PTY 자식에게는 자동 주입됩니다 — 위 참고).

---

## 6. 이미지 / 아이콘 (렌더러 직접 로드)

| 기능 | 호스트 | 발동 | 파일 |
| --- | --- | --- | --- |
| GitHub 아바타 | `avatars.githubusercontent.com` (저장소 아이콘은 GHES 호스트를 따름) | PR/이슈/프로젝트 렌더 시 | `src/renderer/src/components/github/github-user-avatar.tsx:38,82`, `src/shared/repo-icon.ts:51-80` |
| 저장소 아이콘 자동감지 | `www.google.com/s2/favicons` | 저장소 웹사이트 URL이 있을 때 | `src/shared/repo-icon.ts:17-32` |
| 에이전트 카탈로그 아이콘 | `www.google.com/s2/favicons` | 에이전트 목록 표시 | `src/renderer/src/lib/agent-catalog.tsx:397` |
| "다른 앱으로 열기" 아이콘 | `www.google.com/s2/favicons` | 앱 프리셋 표시 | `src/renderer/src/lib/open-in-app-catalog.tsx:66` |
| 마크다운 본문의 인라인 이미지 | 본문에 적힌 임의의 http(s) URL | PR·이슈·Jira 설명 렌더 시 (`variant="document"`) | `src/renderer/src/components/sidebar/comment-markdown-element-renderers.tsx:271,290` |
| Linear/Jira 사용자 아바타 | 각 벤더 아바타 CDN | 이슈·코멘트 목록 렌더 시 | `src/renderer/src/components/LinearIssueWorkspace.tsx:116`, `JiraIssueWorkspace.tsx:578,727` |

렌더러 `<img>`가 직접 로드하며, **기본 정책(`lockdown: true`만 켠 상태)으로는 차단되지 않습니다.** 폐쇄망에서 로드 실패 시 아이콘만 깨지고 기능은 동작합니다.

마크다운 이미지는 변형에 따라 동작이 다릅니다: `compact` 변형(기본값 — 사이드바 카드, Linear 코멘트 `LinearIssueWorkspace.tsx:996` 등)은 `blob:`/`data:image` 외의 `src`를 **이미지가 아니라 텍스트 링크로** 렌더해 자동 요청을 내지 않습니다 (`comment-markdown-element-renderers.tsx:17-25,145-160`). 원격 이미지를 실제로 가져오는 것은 `document` 변형뿐입니다.

완전 차단이 필요하면 `"enforceNetworkAllowlist": true` + `allowedNetworkHosts`를 지정하세요 (§7 레벨 3). 저장소 아이콘의 GitHub 아바타는 GHES 호스트를 따라가므로(`repo-icon.ts:62-80`), 허용목록에 GHES 호스트만 넣어도 그 항목은 살아남습니다.

---

## 7. 통합 차단(kill-switch) — 현재 구현 상태

### 레벨 1 — 정책 파일 (코드 수정 없음, 권장 기본안)

머신 전역 경로에 아래 파일을 배치합니다 (§0.1).

```jsonc
{
  "lockdown": true,
  "githubEnterpriseHost": "github.samsungds.net"
}
```

이것으로 §2(텔레메트리·진단), §1(star-nag), §4(사용량 폴링 + 관리형 Claude 계정/`platform.claude.com` OAuth 회전), 맞춤법 사전 다운로드, scrcpy jar 직접 다운로드(§0.2 #9), Chromium의 DNS-over-HTTPS 자동 승격(§8)이 한 번에 닫힙니다(예전에 함께 적혀 있던 "Gitea 폴백 오인 방지"는 Gitea 연동 자체가 제거돼 더는 필요 없습니다 — §1). (Orca Cloud/모바일 릴레이는 이제 이 정책이 아니라 소스에서 제거되어 있습니다 — §3.1. `disableCloudRelay`는 죽은 스위치로 유지됩니다.)

**닫히지 않는 것**(§0.2와 동일): 서브프로세스 트래픽, 렌더러 외부 이미지, SSH 릴레이의 원격 `npm install`, STT 모델 다운로드. 레벨 1만으로 "외부 통신이 끊겼다"고 보고하면 안 됩니다.

추가로:
- 사이드바 워크트리 카드 속성에서 `pr`/`ci`(신형 카드 스타일이면 `status`) 제거 → PR/리뷰 백그라운드 갱신 중단(명시적 열람은 유지). 단 **`groupBy`가 `pr-status`이거나 우측 사이드바가 PR 데이터를 보이면 카드 속성과 무관하게 계속 갱신**됩니다 (`src/renderer/src/store/slices/github.ts:4821-4826`).
- Gemini/MiniMax/OpenCode/받아쓰기는 기본 꺼짐이라 **켜지 않으면 됨**.

### 레벨 2 — 환경변수 (정책 파일과 별개로 여전히 유효한 것)

```
GH_HOST=github.samsungds.net       # gh 자신의 변수. 정책 파일이 대체하지 못함 — 아래 참고
HTTPS_PROXY / HTTP_PROXY / NO_PROXY # 프록시 (§5, Electron 세션 한정)
NODE_EXTRA_CA_CERTS=<corp-ca.pem>  # 사설 CA (§5)
```

⚠️ **`githubEnterpriseHost`는 `GH_HOST`를 대체하지 않습니다.** 이 정책 값을 읽는 곳은 허용목록 자동 추가(`src/shared/enterprise-policy.ts:370-371`) · 설정 → GitHub Enterprise 팬의 로그인 대상 기본값(`src/main/ipc/github-enterprise.ts:83-86`, 사용자가 저장한 호스트가 없을 때) · GHES 퍼머링크(blob/commit URL) 인식(`src/main/git/hosted-remote-url.ts:38-42`) · `disableVendorLinks`의 GHES 예외(`src/main/enterprise/enterprise-vendor-link-guard.ts:80-83`), 그리고 정책 트레이스(`src/main/enterprise/enterprise-policy-trace.ts:53`)와 설정 팬의 "실제로 gh가 향할 호스트" 표시의 최후순위 후보(`src/main/github/effective-github-host.ts`)뿐입니다 — 어느 것도 `gh` API 호출의 argv나 환경을 바꾸지 않습니다(로그인 팬이 이 값을 대상으로 `gh auth login --hostname`을 실행하면 그 뒤로는 `gh` 자신의 설정이 기본 호스트를 정합니다). `gh`가 어느 호스트로 나갈지는 여전히 origin 리모트에서 유도한 `options.host` 또는 `GH_HOST`가 정합니다 (`src/main/git/runner.ts:1641-1674,1706-1722`). 의존 방향은 오히려 반대입니다 — `githubEnterpriseHost`가 비어 있을 때 `GH_HOST`를 폴백으로 읽습니다 (`src/shared/enterprise-policy.ts:366`).

### 레벨 3 — 허용목록 하드 게이트 (opt-in)

`"enforceNetworkAllowlist": true`. 구현은 `src/main/enterprise/enterprise-network-guard.ts`이며 두 레인을 덮습니다:

1. `session.defaultSession.webRequest.onBeforeRequest` — 렌더러 요청 (`:87-97`)
2. 메인 프로세스 global `fetch` 래퍼 — §5의 undici 호출 지점 (`:99-122`)

허용목록에 없는 호스트는 호스트당 한 줄씩 stderr에 기록되고 차단됩니다 (`:36-45`). 로그는 256개 호스트에서 멈추지만(`:30,37`) **차단 자체에는 상한이 없습니다** — 로그가 끊겨도 요청은 계속 막힙니다. 루프백과 non-http 스킴은 항상 통과합니다 (`:47-71`).

**덮지 않는 것** (§0.2와 동일): 서브프로세스(`gh`/`glab`/에이전트 CLI), `node:https` 다운로더(단 scrcpy는 별도 가드가 있고, 그 가드도 `enforceNetworkAllowlist`를 함께 봅니다 — `enterprise-direct-download-guard.ts:26-31`), 임베디드 브라우저의 `persist:` 파티션(`:9-13` — 그 슬롯은 인증서 게이트가 점유). ⚠️ Electron `net.fetch`/`net.request`가 `defaultSession`의 `webRequest` 리스너를 타는지는 테스트로 확인되지 않았습니다(`enterprise-network-guard.test.ts`의 케이스는 렌더러 요청 8건과 global fetch 5건뿐 — `:86-182`, `:184-243`). 이 항목이 §4의 `api.anthropic.com`·`platform.claude.com`(둘 다 `net.fetch`)과 §0.2 #10에 동시에 걸립니다.

### 레벨 4 — 망 차원 (가장 견고)

서브프로세스 트래픽은 Electron 세션 밖이므로 방화벽/프록시 강제가 유일한 통제 수단입니다. 레벨 1 + 레벨 4 병행이 실질적인 완전형입니다.

### 레벨 5 — 빌드 설정

- 빌드 셸에 `ORCA_DISABLE_PUBLISH_TARGET=1` → `publish`가 `null`이 되어 업데이터 메타 미생성 (`config/electron-builder.config.cjs:543-545`, §3의 이중 방어). 빌드 업로드는 `--publish never`로 별도 처리.

---

## 8. 종결된 항목 및 남은 미검증(⚠️)

이전 판의 “미검증 5건” 중 **4건이 완전히 종결**되었고, 나머지 1건(Electron 기본 동작)은 맞춤법 사전과 DNS-over-HTTPS가 종결되고 컴포넌트 업데이터만 남았습니다.

### ✅ 종결: Chromium 맞춤법 사전 다운로드 — 실재하며, 이제 차단됨

Electron은 `spellcheck`를 기본 켜며, **Windows/Linux에서 Chromium이 hunspell 사전을 Google CDN에서 내려받습니다** — 이 문장은 코드 주석에 그대로 있습니다(`src/main/window/createMainWindow.ts:305`). 주석은 macOS를 언급하지 않습니다(macOS가 OS 검사기를 쓴다는 것은 Electron 플랫폼 동작이며 이 저장소 코드로는 확인되지 않습니다). `disableSpellcheck`는 **자체 세션을 갖는 WebContents 5곳을 전부** 끕니다 — 메인 창(`:306`), `will-attach-webview` 게스트(`:494`, 게스트는 자체 세션이라 메인 창 설정이 안 미침 — `:493` 주석), 대시보드 팝아웃 창(`src/main/window/dashboard-popout-window.ts:181`), 오프스크린 브라우저 백엔드(`src/main/browser/offscreen-browser-backend.ts:45`), PDF 내보내기 WebContents(`src/main/lib/html-to-pdf.ts:46`). 한 곳이라도 켜져 있으면 그 세션이 hunspell 다운로드를 다시 무장시키기 때문입니다(`html-to-pdf.ts:45` 주석).

### ✅ 종결: 프로덕션 렌더러 CSP — **부재 확정**

`src/renderer/index.html`에는 CSP가 없습니다. 이전에 “electron-vite가 주입한다”고 적혀 있던 주석은 **거짓이었고 제거되었습니다**. 현재 주석은 사실대로 “어느 단계에서도 CSP는 주입되지 않으며, egress는 메인 프로세스의 `enterprise-network-guard.ts`에서 통제한다”고 명시합니다. 저장소 전체에서 `Content-Security-Policy`가 나오는 곳은 마크다운 내보내기 HTML 템플릿(`src/renderer/src/components/editor/markdown-export-html.ts:41`) 하나뿐이며, 이는 앱 렌더러와 무관합니다.

대체 통제 수단은 opt-in `enforceNetworkAllowlist`입니다. **덮는 것**: 렌더러의 모든 http(s) 요청(§6의 이미지 포함)과 메인 프로세스 global `fetch`. **덮지 않는 것**: 서브프로세스, `node:https`(scrcpy만 별도 가드가 대신 봄 — §5), 임베디드 브라우저 파티션 (§0.2·§7 레벨 3).

### ✅ 종결: SSH 릴레이의 원격 다운로드 — **npm install은 실재, ripgrep 다운로드는 사실무근**

- **실재**: 릴레이는 원격 호스트에서 `npm install`을 실행해 `node-pty`와 `@parcel/watcher`를 설치합니다 (`src/main/ssh/ssh-relay-deploy.ts:948-1010` — `npm install` `:997,1009`, 대상 목록 `:700-702`). 이 둘은 네이티브 애드온이라 esbuild 번들에 포함할 수 없습니다. Linux에서는 node-pty가 소스 컴파일되므로 C/C++ 툴체인까지 필요합니다(툴체인 프로브 `:1025-1034` → `src/main/ssh/ssh-relay-build-toolchain.ts`, 실패 시 안내 문구는 그 파일의 `:25-27`). **폐쇄망 원격 호스트에서는 최초 연결이 실패합니다** — 사내 npm 미러 또는 사전 설치가 필요합니다.
- **사실무근**: 릴레이가 ripgrep을 다운로드하지는 **않습니다.** `src/relay/fs-handler-install-rg.ts`는 `src/shared/quick-open-install-rg.ts`의 재수출 셸이고, 그쪽이 배포판을 감지해 `sudo apt install ripgrep` 같은 **설치 안내 문자열만 생성**하며(`quick-open-install-rg.ts:9-25`, 배포판 분기 `:27-40`), `:24`의 `github.com/BurntSushi/ripgrep` URL도 사용자에게 보여 주는 텍스트일 뿐 소켓을 열지 않습니다. 이 파일이 import하는 것은 로컬 바운디드 파일 리더와 프로세스 출력 스캐너뿐이라(`:1-2`) HTTP 클라이언트 자체가 없습니다. rg가 없으면 git/readdir 폴백으로 degrade합니다(`fs-handler-git-fallback.ts`, `fs-handler-readdir-fallback.ts`).
- 릴레이 번들 자체는 SCP로 전송되며 다운로드하지 않습니다. 원격 Node가 없을 때도 안내 메시지만 냅니다(`src/main/ssh/ssh-remote-node-resolution.ts:301`).

### ✅ 종결: agent-browser 서브프로세스의 `process.env` 상속 — **전체 상속 확정**

`src/main/browser/agent-browser-bridge.ts:2670-2672` — `env: execOptions?.envOverrides ? { ...process.env, ...execOptions.envOverrides } : process.env`. **`process.env` 전체를 그대로 넘깁니다.** 이것이 이 브랜치가 잠금 설정을 환경변수에서 파일로 옮긴 이유를 그대로 뒷받침합니다 (§0.1).

### ✅ 종결: 로케일 카탈로그의 Google Translate — **빌드 스크립트 한정**

`config/scripts/bootstrap-locale-catalog.mjs:66`에서 `translate.googleapis.com/translate_a/single`을 호출합니다. 이는 **번역 카탈로그를 생성하는 개발용 스크립트**이며 앱 런타임 코드가 아닙니다(`src/` 아래 어디에도 이 호스트가 없음). 사내 배포 위험 아님.

### ✅ 종결: Chromium의 DNS-over-HTTPS 자동 승격 — `lockdown`이 OS 리졸버로 고정

Electron의 `configureHostResolver`는 `secureDnsMode`가 기본 `'automatic'`이라, 머신에 설정된 리졸버가 알려진 DoH 제공자면 Chromium이 스스로 DoH로 승격합니다. 그러면 이름 해석이 443으로 공용 리졸버에 나가면서 **사내 호스트만 풀 수 있는 split-horizon DNS와 DNS 기반 egress 모니터링을 동시에 지나칩니다** — 근거는 코드 주석에 그대로 있습니다(`src/main/enterprise/enterprise-secure-dns.ts:1-8`). `lockdown`이면 `secureDnsMode: 'off'`로 고정합니다(`:19-24`). 배선은 `ready` 이후입니다(`src/main/index.ts:2084`, Electron이 `ready` 전 호출을 거부하므로). 고정에 실패해도 stderr 한 줄만 남기고 기동은 계속합니다(`:25-30`).

> ⚠️ 이 통제는 **커맨드라인 스위치가 아니라 `app.configureHostResolver` 호출**이므로 `disable-features`/`appendSwitch` 목록에는 나타나지 않습니다. 스위치 목록만 보고 “DoH 통제 수단이 없다”고 읽으면 안 됩니다 — 이전 판이 그렇게 적었고, 틀렸습니다.

### ⚠️ 신규 (v1.4.185): CI 패키징 잡의 Docker Hub · Ubuntu 아카이브 접근

`.github/workflows/pr.yml:389`의 Linux 패키징 잡에 **"Verify headless serve signal shutdown" 스텝이 새로 생겼습니다**(`config/scripts/run-headless-serve-shutdown-docker.mjs`). 이 스크립트는 `spawnSync('docker', …)`로 `config/docker/headless-serve-shutdown/Dockerfile`을 빌드하고, 그 Dockerfile이 `ubuntu@sha256:678c6550…`를 pull한 뒤 `apt-get install`로 23개 패키지를 받습니다. 목적지는 **Docker Hub 레지스트리와 Ubuntu apt 아카이브**입니다.

**배포 산출물에는 실리지 않습니다** — 개발자·CI 머신에서만 도는 검증 도구이고, `electron-builder.config.cjs` 변경은 `asarUnpack`에 `wsl-transcript-fs-process-entry.js` 한 줄 추가뿐이며 publish/update feed 설정은 손대지 않았습니다. 다만 `docker`는 **자식 프로세스**라 `enforceNetworkAllowlist`의 `fetch` 가드도 Electron 세션 가드도 보지 못하고, 애초에 Orca 프로세스가 아니므로 엔터프라이즈 정책 파일의 사정권 밖입니다(§0.2 #1의 `gh`/`git` 자식 프로세스와 같은 사각지대). **사내 CI에서 `pr.yml`을 그대로 돌린다면 두 목적지를 미러로 돌리거나 이 스텝을 제외해야 합니다.** 위의 "로케일 카탈로그의 Google Translate — 빌드 스크립트 한정"과 같은 성격의 항목입니다.

### ⚠️ 남은 미검증

- **`enforceNetworkAllowlist`는 WebSocket을 검사하지 않습니다.** 가드는 `http:`/`https:` URL만 보고 `globalThis.fetch`만 래핑합니다 (`src/main/enterprise/enterprise-network-guard.ts:66`). 원격 Orca 런타임과 모바일 페어링은 WebSocket이므로 **허용목록으로는 막히지 않습니다** — 그래서 `disableRemoteOrcaServer` / `disableMobilePairing`이 별도 스위치로 존재합니다. 허용목록만 켜고 두 스위치를 끄면 구멍이 남습니다.
- **웹 클라이언트(`orca serve` / `pnpm dev:web`)에는 정책이 전달되지 않습니다.** `src/renderer/src/web/web-preload-api.ts`에 `enterprisePolicy` 키가 없어 렌더러 캐시가 "제한 없음"으로 남습니다. **UI 차단만 무력화되고 메인 프로세스 게이트는 그대로 유효**하므로 실제 egress는 막히지만, 화면에는 정책이 지운 섹션이 보입니다. 데스크톱 앱에는 해당하지 않습니다.
- **Computer Use 승인은 창이 있을 때만 물을 수 있습니다.** `requireComputerUseApproval`은 띄울 창이 없으면 **거부**로 처리하므로 헤드리스 경로에서 무단 실행되지는 않지만, 그 경로에서는 Computer Use가 사실상 사용 불가가 됩니다.
- **`gateway-cli`의 동작 전반 (§0.2 #25).** 이 저장소가 판정할 수 있는 것은 **Orca가 무엇을 하지 않는지**까지입니다. 다음은 그 CLI의 계약이며 코드로 확인하지 못했습니다: ① `gateway-cli verify`의 출력 형식(그래서 파서가 JSON → 텍스트 → 종료 코드 순으로 방어적입니다), ② `verify`가 네트워크를 타는지와 그 목적지, ③ virtual key의 저장 위치·수명·전달 방식(`AWS_BEARER_TOKEN_BEDROCK`을 쓰는지 포함), ④ `gateway-cli logout`의 존재 여부(**그래서 로그아웃을 구현하지 않았습니다** — 없는 하위 명령을 발명하지 않는 편이 낫다는 판단), ⑤ 설치 경로(그래서 PATH 해석만 하고 경로를 추측하지 않습니다), ⑥ 프록시·사설 CA 처리, ⑦ WSL 게스트·SSH 원격에서의 동작. **배포 전에 사내 인증 담당과 함께 실측하고, 최소한 IdP·게이트웨이 호스트명은 #25에 실명으로 채워 넣으십시오.**
- **Chromium 컴포넌트 업데이터.** 이 브랜치는 관련 스위치를 걸지 않습니다 — `disable-features`에 들어가는 값은 `FedCm`(upstream #14023 — 미지원 Chromium 로그인 API 비활성화)과 `IntensiveWakeUpThrottling` 둘뿐이고(`src/main/startup/configure-process.ts:70,319`, 조립은 `:73-80`), 프로덕션 `appendSwitch` 호출 11곳(`configure-process.ts` 7곳, `startup/gpu-fallback-switches.ts:32`, `startup/ensure-virtual-display.ts:22,25`, `startup/renderer-heap-headroom.ts:101`) 어디에도 컴포넌트 관련 항목이 없습니다. **통제 수단이 없다는 것은 확인했으나, Electron 런타임이 실제로 컴포넌트 업데이트 요청을 내는지는 패킷 캡처로 확인하지 못했습니다.** 배포 전 실측 권장.

---

## 부록: 확정 44건 요약

> **v1.4.188 갱신**: upstream이 들여온 **에이전트 스킬 공유** 도메인(IPC 21개, RPC 13개, CLI 서브커맨드 2개, 프로덕션 네트워크 호출지점 3개, `GlobalSettings` 키 2개)은 §3.1에서 소스 제거했으므로 **이 44건에 더해지지 않습니다.** 실질 신규 목적지는 `storage.googleapis.com` 1건이었고, 기존 호스트 `share.onorca.dev`로 가는 **무인증 경로**가 1건 늘었던 것이 이번 릴리스의 최대 델타입니다. 남은 스킬 표면은 전부 로컬이며 §0.2 #26에 범위를 적었습니다.

전체 원자료(호스트·파일·라인·차단 평가)는 조사 산출물에 있습니다. 여기서는 실제 외부 호출로 **확정된** 기능만 나열합니다.

git: GitHub REST/GraphQL·PR 백그라운드 폴링·아바타·star-nag / GitLab / 일반 git fetch·push·clone. (Bitbucket·Azure DevOps·Gitea 폴백은 포크가 코드에서 제거했고, attribution 푸터는 upstream이 v1.4.184에서 제거해 목록에서 빠졌습니다.)
이슈: Linear GraphQL·에이전트 write·첨부 signed URL / Jira REST / GitHub·GitLab 이슈 소스 / 본문 마크다운의 인라인 이미지·벤더 아바타. v1.4.184부터 Cmd+J 팔레트의 Linear/GitHub URL 붙여넣기도 같은 레인의 트리거입니다(신규 목적지 아님).
AI: Claude 사용량(`api.anthropic.com`)·OAuth갱신(`platform.claude.com`) / Codex / Gemini / MiniMax / OpenCode / Grok / Kimi / 받아쓰기(OpenAI).
인증: 사내 게이트웨이 CLI(`gateway-cli login`/`verify` → 사내 OIDC IdP + 게이트웨이). **자식 프로세스라 Orca가 소켓을 열지 않으므로 위 44건에 포함되지 않습니다** — §0.2 #25의 잔여 위험 항목입니다.
클라우드: PostHog / 진단 번들(`onorca.dev`). (업데이터·넛지·changelog, 피드백/크래시 제출, 그리고 Orca Cloud 로그인·모바일 페어링 릴레이·Artifacts 공유·**에이전트 스킬 공유**는 코드에서 제거되어 목록에 없습니다 — §3, §3.1.)
에셋: STT 모델(sherpa-onnx)·scrcpy(에뮬레이터) GitHub Releases 다운로드 / Google favicon·아바타 이미지 / SSH 릴레이의 원격 npm install.
