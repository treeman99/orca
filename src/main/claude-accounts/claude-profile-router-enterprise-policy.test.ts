// Fork-owned: proves disableManagedClaudeAccounts keeps a Claude launch on the inherited auth.
// v1.4.226 routes every launch through the account-folder router (the old preparation file is
// gone), so the gate is the router's account selection; a Bedrock fleet must never be moved onto
// a managed account's folder. Kept in its own file so an upstream split of the router suite
// cannot carry the gate test away.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { ClaudeManagedAccount } from '../../shared/managed-account-types'
import type * as EnterprisePolicyFileModule from '../enterprise/enterprise-policy-file'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', async (importOriginal) => ({
  ...(await importOriginal<typeof EnterprisePolicyFileModule>()),
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../startup/login-shell-environment', () => ({
  resolveLoginShellEnvironment: () => Promise.resolve({})
}))
vi.mock('../macos-keychain/generic-password', () => ({
  execSecurityCommand: async () => {
    throw new Error('The specified item could not be found in the keychain.')
  }
}))

import { ClaudeProfileRouter, type ClaudeProfileRouterSettings } from './claude-profile-router'
import { installClaudeProfileRouter } from './claude-profile-installed-router'

const roots: string[] = []

function account(id: string): ClaudeManagedAccount {
  return {
    id,
    email: `${id}@example.test`,
    authMethod: 'subscription-oauth',
    managedAuthPath: '/unused-legacy',
    createdAt: 0,
    updatedAt: 0,
    lastAuthenticatedAt: 0
  }
}

function routerWithSelectedAccount() {
  const root = mkdtempSync(join(tmpdir(), 'claude-router-policy-'))
  roots.push(root)
  const userHome = join(root, 'personal')
  const dataRoot = join(root, 'data')
  mkdirSync(join(userHome, '.claude'), { recursive: true })
  const settings: ClaudeProfileRouterSettings = {
    claudeManagedAccounts: [account('a')],
    activeClaudeManagedAccountId: 'a',
    activeClaudeManagedAccountIdsByRuntime: undefined,
    agentStatusHooksEnabled: false,
    disabledTuiAgents: []
  }
  const router = new ClaudeProfileRouter({
    getSettings: () => settings,
    dataRoot,
    userHome,
    env: {},
    runSetup: async () => ({ outcome: 'prepared', warnings: [], surfaces: {} }),
    refreshWaitMs: 500
  })
  // The account's own folder is prepared and signed in, and System default is someone else, so an
  // unpoliced build launches on the account's folder.
  const accountHome = join(dataRoot, 'claude-profiles', 'a', 'home')
  mkdirSync(accountHome, { recursive: true })
  writeFileSync(join(accountHome, '..', 'profile.json'), '{}')
  writeFileSync(
    join(accountHome, '.claude.json'),
    JSON.stringify({ oauthAccount: { emailAddress: 'a@example.test' } })
  )
  writeFileSync(
    join(userHome, '.claude.json'),
    JSON.stringify({ oauthAccount: { emailAddress: 'someone-else@example.test' } })
  )
  return { router, userHome, accountHome }
}

describe('Claude profile routing under disableManagedClaudeAccounts', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })
  afterEach(() => {
    installClaudeProfileRouter(undefined)
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
  })

  it('keeps the launch on System default, with no account folder in its env', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
    const { router, userHome } = routerWithSelectedAccount()

    await expect(router.prepareLaunch()).resolves.toMatchObject({
      configDir: join(userHome, '.claude'),
      provenance: 'system'
    })
    expect(router.preparation().envPatch).not.toHaveProperty('CLAUDE_CONFIG_DIR')
    expect(router.routedHome()).toBeNull()
  })

  it("routes to the selected account's folder on a build with no policy file", async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const { router, accountHome } = routerWithSelectedAccount()

    await expect(router.prepareLaunch()).resolves.toMatchObject({ configDir: accountHome })
  })
})
