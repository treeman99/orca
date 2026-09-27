// Fork-owned: proves `disableRuntimeDownloads` stops the Bun runtime fetch from GitHub Releases
// that SSH relay deploy and the WSL session scan trigger with no user action. Kept apart from
// upstream's materializer suite so a split of that file cannot carry the gate test away.
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { ORCAD_BUN_RUNTIME_FILENAME } from '../../shared/orcad-artifacts'
import { ORCAD_BUN_RELEASE_ASSETS, ORCAD_BUN_VERSION } from '../../shared/orcad-bun-runtime'
import { materializeCachedOrcadBunRuntime } from './orcad-bun-runtime-materializer'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  executable: new Uint8Array()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

vi.mock('../../shared/child-process/run-process', () => ({
  runProcess: vi.fn(async (spec: { args: string[] }) => {
    const extracted = join(spec.args.at(-1)!, 'bun-linux-x64')
    await mkdir(extracted, { recursive: true })
    await writeFile(join(extracted, 'bun'), mocks.executable)
    return { code: 0, stdout: '', stderr: '' }
  })
}))

const TARGET = 'linux-x64-glibc' as const
const originalAsset = { ...ORCAD_BUN_RELEASE_ASSETS[TARGET] }
const archive = new TextEncoder().encode('pinned archive')
let cacheRoot = ''

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function archiveFetcher() {
  return vi.fn<typeof fetch>(async () => new Response(Buffer.from(archive), { status: 200 }))
}

beforeEach(async () => {
  mocks.getEnterprisePolicy.mockReset()
  mocks.executable = new TextEncoder().encode('pinned bun executable')
  Object.assign(ORCAD_BUN_RELEASE_ASSETS[TARGET], {
    sha256: sha256(archive),
    executableSha256: sha256(mocks.executable)
  })
  cacheRoot = await mkdtemp(join(tmpdir(), 'orca-bun-runtime-policy-'))
})

afterEach(async () => {
  Object.assign(ORCAD_BUN_RELEASE_ASSETS[TARGET], originalAsset)
  await rm(cacheRoot, { recursive: true, force: true })
})

describe('Bun runtime download under enterprise policy', () => {
  it('never fetches the runtime under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const fetcher = archiveFetcher()

    await expect(materializeCachedOrcadBunRuntime(TARGET, cacheRoot, { fetcher })).rejects.toThrow(
      'disabled by enterprise policy'
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('still serves a verified cached runtime under lockdown — that is local', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const runtimeDir = join(cacheRoot, 'bun', `v${ORCAD_BUN_VERSION}`, TARGET)
    await mkdir(runtimeDir, { recursive: true })
    await writeFile(join(runtimeDir, ORCAD_BUN_RUNTIME_FILENAME), mocks.executable)
    const fetcher = archiveFetcher()

    await expect(materializeCachedOrcadBunRuntime(TARGET, cacheRoot, { fetcher })).resolves.toBe(
      join(runtimeDir, ORCAD_BUN_RUNTIME_FILENAME)
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('downloads the runtime when no policy disables it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const fetcher = archiveFetcher()

    await materializeCachedOrcadBunRuntime(TARGET, cacheRoot, { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
