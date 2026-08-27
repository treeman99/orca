import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

import {
  COMPUTER_USE_ACTION_DENIED,
  __resetComputerUseApprovalQueueForTests,
  requireComputerUseApproval
} from './computer-use-action-approval'

type ApprovalDeps = NonNullable<Parameters<typeof requireComputerUseApproval>[2]>
type Verdict = Awaited<ReturnType<NonNullable<ApprovalDeps['confirm']>>>

// The mock is returned alongside the dep so assertions keep full Mock typing.
function answer(verdict: Verdict): {
  confirm: ApprovalDeps['confirm']
  mock: ReturnType<typeof vi.fn>
} {
  const mock = vi.fn(async () => verdict)
  return { confirm: mock as unknown as ApprovalDeps['confirm'], mock }
}

describe('requireComputerUseApproval', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeLockdownPolicy())
    __resetComputerUseApprovalQueueForTests()
  })

  it('does not prompt when the policy does not require approval', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
    const deps = answer('denied')
    expect(requireComputerUseApproval('click', { app: 'Slack' }, deps)).toBe(undefined)
    expect(deps.mock).not.toHaveBeenCalled()
  })

  it('proceeds when the user allows', async () => {
    const deps = answer('allowed')
    await expect(
      requireComputerUseApproval('click', { app: 'Slack' }, deps)
    ).resolves.toBeUndefined()
    expect(deps.mock).toHaveBeenCalledOnce()
  })

  // Esc and the window close button both report the cancel button, so a dismissed
  // dialog reaches this module as 'denied' — it must never read as consent.
  it('refuses when the user denies or dismisses', async () => {
    const deps = answer('denied')
    await expect(requireComputerUseApproval('click', { app: 'Slack' }, deps)).rejects.toMatchObject(
      {
        code: COMPUTER_USE_ACTION_DENIED
      }
    )
  })

  // The prompt has to say what will be typed — that text is what leaves Orca.
  it('shows the text an agent wants to type', async () => {
    const deps = answer('allowed')
    await requireComputerUseApproval('typeText', { app: 'Mail', text: 'send the Q3 numbers' }, deps)
    const detail = deps.mock.mock.calls[0]?.[0] as string
    expect(detail).toContain('Mail')
    expect(detail).toContain('send the Q3 numbers')
  })

  it('truncates a very long payload instead of filling the screen', async () => {
    const deps = answer('allowed')
    await requireComputerUseApproval('pasteText', { app: 'Notes', text: 'x'.repeat(5_000) }, deps)
    const detail = deps.mock.mock.calls[0]?.[0] as string
    expect(detail.length).toBeLessThan(300)
    expect(detail).toContain('…')
  })

  // Fails closed: a headless run has nobody to ask, so it must not act unattended.
  it('refuses when there is no window to ask in', async () => {
    const deps = answer('no-window')
    await expect(requireComputerUseApproval('click', { app: 'Slack' }, deps)).rejects.toMatchObject(
      {
        code: COMPUTER_USE_ACTION_DENIED
      }
    )
  })

  // With no desktop installed the runtime's own port answers, and it must fail closed.
  it('refuses through the inert desktop surface when no host installed one', async () => {
    await expect(requireComputerUseApproval('click', { app: 'Slack' })).rejects.toMatchObject({
      code: COMPUTER_USE_ACTION_DENIED
    })
  })

  it('asks one question at a time for a burst of actions', async () => {
    let concurrent = 0
    let peak = 0
    const confirm = vi.fn(async () => {
      concurrent += 1
      peak = Math.max(peak, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 1))
      concurrent -= 1
      return 'allowed' as const
    })
    await Promise.all(
      ['click', 'scroll', 'drag'].map((method) =>
        requireComputerUseApproval(method, { app: 'Slack' }, { confirm })
      )
    )
    expect(peak).toBe(1)
    expect(confirm).toHaveBeenCalledTimes(3)
  })
})
