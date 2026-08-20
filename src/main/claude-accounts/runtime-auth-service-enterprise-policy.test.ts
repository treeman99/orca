// Fork-owned: proves disableManagedClaudeAccounts stops the launch preparation from
// rewriting auth env, so an inherited Bedrock environment survives. Kept in its own
// file so an upstream split of the runtime-auth suite cannot drop the gate.
import {
  cleanupRuntimeAuthTestState,
  createClaudeAccount,
  createClaudeCredentialsJson,
  createElectronMock,
  createKeychainMock,
  createManagedClaudeAuth,
  createOauthRefreshMock,
  createSettings,
  createStore,
  resetRuntimeAuthTestState,
  setPlatform,
  testState
} from './runtime-auth-service-test-harness'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('electron', () => createElectronMock())
vi.mock('./oauth-refresh', () => createOauthRefreshMock())
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os') // eslint-disable-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  return {
    ...actual,
    homedir: () => testState.fakeHomeDir
  }
})
vi.mock('./keychain', () => createKeychainMock())

describe('ClaudeRuntimeAuthService with managed Claude accounts disabled by policy', () => {
  beforeEach(() => {
    resetRuntimeAuthTestState()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
  })

  afterEach(() => {
    cleanupRuntimeAuthTestState()
  })

  it('never strips auth env for a WSL launch, so an inherited Bedrock env survives', async () => {
    const store = createStore(createSettings())

    const { ClaudeRuntimeAuthService } = await import('./runtime-auth-service')
    const service = new ClaudeRuntimeAuthService(store as never)
    const preparation = await service.prepareForClaudeLaunch({
      runtime: 'wsl',
      wslDistro: 'Ubuntu'
    })

    expect(preparation.runtime).toBe('wsl')
    expect(preparation.provenance).toBe('wsl:Ubuntu:system')
    expect(preparation.stripAuthEnv).toBe(false)
    expect(preparation.envPatch).toEqual({})
  })

  it('ignores a selected WSL managed account instead of rewriting the launch env', async () => {
    setPlatform('win32')
    vi.doMock('../wsl', () => ({
      getDefaultWslDistro: () => 'Ubuntu',
      getWslHome: () => null,
      toWindowsWslPath: (value: string) => value
    }))
    const ubuntuAuthPath = createManagedClaudeAuth(
      testState.userDataDir,
      'ubuntu-account',
      createClaudeCredentialsJson('ubuntu@example.com', 'ubuntu-token')
    )
    const settings = createSettings({
      localAccountRuntime: 'wsl',
      localAccountWslDistro: 'Ubuntu',
      claudeManagedAccounts: [
        createClaudeAccount('ubuntu-account', ubuntuAuthPath, {
          managedAuthRuntime: 'wsl',
          wslDistro: 'Ubuntu',
          wslLinuxAuthPath: '/home/alice/.local/share/orca/claude-accounts/ubuntu/auth'
        })
      ],
      activeClaudeManagedAccountId: null,
      activeClaudeManagedAccountIdsByRuntime: {
        host: null,
        wsl: { Ubuntu: 'ubuntu-account' }
      }
    })
    const store = createStore(settings)

    const { ClaudeRuntimeAuthService } = await import('./runtime-auth-service')
    const service = new ClaudeRuntimeAuthService(store as never)
    const preparation = await service.prepareForClaudeLaunch()

    expect(preparation).toMatchObject({
      runtime: 'wsl',
      provenance: 'wsl:Ubuntu:system',
      stripAuthEnv: false,
      envPatch: {}
    })
  })

  it('ignores an active host managed account for the launch preparation', async () => {
    const managedAuthPath = createManagedClaudeAuth(
      testState.userDataDir,
      'account-1',
      createClaudeCredentialsJson('user@example.com', 'managed')
    )
    const settings = createSettings({
      claudeManagedAccounts: [createClaudeAccount('account-1', managedAuthPath)],
      activeClaudeManagedAccountId: 'account-1'
    })
    const store = createStore(settings)

    const { ClaudeRuntimeAuthService } = await import('./runtime-auth-service')
    const service = new ClaudeRuntimeAuthService(store as never)
    const preparation = await service.prepareForClaudeLaunch()

    expect(preparation).toMatchObject({
      runtime: 'host',
      provenance: 'system',
      stripAuthEnv: false
    })
    expect(preparation.envPatch.CLAUDE_CONFIG_DIR).toBeUndefined()
  })
})
