# Submodules as separate repositories in Source Control

The VS Code-shaped Source Control panel
(`src/renderer/src/components/right-sidebar/vscode-source-control/`) treats every submodule
as its own repository, the way VS Code's Git extension opens `.gitmodules` entries as
independent Repositories. This note records the boundaries that decision draws, because
several of them are the result of a bug rather than a preference.

## What it does

- **Enumerates from `.gitmodules`, not from dirtiness.** `git.submoduleList` reads the
  configured submodules; every initialized one gets a section whether or not it has changes.
  A clean submodule still earns a section — that is the only place its branch is ever shown,
  and a submodule parked on a different branch than the root is the state users most need to
  see. This mirrors VS Code's `git.detectSubmodules`.
- **Caps detection at 10** (`MAX_DETECTED_SUBMODULES`, matching VS Code's
  `git.detectSubmodulesLimit` default) and says so in the parent section when the cap is hit.
  A silent truncation would read as "this repo has 10 submodules".
- **Drives each submodule's own git.** Stage, unstage, discard, commit, pull and push inside
  a section run against that submodule's repository through the submodule-scoped runtime API
  (`git.submoduleStage/Unstage/Discard/Commit/Pull/Push`), with paths relative to the
  submodule root. The primary button follows the same Commit → Publish Branch → Sync Changes
  → disabled Commit precedence as the parent, blocked first by Resolve Conflicts. Sync Changes
  is pull **then** push, matching VS Code: push alone reports success while a behind-only
  submodule stays behind.
- **Re-reads both repositories after a write.** A submodule commit or discard moves the
  gitlink the parent records, so refreshing only the submodule would leave the parent section
  asserting a pointer change that is already gone.

## What it deliberately does not do

- **The parent view never shows a submodule's inner file paths.** A submodule is exactly one
  gitlink row in the parent section; its contents live in its own section and are read from
  that submodule's own `git status`. Expanding inner paths into the parent list was tried and
  reverted (87aa508be1) — it made the parent's change count and its "discard all" scope lie.
- **Uninitialized submodules get no section.** They have no checkout, so there is no status to
  read and nothing to act on. Rendering them would fill a freshly cloned repository with error
  banners.
- **A gitlink nested inside a submodule has no discard.** Restoring it would have to run
  `git submodule update` _inside_ that submodule, which the submodule-scoped API cannot
  express. It stays unavailable rather than silently targeting the wrong repository.
- **A submodule's own submodules are not enumerated.** Detection is one level deep, matching
  what the parent's `.gitmodules` declares.
- **Sync Changes does not roll back a half-finished sync.** The pull runs first and is left in
  place if the push then fails, so a rejected push leaves the submodule merged-but-unpushed.
  A pull that fails outright (conflicts, no upstream) surfaces as the section's error and the
  push is never attempted. VS Code behaves the same way.

## Discarding a gitlink row is not a file restore

In the parent section, Discard on a gitlink row runs `git submodule update --init`
(`restoreRuntimeGitSubmodulePointer`), never `git restore`. `git restore` lies about this
row: on a moved or dirty pointer it exits 0 having changed nothing, and on a deleted
submodule directory it clears the row while leaving an empty, uninitialized folder behind.

Two consequences are stated in the confirmation dialog before the user can accept them:

- the submodule ends up on a **detached HEAD**, so whatever branch was checked out inside it
  is not preserved;
- a file row inside a submodule restores to **that submodule's HEAD**, not to the commit the
  parent records.

The action is offered only when the pointer actually moved (`submodule.commitChanged`).
`git submodule update` does not touch the submodule's working tree, so offering it for a
submodule that is merely dirty inside would be a button that reports success and changes
nothing.

## Why the root guard is not optional

Every mutating submodule path in the main process and the relay runs two checks in order:

1. `resolveSubmoduleWorktreePath` — proves the path stays inside the parent worktree;
2. `assertSubmoduleWorktreeRoot` — proves that directory **is** a repository root
   (`git rev-parse --show-prefix` returns an empty string).

The second check is the load-bearing one. `resolveSubmoduleWorktreePath` only answers
"is this inside the parent". Once a submodule is deinitialized, moved, or left behind by a
branch switch, the directory is an ordinary folder — and git walks **up** from it to the
parent repository. A command aimed at the submodule then runs against the parent: a commit
lands on the parent's branch, a push pushes the parent, a discard restores the parent's copy
of a same-named file. `src/main/git/submodule-write-root-guard.test.ts` pins this with a
negative control that shows a raw `git commit` in that directory really does commit to the
parent.

The renderer must never assemble a submodule path that bypasses this. Row paths are validated
by `resolveVscodeScmSubmoduleInnerPath`, which delegates to the existing
`resolveSubmoduleDiscardTarget` rules (no empty, `.` or `..` segment on either half), and
`.gitmodules` paths are re-checked in `selectDetectedSubmodulePaths` before they can reach a
write. These are defence in depth — the host refuses an escaping path regardless — but a path
that cannot be trusted should never reach a mutation call in the first place.

## Mixed-version hosts

The six submodule write RPCs postdate the oldest relay and remote host a client may pair
with. An unknown method comes back as JSON-RPC method-not-found; both skew paths are folded
into one typed error (`SubmoduleWriteUnsupportedError`, see
`src/renderer/src/runtime/runtime-git-submodule-write-support.ts`). `git.submoduleList`
reports it as a flag rather than throwing, because it is polled.

Two things follow from that flag:

- The panel falls back to enumerating the submodules the **parent's own status** flagged as
  dirty (`collectDirtySubmodulePaths`). A clean submodule cannot be seen without
  `git.submoduleList`, but the dirty ones still can — and dropping every section would read
  as "this repository has no submodules" rather than "this host is behind".
- Every submodule write action renders **disabled with the reason in its tooltip**. A
  silently missing button reads as a panel bug rather than a host limitation.

Parent-repository writes are unaffected — they use RPCs that have always been there.
