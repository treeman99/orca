// Fork-owned: v1.4.232 lets a POSIX SSH/WSL host download Node itself whenever this computer's
// download fails. Under `disableRuntimeDownloads` this computer's download is refused by policy, so
// without a gate the refusal became the trigger for the host to fetch nodejs.org directly.
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'
import { materializeVerifiedRuntimeArchive } from '../../node-runtime/pinned-runtime-materializer'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import { stageNodeRuntimeArchive } from './remote-node-runtime-host-download'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

const LINUX_HOST = getRemoteHostPlatform('linux-x64')
const archive = {
  label: 'Node.js',
  url: 'https://example.invalid/node-v1.0.0-linux-x64.tar.xz',
  archiveSha256: '0'.repeat(64)
}
let cacheDir = ''

function stage(archivePath: () => Promise<string>, exec = vi.fn(async () => '')) {
  return {
    exec,
    staged: stageNodeRuntimeArchive({
      host: LINUX_HOST,
      target: 'linux-x64-glibc',
      stageDir: '/tmp/orca-stage',
      archivePath,
      exec,
      upload: vi.fn(async () => {}),
      onLocalStage: vi.fn()
    })
  }
}

beforeEach(async () => {
  mocks.getEnterprisePolicy.mockReset()
  cacheDir = await mkdtemp(join(tmpdir(), 'orca-host-node-policy-'))
})

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true })
})

describe('host-side Node download under enterprise policy', () => {
  it('keeps the policy refusal itself instead of rewording it as an unreachable network', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const fetcher = vi.fn<typeof fetch>()

    await expect(
      materializeVerifiedRuntimeArchive(archive, cacheDir, { fetcher })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/disabled by enterprise policy$/),
      code: 'ORCA_RUNTIME_DOWNLOAD_DISABLED_BY_POLICY'
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect((await readdir(cacheDir)).filter((name) => name.startsWith('.download-'))).toEqual([])
  })

  it('never hands a refused download to the host under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const refusal = new Error('Node.js runtime download is disabled by enterprise policy')
    const { exec, staged } = stage(async () => {
      throw refusal
    })

    await expect(staged).rejects.toBe(refusal)
    expect(exec).not.toHaveBeenCalled()
  })

  it('lets the host download when the policy permits runtime downloads', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const { exec, staged } = stage(
      async () => {
        throw new Error('net::ERR_CONNECTION_REFUSED')
      },
      vi.fn(async () => {
        throw new Error('host exec stubbed out')
      })
    )

    await expect(staged).rejects.toThrow()
    expect(exec).toHaveBeenCalled()
  })
})
