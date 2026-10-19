import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gitBlobSha } from '../../shared/skill-git-tree-identity'
import type { CorporateRemoteBundle } from './corporate-skill-bundle-remote'
import type { CorporateSkillBundleFiles } from './corporate-skill-bundle-download'
import { installCorporateSkillBundle } from './corporate-skill-bundle-install'
import { corporateSkillHomeRoots } from './corporate-skill-local-observation'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

const CONTENT: Record<string, Record<string, string>> = {
  orchestration: { 'SKILL.md': 'new orchestration\n', 'harness-template/rules.md': '# Rules\n' },
  ponytail: { 'SKILL.md': 'ponytail\n' }
}

function bundle(): CorporateRemoteBundle {
  return {
    host: 'github.samsungds.net',
    repository: 'daegun-kim/ORCA_skill',
    branch: 'orca_skill',
    commitSha: 'e'.repeat(40),
    skills: Object.entries(CONTENT).map(([name, files], index) => ({
      name,
      treeSha: String(index + 1).repeat(40),
      files: Object.entries(files).map(([path, content]) => ({
        path,
        blobSha: gitBlobSha(Buffer.from(content)).toString('hex'),
        executable: false
      }))
    }))
  }
}

function files(): CorporateSkillBundleFiles {
  return new Map(
    Object.entries(CONTENT).map(([name, entries]) => [
      name,
      new Map(Object.entries(entries).map(([path, content]) => [path, Buffer.from(content)]))
    ])
  )
}

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-corporate-install-'))
  directories.push(root)
  return root
}

describe('installCorporateSkillBundle', () => {
  it('replaces whole folders in both homes and adds the skills orchestration relies on', async () => {
    const homeDir = await home()
    const roots = corporateSkillHomeRoots(homeDir)
    const stale = join(roots[0].path, 'orchestration')
    await mkdir(stale, { recursive: true })
    await writeFile(join(stale, 'SKILL.md'), 'customized long ago\n')
    await writeFile(join(stale, 'removed-reference.md'), 'the repository dropped this\n')

    const outcome = await installCorporateSkillBundle({
      bundle: bundle(),
      files: files(),
      roots,
      homeDir,
      stateHome: null
    })

    expect(outcome).toEqual({
      installedNames: ['orchestration', 'ponytail'],
      skippedPaths: [],
      errors: []
    })
    for (const root of roots) {
      expect((await readdir(join(root.path, 'orchestration'))).sort()).toEqual([
        'SKILL.md',
        'harness-template'
      ])
      expect(await readFile(join(root.path, 'orchestration', 'SKILL.md'), 'utf8')).toBe(
        'new orchestration\n'
      )
      expect(await readFile(join(root.path, 'ponytail', 'SKILL.md'), 'utf8')).toBe('ponytail\n')
    }
    // Staging lives beside the skills folder and is gone afterwards.
    expect(await readdir(join(homeDir, '.agents'))).toEqual(['.skill-lock.json', 'skills'])
  })

  it('never writes through a link — its target may belong to someone else', async () => {
    const homeDir = await home()
    const roots = corporateSkillHomeRoots(homeDir)
    const elsewhere = join(homeDir, 'someone-elses-checkout')
    await mkdir(elsewhere, { recursive: true })
    await writeFile(join(elsewhere, 'SKILL.md'), 'not ours\n')
    await mkdir(roots[1].path, { recursive: true })
    await symlink(elsewhere, join(roots[1].path, 'orchestration'), 'dir')

    const outcome = await installCorporateSkillBundle({
      bundle: bundle(),
      files: files(),
      roots,
      homeDir,
      stateHome: null
    })

    expect(outcome.skippedPaths).toEqual([join(roots[1].path, 'orchestration')])
    expect(await readFile(join(elsewhere, 'SKILL.md'), 'utf8')).toBe('not ours\n')
    expect(await readFile(join(roots[0].path, 'orchestration', 'SKILL.md'), 'utf8')).toBe(
      'new orchestration\n'
    )
  })

  it('records the corporate source in the lock and keeps unrelated entries', async () => {
    const homeDir = await home()
    await mkdir(join(homeDir, '.agents'), { recursive: true })
    await writeFile(
      join(homeDir, '.agents', '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        skills: {
          orchestration: {
            source: 'orca-bundled',
            sourceUrl: 'https://github.com/stablyai/orca.git',
            installedAt: '2026-08-22T07:50:13.185Z'
          },
          'find-skills': { source: 'vercel-labs/skills' }
        },
        dismissed: { findSkillsPrompt: true }
      })
    )

    await installCorporateSkillBundle({
      bundle: bundle(),
      files: files(),
      roots: corporateSkillHomeRoots(homeDir),
      homeDir,
      stateHome: null,
      now: () => new Date('2026-10-19T00:00:00.000Z')
    })

    const lock = JSON.parse(await readFile(join(homeDir, '.agents', '.skill-lock.json'), 'utf8'))
    expect(lock.skills.orchestration).toEqual({
      source: 'https://github.samsungds.net/daegun-kim/ORCA_skill',
      sourceType: 'git',
      sourceUrl: 'https://github.samsungds.net/daegun-kim/ORCA_skill.git',
      ref: 'e'.repeat(40),
      skillPath: 'skills/orchestration/SKILL.md',
      skillFolderHash: '1'.repeat(40),
      installedAt: '2026-08-22T07:50:13.185Z',
      updatedAt: '2026-10-19T00:00:00.000Z'
    })
    expect(lock.skills.ponytail.installedAt).toBe('2026-10-19T00:00:00.000Z')
    expect(lock.skills['find-skills']).toEqual({ source: 'vercel-labs/skills' })
    expect(lock.dismissed).toEqual({ findSkillsPrompt: true })
  })
})
