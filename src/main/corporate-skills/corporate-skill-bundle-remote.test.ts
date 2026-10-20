import { describe, expect, it, vi } from 'vitest'

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => ({ githubEnterpriseHost: null })
}))

import {
  lookupCorporateSkillBundle,
  parseCorporateSkillTree
} from './corporate-skill-bundle-remote'

const SHA = (digit: string): string => digit.repeat(40)
const TARGET = { host: 'github.samsungds.net', repository: 'daegun-kim/ORCA_skill' }

function blob(path: string, sha = SHA('a'), mode = '100644') {
  return { path, mode, type: 'blob', sha, size: 10 }
}
function tree(path: string, sha = SHA('b')) {
  return { path, mode: '040000', type: 'tree', sha }
}

const BUNDLE_TREE = {
  truncated: false,
  tree: [
    blob('README.md'),
    tree('skills'),
    tree('skills/orchestration', SHA('c')),
    blob('skills/orchestration/SKILL.md', SHA('1')),
    tree('skills/orchestration/harness-template'),
    blob('skills/orchestration/harness-template/rules.md', SHA('2')),
    tree('skills/ponytail', SHA('d')),
    blob('skills/ponytail/SKILL.md', SHA('3'), '100755'),
    tree('skills/assets-only'),
    blob('skills/assets-only/logo.txt')
  ]
}

describe('parseCorporateSkillTree', () => {
  it('collects each skill folder with its files, relative to the folder', () => {
    expect(parseCorporateSkillTree(BUNDLE_TREE)).toEqual({
      skills: [
        {
          name: 'orchestration',
          treeSha: SHA('c'),
          files: [
            { path: 'SKILL.md', blobSha: SHA('1'), executable: false },
            { path: 'harness-template/rules.md', blobSha: SHA('2'), executable: false }
          ]
        },
        {
          name: 'ponytail',
          treeSha: SHA('d'),
          files: [{ path: 'SKILL.md', blobSha: SHA('3'), executable: true }]
        }
      ]
    })
  })

  it.each([
    ['a truncated listing', { ...BUNDLE_TREE, truncated: true }],
    [
      'a symlink inside a skill',
      { tree: [tree('skills/x'), blob('skills/x/SKILL.md', SHA('1'), '120000')] }
    ],
    [
      'a submodule inside a skill',
      {
        tree: [
          tree('skills/x'),
          { path: 'skills/x/sub', mode: '160000', type: 'commit', sha: SHA('1') }
        ]
      }
    ],
    [
      'a skill name outside the package grammar',
      { tree: [tree('skills/Bad Name'), blob('skills/Bad Name/SKILL.md')] }
    ],
    [
      'a dot-dot path segment',
      { tree: [tree('skills/x'), blob('skills/x/SKILL.md'), blob('skills/x/../escape')] }
    ],
    ['no skill folder at all', { tree: [blob('README.md')] }]
  ])('refuses %s', (_label, listing) => {
    expect(parseCorporateSkillTree(listing)).toBeNull()
  })
})

describe('lookupCorporateSkillBundle', () => {
  const HEAD = { commit: { sha: SHA('e'), commit: { tree: { sha: SHA('f') } } } }
  const TREE_PATH = `repos/daegun-kim/ORCA_skill/git/trees/${SHA('f')}?recursive=1`

  it('reads the main branch and its tree, nothing else', async () => {
    const readApi = vi.fn(async (path: string, _host: string) => {
      if (path === 'repos/daegun-kim/ORCA_skill/branches/main') {
        return HEAD
      }
      if (path === TREE_PATH) {
        return BUNDLE_TREE
      }
      throw new Error(`unexpected ${path}`)
    })

    const result = await lookupCorporateSkillBundle({ target: TARGET, readApi })

    expect(result.outcome === 'found' && result.bundle).toMatchObject({
      host: TARGET.host,
      repository: TARGET.repository,
      branch: 'main',
      commitSha: SHA('e')
    })
    // Never "the default branch": that is where a mirror keeps the upstream originals.
    expect(readApi.mock.calls.map(([path]) => path)).toEqual([
      'repos/daegun-kim/ORCA_skill/branches/main',
      TREE_PATH
    ])
    expect(readApi.mock.calls.every(([, host]) => host === TARGET.host)).toBe(true)
  })

  it('reports a missing main branch as no-bundle without trying another branch', async () => {
    const readApi = vi.fn(async (path: string) => {
      if (path.endsWith('/branches/main')) {
        throw new Error('gh: Branch not found (HTTP 404)')
      }
      return { default_branch: 'develop' }
    })

    await expect(lookupCorporateSkillBundle({ target: TARGET, readApi })).resolves.toMatchObject({
      outcome: 'no-bundle'
    })
    expect(readApi).toHaveBeenCalledTimes(1)
  })

  it('reports a transient failure as lookup-failed', async () => {
    const readApi = vi.fn().mockRejectedValue(new Error('gh: Bad Gateway (HTTP 502)'))

    await expect(lookupCorporateSkillBundle({ target: TARGET, readApi })).resolves.toMatchObject({
      outcome: 'lookup-failed'
    })
  })

  it('reaches nothing without a corporate host', async () => {
    const readApi = vi.fn()
    await expect(
      lookupCorporateSkillBundle({ target: { ...TARGET, host: null }, readApi })
    ).resolves.toMatchObject({ outcome: 'no-enterprise-host' })
    expect(readApi).not.toHaveBeenCalled()
  })

  it('reports an unreadable tree as lookup-failed, not a throw', async () => {
    const readApi = vi.fn(async (path: string) => {
      if (path.includes('/branches/')) {
        return HEAD
      }
      throw new Error('socket hang up')
    })
    await expect(lookupCorporateSkillBundle({ target: TARGET, readApi })).resolves.toMatchObject({
      outcome: 'lookup-failed'
    })
  })

  it('reports a branch with no installable skills folder as no-bundle', async () => {
    const readApi = vi.fn(async (path: string) =>
      path.includes('/branches/') ? HEAD : { tree: [blob('README.md')] }
    )
    await expect(lookupCorporateSkillBundle({ target: TARGET, readApi })).resolves.toMatchObject({
      outcome: 'no-bundle'
    })
  })
})
