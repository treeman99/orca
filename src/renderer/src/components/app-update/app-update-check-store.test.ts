// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateCheckStatus } from '../../../../shared/app-update-check'
import {
  dismissAppUpdatePresentation,
  isAppUpdateCheckStatus,
  isAppUpdateLookupTarget,
  resetAppUpdateCheckStoreForTests,
  resolveBackgroundPresentation,
  runManualAppUpdateCheck,
  skipAppUpdateVersion,
  startAppUpdateCheckSync
} from './app-update-check-store'

const TARGET = { host: 'ghe.example.com', repository: 'tools/orca' }

const AVAILABLE: AppUpdateCheckStatus = {
  state: 'available',
  currentVersion: '1.4.200',
  latestVersion: '1.4.205',
  releaseTag: 'v1.4.205',
  releaseUrl: 'https://ghe.example.com/tools/orca/releases/tag/v1.4.205',
  dismissed: false,
  target: TARGET,
  checkedAt: 1_700_000_000_000
}
const UP_TO_DATE: AppUpdateCheckStatus = {
  state: 'up-to-date',
  currentVersion: '1.4.205',
  latestVersion: '1.4.205',
  target: TARGET,
  checkedAt: 1_700_000_000_000
}
const UNAVAILABLE: AppUpdateCheckStatus = {
  state: 'unavailable',
  reason: 'lookup-failed',
  target: TARGET,
  checkedAt: 1_700_000_000_000
}

type LaneMocks = {
  getStatus: ReturnType<typeof vi.fn>
  check: ReturnType<typeof vi.fn>
  dismissVersion: ReturnType<typeof vi.fn>
  getLookupTarget: ReturnType<typeof vi.fn>
  openReleasePage: ReturnType<typeof vi.fn>
  statusListeners: ((status: AppUpdateCheckStatus) => void)[]
  checkRequestedListeners: (() => void)[]
}

let lane: LaneMocks

function installLane(overrides: Partial<Pick<LaneMocks, 'getStatus' | 'check'>> = {}): void {
  lane = {
    getStatus: overrides.getStatus ?? vi.fn().mockResolvedValue({ state: 'unknown' }),
    check: overrides.check ?? vi.fn().mockResolvedValue(UP_TO_DATE),
    dismissVersion: vi.fn().mockResolvedValue({ ...AVAILABLE, dismissed: true }),
    getLookupTarget: vi.fn().mockResolvedValue(TARGET),
    openReleasePage: vi.fn().mockResolvedValue(undefined),
    statusListeners: [],
    checkRequestedListeners: []
  }
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      app: { getVersion: vi.fn().mockResolvedValue('1.4.200') },
      appUpdate: {
        getStatus: lane.getStatus,
        check: lane.check,
        dismissVersion: lane.dismissVersion,
        getLookupTarget: lane.getLookupTarget,
        openReleasePage: lane.openReleasePage,
        onStatus: (callback: (status: AppUpdateCheckStatus) => void) => {
          lane.statusListeners.push(callback)
          return () => undefined
        },
        onCheckRequested: (callback: () => void) => {
          lane.checkRequestedListeners.push(callback)
          return () => undefined
        }
      }
    }
  })
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** The store has no exported getter by design; read it the way React does. */
async function snapshot(): Promise<{
  status: AppUpdateCheckStatus | null
  pending: { source: string; status: AppUpdateCheckStatus } | null
  target: unknown
  currentVersion: string | null
  checking: boolean
}> {
  const { renderHook } = await import('@testing-library/react')
  const { useAppUpdateCheck } = await import('./app-update-check-store')
  const { result, unmount } = renderHook(() => useAppUpdateCheck())
  const value = result.current
  unmount()
  return value
}

beforeEach(() => {
  resetAppUpdateCheckStoreForTests()
  installLane()
})

afterEach(() => {
  resetAppUpdateCheckStoreForTests()
})

describe('background checks', () => {
  it('opens only for a real, un-skipped upgrade', () => {
    expect(resolveBackgroundPresentation(AVAILABLE)).toEqual({
      source: 'background',
      status: AVAILABLE
    })
    expect(resolveBackgroundPresentation({ ...AVAILABLE, dismissed: true })).toBeNull()
    expect(resolveBackgroundPresentation(UP_TO_DATE)).toBeNull()
    expect(resolveBackgroundPresentation(UNAVAILABLE)).toBeNull()
    expect(resolveBackgroundPresentation({ state: 'disabled' })).toBeNull()
    expect(resolveBackgroundPresentation({ state: 'unknown' })).toBeNull()
  })

  it('records an up-to-date push without presenting anything', async () => {
    startAppUpdateCheckSync()
    await flush()
    for (const listener of lane.statusListeners) {
      listener(UP_TO_DATE)
    }

    const state = await snapshot()
    expect(state.status).toEqual(UP_TO_DATE)
    expect(state.pending).toBeNull()
  })

  it('records a failed lookup without presenting anything', async () => {
    startAppUpdateCheckSync()
    await flush()
    for (const listener of lane.statusListeners) {
      listener(UNAVAILABLE)
    }

    expect((await snapshot()).pending).toBeNull()
  })

  it('presents an available push', async () => {
    startAppUpdateCheckSync()
    await flush()
    for (const listener of lane.statusListeners) {
      listener(AVAILABLE)
    }

    expect((await snapshot()).pending).toEqual({ source: 'background', status: AVAILABLE })
  })

  it('presents an upgrade main already found before this renderer loaded', async () => {
    installLane({ getStatus: vi.fn().mockResolvedValue(AVAILABLE) })
    startAppUpdateCheckSync()
    await flush()

    expect((await snapshot()).pending).toEqual({ source: 'background', status: AVAILABLE })
  })

  it('leaves a dialog the user is reading alone when a later push finds nothing', async () => {
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()
    for (const listener of lane.statusListeners) {
      listener(UNAVAILABLE)
    }

    const state = await snapshot()
    expect(state.pending).toEqual({ source: 'manual', status: UP_TO_DATE })
    expect(state.status).toEqual(UNAVAILABLE)
  })
})

describe('manual checks', () => {
  it('answers for up-to-date', async () => {
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()

    expect((await snapshot()).pending).toEqual({ source: 'manual', status: UP_TO_DATE })
  })

  it('answers for an unavailable lookup', async () => {
    installLane({ check: vi.fn().mockResolvedValue(UNAVAILABLE) })
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()

    expect((await snapshot()).pending).toEqual({ source: 'manual', status: UNAVAILABLE })
  })

  it('answers for a policy-disabled machine', async () => {
    installLane({ check: vi.fn().mockResolvedValue({ state: 'disabled' }) })
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()

    expect((await snapshot()).pending).toEqual({
      source: 'manual',
      status: { state: 'disabled' }
    })
  })

  it('answers for a version the user already skipped', async () => {
    const skipped = { ...AVAILABLE, dismissed: true }
    installLane({ check: vi.fn().mockResolvedValue(skipped) })
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()

    expect((await snapshot()).pending).toEqual({ source: 'manual', status: skipped })
  })

  it('answers with unknown when the lane itself does not respond', async () => {
    installLane({ check: vi.fn().mockRejectedValue(new Error('no handler registered')) })
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()

    const state = await snapshot()
    expect(state.pending).toEqual({ source: 'manual', status: { state: 'unknown' } })
    expect(state.checking).toBe(false)
  })

  it('runs the same path the menu bar asks for', async () => {
    startAppUpdateCheckSync()
    await flush()
    for (const listener of lane.checkRequestedListeners) {
      listener()
    }
    await flush()

    expect(lane.check).toHaveBeenCalledTimes(1)
    expect((await snapshot()).pending).toEqual({ source: 'manual', status: UP_TO_DATE })
  })

  it('ignores a second press while one is in flight', async () => {
    let release: (status: AppUpdateCheckStatus) => void = () => undefined
    installLane({
      check: vi.fn().mockReturnValue(
        new Promise<AppUpdateCheckStatus>((resolve) => {
          release = resolve
        })
      )
    })
    startAppUpdateCheckSync()
    await flush()

    const first = runManualAppUpdateCheck()
    await runManualAppUpdateCheck()
    expect(lane.check).toHaveBeenCalledTimes(1)
    expect((await snapshot()).checking).toBe(true)

    release(UP_TO_DATE)
    await first
    expect((await snapshot()).checking).toBe(false)
  })

  it('clears the presentation when the user closes it', async () => {
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()
    dismissAppUpdatePresentation()

    expect((await snapshot()).pending).toBeNull()
  })

  it('closes and remembers the skip when a version is skipped', async () => {
    startAppUpdateCheckSync()
    await flush()
    await skipAppUpdateVersion('1.4.205')

    const state = await snapshot()
    expect(lane.dismissVersion).toHaveBeenCalledWith({ version: '1.4.205' })
    expect(state.pending).toBeNull()
    expect(state.status).toEqual({ ...AVAILABLE, dismissed: true })
  })
})

describe('clients without an update lane', () => {
  it('stays empty when the bridge is missing', async () => {
    Object.defineProperty(window, 'api', { configurable: true, value: {} })
    startAppUpdateCheckSync()
    await flush()
    await runManualAppUpdateCheck()

    const state = await snapshot()
    expect(state.status).toBeNull()
    expect(state.pending).toBeNull()
    expect(state.target).toBeNull()
  })

  it('rejects the browser client fallback proxy answers', async () => {
    // `pnpm dev:web` resolves getStatus() to [] and getLookupTarget() to undefined.
    installLane({ getStatus: vi.fn().mockResolvedValue([]) })
    lane.getLookupTarget.mockResolvedValue(undefined)
    startAppUpdateCheckSync()
    await flush()

    const state = await snapshot()
    expect(state.status).toBeNull()
    expect(state.target).toBeNull()
  })

  it('reads the installed version from the app bridge', async () => {
    startAppUpdateCheckSync()
    await flush()

    expect((await snapshot()).currentVersion).toBe('1.4.200')
  })
})

describe('payload guards', () => {
  it('accepts only the five modelled states', () => {
    expect(isAppUpdateCheckStatus({ state: 'unknown' })).toBe(true)
    expect(isAppUpdateCheckStatus(AVAILABLE)).toBe(true)
    expect(isAppUpdateCheckStatus({ state: 'downloading' })).toBe(false)
    expect(isAppUpdateCheckStatus([])).toBe(false)
    expect(isAppUpdateCheckStatus(undefined)).toBe(false)
    expect(isAppUpdateCheckStatus(null)).toBe(false)
  })

  it('accepts a target with no configured host', () => {
    expect(isAppUpdateLookupTarget({ host: null, repository: 'tools/orca' })).toBe(true)
    expect(isAppUpdateLookupTarget(TARGET)).toBe(true)
    expect(isAppUpdateLookupTarget({ repository: 'tools/orca' })).toBe(false)
    expect(isAppUpdateLookupTarget(undefined)).toBe(false)
  })
})
