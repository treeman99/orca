# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The contribution rules above (design system, cross-platform, SSH, Git compatibility, naming, `max-lines`) are binding. This file adds the commands and the architecture map.

## Commands

Node 24 + pnpm 10 (`packageManager` is pinned). `engines` declares Node 24 and every CI job pins it via `node-version-file: package.json`, but `.npmrc` does not set `engine-strict`, so pnpm only warns on a newer Node.

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

### Single tests

```bash
pnpm test src/main/worktree-create-base.test.ts        # one file
pnpm test src/main/foo.test.ts -t "handles rebase"     # one case
pnpm tc:node                                           # typecheck one project (tc:cli / tc:web)
```

Vitest collects `src/**/*.test.ts(x)`, `config/scripts/**`, `tools/**/*.test.mjs`, and `tests/e2e/**/*.unit.test.ts`. Tests live next to their subject, not in a `__tests__` tree.

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
- **Reliability gates** — `config/reliability-gates.jsonc` tracks cross-platform invariants and their maturity (`experimental` → `soak` → `blocking`).
- **Styled scrollbars / feature-wall asset budget / macOS entitlements** — dedicated `check:*` scripts.

Telemetry keys are compile-time constants substituted in `electron.vite.config.ts`; only the official CI release workflow sets them, so `pnpm dev` and third-party builds cannot transmit — there is no env-var fallback to flip.

## Reference docs

`docs/STYLEGUIDE.md` (mandatory for UI work), `docs/reference/git-compatibility.md` (Git 2.25 baseline, `GitCapabilityCache`), `docs/reference/linux-glibc-compatibility.md`, `docs/reference/headless-linux-server.md` (`orca serve`), `.github/CONTRIBUTING.md` (PR expectations, maintainer release flow). Loose `docs/*.md` files are per-feature design notes, not general guides.

Fork-specific (Korean): `README.md` (build, GHES, Bedrock, fork sync), `docs/reference/enterprise-policy.md` (policy file schema, fleet deployment, verification), `docs/reference/external-integrations-audit.md` (what leaves the machine, what the lockdown covers, and the residual-risk register), `docs/reference/windows-corporate-build.md` (Windows installer build), `docs/reference/macos-dev-ui-check.md` (check the corporate UI from a macOS `pnpm dev` run, no installer), `docs/reference/local-dev-run.md` (Windows-side local verification: what `pnpm dev` vs `build:unpack` vs the installer each prove, and what none of them can), `docs/reference/bot-lane.md` (the fork-only Bots sidebar lane: a bot is a name over the existing agent + workspace + automation primitives, never a new runtime; also what was deliberately left out and why). Keep the audit document honest — it is what a corporate security reviewer reads, and overstating the lockdown there is worse than saying nothing.
