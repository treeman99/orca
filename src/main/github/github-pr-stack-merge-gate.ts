import type { GitHubPRStack } from '../../shared/github/pull-request-types'
import { translateMain } from '../i18n/main-i18n'

/**
 * Whether the caller has shown the user which pull requests a stack merge would
 * take, and been told yes.
 *
 * `mergePR` receives a single PR number, but GitHub's `pulls/{n}/merge-async`
 * endpoint merges that PR *and every PR below it* atomically. Promotion must
 * therefore be the caller's explicit decision, never main's inference from the
 * PR's stack metadata — only the caller knows whether it asked.
 *
 * Wire compatibility (docs/reference/remote-wire-compatibility.md Rule 1): the
 * `stackMergeIntent` field carrying this over IPC and runtime RPC is a new
 * *optional* field, not a stream opcode, so it needs no capability negotiation.
 * A client older than this gate omits it and lands on `single-pr-only`, which
 * fails closed — the intended outcome, not a regression: a client that could not
 * have shown the scope must not be able to trigger a multi-PR merge. The mirror
 * case (new client, older host) leaves that host's silent promotion in place
 * because it ignores a field it does not know; that is the old host's
 * pre-existing exposure, which this gate neither creates nor widens.
 */
export type GitHubPRStackMergeIntent = 'single-pr-only' | 'confirmed-stack-scope'

function stackMergeCount(stack: GitHubPRStack): number {
  // Mirrors the renderer's scope math: merging PR at `position` takes it and everything below it.
  return stack.position > 0 ? stack.position : 1
}

/**
 * Message for a caller that cannot show the stack scope. It has to say what
 * would have been merged and where the user can do it with that scope visible —
 * "blocked" alone gives them nothing to act on.
 */
export function buildUnconfirmedGitHubPRStackMergeError(
  stack: GitHubPRStack,
  prNumber: number
): string {
  // `prCount`, not `count`: an i18next `count` option switches the lookup to plural-suffixed
  // keys, which these catalogs do not carry.
  const prCount = stackMergeCount(stack)
  return prCount === 1
    ? translateMain(
        'github.stackMerge.confirmationRequiredSingle',
        'Pull request #{{pr}} belongs to a GitHub stack, so merging it here goes through GitHub stack merge and takes {{prCount}} pull request. Merge it from the review sidebar in Orca desktop, which shows exactly which pull requests are included before you confirm.',
        { pr: prNumber, prCount }
      )
    : translateMain(
        'github.stackMerge.confirmationRequiredMultiple',
        'Pull request #{{pr}} belongs to a GitHub stack, so merging it here would merge {{prCount}} pull requests atomically. Merge it from the review sidebar in Orca desktop, which shows exactly which pull requests are included before you confirm.',
        { pr: prNumber, prCount }
      )
}
