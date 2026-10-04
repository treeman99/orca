// Fork-owned: proves `disableRuntimeDownloads` stops the pinned Node runtime fetch that SSH relay
// deploy, WSL and OpenCode preparation trigger with no user action. Kept apart from upstream's
// materializer suite so a split of that file cannot carry the gate test away.
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { NODE_RUNTIME_ASSETS, nodeRuntimeExecutablePath } from '../../shared/node-runtime-pin'
import {
  materializeCachedNodeRuntime,
  materializeNodeRuntimeArchive
} from './pinned-runtime-materializer'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  executable: new Uint8Array(),
  member: ''
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

vi.mock('../../shared/child-process/run-process', () => ({
  runProcess: vi.fn(async (spec: { args: string[] }) => {
    const flag = spec.args.includes('-C') ? '-C' : '-d'
    const extracted = join(spec.args[spec.args.indexOf(flag) + 1]!, ...mocks.member.split('/'))
    await mkdir(join(extracted, '..'), { recursive: true })
    await writeFile(extracted, mocks.executable)
    return { code: 0, stdout: '', stderr: '' }
  })
}))

const TARGET = 'linux-x64-glibc' as const
const originalAsset = structuredClone(NODE_RUNTIME_ASSETS[TARGET])
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
  mocks.executable = new TextEncoder().encode('pinned node executable')
  Object.assign(NODE_RUNTIME_ASSETS[TARGET], {
    archiveSha256: sha256(archive),
    executableSha256: sha256(mocks.executable)
  })
  mocks.member = nodeRuntimeExecutablePath(TARGET, NODE_RUNTIME_ASSETS[TARGET].archive)
  cacheRoot = await mkdtemp(join(tmpdir(), 'orca-node-runtime-policy-'))
})

afterEach(async () => {
  Object.assign(NODE_RUNTIME_ASSETS[TARGET], originalAsset)
  await rm(cacheRoot, { recursive: true, force: true })
})

describe('pinned Node runtime download under enterprise policy', () => {
  it('never fetches the runtime executable under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const fetcher = archiveFetcher()

    await expect(materializeCachedNodeRuntime(TARGET, cacheRoot, { fetcher })).rejects.toThrow(
      'disabled by enterprise policy'
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('never fetches the runtime archive under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const fetcher = archiveFetcher()

    await expect(materializeNodeRuntimeArchive(TARGET, cacheRoot, { fetcher })).rejects.toThrow(
      'disabled by enterprise policy'
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('still serves a verified cached runtime under lockdown — that is local', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const runtimeDir = join(cacheRoot, 'node', NODE_RUNTIME_ASSETS[TARGET].executableSha256)
    await mkdir(runtimeDir, { recursive: true })
    await writeFile(join(runtimeDir, 'node'), mocks.executable)
    const fetcher = archiveFetcher()

    await expect(materializeCachedNodeRuntime(TARGET, cacheRoot, { fetcher })).resolves.toBe(
      join(runtimeDir, 'node')
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('downloads the runtime when no policy disables it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const fetcher = archiveFetcher()

    await materializeCachedNodeRuntime(TARGET, cacheRoot, { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
