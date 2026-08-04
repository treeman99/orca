import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/orca-test-userdata' }
}))

const existsSyncMock = vi.fn((_path: string) => false)
const statSyncMock = vi.fn((_path: string) => ({ size: 0 }))

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  createWriteStream: vi.fn(),
  existsSync: (path: string) => existsSyncMock(path),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: (path: string) => statSyncMock(path)
}))

const httpsGetMock = vi.fn(() => {
  throw new Error('network reached')
})

vi.mock('node:https', () => ({
  get: (...args: unknown[]) => httpsGetMock(...(args as []))
}))

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())

vi.mock('../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

import { EmulatorError } from '../emulator-errors'
import { ensureScrcpyServerJar, scrcpyServerJarPath } from './scrcpy-server-download'

describe('scrcpy server jar download under enterprise policy', () => {
  beforeEach(() => {
    httpsGetMock.mockClear()
    existsSyncMock.mockReturnValue(false)
    statSyncMock.mockReturnValue({ size: 0 })
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('refuses the github.com download under lockdown instead of bypassing the proxy', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    const error = await ensureScrcpyServerJar().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(EmulatorError)
    expect((error as EmulatorError).code).toBe('emulator_disabled')
    expect((error as EmulatorError).message).toContain('lockdown')
    expect((error as EmulatorError).message).toContain('github.com')
    expect(httpsGetMock).not.toHaveBeenCalled()
  })

  it('refuses when the allowlist does not cover github.com', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({
        enforceNetworkAllowlist: true,
        allowedNetworkHosts: ['github.corp.test']
      })
    )

    const error = await ensureScrcpyServerJar().catch((thrown: unknown) => thrown)

    expect((error as EmulatorError).message).toContain('allowedNetworkHosts')
    expect(httpsGetMock).not.toHaveBeenCalled()
  })

  it('still serves a jar an administrator staged locally', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 500_000 })

    await expect(ensureScrcpyServerJar()).resolves.toBe(scrcpyServerJarPath())
    expect(httpsGetMock).not.toHaveBeenCalled()
  })

  it('downloads normally without an enterprise policy', async () => {
    const error = await ensureScrcpyServerJar().catch((thrown: unknown) => thrown)

    expect(httpsGetMock).toHaveBeenCalledTimes(1)
    expect((error as EmulatorError).code).toBe('emulator_helper_failed')
  })
})
