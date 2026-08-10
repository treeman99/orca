// Replaces the upstream artifact-cloud-service suites, which asserted the vendor round-trip this
// build removes. What matters now is the negative: no method reaches the network, and none of them
// depends on the user setting or on an absent cloud session to stay quiet.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false }
}))

import { ARTIFACT_SHARING_REMOVED_MESSAGE } from '../../shared/artifact-sharing-removal'
import { ArtifactCloudService } from './artifact-cloud-service'

const createdPaths: string[] = []

async function makeUserDataPath(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'orca-artifact-removed-'))
  createdPaths.push(path)
  return path
}

function writeRequest(): {
  sourceKey: string
  content: string
  contentType: 'text/html'
  fileName: string
} {
  return {
    sourceKey: '/tmp/report.html',
    content: '<h1>quarterly numbers</h1>',
    contentType: 'text/html',
    fileName: 'report.html'
  }
}

describe('artifact sharing removal', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error('artifact code reached the network')
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    while (createdPaths.length > 0) {
      await rm(createdPaths.pop()!, { recursive: true, force: true })
    }
  })

  it('refuses every cloud method without opening a request', async () => {
    const userDataPath = await makeUserDataPath()
    // `true` on purpose: the block must not rest on the user-facing capability toggle, which a
    // user can flip in Settings.
    const service = new ArtifactCloudService(userDataPath, () => true)
    const request = writeRequest()

    const results = [
      await service.list({}),
      await service.getPublishedLink({ sourceKey: request.sourceKey }),
      await service.share(request),
      await service.publish(request),
      await service.update(request),
      await service.unshare({ sourceKey: request.sourceKey }),
      await service.delete('slug-1', {})
    ]

    for (const result of results) {
      expect(result).toEqual({
        status: 'unconfigured',
        message: ARTIFACT_SHARING_REMOVED_MESSAGE
      })
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still refuses when a caller supplies its own API URL and token', async () => {
    // The dev-build override normally bypasses the cloud auth config, so it would bypass a block
    // placed after it. Loopback is an allowed host, which is what makes this the sharp case.
    const userDataPath = await makeUserDataPath()
    const service = new ArtifactCloudService(userDataPath, () => true)

    const result = await service.list({
      apiUrl: 'http://localhost:3000',
      authToken: 'token-from-the-caller'
    })

    expect(result).toEqual({
      status: 'unconfigured',
      message: ARTIFACT_SHARING_REMOVED_MESSAGE
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
