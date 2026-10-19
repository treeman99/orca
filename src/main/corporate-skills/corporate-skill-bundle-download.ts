// Fetches the bundle's files at one commit, each as a git blob checked against the hash
// the tree listing promised.
//
// Blobs rather than the zipball: the `gh` runner decodes stdout as text, so an archive
// comes back mangled, while a blob arrives as base64 inside JSON on the same `gh api` road
// (host, token, rate-limit breaker). Nothing is written from a name the server chose —
// every path comes from the validated tree listing.

import { gitBlobSha } from '../../shared/skill-git-tree-identity'
import { ghExecFileAsync } from '../github/gh-utils'
import type { GhApiReader } from '../app-update/enterprise-release-lookup'
import type { CorporateRemoteBundle } from './corporate-skill-bundle-remote'

const BLOB_TIMEOUT_MS = 30_000
const BLOB_CONCURRENCY = 4

/** Skill name → path inside the skill folder → verified bytes. */
export type CorporateSkillBundleFiles = Map<string, Map<string, Buffer>>

async function readGhBlobApi(path: string, host: string): Promise<unknown> {
  const { stdout } = await ghExecFileAsync(['api', path], { host, timeout: BLOB_TIMEOUT_MS })
  return JSON.parse(stdout) as unknown
}

function decodeBlob(response: unknown): Buffer | undefined {
  if (
    typeof response !== 'object' ||
    response === null ||
    !('content' in response) ||
    !('encoding' in response)
  ) {
    return undefined
  }
  const { content, encoding } = response
  return typeof content === 'string' && encoding === 'base64'
    ? Buffer.from(content, 'base64')
    : undefined
}

export async function downloadCorporateSkillBundle(
  bundle: CorporateRemoteBundle,
  deps: { readApi?: GhApiReader } = {}
): Promise<CorporateSkillBundleFiles> {
  const readApi = deps.readApi ?? readGhBlobApi
  const jobs = bundle.skills.flatMap((skill) => skill.files.map((file) => ({ skill, file })))
  const result: CorporateSkillBundleFiles = new Map(
    bundle.skills.map((skill) => [skill.name, new Map<string, Buffer>()])
  )
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const { skill, file } = jobs[next++]
      const bytes = decodeBlob(
        await readApi(`repos/${bundle.repository}/git/blobs/${file.blobSha}`, bundle.host)
      )
      if (!bytes || gitBlobSha(bytes).toString('hex') !== file.blobSha) {
        throw new Error(
          `skills/${skill.name}/${file.path} does not match commit ${bundle.commitSha}`
        )
      }
      result.get(skill.name)?.set(file.path, bytes)
    }
  }
  await Promise.all(Array.from({ length: Math.min(BLOB_CONCURRENCY, jobs.length) }, worker))
  return result
}
