import type { PRConflictSummary } from '../../../../shared/github/pull-request-types'
import { getPRConflictSummary } from '../../conflict-summary'
import { ghExecFileAsync, acquire, release, type LocalGitExecOptions } from '../../gh-utils'
import { resolveGitHubRepoExecution, type GitHubApiRepository } from '../../github-api-repository'
import { mergeGitHubPRStack } from '../../github-pr-stack'
import { githubPRStackExecutionScope, type GhExecOptions } from './../github-exec-scope'
import { detectRepositoryMergeMetadata } from './../detect/repository-merge-metadata'
import type { PullRequestLookupData } from './../lookup/pull-request-lookup-data'
import { getRestPRByNumber, getPRByNumber } from './../lookup/pr-number-lookup'
import { STACK_METADATA_UNAVAILABLE_ERROR } from './../lookup/pr-stack-summary-cache'
import {
  buildUnconfirmedGitHubPRStackMergeError,
  type GitHubPRStackMergeIntent
} from '../../github-pr-stack-merge-gate'
/**
 * Merge a PR by number using gh CLI.
 * method: 'merge' | 'squash' | 'rebase' (default: 'squash')
 *
 * `stackMergeIntent` defaults to fail-closed: a stacked PR is never promoted to
 * GitHub's atomic multi-PR merge unless the caller says it showed the scope.
 */
export async function mergePR(
  repoPath: string,
  prNumber: number,
  method: 'merge' | 'squash' | 'rebase' = 'squash',
  connectionId?: string | null,
  prRepo?: GitHubApiRepository | null,
  localGitOptions: LocalGitExecOptions = {},
  stackMergeIntent: GitHubPRStackMergeIntent = 'single-pr-only'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(
    repoPath,
    prRepo,
    connectionId,
    localGitOptions
  )
  if (!ownerRepo) {
    return { ok: false, error: 'Could not resolve GitHub owner/repo for this repository' }
  }
  await acquire()
  let concurrencySlotHeld = true
  try {
    let restData: PullRequestLookupData
    try {
      restData = await getRestPRByNumber(ownerRepo, prNumber, ghOptions, {
        requireUsableStackMetadata: true
      })
    } catch (err) {
      const diagnostic =
        err instanceof SyntaxError
          ? 'invalid JSON response'
          : err instanceof Error
            ? err.message
            : String(err)
      console.warn(
        `mergePR stack metadata probe failed for ${ownerRepo.owner}/${ownerRepo.repo}#${String(prNumber)}:`,
        diagnostic
      )
      return { ok: false, error: STACK_METADATA_UNAVAILABLE_ERROR }
    }
    if (restData.stack) {
      if (stackMergeIntent !== 'confirmed-stack-scope') {
        // Do NOT quietly fall back to a single-PR merge: the caller has to learn that the
        // request it made is not the write GitHub would have performed.
        return {
          ok: false,
          error: buildUnconfirmedGitHubPRStackMergeError(restData.stack, prNumber)
        }
      }
      const mergeMetadata = await detectRepositoryMergeMetadata(
        ownerRepo,
        restData.stack.baseRefName,
        ghOptions,
        githubPRStackExecutionScope(connectionId, localGitOptions)
      )
      release()
      concurrencySlotHeld = false
      return await mergeGitHubPRStack({
        repository: ownerRepo,
        prNumber,
        method,
        mergeAction: mergeMetadata.mergeQueueRequired === true ? 'merge_queue' : 'direct_merge',
        headSha: restData.headRefOid,
        ghOptions
      })
    }
    const mergeBlocker = await getPRMergeBlocker(
      repoPath,
      prNumber,
      ownerRepo,
      ghOptions,
      connectionId,
      localGitOptions
    )
    if (mergeBlocker) {
      return { ok: false, error: mergeBlocker }
    }

    // Don't use --delete-branch: it deletes the local branch, which fails while the worktree is checked out on it.
    const args = ['pr', 'merge', String(prNumber), `--${method}`]
    if (ownerRepo) {
      args.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
    }
    await ghExecFileAsync(args, {
      ...ghOptions,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' }
    })
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
    return { ok: false, error: message }
  } finally {
    if (concurrencySlotHeld) {
      release()
    }
  }
}

export async function getPRMergeBlocker(
  repoPath: string,
  prNumber: number,
  ownerRepo: GitHubApiRepository | null,
  ghOptions: GhExecOptions,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string | null> {
  if (!ownerRepo) {
    return null
  }

  try {
    const pr = await getPRByNumber(
      ownerRepo,
      prNumber,
      ghOptions,
      githubPRStackExecutionScope(connectionId, localGitOptions)
    )
    if (!pr) {
      return null
    }
    if (pr.reviewDecision === 'REVIEW_REQUIRED') {
      return 'This pull request requires review approval before it can be merged.'
    }
    if (pr.reviewDecision === 'CHANGES_REQUESTED') {
      return 'This pull request has requested changes and cannot be merged yet.'
    }
    if (pr.mergeQueueRequired === true) {
      return 'This pull request must be merged through GitHub merge queue. Use Merge when ready instead.'
    }
    // Why: conflict summaries shell out to local git; skip for SSH repos until that helper routes through the SSH provider.
    if (
      connectionId ||
      pr.mergeable !== 'CONFLICTING' ||
      !pr.baseRefName ||
      !pr.baseRefOid ||
      !pr.headRefOid
    ) {
      return null
    }

    const summary = await getPRConflictSummary(
      repoPath,
      pr.baseRefName,
      pr.baseRefOid,
      pr.headRefOid,
      localGitOptions
    )
    return formatMergeConflictBlocker(pr.baseRefName, summary)
  } catch {
    // Why: conflict preflight should improve stale UI diagnostics, not block merge on a transient lookup failure.
    return null
  }
}

export function formatMergeConflictBlocker(
  baseRefName: string,
  summary: PRConflictSummary | undefined
): string {
  const heading = 'This pull request has merge conflicts and cannot be merged yet.'
  if (!summary || summary.files.length === 0) {
    return `${heading}\nUpdate the branch with ${baseRefName} and resolve the conflicts before merging.`
  }

  const files = summary.files.map((file) => `- ${file}`).join('\n')
  const behind = `${summary.commitsBehind} commit${summary.commitsBehind === 1 ? '' : 's'} behind ${baseRefName}`
  return `${heading}\n${behind} (base commit: ${summary.baseCommit}).\n\nConflicting files:\n${files}`
}
