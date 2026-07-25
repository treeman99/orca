import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeEnterprisePolicy, makeLockdownPolicy } from './enterprise-policy-fixture'

const configureHostResolverMock = vi.fn()

vi.mock('electron', () => ({
  app: {
    configureHostResolver: (options: unknown) => configureHostResolverMock(options)
  }
}))

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())

vi.mock('./enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

import { applyEnterpriseSecureDnsPolicy } from './enterprise-secure-dns'

describe('enterprise secure DNS gate', () => {
  beforeEach(() => {
    configureHostResolverMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('leaves host resolution alone without a lockdown policy', () => {
    applyEnterpriseSecureDnsPolicy()

    expect(configureHostResolverMock).not.toHaveBeenCalled()
  })

  it('disables DNS-over-HTTPS under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    applyEnterpriseSecureDnsPolicy()

    expect(configureHostResolverMock).toHaveBeenCalledWith({ secureDnsMode: 'off' })
  })

  it('stays opt-in: an allowlist without lockdown does not touch the resolver', () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ enforceNetworkAllowlist: true, allowedNetworkHosts: ['corp.test'] })
    )

    applyEnterpriseSecureDnsPolicy()

    expect(configureHostResolverMock).not.toHaveBeenCalled()
  })

  it('does not abort startup when Electron rejects the call', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    configureHostResolverMock.mockImplementation(() => {
      throw new Error('called before ready')
    })
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    expect(() => applyEnterpriseSecureDnsPolicy()).not.toThrow()
    expect(String(stderr.mock.calls[0]?.[0])).toContain('DNS-over-HTTPS')

    stderr.mockRestore()
  })
})
