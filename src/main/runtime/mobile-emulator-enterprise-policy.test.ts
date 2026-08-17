import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

import { OrcaRuntimeService } from './orca-runtime'

// Every emulator RPC handler pulls the bridge through RuntimeEmulatorCommands.requireEmulatorBridge,
// so the policy gate sits on the host's getEmulatorBridge in orca-runtime.ts. Asserted at the
// service method level so an upstream refactor of either file cannot drop it silently.
describe('mobile emulator RPCs under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it.each(['emulatorList', 'emulatorListDevices', 'emulatorAvailability'] as const)(
    'refuses %s with emulator_disabled_by_policy under lockdown',
    async (name) => {
      getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
      const runtime = new OrcaRuntimeService()

      await expect(runtime[name]({})).rejects.toMatchObject({
        code: 'emulator_disabled_by_policy'
      })
    }
  )

  it('lets an explicit opt-back-in reach the bridge lookup', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ disableMobileEmulator: false }))
    const runtime = new OrcaRuntimeService()

    // Why not a success assertion: no bridge is wired in this harness, so getting past the
    // gate surfaces as the ordinary "no active emulator" refusal instead.
    await expect(runtime.emulatorList({})).rejects.toMatchObject({ code: 'emulator_no_active' })
  })
})
