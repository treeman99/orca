// Fork-owned: v1.4.232 moved MiniMax and GLM Coding Plan key saving out of the ipcMain handlers
// into commands that new runtime RPCs (a paired client saving on this host) call directly. The
// `disableVendorProviderAccounts` gate therefore sits in those commands; this proves the RPC lane.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeEnterprisePolicy,
  makeLockdownPolicy
} from '../../../../shared/enterprise-policy-fixture'
import { VENDOR_ACCOUNTS_DISABLED_BY_POLICY } from '../../../enterprise/vendor-account-registration-guard'
import type * as CookieStore from '../../../minimax/minimax-cookie-store'
import type * as MiniMaxKeyStore from '../../../minimax/minimax-api-key-store'
import type * as ZcodeKeyStore from '../../../zcode/zcode-plan-api-key-store'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  saveMiniMaxSessionCookie: vi.fn(),
  saveMiniMaxApiKey: vi.fn(),
  saveZcodePlanApiKey: vi.fn(),
  clearMiniMaxApiKey: vi.fn(),
  clearZcodePlanApiKey: vi.fn()
}))

vi.mock('../../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../../../minimax/minimax-cookie-store', async (importOriginal) => ({
  ...(await importOriginal<typeof CookieStore>()),
  saveMiniMaxSessionCookie: mocks.saveMiniMaxSessionCookie,
  hasMiniMaxSessionCookie: () => false
}))
vi.mock('../../../minimax/minimax-api-key-store', async (importOriginal) => ({
  ...(await importOriginal<typeof MiniMaxKeyStore>()),
  saveMiniMaxApiKey: mocks.saveMiniMaxApiKey,
  clearMiniMaxApiKey: mocks.clearMiniMaxApiKey,
  hasMiniMaxApiKey: () => false
}))
vi.mock('../../../zcode/zcode-plan-api-key-store', async (importOriginal) => ({
  ...(await importOriginal<typeof ZcodeKeyStore>()),
  saveZcodePlanApiKey: mocks.saveZcodePlanApiKey,
  clearZcodePlanApiKey: mocks.clearZcodePlanApiKey,
  hasZcodePlanApiKey: () => false
}))
vi.mock('../../../rate-limits/zcode-usage-fetcher', () => ({
  hasZcodeCliPlanCredentials: () => false
}))
vi.mock('../../../credentials/saved-credential-readability', () => ({
  savedCredentialUnreadable: () => undefined,
  refuseCredentialSealedElsewhere: vi.fn()
}))
vi.mock('../../../network/http-client', () => ({
  // A desktop host: the session-cookie save needs its browser session.
  getMainHttpClient: () => ({ partitionSession: {} })
}))

import { USAGE_CREDENTIAL_METHODS } from './usage-credentials'

const runtime = { requireUsageRateLimits: () => null }

async function call(name: string, params: unknown): Promise<unknown> {
  const method = USAGE_CREDENTIAL_METHODS.find((entry) => entry.name === name)
  if (!method) {
    throw new Error(`no RPC method ${name}`)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these handlers read only requireUsageRateLimits from the context.
  return await method.handler(params as never, { runtime } as never)
}

const SAVES = [
  ['accounts.minimaxSaveApiKey', { apiKey: 'key-value' }, mocks.saveMiniMaxApiKey, 'key-value'],
  [
    'accounts.minimaxSaveSessionCookie',
    { cookie: 'cookie-value' },
    mocks.saveMiniMaxSessionCookie,
    'cookie-value'
  ],
  ['accounts.zcodePlanSaveApiKey', { apiKey: 'key-value' }, mocks.saveZcodePlanApiKey, 'key-value']
] as const

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
  mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
})

describe('usage-credential RPCs under the enterprise policy', () => {
  it.each(SAVES)('refuses %s under lockdown without writing it', async (name, params, store) => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await expect(call(name, params)).rejects.toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
    expect(store).not.toHaveBeenCalled()
  })

  it.each(SAVES)('lets %s save when no policy locks it', async (name, params, store, value) => {
    await call(name, params)

    expect(store).toHaveBeenCalledWith(value)
  })

  it.each([
    ['accounts.minimaxClearApiKey', mocks.clearMiniMaxApiKey],
    ['accounts.zcodePlanClearApiKey', mocks.clearZcodePlanApiKey]
  ])('still lets %s forget a stored key under lockdown', async (name, clear) => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await call(name, null)

    expect(clear).toHaveBeenCalled()
  })
})
