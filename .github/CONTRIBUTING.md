# Contributing to Orca

Thanks for contributing to Orca.

> ## 📌 사내 포크(`enterprise/samsungds`)에서 작업하는 경우
>
> **이 문서는 원본 프로젝트 [`stablyai/orca`](https://github.com/stablyai/orca) 기준입니다.** 아래 내용은 그대로 유효하지만, 사내 포크에서는 세 가지가 다릅니다.
>
> 1. **PR은 사내 포크로 보냅니다.** 원본에 열지 마세요. 사내 커스터마이즈가 담긴 브랜치는 `enterprise/samsungds`이고, `main`은 원본의 깨끗한 미러로만 유지합니다(동기화 절차는 [`README.md`](../README.md) §6).
> 2. **릴리스 절차가 다릅니다.** 아래 "Release Process"의 **Cut Release 워크플로를 실행하지 마세요** — 그 워크플로는 `stablyai/orca`의 GitHub Releases에 발행합니다. 사내 배포용 `.exe`는 [`docs/reference/windows-corporate-build.md`](../docs/reference/windows-corporate-build.md)의 Windows 빌드 절차로 만들며, `--publish never`가 필수입니다.
> 3. **잠금 정책 계층을 건드릴 때 규칙이 있습니다.** 벤더 phone-home 게이트는 관리자 소유 정책 파일로 통제됩니다. 게이트를 **호출자가 아니라 초크포인트**에 두고, **런타임 환경 변수를 새로 만들지 말고**, 게이트마다 **동작 회귀 테스트**를 추가하세요 — 리졸버 테스트만으로는 리베이스에서 게이트가 사라져도 CI가 초록으로 통과합니다. 자세한 규칙은 [`CLAUDE.md`](../CLAUDE.md)의 "Enterprise policy is a second seam", 정책 파일 스키마는 [`docs/reference/enterprise-policy.md`](../docs/reference/enterprise-policy.md).
>
> 배포 대상은 **Windows x64 단일 플랫폼**이지만, **코드베이스는 크로스플랫폼을 유지합니다** — 아래 "Before You Start"의 플랫폼 규칙은 사내 포크에도 그대로 적용됩니다.

## Before You Start

- Keep changes scoped to a clear user-facing improvement, bug fix, or refactor.
- Orca targets macOS, Linux, and Windows. Every change must stay compatible with all three platforms unless the code is explicitly guarded by a runtime platform check.
- For keyboard shortcuts, use runtime platform checks in renderer code and `CmdOrCtrl` in Electron menu accelerators.
- For shortcut labels, show `⌘` and `⇧` on macOS, and `Ctrl+` and `Shift+` on Linux and Windows.
- For file paths, use Node or Electron path utilities such as `path.join`.
- Orca must work against local repositories, remote servers, and SSH worktrees. Do not assume a process, file, credential, shell, or network path exists only on the local machine.
- Orca supports many CLI agents, integrations, and git providers. Keep generic behavior provider-neutral; guard integration-specific logic behind explicit checks.
- Keep changes well-engineered and performant: follow existing architecture, avoid unnecessary work in hot paths, clean up owned resources, and use concrete module names.
- For UI work, follow [`docs/STYLEGUIDE.md`](../docs/STYLEGUIDE.md), use the tokens and shadcn primitives it specifies, and verify polished behavior across platforms, light/dark mode, and SSH latency.

## Local Setup

```bash
pnpm install
pnpm dev
```

## Branch Naming

Use a clear, descriptive branch name that reflects the change.

Good examples:

- `fix/ctrl-backspace-delete-word`
- `feat/shift-enter-newline`
- `chore/update-contributor-guide`

Avoid vague names like `test`, `misc`, or `changes`.

## Before Opening a PR

Run the same checks that CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Add high-quality tests for behavior changes and bug fixes. Prefer tests that would actually catch a regression, not shallow coverage that only exercises the happy path.

If your change affects UI or interaction behavior, verify it on the platforms it could impact.

## Type Declarations: Prefer `.ts` Over `.d.ts`

Project-owned type declarations belong in `.ts` files. `.d.ts` is reserved for ambient shims (e.g., `env.d.ts`, `vite/client.d.ts`). TypeScript's `skipLibCheck: true` setting applies globally, including to our own `.d.ts` files, which means any unresolved type reference in a `.d.ts` silently becomes `any` at its call sites. Write your types in `.ts` files so the compiler actually checks them.

CI enforces this for `src/preload/` and `src/shared/` — see `docs/preload-typecheck-hole.md`.

## Pull Requests

Each pull request should:

- explain the user-visible change
- stay focused on a single topic when possible
- include screenshots or screen recordings for new UI or behavior changes
- include high-quality tests when behavior changes or bug fixes warrant them
- include a brief code review summary from your AI coding agent that explicitly checks cross-platform compatibility, SSH/remote/local compatibility, supported agent and integration compatibility, performance risk, UI quality when applicable, and basic security risk
- mention any platform-specific, remote/SSH-specific, agent-specific, integration-specific, or git-provider-specific behavior and testing notes
- **Include your X (Twitter) handle!** We love giving shoutouts to our contributors when we merge features on [@orca_build](https://x.com/orca_build).

If there is no visual change, say that explicitly in the PR description.

## Release Process

Version bumps, tags, and releases are maintainer-managed. Do not include release version changes in a normal contribution unless a maintainer asks for them.

### Cutting a release (maintainers)

All releases are cut from the **Cut Release** GitHub Actions workflow. There is no local `pnpm release:*` script — running releases locally is too easy to get wrong (dirty tree, wrong branch, stale main).

**To cut a release:**

1. Open [Actions → Cut Release](../../actions/workflows/release-cut.yml).
2. Click **Run workflow** and pick:
   - **kind**: one of `rc`, `patch`, `minor`, `major`.
   - **ref**: the branch, tag, or SHA to build from. Defaults to `main`.
3. Run it.

The workflow resolves the next version from GitHub Releases, bumps `package.json`, tags, pushes, and runs the multi-platform build + publish inline.

**How the next version is chosen:**

All stable kinds (`patch`, `minor`, `major`) are computed off the latest _stable_ release, ignoring any RCs in between.

- `kind=rc` + last tag was stable (e.g. `v1.3.14`) → `v1.3.15-rc.0`.
- `kind=rc` + active RC series (e.g. `v1.3.15-rc.2`) → `v1.3.15-rc.3`.
- `kind=patch` + latest stable `v1.3.14` → `v1.3.15` (regardless of any intermediate RCs).
- `kind=minor` + latest stable `v1.3.14` → `v1.4.0`.
- `kind=major` + latest stable `v1.3.14` → `v2.0.0`.

**Safety guarantees:**

- Stable releases are refused if the new version isn't strictly greater than the latest published stable. This is the only rule `electron-updater` actually needs — it compares semver within the `latest` channel, so a regressing stable is the one thing that breaks auto-update for fresh installs.
- Complete RC draft releases created by the release workflow are published before cutting a new tag only when the draft tag was built from the current release ref. Stale drafts are skipped so fixes cut a fresh RC instead of exposing old artifacts.
- If the latest RC tag exists but is still draft-only or missing its GitHub Release, the workflow resumes that tag only when it was built from the current release ref. Otherwise the next RC number is cut.
- RC numbering also considers release commits on `main`, so deleting a stale tag does not let a later cut reuse the same RC number.
- Off-main releases (when `ref` is not the tip of `main`) only push the tag. `main` is never mutated from a non-main ref, so you can safely release an older commit without polluting history.
- When `ref` is the tip of `main`, the version-bump commit is fast-forwarded onto `main` so local `package.json` stays in sync with what's shipped.

**Common scenarios:**

- **Normal release:** `kind=patch`, `ref=main`.
- **"A bad commit just landed on main, release the commit before it":** `kind=patch`, `ref=<good-sha>`. `main` is left alone; the tag points at the good SHA. Fix forward on `main` afterward.
- **One-off RC for a feature branch:** `kind=rc`, `ref=<branch-or-sha>`. Produces an RC tag that does not touch `main`.
- **Minor or major bump:** `kind=minor` or `kind=major`.

The scheduled 2x/day RC cron in [`release-rc.yml`](../../actions/workflows/release-rc.yml) is independent and continues to run automatically from `main`.


## Release Channels

The public Homebrew cask tracks stable desktop releases:

```bash
brew install --cask stablyai/orca/orca
```

Release candidates use a separate cask token:

```bash
brew install --cask stablyai/orca/orca@rc
```

The two casks conflict because both install `Orca.app`. Switch channels with a
normal `brew uninstall --cask` followed by the install for the other channel.
Do not use `--zap` unless you intentionally want to remove local Orca state.
