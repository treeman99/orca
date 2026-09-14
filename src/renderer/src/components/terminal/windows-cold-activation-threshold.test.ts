import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COLD_ACTIVATION_TAB_DEFER_THRESHOLD,
  planColdActivationTabDeferral
} from './background-terminal-worktree-mount'
import {
  resolveColdActivationTabDeferThreshold,
  WINDOWS_COLD_ACTIVATION_TAB_DEFER_THRESHOLD
} from './windows-cold-activation-threshold'

const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Electron/43.7.0'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Electron/43.7.0'

function planWithHiddenTabs(hiddenTabCount: number): {
  deferring: boolean
  deferred: ReadonlySet<string> | undefined
} {
  const restrictions = new Map<string, ReadonlySet<string>>()
  const deferredMountTabIdsByWorktree = new Map<string, ReadonlySet<string>>()
  const allTabIds = Array.from({ length: hiddenTabCount + 1 }, (_, i) => `tab-${i + 1}`)
  const deferring = planColdActivationTabDeferral({
    restrictions,
    deferredMountTabIdsByWorktree,
    worktreeId: 'wt-1',
    allTabIds,
    isTabLive: () => false,
    isTabDeferrable: () => true,
    immediateTabIds: new Set(['tab-1'])
  })
  return { deferring, deferred: deferredMountTabIdsByWorktree.get('wt-1') }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Windows cold-activation eager-mount budget (fork)', () => {
  it('mounts up to four hidden siblings during a Windows switch instead of on idle frames', () => {
    vi.stubGlobal('navigator', { userAgent: WINDOWS_UA })

    for (const hidden of [1, 2, WINDOWS_COLD_ACTIVATION_TAB_DEFER_THRESHOLD]) {
      const plan = planWithHiddenTabs(hidden)
      expect(plan.deferring).toBe(false)
      expect(plan.deferred).toBeUndefined()
    }
  })

  it('still defers a Windows worktree with more hidden tabs than the budget', () => {
    vi.stubGlobal('navigator', { userAgent: WINDOWS_UA })

    const plan = planWithHiddenTabs(WINDOWS_COLD_ACTIVATION_TAB_DEFER_THRESHOLD + 1)

    expect(plan.deferring).toBe(true)
    expect(plan.deferred?.size).toBe(WINDOWS_COLD_ACTIVATION_TAB_DEFER_THRESHOLD + 1)
  })

  it('leaves the upstream visible-only switch on other platforms', () => {
    vi.stubGlobal('navigator', { userAgent: MAC_UA })

    expect(planWithHiddenTabs(1).deferring).toBe(true)
    expect(
      resolveColdActivationTabDeferThreshold(COLD_ACTIVATION_TAB_DEFER_THRESHOLD, MAC_UA)
    ).toBe(COLD_ACTIVATION_TAB_DEFER_THRESHOLD)
  })

  it('never lowers a budget upstream raises above the Windows floor', () => {
    expect(resolveColdActivationTabDeferThreshold(6, WINDOWS_UA)).toBe(6)
  })
})
