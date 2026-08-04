import type { SubmoduleStatusState } from './source-control-submodule-expansion'

/**
 * What to show beneath an expanded submodule row so it reads as its own
 * repository rather than a file in the parent. A submodule is routinely parked
 * on a different branch than the root, and until that is on screen the panel
 * gives no way to tell the two repositories apart.
 */
export type SubmoduleBranchLabel = {
  /** Short branch name, or an abbreviated OID when the submodule is detached. */
  name: string
  detached: boolean
  /** True when the submodule's branch differs from the parent worktree's. */
  differsFromParent: boolean
}

const HEADS_PREFIX = 'refs/heads/'
const DETACHED_OID_LENGTH = 7

/** `refs/heads/foo` -> `foo`; already-short names pass through. */
export function toShortSubmoduleBranchName(branch: string | undefined): string | null {
  const trimmed = branch?.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.startsWith(HEADS_PREFIX) ? trimmed.slice(HEADS_PREFIX.length) || null : trimmed
}

/**
 * Derive the branch label for an expanded submodule. Returns null while the
 * inner status is still loading or failed — the branch is read from that same
 * response, so there is nothing to show yet and no extra git call is made.
 *
 * A submodule with a detached HEAD (the state `git submodule update` leaves
 * behind) has no branch, so fall back to the abbreviated commit the parent
 * recorded rather than rendering an empty row.
 */
export function getSubmoduleBranchLabel(
  state: SubmoduleStatusState | undefined,
  parentBranch: string | undefined
): SubmoduleBranchLabel | null {
  if (!state || state.status !== 'loaded') {
    return null
  }
  const shortBranch = toShortSubmoduleBranchName(state.branch)
  if (shortBranch) {
    return {
      name: shortBranch,
      detached: false,
      differsFromParent: shortBranch !== toShortSubmoduleBranchName(parentBranch)
    }
  }
  const head = state.head?.trim()
  if (!head) {
    return null
  }
  return {
    name: head.slice(0, DETACHED_OID_LENGTH),
    detached: true,
    // Why: a detached submodule is never "on the parent's branch", so always mark it.
    differsFromParent: true
  }
}
