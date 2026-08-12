import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AGENT_SKILL_INSTALL_ROOTS,
  resolveAgentSkillInstallRoots
} from './agent-skill-install-roots'
import { BUNDLED_SKILL_LOCK_SOURCE, installBundledSkills } from './bundled-skill-install'
import { readBundledSkillPackage } from './bundled-skill-package-source'

const REPO_ROOT = resolve(__dirname, '..', '..')
const temporaryDirectories: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-bundled-skill-'))
  temporaryDirectories.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function makePackageRoot(files: Record<string, string>): Promise<string> {
  const root = await makeTempDir()
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, ...path.split('/'))
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
  return root
}

describe('installBundledSkills', () => {
  it('writes the package into every selected agent home and records the lock', async () => {
    const packageRoot = await makePackageRoot({ 'demo/SKILL.md': '# Demo\n' })
    const homeDir = await makeTempDir()

    const result = await installBundledSkills({
      names: ['demo'],
      packageRoot,
      homeDir,
      roots: resolveAgentSkillInstallRoots(['universal', 'claude-code'])
    })

    expect(result.errors).toEqual([])
    expect(result.installed).toHaveLength(1)
    expect(await readFile(join(homeDir, '.agents', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(
      '# Demo\n'
    )
    expect(await readFile(join(homeDir, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(
      '# Demo\n'
    )

    const lock = JSON.parse(
      await readFile(join(homeDir, '.agents', '.skill-lock.json'), 'utf8')
    ) as {
      version: number
      skills: Record<string, { skillFolderHash: string; skillPath: string; source: string }>
    }
    // Why: update eligibility is gated on a lock entry with all three fields at
    // version >= 3, so an install that skips it leaves the Update button dead.
    expect(lock.version).toBeGreaterThanOrEqual(3)
    expect(lock.skills.demo.skillFolderHash).toBe(result.installed[0].gitTreeSha)
    expect(lock.skills.demo.skillPath).toBe(join(homeDir, '.agents', 'skills', 'demo'))
    expect(lock.skills.demo.source).toBe(BUNDLED_SKILL_LOCK_SOURCE)
  })

  it('keeps lock entries it did not write', async () => {
    const packageRoot = await makePackageRoot({ 'demo/SKILL.md': '# Demo\n' })
    const homeDir = await makeTempDir()
    await mkdir(join(homeDir, '.agents'), { recursive: true })
    await writeFile(
      join(homeDir, '.agents', '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        somethingElse: true,
        skills: {
          other: { skillFolderHash: 'abc', skillPath: '/elsewhere/other', source: 'npm' }
        }
      }),
      'utf8'
    )

    await installBundledSkills({
      names: ['demo'],
      packageRoot,
      homeDir,
      roots: resolveAgentSkillInstallRoots(['universal'])
    })

    const lock = JSON.parse(
      await readFile(join(homeDir, '.agents', '.skill-lock.json'), 'utf8')
    ) as Record<string, unknown> & { skills: Record<string, { source: string }> }
    expect(lock.somethingElse).toBe(true)
    expect(lock.skills.other.source).toBe('npm')
    expect(lock.skills.demo.source).toBe(BUNDLED_SKILL_LOCK_SOURCE)
  })

  it('reports a missing package instead of writing a half install', async () => {
    const packageRoot = await makePackageRoot({ 'demo/SKILL.md': '# Demo\n' })
    const homeDir = await makeTempDir()

    const result = await installBundledSkills({
      names: ['absent'],
      packageRoot,
      homeDir,
      roots: resolveAgentSkillInstallRoots(['universal'])
    })

    expect(result.installed).toEqual([])
    expect(result.errors[0]?.name).toBe('absent')
  })

  it('refuses to write anything when no target was selected', async () => {
    const packageRoot = await makePackageRoot({ 'demo/SKILL.md': '# Demo\n' })
    const homeDir = await makeTempDir()

    const result = await installBundledSkills({
      names: ['demo'],
      packageRoot,
      homeDir,
      roots: resolveAgentSkillInstallRoots(['not-an-agent'])
    })

    expect(result.installed).toEqual([])
    expect(result.errors[0]?.message).toContain('No install target')
  })

  it('leaves the global lock alone for a project-scoped install', async () => {
    const packageRoot = await makePackageRoot({ 'demo/SKILL.md': '# Demo\n' })
    const projectDir = await makeTempDir()

    await installBundledSkills({
      names: ['demo'],
      packageRoot,
      homeDir: projectDir,
      roots: [{ rootId: 'repo-agents', segments: ['.agents', 'skills'], agentKey: null }],
      recordLock: false
    })

    expect(await readFile(join(projectDir, '.agents', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(
      '# Demo\n'
    )
    await expect(
      readFile(join(projectDir, '.agents', '.skill-lock.json'), 'utf8')
    ).rejects.toThrow()
  })

  // The decisive check for the offline lane: the lock hash has to equal the
  // gitTreeSha the freshness manifest recorded for the same package, or every
  // install reports itself as unrecognized content the moment it lands.
  it('installs bytes whose tree sha matches the shipped freshness manifest', async () => {
    const manifest = JSON.parse(
      await readFile(join(REPO_ROOT, 'resources', 'skills', 'current-manifest.json'), 'utf8')
    ) as { skills: { name: string; gitTreeSha: string }[] }
    expect(manifest.skills.length).toBeGreaterThan(0)
    const homeDir = await makeTempDir()

    const result = await installBundledSkills({
      names: manifest.skills.map((skill) => skill.name),
      packageRoot: join(REPO_ROOT, 'skills'),
      homeDir,
      roots: resolveAgentSkillInstallRoots(['universal'])
    })

    expect(result.errors).toEqual([])
    for (const skill of manifest.skills) {
      const installed = result.installed.find((entry) => entry.name === skill.name)
      expect(installed?.gitTreeSha).toBe(skill.gitTreeSha)
    }
  })

  it('rewrites an existing install so an update converges', async () => {
    const packageRoot = await makePackageRoot({ 'demo/SKILL.md': '# Demo v2\n' })
    const homeDir = await makeTempDir()
    const target = join(homeDir, '.agents', 'skills', 'demo')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'SKILL.md'), '# Demo v1\n', 'utf8')

    await installBundledSkills({
      names: ['demo'],
      packageRoot,
      homeDir,
      roots: resolveAgentSkillInstallRoots(['universal'])
    })

    expect(await readFile(join(target, 'SKILL.md'), 'utf8')).toBe('# Demo v2\n')
  })
})

describe('readBundledSkillPackage', () => {
  it('returns nested files in a stable order', async () => {
    const packageRoot = await makePackageRoot({
      'demo/SKILL.md': '# Demo\n',
      'demo/reference/b.md': 'b\n',
      'demo/reference/a.md': 'a\n'
    })

    const files = await readBundledSkillPackage(packageRoot, 'demo')

    expect(files.map((file) => file.path)).toEqual(['SKILL.md', 'reference/a.md', 'reference/b.md'])
  })
})

describe('agent skill install roots', () => {
  it('keys every root by a directory the freshness inventory also scans', () => {
    // Why: an install into a directory Orca does not scan reports success and then
    // shows the skill as never installed.
    expect(new Set(AGENT_SKILL_INSTALL_ROOTS.map((root) => root.rootId)).size).toBe(
      AGENT_SKILL_INSTALL_ROOTS.length
    )
    expect(AGENT_SKILL_INSTALL_ROOTS.some((root) => root.rootId === 'home-agents')).toBe(true)
  })
})
