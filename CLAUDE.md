# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The contribution rules above (design system, cross-platform, SSH, Git compatibility, naming, `max-lines`) are binding. This file adds the commands and the architecture map.

## Commands

Node 24 + pnpm 12 (`packageManager` is pinned; upstream v1.4.194 moved 10 → 12 and relocated every `pnpm.*` block from `package.json` to `pnpm-workspace.yaml`, deleting `.npmrc`). `engines` declares Node 24 and every CI job pins it via `node-version-file: package.json`; nothing sets `engine-strict`, so pnpm only warns on a newer Node. **Install pnpm with `npm install -g pnpm`, not `corepack enable`** — a corepack shim shadows that pnpm on PATH and corepack does not read `.npmrc`, so its downloads bypass a corporate mirror or proxy. `docs/reference/pnpm-12-corepack-install.md` covers that and the other two ways this bites on a locked-down Windows machine.

`pnpm install` runs a postinstall (`rebuild-native-deps.mjs`) that compiles native deps against **Electron's** ABI, not the host Node's. `pnpm test`, `pnpm dev`, and `pnpm start` first run `ensure-native-runtime.mjs`, which re-targets `node-pty` at whichever runtime is about to load it (`--runtime=node` for tests, `--runtime=electron` for dev). Its `Native modules still do not load for Node <v>` message means node-pty could not be loaded *or rebuilt* — the usual cause is that `pnpm install` never ran, not that the Node major is wrong.

```bash
pnpm dev                 # Electron app in watch mode
pnpm dev:web             # renderer only, in a browser (127.0.0.1)
pnpm lint                # oxlint + switch-exhaustiveness + all repo gates (see below)
pnpm typecheck           # three tsconfig projects: node, cli, web
pnpm test                # vitest, whole suite
pnpm build               # desktop bundles + native binaries
pnpm format              # oxfmt --write .
```

CI (`.github/workflows/pr.yml`) runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:unpack`. Run those four before opening a PR.

### Patched dependencies

Patches live in `config/patches/` and are declared in `pnpm-workspace.yaml` (not `package.json`).

- **Never hand-edit a patch.** Regenerate it: `npm pack <pkg>@<ver>`, extract, diff the pristine tree against the patched copy, strip CR (this repo's patches are LF-only — `windows-process-tree-patch-contract.test.mjs` enforces it).
- **Changing a patch changes its hash**, so follow every patch edit with `pnpm install --lockfile-only`; otherwise `--frozen-lockfile` refuses the tree.
- **A green gate does not mean the patch applied.** pnpm applies a malformed hunk as a silent no-op. Verify on the installed file — e.g. `grep -c SpectreMitigation node_modules/@vscode/windows-process-tree/binding.gyp` must be `0`.

### Single tests

```bash
pnpm test src/main/worktree-create-base.test.ts        # one file
pnpm test src/main/foo.test.ts -t "handles rebase"     # one case
pnpm tc:node                                           # typecheck one project (tc:cli / tc:web)
```

Vitest collects `src/**/*.test.ts(x)`, `config/scripts/**`, `tools/**/*.test.mjs`, and `tests/e2e/**/*.unit.test.ts`. Tests live next to their subject, not in a `__tests__` tree.

A single full-suite run is not a verdict. Some failures are cross-file interference that reproduce on a pristine upstream-tag worktree as well; re-run the same file pairing several times on both trees before calling anything a regression.

### E2E (Playwright + real Electron)

```bash
pnpm test:e2e                                       # builds with --mode e2e, then runs headless
pnpm exec electron-vite build --mode e2e            # then: SKIP_BUILD=1 pnpm test:e2e   (fast loop)
npx playwright test tests/e2e/x.spec.ts --config tests/playwright.config.ts --project electron-headless
```

The `--mode e2e` build is what exposes `window.__store`; a plain `pnpm build` reused with `SKIP_BUILD=1` makes every spec hang. Read `tests/e2e/AGENTS.md` before adding a spec — it defines when E2E is warranted at all and why assertions must target the DOM rather than the store.

### CLI

`pnpm build:cli` compiles `src/cli` to `out/cli` and symlinks `orca-dev` into `/usr/local/bin`. Use `orca-dev` (not `orca`) against a dev checkout — it points the CLI at a dev userData dir and the local Electron binary.

### Mobile

`mobile/` is a separate pnpm workspace with its own lockfile and Expo toolchain. Run its checks from inside it: `cd mobile && pnpm test | pnpm typecheck | pnpm lint`.

## Architecture

Orca is an Electron app that runs many CLI coding agents in parallel git worktrees, locally or on remote hosts. Five deployable pieces:

| Piece | Entry | Role |
| --- | --- | --- |
| Main | `src/main/index.ts` | Electron main; owns all state that must survive a renderer reload |
| Preload | `src/preload/index.ts` | the single audited `contextBridge` IPC contract |
| Renderer | `src/renderer/index.html` → `src/renderer/src/main.tsx` | React 19 + Zustand + Tailwind v4/shadcn |
| Relay | `src/relay/relay.ts` | standalone daemon shipped to remote hosts over SCP |
| CLI | `src/cli/index.ts` | `orca` binary; drives a running app over a local socket |

Plus `mobile/` (Expo companion that pairs to the desktop runtime) and `native/` (per-OS binaries for Computer Use and macOS notification status).

### Enterprise policy is a second seam (fork-specific)

This branch is a corporate fork. Every vendor phone-home is gated by an administrator-owned policy
file, not by environment variables — env vars are inherited by every process Orca spawns (`gh`,
`git`, agent CLIs, the relay) and leak into unrelated tooling on the machine. `src/shared/enterprise-policy.ts` is the pure resolver; `src/main/enterprise/enterprise-policy-file.ts` does discovery, JSONC parsing, and one-shot caching, and is **the only import a consumer needs**:

```ts
import { getEnterprisePolicy } from '<...>/enterprise/enterprise-policy-file'
if (getEnterprisePolicy().disableStarNag) return
```

Rules when you touch this:

- **Gate at the chokepoint, not the caller.** The first version gated `StarNagService.start()` and missed three other paths into the same `gh` call; the gate now sits in `src/main/github/client.ts`. Grep for every caller before choosing a spot.
- **Never add a runtime environment variable.** `ORCA_ENTERPRISE_POLICY` (the file's location) is the only one, and in a packaged build it cannot switch a machine-wide policy off — on Windows a standard user can set their own env var, so an unconditional opt-out would be a one-command bypass.
- **A new switch means four edits**: the type + `LOCKDOWN_INHERITING_KEYS` in `src/shared/enterprise-policy.ts`, `enterprise-policy-fixture.ts`, the gate, and `docs/reference/enterprise-policy.md`.
- **Every gate needs a behavioural test.** A resolver test proves the policy object is right, not that anything consumes it — and an upstream rebase resolved the wrong way drops a gate with a green suite. Use `makeLockdownPolicy()` from `enterprise-policy-fixture.ts`.
- `config/vitest-enterprise-policy-isolation.ts` neutralizes a machine-wide policy file for the whole suite, so building this fork on a locked-down machine does not turn the tests red. `tests/e2e/helpers/electron-home-isolation.ts` does the same for spawned Electron children.

### OrcaRuntimeService is the seam

`src/main/runtime/orca-runtime.ts` is the façade for every PTY, filesystem, git, and browser operation. It dispatches to a provider — local PTY, the local daemon, WSL, or an SSH relay — so nothing above it knows where execution actually happens. **New capabilities belong behind this service, not wired straight to a provider**, otherwise they silently work locally and break over SSH. Which runtime a project resolves to is modeled in `src/shared/project-execution-runtime.ts` (`local-host` / `windows-host` / `wsl`); SSH connection and relay lifecycle live in `src/main/ssh/`.

### Two out-of-process daemons

- **Local PTY daemon** (`src/main/daemon/`, forked as `daemon-entry.js`, unix socket + token file) keeps terminals alive across app restarts and crashes.
- **Relay** (`src/relay/`) is an esbuild CJS bundle per platform, deployed over SCP and launched through an SSH exec channel. It speaks framed JSON-RPC over stdio; handlers are split by domain (`fs-handler`, `git-handler`, `pty-handler`, `agent-exec-handler`, …). On disconnect it holds PTYs on a unix socket through a grace period so a reconnecting session re-attaches instead of restarting agents. Native addons are external — the relay degrades gracefully when the remote lacks them.

### Terminal state is main-owned

Main ingests PTY bytes into a bounded headless xterm model *before* forwarding to the renderer; the renderer is a view with a capped hidden-output queue that marks itself stale and re-syncs from a serialized snapshot on reveal. Before touching terminal output, visibility, or scrollback, read the modules themselves — `src/main/terminal-scrollback-snapshots.ts`, `src/main/daemon/`, and `src/renderer/src/components/terminal-pane/` (upstream deleted the `docs/terminal-main-owned-state.md` this used to point at).

### Renderer state

One Zustand store (`src/renderer/src/store/index.ts`) composed from ~190 slices in `store/slices/`. Prefer a slice unit test with `createTestAppStore()` over an E2E spec for pure logic. Path aliases: `@renderer` and `@` both point at `src/renderer/src`.

### IPC contract

`registerCoreHandlers` (`src/main/ipc/register-core-handlers.ts`) registers handlers; `src/preload/index.ts` + `api-types.ts` are the typed surface renderer code may use. Both preload files are deliberately large and unsplit — they exist to be reviewed as one contract.

## Repo gates worth knowing

`pnpm lint` is not just oxlint. It also runs, and CI enforces:

- **max-lines ratchet** — oxlint caps files (300 ts / 400 tsx / 800 test). `config/max-lines-baseline.txt` grandfathers existing bypasses and may only shrink; adding a new one fails CI (AGENTS.md forbids it outright).
- **Localization** — user-facing strings go through i18n (`src/renderer/src/i18n/locales/*.json`, en/es/ja/ko/zh). `pnpm sync:localization-catalog` fixes catalog drift; `pnpm audit:localization` reports uncovered strings. The auditor flags user-visible JSX props (`label`, `placeholder`, `tooltip`, `aria-label`, …) holding raw literals.
- **Skill guides** — `skills/<topic>/SKILL.md` is the source; `skill-guides/` and `skill-stubs/` are generated. After editing a skill run `pnpm generate:bundled-skill-guides` and `pnpm generate:skill-bundle-manifest`. Guide names in `config/scripts/generate-bundled-skill-guides.mjs` are a compatibility ledger — renames add aliases, never remove them.
- **No project-owned `.d.ts` in `src/preload` or `src/shared`** — `skipLibCheck: true` (inherited from `@electron-toolkit/tsconfig`) silently widens unresolved names to `any` there, so a broken IPC signature passes typecheck. A `find` step in CI fails the build.
- **Patch integrity** — `config/scripts/pnpm-patch-integrity.test.mjs` compares every hunk header against its body in *both* directions (a body that is too long is corruption just as a truncated one is) and asserts the Spectre requirement is gone from the two Windows native packages. `windows-process-tree-patch-contract.test.mjs` pins that patch LF-only and hash-synced with the lockfile.
- **Reliability gates** — `config/reliability-gates.jsonc` tracks cross-platform invariants and their maturity (`experimental` → `soak` → `blocking`).
- **Styled scrollbars / feature-wall asset budget / macOS entitlements** — dedicated `check:*` scripts.

Telemetry keys are compile-time constants substituted in `electron.vite.config.ts`; only the official CI release workflow sets them, so `pnpm dev` and third-party builds cannot transmit — there is no env-var fallback to flip.

## 버전 업그레이드 절차 (fork sync → enterprise 머지)

Orca 버전 업그레이드는 반드시 다음 순서로 진행한다:

1. **`main` 브랜치에서 fork sync를 진행하고, 그 결과를 원격 `main`에 푸시한다.** 절차와 유령 충돌 판별법은 README §6(fork-sync 레저)을 따른다.
2. **`enterprise/samsungds` 브랜치는 fork sync가 끝난 `main`의 결과를 기반으로 머지한다.** `main`을 건너뛰고 upstream 태그를 `enterprise/samsungds`에 직접 머지하지 않는다.
3. **충돌을 다 해소한 직후, 게이트를 돌기 전에 `pnpm check:fork-feature-ledger` 를 먼저 돌린다.** 포크 기능이 조용히 사라졌는지 이것이 가장 먼저 말해 준다 — 타입체크와 기존 테스트는 이 부류를 구조적으로 못 잡는다(§포크 기능 원장). 빨개지면 앵커를 지우지 말고 upstream 이 옮긴 새 위치에 포크 줄을 다시 넣고 원장의 `file` 을 갱신한다.
4. **테스트는 반드시 `--config config/vitest.config.ts` 로 돌린다.** 설정 없이 `vitest run` 을 돌리면 별칭·setup·include 가 전부 빠져 정책 게이트 테스트가 아예 실행되지 않고 실패가 수천 건으로 부풀려진다. 전체 스위트 1회는 판정이 아니다 — 머지 전 포크와 순정 태그로 워크트리 2개를 띄워 실패 **파일 집합**을 3자 대조해야 진짜 회귀만 남는다(README §6).
5. **머지 후, 원격에 푸시하기 전에** 새로 들어온 코드에 외부 URL 접근을 시도하는 코드(신규 `fetch`/`http(s)` 요청, 원격 스크립트 로드, 텔레메트리·업데이트 체크 엔드포인트 등)가 있는지 점검하고, 결과를 리포트로 정리해 제공한다. `docs/reference/external-integrations-audit.md`의 잔여-위험 레지스터에 반영이 필요한지도 함께 검토한다.

## 포크 기능 원장 — 머지가 갉아먹지 못하게 하는 장치

**이 절이 이 저장소에서 가장 자주 필요한 규칙이다.** 지금까지 v1.4.176·178·182·188·193·195·196
동기화에서 **매번** 포크 기능이 조용히 사라졌고, 매번 CI가 아니라 사용자가 먼저 발견했다.

### 왜 조용히 사라지는가

이 포크가 upstream 파일에 끼워 넣은 게이트는 **아무도 참조하지 않는 줄**이다. upstream 이 그 파일을
쪼개면(v1.4.196 은 `max-lines` 우회 34건을 한 릴리스에 청산했다) 주변 코드는 새 모듈로 옮겨 가고
끼워 넣은 줄만 남지 않는다. 그런데도:

- **타입체크는 초록이다** — 아무도 import 하지 않으니 없어져도 타입이 안 깨진다. (v1.4.196 에서
  `paneGroupPlacement` 전달 2줄이 이렇게 사라졌다. 세 번째로 사라진 타입 선언은 producer 파일이
  `@ts-nocheck` 라 역시 침묵했다.)
- **기존 테스트도 초록이다** — seam 을 양쪽에서 감싸고만 있기 때문이다. 워커 패널 자동 분할은
  minting 테스트가 `createTerminal` 을 목으로 막고, bridge 테스트는 이미 필드를 담은 페이로드에서
  시작하고, claim 테스트는 단독으로 돈다. 가운데가 비어 있었다.
- **제거한 표면은 충돌조차 안 난다** — upstream 이 같은 기능을 **새 경로에 새 파일로** 다시 만들면
  git 은 그냥 추가한다. v1.4.196 에서 31개가 그렇게 들어왔다(`src/main/updater/**` 18,
  preload 브리지 3, `docs/site` 8).

### 장치: `config/fork-feature-ledger.json` + 게이트

원장은 기능마다 **머지가 지우면 안 되는 정확한 문자열**과 **돌아오면 안 되는 경로/심볼**을 적는다.
`config/scripts/fork-feature-ledger.test.mjs` 가 이를 강제하고 `pnpm lint` 에 물려 있다
(`pnpm check:fork-feature-ledger` 로 단독 실행). 세 방향을 본다:

| 검사 | 잡는 사고 |
| --- | --- |
| `features[].present` — 파일에 그 문자열이 있는가 | 게이트·전달 라인이 리팩터링과 함께 사라진 것 |
| `absentPaths` / `absentSymbols` | 제거한 표면이 새 경로로 되살아난 것 |
| `policySwitchMinConsumers` — 정책 스위치별 소비 지점 하한 | 어느 레인에서 게이트가 통째로 빠진 것 |

하한을 쓰고 정확한 수를 쓰지 않는 이유: upstream 이 이미 게이트된 레인에 호출지점을 정당하게
늘리는 일이 있고 그것으로 빌드가 깨져서는 안 된다. **줄어드는 방향만이 사고다.**

> 앵커가 해석된다는 것이 기능이 동작한다는 증명은 아니다. 동작 증명은 여전히 행동 테스트의 몫이다.
> 이 게이트는 **조용한 삭제를 먼저 잡는 것**이 목적이다.

### 머지할 때 (§버전 업그레이드 절차 4단계와 같이 본다)

`pnpm check:fork-feature-ledger` 가 빨개지면 실패 메시지가 그 파일과 문자열을 그대로 알려 준다.
**앵커를 지우지 말고, upstream 이 그 코드를 옮긴 새 위치를 찾아 포크 줄을 거기 다시 넣은 뒤
원장의 `file` 을 갱신하라.** 새 위치는 기계적으로 찾을 수 있다 — 포크 hunk 의 컨텍스트 라인을
upstream 새 트리에서 grep 하면 어느 모듈로 갔는지 나온다(README §6).

### 새 기능·수정을 만들 때 (fork sync 가 아닌, 사용자와 함께 하는 작업)

**upstream 파일을 건드렸다면 같은 커밋에서 원장에 등재한다.** 판정 기준은 하나다 —
*upstream 이 이 파일을 쪼개면 내 변경이 사라지는가?* 그렇다면 등재 대상이다.

- upstream 파일에 끼워 넣은 게이트·전달 라인·등록 한 줄 → `features[].present` 에 추가
- upstream 기능을 지웠다면 → `absentPaths` / `absentSymbols` 에 추가
- 새 정책 스위치를 만들었다면 → `policySwitchMinConsumers` 에 현재 소비 지점 수로 추가

포크 **전용 파일**만 추가했다면 등재하지 않아도 된다(충돌할 상대가 없다). 다만 그 파일을 부르는
쪽이 upstream 파일이라면 **그 호출 한 줄이 앵커다.**

원장 등재는 행동 테스트를 대신하지 않는다. 게이트에는 여전히 동작 테스트가 필요하고
(`makeLockdownPolicy()` 사용), 게이트를 임시로 지워 그 케이스만 빨개지는지 확인하는
뮤테이션 검증까지 하는 것이 이 저장소의 기준이다.

### 이 포크가 소유한 것 — 계열별

원장의 `features[]` 가 정본이고, 여기 요약은 읽는 사람을 위한 것이다.

**사내 잠금(정책 파일)** — 시작 시 무장(Secure DNS·네트워크 허용목록·정책 트레이스), 플러그인
3중 차단, 에이전트 허용목록(실행 문 8곳), 벤더 자체 호출 차단(텔레메트리·star-nag·클라우드
릴레이·음성·관리형 Claude 계정·벤더 계정 등록), 사용량 폴링 잠금, 모바일 페어링/에뮬레이터,
맞춤법 검사, GHES 호스트, 제거한 상위 뷰(Mobile/Artifacts)의 디스크 복원 차단, 스위트 전체의
정책 파일 격리.

**빌드에서 제거한 표면** — 인앱 자동 업데이트(+`electron-updater`), artifact 공유, 스킬 공유,
Orca 클라우드, Bitbucket·Azure DevOps·Gitea, `docs/site` 배포 레인, 피드백·크래시 리포트 제출,
사내 자체 호스팅 모델 레인.

**포크가 더한 기능** — 오케스트레이션 워커 패널 자동 분할(+최대 개수 설정, 완료 탭 자동 닫기,
워커 프롬프트 진단 로그), opencode 평문 프롬프트 배달과 Enter 재전송 구제, 탭 팝아웃 창,
VS Code 소스 제어 패널과 서브모듈 취급, VS Code 로 열기, Confluence 연동, GHES 릴리스 태그
업데이트 알림, 탭 닫기 시 세션 종료, 번들 스킬 오프라인 설치, 스택 PR 병합 옵트인,
게이트웨이 CLI 로그인, 진단 로그.

**Windows 빌드** — napi 헤더 스테이징, windows-process-tree 패치 무결성, Electron 추출
스테이징과 copy 폴백, blockmap 재생성, pnpm 12 의 실행 전 재설치 차단
(`verifyDepsBeforeRun: false`).

## Reference docs

`docs/STYLEGUIDE.md` (mandatory for UI work), `docs/reference/git-compatibility.md` (Git 2.25 baseline, `GitCapabilityCache`), `docs/reference/linux-glibc-compatibility.md`, `docs/reference/headless-linux-server.md` (`orca serve`), `.github/CONTRIBUTING.md` (PR expectations, maintainer release flow). Loose `docs/*.md` files are per-feature design notes, not general guides.

Fork-specific (Korean): `README.md` (build, GHES, Bedrock, fork sync), `docs/reference/enterprise-policy.md` (policy file schema, fleet deployment, verification), `docs/reference/external-integrations-audit.md` (what leaves the machine, what the lockdown covers, and the residual-risk register), `docs/reference/windows-corporate-build.md` (Windows installer build), `docs/reference/macos-dev-ui-check.md` (check the corporate UI from a macOS `pnpm dev` run, no installer), `docs/reference/local-dev-run.md` (Windows-side local verification: what `pnpm dev` vs `build:unpack` vs the installer each prove, and what none of them can), `docs/reference/pnpm-12-corepack-install.md` (why a locked-down Windows machine fails to install pnpm, and the three causes that are not pnpm itself — read it before blaming the pinned version). **README §6 is the fork-sync ledger**: it records what this fork deleted from upstream and, for each, the collateral edits that come back *without a conflict* on the next merge — check those by hand, not by trusting a clean merge. Keep the audit document honest — it is what a corporate security reviewer reads, and overstating the lockdown there is worse than saying nothing.
