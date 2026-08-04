import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

import WebSocket from 'ws'
import { deriveSharedKey, encrypt, generateKeyPair, publicKeyFromBase64 } from './rpc/e2ee-crypto'
import { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

// Drives a real direct WebSocket through the handshake and then authenticates with a
// token the device registry does not know — the 4001/Unauthorized close that feeds the
// unpaired-device throttle.
async function failDirectAuthOnce(server: OrcaRuntimeRpcServer): Promise<void> {
  const endpoint = server.getWebSocketEndpoint()
  const desktopPublicKeyB64 = server.getE2EEPublicKey()
  if (!endpoint || !desktopPublicKeyB64) {
    throw new Error('WebSocket transport did not start')
  }
  const phone = generateKeyPair()
  const sharedKey = deriveSharedKey(phone.secretKey, publicKeyFromBase64(desktopPublicKeyB64))
  const socket = new WebSocket(endpoint.replace('0.0.0.0', '127.0.0.1'))
  await new Promise<void>((resolve, reject) => {
    socket.on('error', reject)
    socket.on('close', () => resolve())
    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: Buffer.from(phone.publicKey).toString('base64')
        })
      )
    })
    socket.on('message', (data) => {
      if (!String(data).includes('e2ee_ready')) {
        return
      }
      socket.send(
        encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: 'never-paired' }), sharedKey)
      )
    })
  })
}

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

  // The prompt this raises tells the user to "re-pair it from Settings → Mobile" — a pane
  // the policy removed. Gating the producer covers `orca serve` and the renderer alike.
  it('does not raise the unpaired-device re-pair prompt under lockdown', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    server = await startServer()
    const onUnpaired = vi.fn()
    server.setOnUnpairedDeviceAuthFailure(onUnpaired)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await failDirectAuthOnce(server)
    }

    expect(onUnpaired).not.toHaveBeenCalled()
  })

  it('still raises the unpaired-device prompt when no policy disables pairing', async () => {
    server = await startServer()
    const onUnpaired = vi.fn()
    server.setOnUnpairedDeviceAuthFailure(onUnpaired)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await failDirectAuthOnce(server)
    }

    expect(onUnpaired).toHaveBeenCalledTimes(1)
  })

  it('leaves mobile pairing alone when only the cloud relay is disabled', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ disableCloudRelay: true }))
    server = await startServer()

    expect(server.createPairingOffer({ name: 'Phone', scope: 'mobile' })).toMatchObject({
      available: true
    })
  })
})
