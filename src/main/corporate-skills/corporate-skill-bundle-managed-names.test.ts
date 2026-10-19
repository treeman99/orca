// The build's own freshness check must stay off the corporate bundle's skills — otherwise it
// nudges "update orchestration" and its update writes this build's stub over the bundle.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getEnterprisePolicyMock, rememberedNamesMock } = vi.hoisted(() => ({
  getEnterprisePolicyMock: vi.fn(),
  rememberedNamesMock: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('./corporate-skill-bundle-state', () => ({
  readCorporateSkillBundleState: () => ({
    dismissedCommit: null,
    bundleNames: rememberedNamesMock()
  })
}))

import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { inventorySkillFreshness } from '../skills/skill-freshness-inventory'
import { describeObservedSkillFile, skillPackageDigest } from '../skills/skill-package-identity'
import { corporateBundleManagedNames } from './corporate-skill-bundle-managed-names'

const CORPORATE = 'https://github.samsungds.net/daegun-kim/ORCA_skill'
const directories: string[] = []

beforeEach(() => {
  getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  rememberedNamesMock.mockReset().mockReturnValue([])
  for (const name of ['CLAUDE_CONFIG_DIR', 'GROK_HOME', 'HERMES_HOME', 'XDG_STATE_HOME']) {
    vi.stubEnv(name, '')
  }
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('corporateBundleManagedNames', () => {
  it('owns the names Orca installed from the bundle and the ones the last check found', () => {
    rememberedNamesMock.mockReturnValue(['ponytail'])
    const lock = new Map([
      ['orchestration', CORPORATE],
      ['computer-use', 'stablyai/orca']
    ])
    expect([...corporateBundleManagedNames(lock)].sort()).toEqual(['orchestration', 'ponytail'])
  })

  it('owns nothing when the administrator turned the lane off', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    rememberedNamesMock.mockReturnValue(['ponytail'])
    expect(corporateBundleManagedNames(new Map([['orchestration', CORPORATE]])).size).toBe(0)
  })
})

describe('skill freshness inventory', () => {
  async function scanWithLockSource(source: string) {
    const root = await mkdtemp(join(tmpdir(), 'orca-corporate-inventory-'))
    directories.push(root)
    const homeDir = join(root, 'home')
    const resourceRoot = join(root, 'resources')
    const observed = describeObservedSkillFile('SKILL.md', Buffer.from('build stub\n'), false)
    const shipped = {
      path: observed.path,
      size: observed.size,
      executable: observed.executable,
      classification: observed.classification,
      exactSha256: observed.exactSha256,
      textNormalizedSha256: observed.textNormalizedSha256,
      identitySha256: observed.identitySha256
    }
    await mkdir(join(resourceRoot, 'skills'), { recursive: true })
    await writeFile(
      join(resourceRoot, 'skills', 'current-manifest.json'),
      JSON.stringify({
        schemaVersion: 3,
        skills: [
          {
            name: 'orchestration',
            sourcePath: 'skills/orchestration',
            packageDigest: skillPackageDigest([shipped]),
            files: [shipped]
          }
        ]
      })
    )
    await mkdir(join(homeDir, '.agents', 'skills', 'orchestration'), { recursive: true })
    await writeFile(
      join(homeDir, '.agents', 'skills', 'orchestration', 'SKILL.md'),
      'bundle copy\n'
    )
    await writeFile(
      join(homeDir, '.agents', '.skill-lock.json'),
      JSON.stringify({ version: 3, skills: { orchestration: { source } } })
    )
    return inventorySkillFreshness({ homeDir, repos: [], resourceRoot, stateHome: null })
  }

  it('leaves the bundle copy out of the build check', async () => {
    const inventory = await scanWithLockSource(CORPORATE)
    expect(inventory.installations).toEqual([])
    expect(inventory.eligibleUpdateNames).toEqual([])
  })

  it('still judges a copy the build itself installed', async () => {
    const inventory = await scanWithLockSource('orca-bundled')
    expect(inventory.eligibleUpdateNames).toEqual(['orchestration'])
  })
})
