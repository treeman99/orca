import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gitBlobSha } from '../../shared/skill-git-tree-identity'
import type { CorporateRemoteSkill } from './corporate-skill-bundle-remote'
import {
  corporateSkillHomeRoots,
  observeCorporateSkillPlacement,
  observeCorporateSkills
} from './corporate-skill-local-observation'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

const FILES = {
  'SKILL.md': '---\nname: orchestration\n---\n\nBody\n',
  'harness-template/rules.md': '# Rules\n'
}

function remoteSkill(files: Record<string, string> = FILES): CorporateRemoteSkill {
  return {
    name: 'orchestration',
    treeSha: 'f'.repeat(40),
    files: Object.entries(files).map(([path, content]) => ({
      path,
      blobSha: gitBlobSha(Buffer.from(content)).toString('hex'),
      executable: false
    }))
  }
}

async function folder(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-corporate-skill-'))
  directories.push(root)
  const directory = join(root, 'orchestration')
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(directory, ...path.split('/').slice(0, -1)), { recursive: true })
    await writeFile(join(directory, ...path.split('/')), content)
  }
  return directory
}

describe('observeCorporateSkillPlacement', () => {
  it('calls an exact copy current', async () => {
    expect(await observeCorporateSkillPlacement(await folder(FILES), remoteSkill())).toBe('current')
  })

  it('calls a CRLF checkout of the same files current', async () => {
    const crlf = Object.fromEntries(
      Object.entries(FILES).map(([path, content]) => [path, content.replace(/\n/g, '\r\n')])
    )
    expect(await observeCorporateSkillPlacement(await folder(crlf), remoteSkill())).toBe('current')
  })

  it('ignores files the OS drops into folders', async () => {
    const directory = await folder({ ...FILES, '.DS_Store': 'x', 'Thumbs.db': 'y' })
    expect(await observeCorporateSkillPlacement(directory, remoteSkill())).toBe('current')
  })

  it.each([
    ['an edited file', { ...FILES, 'SKILL.md': 'edited' }],
    ['a file the repository dropped', { ...FILES, 'old-reference.md': 'stale' }],
    ['a file the repository added', { 'SKILL.md': FILES['SKILL.md'] }]
  ])('calls a copy with %s outdated', async (_label, files) => {
    expect(await observeCorporateSkillPlacement(await folder(files), remoteSkill())).toBe(
      'outdated'
    )
  })

  it('reports a missing folder, a link, and a file in the way distinctly', async () => {
    const directory = await folder(FILES)
    const parent = join(directory, '..')
    await symlink(directory, join(parent, 'linked'), 'dir')
    await writeFile(join(parent, 'a-file'), 'not a folder')

    expect(await observeCorporateSkillPlacement(join(parent, 'absent'), remoteSkill())).toBe(
      'missing'
    )
    expect(await observeCorporateSkillPlacement(join(parent, 'linked'), remoteSkill())).toBe('link')
    expect(await observeCorporateSkillPlacement(join(parent, 'a-file'), remoteSkill())).toBe(
      'blocked'
    )
  })
})

describe('observeCorporateSkills', () => {
  it('reports every skill in both homes the install instructions require', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orca-corporate-home-'))
    directories.push(home)
    const roots = corporateSkillHomeRoots(home)
    const agentsCopy = join(roots[0].path, 'orchestration')
    await mkdir(join(agentsCopy, 'harness-template'), { recursive: true })
    await writeFile(join(agentsCopy, 'SKILL.md'), FILES['SKILL.md'])
    await writeFile(
      join(agentsCopy, 'harness-template', 'rules.md'),
      FILES['harness-template/rules.md']
    )

    expect(await observeCorporateSkills([remoteSkill()], roots)).toEqual([
      {
        name: 'orchestration',
        placements: [
          { home: 'agents', path: agentsCopy, state: 'current' },
          { home: 'claude', path: join(roots[1].path, 'orchestration'), state: 'missing' }
        ]
      }
    ])
  })
})
