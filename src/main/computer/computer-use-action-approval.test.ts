import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: { showMessageBox: vi.fn() }
}))

vi.mock('../i18n/main-i18n', () => ({
  translateMain: (_key: string, fallback: string) => fallback
}))

import {
  COMPUTER_USE_ACTION_DENIED,
  __resetComputerUseApprovalQueueForTests,
  requireComputerUseApproval
} from './computer-use-action-approval'

type WindowSource = NonNullable<
  NonNullable<Parameters<typeof requireComputerUseApproval>[2]>['getWindow']
>
const getWindow: WindowSource = () => ({}) as ReturnType<WindowSource>

type ApprovalDeps = NonNullable<Parameters<typeof requireComputerUseApproval>[2]>

// The mock is returned alongside the cast dep so assertions keep full Mock typing.
function answer(response: number): {
  showMessageBox: ApprovalDeps['showMessageBox']
  mock: ReturnType<typeof vi.fn>
} {
  const mock = vi.fn(async () => ({ response, checkboxChecked: false }))
  return { showMessageBox: mock as unknown as ApprovalDeps['showMessageBox'], mock }
}

const DENY = 0
const ALLOW = 1

describe('requireComputerUseApproval', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeLockdownPolicy())
    __resetComputerUseApprovalQueueForTests()
  })

  it('does not prompt when the policy does not require approval', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
    const deps = answer(DENY)
    expect(requireComputerUseApproval('click', { app: 'Slack' }, { ...deps, getWindow })).toBe(
      undefined
    )
    expect(deps.mock).not.toHaveBeenCalled()
  })

  it('proceeds when the user allows', async () => {
    const deps = answer(ALLOW)
    await expect(
      requireComputerUseApproval('click', { app: 'Slack' }, { ...deps, getWindow })
    ).resolves.toBeUndefined()
    expect(deps.mock).toHaveBeenCalledOnce()
  })

  it('refuses when the user denies', async () => {
    const deps = answer(DENY)
    await expect(
      requireComputerUseApproval('click', { app: 'Slack' }, { ...deps, getWindow })
    ).rejects.toMatchObject({ code: COMPUTER_USE_ACTION_DENIED })
  })

  // Esc and the window close button both report cancelId, so this is the same path a
  // dismissed dialog takes — it must never read as consent.
  it('defaults to Deny and treats dismissal as a refusal', async () => {
    const deps = answer(DENY)
    await requireComputerUseApproval('click', { app: 'Slack' }, { ...deps, getWindow })?.catch(
      () => undefined
    )
    const options = deps.mock.mock.calls[0]?.[1] as { defaultId: number; cancelId: number }
    expect(options.defaultId).toBe(0)
    expect(options.cancelId).toBe(0)
  })

  // The prompt has to say what will be typed — that text is what leaves Orca.
  it('shows the text an agent wants to type', async () => {
    const deps = answer(ALLOW)
    await requireComputerUseApproval(
      'typeText',
      { app: 'Mail', text: 'send the Q3 numbers' },
      { ...deps, getWindow }
    )
    const options = deps.mock.mock.calls[0]?.[1] as { detail: string }
    expect(options.detail).toContain('Mail')
    expect(options.detail).toContain('send the Q3 numbers')
  })

  it('truncates a very long payload instead of filling the screen', async () => {
    const deps = answer(ALLOW)
    await requireComputerUseApproval(
      'pasteText',
      { app: 'Notes', text: 'x'.repeat(5_000) },
      { ...deps, getWindow }
    )
    const options = deps.mock.mock.calls[0]?.[1] as { detail: string }
    expect(options.detail.length).toBeLessThan(300)
    expect(options.detail).toContain('…')
  })

  // Fails closed: a headless run has nobody to ask, so it must not act unattended.
  it('refuses when there is no window to ask in', async () => {
    const deps = answer(ALLOW)
    await expect(
      requireComputerUseApproval('click', { app: 'Slack' }, { ...deps, getWindow: () => null })
    ).rejects.toMatchObject({ code: COMPUTER_USE_ACTION_DENIED })
    expect(deps.mock).not.toHaveBeenCalled()
  })

  it('asks one question at a time for a burst of actions', async () => {
    let concurrent = 0
    let peak = 0
    const showMessageBox = vi.fn(async () => {
      concurrent += 1
      peak = Math.max(peak, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 1))
      concurrent -= 1
      return { response: ALLOW, checkboxChecked: false }
    })
    await Promise.all(
      ['click', 'scroll', 'drag'].map((method) =>
        requireComputerUseApproval(
          method,
          { app: 'Slack' },
          {
            showMessageBox: showMessageBox as unknown as ApprovalDeps['showMessageBox'],
            getWindow
          }
        )
      )
    )
    expect(peak).toBe(1)
    expect(showMessageBox).toHaveBeenCalledTimes(3)
  })
})
