// Behavioural gate for `disableSkillBundleUpdate`: a lockdown policy must stop the lookup
// and the write themselves, not merely hide the notice.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEnterprisePolicyMock } = vi.hoisted(() => ({ getEnterprisePolicyMock: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('electron', () => ({
  app: { getPath: () => '' },
  BrowserWindow: { getAllWindows: () => [] }
}))

import {
  CorporateSkillBundleService,
  deriveCorporateSkillBundleStatus,
  type CorporateSkillBundleServiceDeps
} from './corporate-skill-bundle-service'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { CorporateSkillBundleSkill } from '../../shared/corporate-skill-bundle'
import type { CorporateRemoteBundle } from './corporate-skill-bundle-remote'

const TARGET = { host: 'github.samsungds.net', repository: 'daegun-kim/ORCA_skill' }
const COMMIT = 'e'.repeat(40)
const BUNDLE: CorporateRemoteBundle = {
  ...TARGET,
  host: 'github.samsungds.net',
  branch: 'orca_skill',
  commitSha: COMMIT,
  skills: [
    { name: 'orchestration', treeSha: '1'.repeat(40), files: [] },
    { name: 'ponytail', treeSha: '2'.repeat(40), files: [] }
  ]
}

function skills(
  orchestration: 'current' | 'outdated' | 'missing',
  ponytail: 'current' | 'outdated' | 'missing' | 'link'
): CorporateSkillBundleSkill[] {
  return [
    {
      name: 'orchestration',
      placements: [{ home: 'agents', path: '/a/orchestration', state: orchestration }]
    },
    { name: 'ponytail', placements: [{ home: 'agents', path: '/a/ponytail', state: ponytail }] }
  ]
}

function makeService(overrides: Partial<CorporateSkillBundleServiceDeps> = {}) {
  const deps = {
    resolveTarget: () => TARGET,
    lookup: vi.fn().mockResolvedValue({ outcome: 'found', target: TARGET, bundle: BUNDLE }),
    observe: vi.fn().mockResolvedValue(skills('outdated', 'current')),
    download: vi.fn().mockResolvedValue(new Map()),
    install: vi.fn().mockResolvedValue({
      installedNames: ['orchestration', 'ponytail'],
      skippedPaths: [],
      errors: []
    }),
    readState: vi.fn().mockReturnValue({ dismissedCommit: null, bundleNames: [] }),
    writeState: vi.fn(),
    broadcast: vi.fn(),
    afterInstall: vi.fn(),
    now: () => 1_000,
    ...overrides
  }
  return { service: new CorporateSkillBundleService(deps), deps }
}

beforeEach(() => {
  getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
})

describe('disableSkillBundleUpdate gate', () => {
  it('reads nothing and writes nothing under a lockdown policy', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const { service, deps } = makeService()

    await expect(service.check()).resolves.toEqual({ state: 'disabled' })
    await expect(service.update()).resolves.toMatchObject({ ok: false, reason: 'disabled' })
    expect(deps.lookup).not.toHaveBeenCalled()
    expect(deps.download).not.toHaveBeenCalled()
    expect(deps.install).not.toHaveBeenCalled()
    expect(service.getStatus()).toEqual({ state: 'disabled' })
  })

  it('stays gated through the scheduler', async () => {
    vi.useFakeTimers()
    try {
      getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
      const { service, deps } = makeService()
      service.start()
      await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000)
      service.stop()
      expect(deps.lookup).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs once the administrator opts the lane back in under lockdown', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ disableSkillBundleUpdate: false }))
    const { service, deps } = makeService()

    await expect(service.check()).resolves.toMatchObject({ state: 'available' })
    expect(deps.lookup).toHaveBeenCalledTimes(1)
  })
})

describe('update', () => {
  it('downloads, replaces the whole bundle, and re-observes', async () => {
    const { service, deps } = makeService({
      observe: vi.fn().mockResolvedValue(skills('current', 'current'))
    })

    const result = await service.update()

    expect(deps.install).toHaveBeenCalledWith(BUNDLE, expect.any(Map))
    expect(deps.afterInstall).toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      commitSha: COMMIT,
      installedNames: ['orchestration', 'ponytail']
    })
    expect(result.status).toMatchObject({ state: 'up-to-date' })
    expect(deps.writeState).toHaveBeenCalledWith({ bundleNames: ['orchestration', 'ponytail'] })
  })

  it('writes nothing when the download does not verify', async () => {
    const { service, deps } = makeService({
      download: vi.fn().mockRejectedValue(new Error('does not match commit'))
    })

    await expect(service.update()).resolves.toMatchObject({ ok: false, reason: 'download-failed' })
    expect(deps.install).not.toHaveBeenCalled()
  })

  it('refuses a second writer while one runs', async () => {
    let release: () => void = () => undefined
    const { service } = makeService({
      download: vi.fn(
        () =>
          new Promise<Map<string, Map<string, Buffer>>>((resolve) => {
            release = () => resolve(new Map())
          })
      )
    })
    const first = service.update()
    await expect(service.update()).resolves.toMatchObject({ ok: false, reason: 'busy' })
    release()
    await expect(first).resolves.toMatchObject({ ok: true })
  })
})

describe('deriveCorporateSkillBundleStatus', () => {
  const derive = (observed: CorporateSkillBundleSkill[], dismissedCommit: string | null = null) =>
    deriveCorporateSkillBundleStatus({
      bundle: BUNDLE,
      skills: observed,
      target: TARGET,
      checkedAt: 1,
      dismissedCommit
    })

  it('offers but never nudges when nothing of the bundle is installed', () => {
    expect(derive(skills('missing', 'missing')).state).toBe('not-installed')
  })

  it('names a missing helper skill as changed, since orchestration needs it', () => {
    expect(derive(skills('current', 'missing'))).toMatchObject({
      state: 'available',
      changedNames: ['ponytail']
    })
  })

  it('does not count a link it will not write', () => {
    expect(derive(skills('current', 'link')).state).toBe('up-to-date')
  })

  it('marks the notice dismissed only for the commit that was closed', () => {
    expect(derive(skills('outdated', 'current'), COMMIT)).toMatchObject({ dismissed: true })
    expect(derive(skills('outdated', 'current'), 'a'.repeat(40))).toMatchObject({
      dismissed: false
    })
  })
})
