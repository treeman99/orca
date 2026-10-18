// Fork-owned: v1.4.229 added a user-triggered managed runtime install (`managedRuntime.install`)
// that downloads, unpacks and starts a vendor release. It funnels into the same
// downloadVerifiedArchiveOnce gate as the pinned Node runtime; this proves the new caller stops
// there under `disableRuntimeDownloads` before any byte is fetched or anything is unpacked.
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { installRuntimeRelease } from './managed-runtime-release-install'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

const pin = {
  version: '1.0.0',
  url: 'https://example.invalid/agent-runtime-1.0.0.zip',
  archiveSha256: '0'.repeat(64),
  archiveBytes: 16,
  members: [{ path: 'agent-server', sha256: '0'.repeat(64), bytes: 8 }]
}
let root = ''

function install(fetcher: typeof fetch) {
  return installRuntimeRelease({
    agent: 'agent',
    runtime: { label: 'Agent', validate: vi.fn(async () => {}) },
    root,
    pin,
    fetcher,
    signal: new AbortController().signal,
    publish: vi.fn(),
    commit: vi.fn()
  })
}

beforeEach(async () => {
  mocks.getEnterprisePolicy.mockReset()
  root = await mkdtemp(join(tmpdir(), 'orca-managed-runtime-policy-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('managed runtime install under enterprise policy', () => {
  it('never fetches the release archive under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const fetcher = vi.fn<typeof fetch>(async () => new Response('archive', { status: 200 }))

    await expect(install(fetcher)).rejects.toThrow('disabled by enterprise policy')
    expect(fetcher).not.toHaveBeenCalled()
    // Nothing was published: the staging folder is gone and no release folder exists.
    expect(await readdir(root)).toEqual([])
  })

  it('reaches the fetch when the policy allows downloads', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error('network stubbed out')
    })

    await expect(install(fetcher)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalled()
  })
})
