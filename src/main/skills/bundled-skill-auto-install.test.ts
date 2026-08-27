import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  autoInstallBundledSkills,
  decidePlacement,
  readPlacedTreeSha,
  resolveAutoInstallRoots
} from './bundled-skill-auto-install'
import { AGENT_SKILL_INSTALL_ROOTS } from '../../shared/agent-skill-install-roots'

const temporaryDirectories: string[] = []

async function makeFixture(): Promise<{ home: string; packageRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'orca-auto-install-'))
  temporaryDirectories.push(root)
  const packageRoot = join(root, 'packages')
  await mkdir(join(packageRoot, 'demo-skill'), { recursive: true })
  await writeFile(join(packageRoot, 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\n---\nv1\n')
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  return { home, packageRoot }
}

const SHARED_ROOT = AGENT_SKILL_INSTALL_ROOTS.filter((root) => root.rootId === 'home-agents')
const CLAUDE_ROOT = AGENT_SKILL_INSTALL_ROOTS.filter((root) => root.rootId === 'home-claude')

function placedSkillPath(home: string, rootSegments: readonly string[]): string {
  return join(home, ...rootSegments, 'demo-skill')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('bundled skill auto install', () => {
  it('places a skill that is not there yet', async () => {
    const { home, packageRoot } = await makeFixture()

    const result = await autoInstallBundledSkills({
      names: ['demo-skill'],
      packageRoot,
      homeDir: home,
      roots: SHARED_ROOT
    })

    expect(result.errors).toEqual([])
    expect(result.decisions).toEqual([
      { name: 'demo-skill', root: 'home-agents', decision: 'installed' }
    ])
    const placed = await readFile(
      join(placedSkillPath(home, ['.agents', 'skills']), 'SKILL.md'),
      'utf8'
    )
    expect(placed).toContain('v1')
  })

  it('does nothing on a second run', async () => {
    const { home, packageRoot } = await makeFixture()
    const run = () =>
      autoInstallBundledSkills({
        names: ['demo-skill'],
        packageRoot,
        homeDir: home,
        roots: SHARED_ROOT
      })

    await run()
    const second = await run()

    expect(second.decisions).toEqual([
      { name: 'demo-skill', root: 'home-agents', decision: 'already-current' }
    ])
  })

  it('refreshes a stale copy this installer wrote and nobody edited', async () => {
    const { home, packageRoot } = await makeFixture()
    await autoInstallBundledSkills({
      names: ['demo-skill'],
      packageRoot,
      homeDir: home,
      roots: SHARED_ROOT
    })
    // A newer build ships different bytes for the same skill.
    await writeFile(join(packageRoot, 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\n---\nv2\n')

    const result = await autoInstallBundledSkills({
      names: ['demo-skill'],
      packageRoot,
      homeDir: home,
      roots: SHARED_ROOT
    })

    expect(result.decisions[0]?.decision).toBe('installed')
    expect(
      await readFile(join(placedSkillPath(home, ['.agents', 'skills']), 'SKILL.md'), 'utf8')
    ).toContain('v2')
  })

  it('never overwrites a copy the user edited', async () => {
    const { home, packageRoot } = await makeFixture()
    await autoInstallBundledSkills({
      names: ['demo-skill'],
      packageRoot,
      homeDir: home,
      roots: SHARED_ROOT
    })
    const placedFile = join(placedSkillPath(home, ['.agents', 'skills']), 'SKILL.md')
    await writeFile(placedFile, '---\nname: demo-skill\n---\nmine, hands off\n')
    await writeFile(join(packageRoot, 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\n---\nv2\n')

    const result = await autoInstallBundledSkills({
      names: ['demo-skill'],
      packageRoot,
      homeDir: home,
      roots: SHARED_ROOT
    })

    expect(result.decisions[0]?.decision).toBe('kept-user-copy')
    expect(await readFile(placedFile, 'utf8')).toContain('mine, hands off')
  })

  it('leaves a copy another installer placed alone', async () => {
    const { home, packageRoot } = await makeFixture()
    const target = placedSkillPath(home, ['.agents', 'skills'])
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'SKILL.md'), '---\nname: demo-skill\n---\nfrom npx skills add\n')

    const result = await autoInstallBundledSkills({
      names: ['demo-skill'],
      packageRoot,
      homeDir: home,
      roots: SHARED_ROOT
    })

    // No lock entry at all: nothing proves the bytes are ours, so they stay.
    expect(result.decisions[0]?.decision).toBe('kept-user-copy')
    expect(await readFile(join(target, 'SKILL.md'), 'utf8')).toContain('from npx skills add')
  })

  it('reports a missing package instead of throwing', async () => {
    const { home, packageRoot } = await makeFixture()

    const result = await autoInstallBundledSkills({
      names: ['not-shipped'],
      packageRoot,
      homeDir: home,
      roots: SHARED_ROOT
    })

    expect(result.errors).toHaveLength(1)
    expect(result.decisions).toEqual([])
  })

  it('targets the shared root always and an agent home only when it exists', async () => {
    const { home } = await makeFixture()

    const withoutClaude = await resolveAutoInstallRoots(home)
    expect(withoutClaude.map((root) => root.rootId)).toEqual(['home-agents'])

    await mkdir(join(home, '.claude'), { recursive: true })
    const withClaude = await resolveAutoInstallRoots(home)
    expect(withClaude.map((root) => root.rootId)).toContain('home-claude')
    expect(withClaude.map((root) => root.rootId)).toContain('home-agents')
  })

  it('installs into a detected agent home, not only the shared root', async () => {
    const { home, packageRoot } = await makeFixture()
    await mkdir(join(home, '.claude'), { recursive: true })

    await autoInstallBundledSkills({
      names: ['demo-skill'],
      packageRoot,
      homeDir: home,
      roots: [...SHARED_ROOT, ...CLAUDE_ROOT]
    })

    expect(
      await readFile(join(placedSkillPath(home, ['.claude', 'skills']), 'SKILL.md'), 'utf8')
    ).toContain('v1')
  })

  it('reads nothing back for a directory with no files', async () => {
    const { home } = await makeFixture()
    expect(await readPlacedTreeSha(join(home, 'absent'))).toBeNull()
  })

  it('keeps a copy whose bytes match neither the bundle nor the lock', () => {
    expect(decidePlacement({ placedSha: 'a', bundledSha: 'b', lockSha: 'c' })).toBe(
      'kept-user-copy'
    )
    expect(decidePlacement({ placedSha: null, bundledSha: 'b', lockSha: undefined })).toBe(
      'installed'
    )
    expect(decidePlacement({ placedSha: 'b', bundledSha: 'b', lockSha: 'a' })).toBe(
      'already-current'
    )
  })
})
