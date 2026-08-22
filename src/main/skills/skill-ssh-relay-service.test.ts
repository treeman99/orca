import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IPtyProvider } from '../providers/pty-provider-contract'
import { installSkillOnSshHost } from './skill-ssh-relay-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function userDataPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-skill-ssh-client-test-'))
  roots.push(root)
  return root
}

function result() {
  return {
    operationId: 'operation_1',
    status: 'installed' as const,
    name: 'ssh-skill',
    packageDigest: 'a'.repeat(64),
    placements: []
  }
}

function request(bytes: Buffer) {
  return {
    operationId: 'operation_1',
    package: {
      packageId: 'package_1',
      versionId: 'version_1',
      packageDigest: 'a'.repeat(64),
      archiveSha256: createHash('sha256').update(bytes).digest('hex'),
      compressedBytes: bytes.length
    },
    ingress: {
      kind: 'download-grant' as const,
      url: 'https://storage.googleapis.com/test/package.tar.gz',
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    },
    destination: { scope: 'global' as const, executionTarget: { kind: 'host' as const } }
  }
}

// The client-mediated upload fallbacks upstream asserts here all began with the desktop
// downloading a vendor grant; they went with the sharing removal. Capability negotiation stays.
describe('installSkillOnSshHost', () => {
  it('does not reuse newer capabilities after reconnecting to an older host', async () => {
    const secondRpc = vi.fn(async (_method: string) => ({ capabilities: [] }))
    const secondProvider = { requestHostRpc: secondRpc } as unknown as IPtyProvider
    let currentProvider: IPtyProvider
    const firstRpc = vi.fn(async (method: string) => {
      if (method === 'relay.status') {
        return { capabilities: ['skills.install.v1'] }
      }
      currentProvider = secondProvider
      throw new Error('disconnected-provider-generation')
    })
    currentProvider = { requestHostRpc: firstRpc } as unknown as IPtyProvider

    await expect(
      installSkillOnSshHost({
        provider: () => currentProvider,
        userDataPath: await userDataPath(),
        request: request(Buffer.from('archive')),
        requireHttps: true
      })
    ).rejects.toThrow('skill-install-ssh-update-required')
    expect(secondRpc.mock.calls.map(([method]) => method)).toEqual(['relay.status'])
  })

  it('requires a relay update before sending an explicit provider choice', async () => {
    const requestHostRpc = vi.fn(async () => ({ capabilities: ['skills.install.v1'] }))
    await expect(
      installSkillOnSshHost({
        provider: { requestHostRpc } as unknown as IPtyProvider,
        userDataPath: await userDataPath(),
        request: { ...request(Buffer.from('archive')), providers: ['claude'] },
        requireHttps: true
      })
    ).rejects.toThrow('skill-install-ssh-update-required')
    expect(requestHostRpc).toHaveBeenCalledOnce()
  })

  it('does not call unknown install methods on an old relay', async () => {
    const requestHostRpc = vi.fn(async () => ({ capabilities: [] }))
    await expect(
      installSkillOnSshHost({
        provider: { requestHostRpc } as unknown as IPtyProvider,
        userDataPath: await userDataPath(),
        request: request(Buffer.from('archive')),
        requireHttps: true
      })
    ).rejects.toThrow('skill-install-ssh-update-required')
    expect(requestHostRpc).toHaveBeenCalledOnce()
  })

  it('retries an idempotent direct install after its response is lost', async () => {
    const bytes = Buffer.from('private skill archive')
    let installAttempts = 0
    const requestHostRpc = vi.fn(async (method: string) => {
      if (method === 'relay.status') {
        return { capabilities: ['skills.install.v1', 'skills.upload.v1'] }
      }
      if (method === 'skills.install') {
        installAttempts += 1
        if (installAttempts === 1) {
          throw new Error('connection dropped after host commit')
        }
        return { ...result(), status: 'unchanged' }
      }
      throw new Error(`unexpected method ${method}`)
    })

    await expect(
      installSkillOnSshHost({
        provider: { requestHostRpc } as unknown as IPtyProvider,
        userDataPath: await userDataPath(),
        request: request(bytes),
        requireHttps: true
      })
    ).resolves.toMatchObject({ status: 'unchanged' })
    expect(installAttempts).toBe(2)
  })
})
