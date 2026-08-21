// Pure tag arithmetic for the enterprise update check: what the host answered →
// which single tag (if any) is a newer released version than the running build.
//
// Kept free of Electron and of `gh` so the rules that decide "notify" can be
// pinned by unit tests. The one rule that matters most: an unparseable tag must
// never read as "newer" — a repository full of tags like `nightly` or
// `release-2026Q3` has to leave the app silent, not popping a dialog.

import {
  compareAppVersions,
  isPrereleaseAppVersion,
  isValidAppVersion
} from '../../shared/app-version'

/** One entry of the releases or tags listing, already narrowed from JSON. */
export type ReleaseTagCandidate = {
  tag: string
  /** The host's own release page, when the entry came from the releases API. */
  releaseUrl: string | null
  /** Absent for the tags fallback, which carries no publication state. */
  draft: boolean
  prerelease: boolean
}

export type SelectedRelease = {
  /** Verbatim tag, e.g. "v1.4.186" — what the release page URL is built from. */
  tag: string
  /** The tag's semver core, `v` stripped, e.g. "1.4.186". */
  version: string
  releaseUrl: string | null
}

/** Strip the conventional `v` prefix; anything else is left for the parser to reject. */
export function releaseTagVersion(tag: string): string | null {
  const version = tag.trim().replace(/^v/i, '')
  return isValidAppVersion(version) ? version : null
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readRecords(payload: unknown): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    return []
  }
  return payload.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
  )
}

/** `GET /repos/{owner}/{repo}/releases` → candidates. Unknown shapes yield none. */
export function parseReleaseListing(payload: unknown): ReleaseTagCandidate[] {
  const candidates: ReleaseTagCandidate[] = []
  for (const entry of readRecords(payload)) {
    const tag = readString(entry, 'tag_name')
    if (!tag) {
      continue
    }
    candidates.push({
      tag,
      releaseUrl: readString(entry, 'html_url'),
      draft: entry.draft === true,
      prerelease: entry.prerelease === true
    })
  }
  return candidates
}

/** `GET /repos/{owner}/{repo}/tags` → candidates. The fallback when releases is empty. */
export function parseTagListing(payload: unknown): ReleaseTagCandidate[] {
  const candidates: ReleaseTagCandidate[] = []
  for (const entry of readRecords(payload)) {
    const tag = readString(entry, 'name')
    if (tag) {
      candidates.push({ tag, releaseUrl: null, draft: false, prerelease: false })
    }
  }
  return candidates
}

/**
 * The newest stable release among `candidates`, or null when none qualifies.
 *
 * Drafts and prereleases are both dropped. The release channel selector was
 * removed with the updater, so nobody on this fleet can opt into a prerelease —
 * announcing one would point them at a build they must not install. A prerelease
 * suffix in the tag itself counts too, because the tags fallback carries no flags.
 */
export function selectLatestStableRelease(
  candidates: readonly ReleaseTagCandidate[]
): SelectedRelease | null {
  let best: SelectedRelease | null = null
  for (const candidate of candidates) {
    if (candidate.draft || candidate.prerelease) {
      continue
    }
    const version = releaseTagVersion(candidate.tag)
    if (!version || isPrereleaseAppVersion(version)) {
      continue
    }
    if (!best || compareAppVersions(version, best.version) > 0) {
      best = { tag: candidate.tag, version, releaseUrl: candidate.releaseUrl }
    }
  }
  return best
}

/**
 * True only when both versions parse AND `latest` is strictly greater.
 *
 * `compareAppVersions` returns 0 for anything it cannot parse, so a bare `>0`
 * would already be safe — the explicit validity check is here so that a future
 * change to the comparator cannot silently turn "unparseable" into "newer".
 */
export function isNewerRelease(currentVersion: string, latestVersion: string): boolean {
  return (
    isValidAppVersion(currentVersion) &&
    isValidAppVersion(latestVersion) &&
    compareAppVersions(latestVersion, currentVersion) > 0
  )
}
