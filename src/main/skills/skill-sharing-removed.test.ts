// Replaces the upstream suites that asserted the vendor round-trip this build removes:
// skill-cloud-request.test.ts, skill-cloud-service.test.ts, and skill-package-download.test.ts.
// They come back on every sync — delete them again rather than reviving the lane they cover.
// What matters now is the negative (nothing reaches the network, on any of the three execution
// contexts) plus the positive (the local lanes the fleet still needs are untouched).
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false }
}))

import { isAgentSkillSharingEnabled } from '../../shared/agent-skill-sharing-gate'
import { SKILL_SHARING_REMOVED_MESSAGE } from '../../shared/skill-sharing-removal'
import { parseSkillShareId, skillShareIdFromArguments } from '../../shared/skill-share-link'
import { clearSkillRootScanCache, discoverSkills } from './discovery'
import { listManagedSkillInstalls } from './skill-install-provenance'
import { downloadSkillPackageGrant } from './skill-package-download'
import { SkillCloudService } from './skill-cloud-service'

const createdPaths: string[] = []

async function makeTemporaryPath(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  createdPaths.push(path)
  return path
}

function publishRequest(): Parameters<SkillCloudService['publishVersion']>[0] {
  return {
    archivePath: '/tmp/package.tar.gz',
    archiveSha256: 'a'.repeat(64),
    compressedBytes: 2048,
    packageId: 'package_1',
    releaseNotes: 'first release'
  }
}

describe('skill sharing removal', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error('skill code reached the network')
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    while (createdPaths.length > 0) {
      await rm(createdPaths.pop()!, { recursive: true, force: true })
    }
  })

  it('opens no request from any SkillCloudService method that reaches the share host', async () => {
    const service = new SkillCloudService(await makeTemporaryPath('orca-skill-removed-'))
    const options = {}

    const settled = await Promise.allSettled([
      service.publish(publishRequest()),
      service.publishVersion(publishRequest()),
      service.createShare('package_1', options),
      service.resolveShare('share_1', options),
      service.createDownloadGrant('share_1', options),
      service.createPackageVersionDownloadGrant('package_1', 'version_1', options),
      service.getPackage('package_1', options),
      service.listOwnedShares(options),
      service.revokeShare('share_1', options),
      service.deleteVersion('package_1', 'version_1', options),
      service.deletePackage('package_1', options)
    ])

    expect(settled).toHaveLength(11)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still opens no request when the device setting that gates upstream publishing is on', async () => {
    // `true` on purpose. Upstream's only switch is this user setting, it is two clicks away, and
    // the anonymous resolve/grant lanes never consult it at all.
    expect(isAgentSkillSharingEnabled({ agentSkillSharingEnabled: true })).toBe(true)
    const service = new SkillCloudService(await makeTemporaryPath('orca-skill-removed-'))

    await Promise.allSettled([
      service.publishVersion(publishRequest()),
      service.resolveShare('share_1', {})
    ])

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still refuses when a caller supplies its own API URL and auth token', async () => {
    // The dev override in skill-cloud-auth.ts runs ahead of the cloud-config check, so a block
    // placed after it would be bypassed here. Loopback is an allowed host, which is the sharp case.
    const service = new SkillCloudService(await makeTemporaryPath('orca-skill-removed-'))
    const options = { apiUrl: 'http://localhost:3000', authToken: 'token-from-the-caller' }

    await expect(service.resolveShare('share_1', options)).rejects.toThrow(
      SKILL_SHARING_REMOVED_MESSAGE
    )
    await expect(service.publishVersion({ ...publishRequest(), ...options })).rejects.toThrow(
      SKILL_SHARING_REMOVED_MESSAGE
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a well-formed unexpired storage grant without opening a request', async () => {
    // Guard B covers desktop, relay, and headless `orca serve` at once: RPC `skills.install` and
    // the relay install handlers take this URL from the caller and are otherwise ungated.
    const fetcher = vi.fn() as unknown as typeof fetch

    await expect(
      downloadSkillPackageGrant({
        url: 'https://storage.googleapis.com/orca-skill-packages/package.tar.gz?signature=valid',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        expectedArchiveSha256: 'b'.repeat(64),
        expectedCompressedBytes: 4096,
        temporaryRoot: await makeTemporaryPath('orca-skill-download-'),
        allowedOrigins: ['https://storage.googleapis.com'],
        requireHttps: true,
        fetcher
      })
    ).rejects.toThrow('skill-download-sharing-removed')

    expect(fetcher).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves no share link, whichever entry point the id arrives through', () => {
    expect(parseSkillShareId('https://app.orca.dev/skills/share/share_123')).toBeNull()
    expect(parseSkillShareId('https://share.onorca.dev/skills/share/share_123/')).toBeNull()
    expect(parseSkillShareId('orca://skills/share/share_123')).toBeNull()
    expect(parseSkillShareId('share_123')).toBeNull()
    // `open-url` and both argv captures in src/main/startup/skill-share-deep-link-state.ts go
    // through this one function.
    expect(skillShareIdFromArguments(['orca://skills/share/share_123'])).toBeNull()
  })

  it('leaves skill discovery working, because over-blocking it is the regression', async () => {
    const home = await makeTemporaryPath('orca-skill-live-')
    const skill = join(home, '.agents', 'skills', 'local-skill')
    await mkdir(skill, { recursive: true })
    await writeFile(
      join(skill, 'SKILL.md'),
      '---\nname: local-skill\ndescription: Still discoverable\n---\n\n# Local\n'
    )

    clearSkillRootScanCache()
    const result = await discoverSkills({ homeDir: home, refresh: true })

    expect(result.skills.map((entry) => entry.name)).toContain('local-skill')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaves the managed-install inventory readable, so what a machine already has stays auditable', async () => {
    const stateDirectory = await makeTemporaryPath('orca-skill-installs-')
    await mkdir(join(stateDirectory, 'receipts'), { recursive: true })

    await expect(listManagedSkillInstalls(stateDirectory)).resolves.toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
