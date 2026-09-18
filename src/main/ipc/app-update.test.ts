// The diagnostic channel is deliberately ungated, so its contract needs stating: it
// answers under a lockdown policy and it never reaches the corporate host to do so.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, getEnterprisePolicyMock, ghExecFileAsyncMock, storedHostMock } = vi.hoisted(
  () => ({
    handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
    getEnterprisePolicyMock: vi.fn(),
    ghExecFileAsyncMock: vi.fn(),
    storedHostMock: vi.fn()
  })
)

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }
  },
  app: { getVersion: () => '1.4.186' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('../github/gh-utils', () => ({ ghExecFileAsync: ghExecFileAsyncMock }))
vi.mock('../github/github-enterprise-host-store', () => ({
  readStoredGithubEnterpriseHost: () => storedHostMock()
}))

import { registerAppUpdateHandlers } from './app-update'
import { resetAppUpdateCheckServiceForTests } from '../app-update/app-update-check-service'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const HOST = 'github.samsungds.net'

/** Left as `unknown`: the assertions below compare the whole object, so nothing needs a cast. */
function invokeLookupTarget(): unknown {
  const handler = handlers.get('appUpdate:getLookupTarget')
  if (!handler) {
    throw new Error('appUpdate:getLookupTarget was not registered')
  }
  return handler({})
}

beforeEach(() => {
  handlers.clear()
  resetAppUpdateCheckServiceForTests()
  ghExecFileAsyncMock.mockReset()
  storedHostMock.mockReset().mockReturnValue(null)
  getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  delete process.env.GH_HOST
})

// Registering the handlers also starts the scheduler; drop it so no timer outlives the file.
afterEach(() => {
  resetAppUpdateCheckServiceForTests()
})

describe('registerAppUpdateHandlers', () => {
  it('registers the lane, the diagnostic included', () => {
    registerAppUpdateHandlers()
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        'appUpdate:getStatus',
        'appUpdate:check',
        'appUpdate:getLookupTarget',
        'appUpdate:dismissVersion',
        'appUpdate:openReleasePage'
      ])
    )
  })

  it('reports the resolved coordinate without touching gh', () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ githubEnterpriseHost: HOST }))
    registerAppUpdateHandlers()

    expect(invokeLookupTarget()).toEqual({ host: HOST, repository: 'daegun-kim/Orca_ds' })
    expect(ghExecFileAsyncMock).not.toHaveBeenCalled()
  })

  it('answers under a lockdown policy, so a gated fleet can still see its host', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ githubEnterpriseHost: HOST }))
    registerAppUpdateHandlers()

    expect(invokeLookupTarget()).toEqual({ host: HOST, repository: 'daegun-kim/Orca_ds' })
    expect(ghExecFileAsyncMock).not.toHaveBeenCalled()
  })

  it('names the repository even when no corporate host is configured', () => {
    registerAppUpdateHandlers()

    expect(invokeLookupTarget()).toEqual({ host: null, repository: 'daegun-kim/Orca_ds' })
  })
})
