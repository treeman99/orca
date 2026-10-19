import { describe, expect, it, vi } from 'vitest'
import { gitBlobSha } from '../../shared/skill-git-tree-identity'
import type { CorporateRemoteBundle } from './corporate-skill-bundle-remote'
import { downloadCorporateSkillBundle } from './corporate-skill-bundle-download'

const SKILL = '---\nname: orchestration\n---\n'
const RULES = '# Rules\n'
// Bytes a text decode would mangle: a downloader that round-trips through a string fails here.
const BINARY = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00, 0x80])

function sha(content: string | Buffer): string {
  return gitBlobSha(Buffer.from(content)).toString('hex')
}

const BUNDLE: CorporateRemoteBundle = {
  host: 'github.samsungds.net',
  repository: 'daegun-kim/ORCA_skill',
  branch: 'orca_skill',
  commitSha: 'e'.repeat(40),
  skills: [
    {
      name: 'orchestration',
      treeSha: 'f'.repeat(40),
      files: [
        { path: 'SKILL.md', blobSha: sha(SKILL), executable: false },
        { path: 'harness-template/rules.md', blobSha: sha(RULES), executable: false },
        { path: 'assets/logo.bin', blobSha: sha(BINARY), executable: false }
      ]
    }
  ]
}

function blobServer(contents: Map<string, Buffer>) {
  return vi.fn(async (path: string, host: string) => {
    expect(host).toBe('github.samsungds.net')
    const bytes = contents.get(path.split('/').pop() ?? '')
    return { content: (bytes ?? Buffer.alloc(0)).toString('base64'), encoding: 'base64' }
  })
}

describe('downloadCorporateSkillBundle', () => {
  it('fetches every file of the commit as a blob, byte for byte', async () => {
    const readApi = blobServer(
      new Map([
        [sha(SKILL), Buffer.from(SKILL)],
        [sha(RULES), Buffer.from(RULES)],
        [sha(BINARY), BINARY]
      ])
    )

    const files = await downloadCorporateSkillBundle(BUNDLE, { readApi })

    expect(readApi).toHaveBeenCalledWith(
      `repos/daegun-kim/ORCA_skill/git/blobs/${sha(SKILL)}`,
      'github.samsungds.net'
    )
    expect(files.get('orchestration')?.get('SKILL.md')?.toString()).toBe(SKILL)
    expect(files.get('orchestration')?.get('harness-template/rules.md')?.toString()).toBe(RULES)
    expect(files.get('orchestration')?.get('assets/logo.bin')).toEqual(BINARY)
  })

  it('refuses a blob whose bytes do not hash to what the tree promised', async () => {
    const readApi = blobServer(new Map([[sha(SKILL), Buffer.from('tampered')]]))

    await expect(downloadCorporateSkillBundle(BUNDLE, { readApi })).rejects.toThrow(
      /does not match commit/
    )
  })
})
