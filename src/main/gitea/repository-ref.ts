import { createRemoteRefProbeCache } from '../git/remote-ref-probe-cache'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

export type GiteaRepoRef = {
  host: string
  owner: string
  repo: string
  apiBaseUrl: string
  webBaseUrl: string
}

type LocalGitExecOptions = {
  wslDistro?: string
}

const KNOWN_NON_GITEA_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'dev.azure.com',
  'ssh.dev.azure.com'
])
// Why the enterprise host is not part of the cache key: the policy is resolved
// once per process, so a cached ref can never disagree with a later read.
const repoRefProbeCache = createRemoteRefProbeCache(parseGiteaRepoRef)

/** @internal - exposed for tests only */
export function _resetGiteaRepoRefCache(): void {
  repoRefProbeCache.clear()
}

/** @internal - exposed for tests only */
export function _getGiteaRepoRefCacheSize(): number {
  return repoRefProbeCache.size()
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parsePath(pathname: string): { owner: string; repo: string; basePath: string } | null {
  const withoutSuffix = pathname.replace(/\/+$/, '').replace(/\.git$/i, '')
  const parts = withoutSuffix
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    return null
  }

  const owner = decodeSegment(parts.at(-2) ?? '')
  const repo = decodeSegment(parts.at(-1) ?? '')
  if (!owner || !repo) {
    return null
  }

  return {
    owner,
    repo,
    basePath: parts.slice(0, -2).join('/')
  }
}

function apiBaseUrlFromWebBase(webBaseUrl: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/api/v1`
}

function makeRepoRef(host: string, path: string, webOrigin: string): GiteaRepoRef | null {
  const normalizedHost = host.toLowerCase()
  // Why: a private GitHub Enterprise host is not in KNOWN_NON_GITEA_HOSTS, so
  // without this guard the Gitea fallback would claim it and hit
  // `<ghes-host>/api/v1/...` — a wrong endpoint. Excluding the configured
  // enterprise host keeps GHES remotes on the gh-CLI GitHub path.
  const enterpriseGitHubHost = getEnterprisePolicy().githubEnterpriseHost
  if (
    !normalizedHost ||
    KNOWN_NON_GITEA_HOSTS.has(normalizedHost) ||
    normalizedHost === enterpriseGitHubHost ||
    normalizedHost.endsWith('.visualstudio.com')
  ) {
    return null
  }

  const parsed = parsePath(path)
  if (!parsed) {
    return null
  }

  // Why: Gitea/Forgejo can be hosted below a URL subpath. SSH-style remotes
  // carry that base path in the repo path, so derive the web/API base here.
  const webBaseUrl = parsed.basePath
    ? `${webOrigin.replace(/\/+$/, '')}/${parsed.basePath}`
    : webOrigin
  return {
    host: normalizedHost,
    owner: parsed.owner,
    repo: parsed.repo,
    apiBaseUrl: apiBaseUrlFromWebBase(webBaseUrl),
    webBaseUrl
  }
}

export function parseGiteaRepoRef(remoteUrl: string): GiteaRepoRef | null {
  const trimmed = remoteUrl.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const scpLike = trimmed.match(/^(?:[^@/:]+@)?([^:\s/]+):([^\s]+?)(?:\.git)?$/)
    if (scpLike) {
      const host = scpLike[1]
      const path = scpLike[2]
      return makeRepoRef(host, path, `https://${host.toLowerCase()}`)
    }
  }

  try {
    const url = new URL(trimmed)
    const protocol = url.protocol.toLowerCase()
    if (!['http:', 'https:', 'ssh:', 'git+ssh:'].includes(protocol)) {
      return null
    }

    const parsed = parsePath(url.pathname)
    if (!parsed) {
      return null
    }

    const webOrigin =
      protocol === 'http:' || protocol === 'https:'
        ? `${protocol}//${url.host}`
        : `https://${url.hostname.toLowerCase()}`
    return makeRepoRef(url.hostname, url.pathname, webOrigin)
  } catch {
    return null
  }
}

export async function getGiteaRepoRefForRemote(
  repoPath: string,
  remoteName: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GiteaRepoRef | null> {
  return repoRefProbeCache.get(repoPath, remoteName, connectionId, localGitOptions)
}

export async function getGiteaRepoRef(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GiteaRepoRef | null> {
  return getGiteaRepoRefForRemote(repoPath, 'origin', connectionId, localGitOptions)
}
