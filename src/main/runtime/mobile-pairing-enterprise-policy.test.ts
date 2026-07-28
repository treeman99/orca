import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

import { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

async function startServer(): Promise<OrcaRuntimeRpcServer> {
  const server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath: mkdtempSync(join(tmpdir(), 'orca-mobile-policy-')),
    enableWebSocket: true,
    wsPort: 0
  })
  await server.start()
  return server
}

describe('mobile pairing under the enterprise policy', () => {
  let server: OrcaRuntimeRpcServer | null = null

  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  afterEach(async () => {
    await server?.stop()
    server = null
  })

  it('refuses a mobile offer when the policy disables pairing', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    server = await startServer()

    expect(server.createPairingOffer({ name: 'Phone', scope: 'mobile' })).toMatchObject({
      available: false,
      reason: 'disabled_by_policy'
    })
  })

  // `disableCloudRelay` only removes the vendor relay; the LAN offer it leaves behind
  // pairs a phone just as well, which is why this path needs its own switch.
  it('refuses the relay-backed mobile offer too', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    server = await startServer()

    await expect(
      server.createMobilePairingOffer({ name: 'Phone', connectionMode: 'local-only' })
    ).resolves.toMatchObject({ available: false, reason: 'disabled_by_policy' })
  })

  // Over-blocking is the other failure mode: the CLI and the desktop web client pair
  // with scope 'runtime' and must keep working on a locked-down machine.
  it('still issues a runtime-scoped offer under lockdown', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    server = await startServer()

    expect(server.createPairingOffer({ name: 'CLI' })).toMatchObject({ available: true })
  })

  it('issues a mobile offer when no policy disables pairing', async () => {
    server = await startServer()

    expect(server.createPairingOffer({ name: 'Phone', scope: 'mobile' })).toMatchObject({
      available: true
    })
  })

  it('leaves mobile pairing alone when only the cloud relay is disabled', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ disableCloudRelay: true }))
    server = await startServer()

    expect(server.createPairingOffer({ name: 'Phone', scope: 'mobile' })).toMatchObject({
      available: true
    })
  })
})
