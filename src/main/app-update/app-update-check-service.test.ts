// Behavioural gate for `disableAutoUpdate`: a lockdown policy must stop the lookup
// itself, not merely hide the dialog. A resolver test proves the policy object is
// right; this proves the chokepoint consumes it.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEnterprisePolicyMock, dismissedVersionMock, writeDismissedMock } = vi.hoisted(() => ({
  getEnterprisePolicyMock: vi.fn(),
  dismissedVersionMock: vi.fn(),
  writeDismissedMock: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('./update-notice-dismissals', () => ({
  readDismissedUpdateVersion: () => dismissedVersionMock(),
  writeDismissedUpdateVersion: (version: string | null) => writeDismissedMock(version)
}))
vi.mock('electron', () => ({
  app: { getVersion: () => '1.4.186' },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { AppUpdateCheckService } from './app-update-check-service'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { ReleaseLookupResult } from './enterprise-release-lookup'

const HOST = 'github.samsungds.net'

function foundRelease(tag: string, version: string): ReleaseLookupResult {
  return {
    outcome: 'found',
    host: HOST,
    release: { tag, version, releaseUrl: null },
    releaseUrl: `https://${HOST}/daegun-kim/Orca_ds/releases/tag/${tag}`
  }
}

type ServiceOverrides = NonNullable<ConstructorParameters<typeof AppUpdateCheckService>[0]>

function makeService(overrides: ServiceOverrides = {}) {
  return new AppUpdateCheckService({
    currentVersion: () => '1.4.186',
    broadcast: vi.fn(),
    ...overrides
  })
}

beforeEach(() => {
  writeDismissedMock.mockReset()
  dismissedVersionMock.mockReset().mockReturnValue(null)
  getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
})

describe('disableAutoUpdate gate', () => {
  it('makes no lookup at all under a lockdown policy', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ githubEnterpriseHost: HOST }))
    const lookup = vi.fn()
    const broadcast = vi.fn()
    const service = makeService({ lookup, broadcast })

    await expect(service.check()).resolves.toEqual({ state: 'disabled' })
    expect(lookup).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalled()
    expect(service.getStatus()).toEqual({ state: 'disabled' })
  })

  it('stays gated through the scheduler too', async () => {
    vi.useFakeTimers()
    try {
      getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ githubEnterpriseHost: HOST }))
      const lookup = vi.fn()
      const service = makeService({ lookup })
      service.start()
      await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000)
      service.stop()
      expect(lookup).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports disabled even after an earlier check found something', async () => {
    const service = makeService({
      lookup: vi.fn().mockResolvedValue(foundRelease('v1.5.0', '1.5.0'))
    })
    await service.check()
    expect(service.getStatus()).toMatchObject({ state: 'available' })

    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ githubEnterpriseHost: HOST }))
    expect(service.getStatus()).toEqual({ state: 'disabled' })
  })

  it('runs the lookup when the administrator opts the lane back in', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ githubEnterpriseHost: HOST, disableAutoUpdate: false })
    )
    const lookup = vi.fn().mockResolvedValue(foundRelease('v1.5.0', '1.5.0'))
    await makeService({ lookup }).check()
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})

describe('status', () => {
  it('announces a newer release with both versions and the corporate page', async () => {
    const broadcast = vi.fn()
    const service = makeService({
      lookup: vi.fn().mockResolvedValue(foundRelease('v1.5.0', '1.5.0')),
      broadcast
    })
    await expect(service.check()).resolves.toEqual({
      state: 'available',
      currentVersion: '1.4.186',
      latestVersion: '1.5.0',
      releaseTag: 'v1.5.0',
      releaseUrl: `https://${HOST}/daegun-kim/Orca_ds/releases/tag/v1.5.0`,
      dismissed: false
    })
    expect(broadcast).toHaveBeenCalledTimes(1)
  })

  it('says up-to-date when the newest release is the running build', async () => {
    const service = makeService({
      lookup: vi.fn().mockResolvedValue(foundRelease('v1.4.186', '1.4.186'))
    })
    await expect(service.check()).resolves.toEqual({
      state: 'up-to-date',
      currentVersion: '1.4.186',
      latestVersion: '1.4.186'
    })
  })

  it('says nothing at all when the host cannot be reached', async () => {
    const broadcast = vi.fn()
    for (const outcome of ['no-enterprise-host', 'lookup-failed', 'no-release'] as const) {
      const service = makeService({ lookup: vi.fn().mockResolvedValue({ outcome }), broadcast })
      await expect(service.check()).resolves.toEqual({ state: 'unavailable', reason: outcome })
    }
  })

  it('treats a thrown lookup as an unavailable answer, not a crash', async () => {
    const service = makeService({ lookup: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(service.check()).resolves.toEqual({
      state: 'unavailable',
      reason: 'lookup-failed'
    })
  })

  it('coalesces concurrent checks into one lookup', async () => {
    const lookup = vi.fn().mockResolvedValue(foundRelease('v1.5.0', '1.5.0'))
    const service = makeService({ lookup })
    await Promise.all([service.check(), service.check(), service.check()])
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('broadcasts only when the status actually changed', async () => {
    const broadcast = vi.fn()
    const service = makeService({
      lookup: vi.fn().mockResolvedValue(foundRelease('v1.5.0', '1.5.0')),
      broadcast
    })
    await service.check()
    await service.check()
    expect(broadcast).toHaveBeenCalledTimes(1)
  })
})

describe('dismissals', () => {
  it('marks the dismissed release and remembers it', async () => {
    const service = makeService({
      lookup: vi.fn().mockResolvedValue(foundRelease('v1.5.0', '1.5.0'))
    })
    await service.check()
    expect(service.dismissVersion('1.5.0')).toMatchObject({ state: 'available', dismissed: true })
    expect(writeDismissedMock).toHaveBeenCalledWith('1.5.0')
  })

  it('still announces a release newer than the dismissed one', async () => {
    dismissedVersionMock.mockReturnValue('1.5.0')
    const service = makeService({
      lookup: vi.fn().mockResolvedValue(foundRelease('v1.6.0', '1.6.0'))
    })
    await expect(service.check()).resolves.toMatchObject({ dismissed: false })
  })

  it('keeps a previously dismissed release dismissed across a re-check', async () => {
    dismissedVersionMock.mockReturnValue('1.5.0')
    const service = makeService({
      lookup: vi.fn().mockResolvedValue(foundRelease('v1.5.0', '1.5.0'))
    })
    await expect(service.check()).resolves.toMatchObject({ dismissed: true })
  })
})
