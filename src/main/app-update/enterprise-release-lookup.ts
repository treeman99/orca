// Reads the newest published release off the corporate GitHub Enterprise host.
//
// No new network or credential path: this goes through `gh`, exactly like every
// other GitHub read in the app. `ghExecFileAsync` injects `--hostname` for `api`
// calls (git/runner.ts:applyGhHostToArgs), so GHES's `/api/v3` prefix, the token in
// gh's own keyring, timeouts, retries, and the rate-limit breaker are all already
// handled — this module adds only "which host, which repository, and refuse the
// vendor".

import { ghExecFileAsync } from '../github/gh-utils'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { readStoredGithubEnterpriseHost } from '../github/github-enterprise-host-store'
import { isVendorGitHubHost, resolveEffectiveGitHubHost } from '../github/effective-github-host'
import {
  parseReleaseListing,
  parseTagListing,
  selectLatestStableRelease,
  type SelectedRelease
} from './release-tag-selection'

/** Where this fork's builds are published. Overridable via `updateReleaseRepository`. */
export const DEFAULT_RELEASE_REPOSITORY = 'DPI/Orcads'

// One page is plenty: releases and tags both come back newest-first, and a build
// more than 30 releases behind still sees the newest entry on that page.
const PAGE_SIZE = 30
const LOOKUP_TIMEOUT_MS = 20_000

export type ReleaseLookupResult =
  | { outcome: 'found'; release: SelectedRelease; host: string; releaseUrl: string }
  | { outcome: 'no-enterprise-host' }
  | { outcome: 'lookup-failed' }
  | { outcome: 'no-release' }

/** Runs one `gh api` read; separated so tests can drive the lane without a subprocess. */
export type GhApiReader = (path: string, host: string) => Promise<unknown>

/**
 * The corporate host this check may talk to, or null.
 *
 * Deliberately NOT the workspace's own remote (the one input
 * `resolveEffectiveGitHubHost` also accepts): the release repository is a fixed
 * corporate coordinate, so a workspace cloned from somewhere else must not redirect
 * it. `policyHost` already folds in `GH_HOST` and gh's own `hosts.yml`.
 *
 * Vendor SaaS is refused outright rather than queried — this fork must not add a
 * github.com call, and `github.com/DPI/Orcads` is somebody else's repository.
 */
export function resolveEnterpriseReleaseHost(): string | null {
  const policy = getEnterprisePolicy()
  const effective = resolveEffectiveGitHubHost({
    ghHostEnv: process.env.GH_HOST ?? null,
    storedHost: readStoredGithubEnterpriseHost(),
    policyHost: policy.githubEnterpriseHost
  })
  return isVendorGitHubHost(effective.host) ? null : effective.host
}

/** `OWNER/REPO` for the release repository: the administrator's, else the build's. */
export function resolveReleaseRepository(): string {
  return getEnterprisePolicy().updateReleaseRepository ?? DEFAULT_RELEASE_REPOSITORY
}

// Deliberately host-local (no `cwd`, no `wslDistro`, no SSH connection): the question
// is which build THIS desktop is running, so a remote runtime's `gh` would answer for
// the wrong machine. Nothing here touches a workspace, so folder workspaces and
// non-git workspaces behave identically.
async function readGhApi(path: string, host: string): Promise<unknown> {
  const { stdout } = await ghExecFileAsync(['api', path], {
    host,
    timeout: LOOKUP_TIMEOUT_MS
  })
  return JSON.parse(stdout) as unknown
}

/**
 * Build the release page URL for `release` on `host`.
 *
 * The API's own `html_url` is preferred but re-checked against the host we asked:
 * the page is about to be handed to the OS browser, and a mirrored or proxied
 * instance answering with somebody else's origin must not become a click target.
 */
export function releasePageUrl(release: SelectedRelease, host: string, repository: string): string {
  if (release.releaseUrl) {
    try {
      if (new URL(release.releaseUrl).hostname.toLowerCase() === host.toLowerCase()) {
        return release.releaseUrl
      }
    } catch {
      // Unparseable — fall through to the constructed URL.
    }
  }
  return `https://${host}/${repository}/releases/tag/${encodeURIComponent(release.tag)}`
}

function found(release: SelectedRelease, host: string, repository: string): ReleaseLookupResult {
  return { outcome: 'found', release, host, releaseUrl: releasePageUrl(release, host, repository) }
}

/**
 * The newest stable release on the corporate host, or why there is none.
 *
 * Every failure is an outcome, never a throw: a machine with no `gh`, no token, or
 * no route to the host must end the check silently, not raise an error the user has
 * no way to act on.
 *
 * Releases first, tags as the fallback — a fleet that publishes builds by pushing a
 * tag without cutting a GitHub release would otherwise never see an update, and an
 * empty releases list is indistinguishable from that case.
 */
export async function lookupLatestEnterpriseRelease(
  options: { host?: string | null; repository?: string; readApi?: GhApiReader } = {}
): Promise<ReleaseLookupResult> {
  const host = options.host !== undefined ? options.host : resolveEnterpriseReleaseHost()
  if (!host) {
    return { outcome: 'no-enterprise-host' }
  }
  const repository = options.repository ?? resolveReleaseRepository()
  const readApi = options.readApi ?? readGhApi

  let sawAnswer = false
  try {
    const releases = await readApi(`repos/${repository}/releases?per_page=${PAGE_SIZE}`, host)
    sawAnswer = true
    const fromReleases = selectLatestStableRelease(parseReleaseListing(releases))
    if (fromReleases) {
      return found(fromReleases, host, repository)
    }
  } catch {
    // Fall through to tags: a repository with releases disabled answers 404 here.
  }

  try {
    const tags = await readApi(`repos/${repository}/tags?per_page=${PAGE_SIZE}`, host)
    const fromTags = selectLatestStableRelease(parseTagListing(tags))
    return fromTags ? found(fromTags, host, repository) : { outcome: 'no-release' }
  } catch {
    return sawAnswer ? { outcome: 'no-release' } : { outcome: 'lookup-failed' }
  }
}
