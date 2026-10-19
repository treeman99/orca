// Fork-owned: v1.4.230 gave `managedRuntime.install` its first real destination (the Antigravity
// ACP server from dl.google.com). `disableRuntimeDownloads` already stops the fetch; this pins the
// second layer — an agent outside `allowedAgents` gets no installation at all, even on a fleet
// that turned runtime downloads back on.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy } from '../../../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  constructed: vi.fn(),
  install: vi.fn()
}))

vi.mock('../../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

vi.mock('../../../node-runtime/managed-runtime-installation', () => ({
  ManagedRuntimeInstallation: class {
    constructor(agent: string) {
      mocks.constructed(agent)
    }
    install(): void {
      mocks.install()
    }
    async status(): Promise<{ revision: number }> {
      return { revision: 0 }
    }
  }
}))

import { AGENT_BLOCKED_BY_POLICY } from '../../../enterprise/agent-allowlist-guard'
import { OrcaRuntimeService } from '../../orca-runtime'
import { eraseRpcMethods, isStreamingMethod } from '../core'
import { MANAGED_RUNTIME_INSTALL_METHODS } from './managed-runtime-install'

function installMethod() {
  const method = eraseRpcMethods(MANAGED_RUNTIME_INSTALL_METHODS).find(
    (candidate) => candidate.name === 'managedRuntime.install'
  )
  if (!method || isStreamingMethod(method)) {
    throw new Error('managedRuntime.install must be a request method')
  }
  return method
}

describe('managedRuntime.install under the agent allowlist', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
    mocks.constructed.mockReset()
    mocks.install.mockReset()
  })

  it('refuses an agent the policy does not allow before creating an installation', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: ['claude'] }))

    await expect(
      installMethod().handler({ agent: 'antigravity' }, { runtime: new OrcaRuntimeService() })
    ).rejects.toThrow(AGENT_BLOCKED_BY_POLICY)
    expect(mocks.constructed).not.toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('installs an allowed agent', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'antigravity'] })
    )

    await installMethod().handler({ agent: 'antigravity' }, { runtime: new OrcaRuntimeService() })

    expect(mocks.constructed).toHaveBeenCalledWith('antigravity')
    expect(mocks.install).toHaveBeenCalledTimes(1)
  })
})
