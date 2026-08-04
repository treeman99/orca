/**
 * Adding, deleting or renaming a submodule must survive a checked-in
 * `submodule.<name>.ignore` of `untracked`/`dirty`.
 *
 * Why this needs its own cover: the submodule sub-state field describes what is
 * going on INSIDE the submodule, so Git emits `S...` — every inner flag clear —
 * for a gitlink that was added, removed or renamed. The first version of the
 * ignore narrowing decided "drop" from those three flags alone, so under
 * `untracked`/`dirty` the row vanished from Source Control while `git status`
 * still listed it. A staged add is the dangerous one: it is already in the index,
 * so committing from a panel that cannot show it commits it unseen.
 *
 * Why real Git: the `S...` shape is Git's, and no stubbed executor produces it.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { getStatus, invalidateGitReadCaches } from './status'

const SUBMODULE_PATH = 'vendor/sub'

function git(dir: string, args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'protocol.file.allow=always',
      '-c',
      'user.email=orca-test@example.com',
      '-c',
      'user.name=Orca Test',
      ...args
    ],
    { cwd: dir, stdio: 'pipe', encoding: 'utf8' }
  )
}

function createRootWithSubmodule(tmpDir: string, ignoreMode: string): string {
  const originPath = path.join(tmpDir, 'sub-origin')
  const rootPath = path.join(tmpDir, 'root')
  mkdirSync(originPath, { recursive: true })
  mkdirSync(rootPath, { recursive: true })

  git(originPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(originPath, 'subfile.txt'), 'one\n')
  git(originPath, ['add', '-A'])
  git(originPath, ['commit', '-m', 'sub init'])

  git(rootPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(rootPath, 'rootfile.txt'), 'root\n')
  git(rootPath, ['add', '-A'])
  git(rootPath, ['commit', '-m', 'root init'])
  git(rootPath, ['submodule', 'add', '-q', originPath, SUBMODULE_PATH])
  git(rootPath, ['config', '-f', '.gitmodules', `submodule.${SUBMODULE_PATH}.ignore`, ignoreMode])
  git(rootPath, ['add', '.gitmodules'])
  return rootPath
}

describe('gitlink add / delete / rename under a checked-in submodule ignore', () => {
  let tmpDir: string

  beforeEach(() => {
    invalidateGitReadCaches()
    tmpDir = mkdtempSync(path.join(tmpdir(), 'orca-submodule-adr-'))
  })

  afterEach(async () => {
    invalidateGitReadCaches()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  for (const mode of ['untracked', 'dirty']) {
    it(`reports a staged submodule ADD under ignore = ${mode}, like git status`, async () => {
      const rootPath = createRootWithSubmodule(tmpDir, mode)

      // Git's own answer, with the checked-in config honoured.
      expect(git(rootPath, ['status', '--short'])).toContain(`A  ${SUBMODULE_PATH}`)
      expect(git(rootPath, ['status', '--porcelain=v2'])).toContain(`1 A. S... `)

      const result = await getStatus(rootPath)

      const row = result.entries.find((entry) => entry.path === SUBMODULE_PATH)
      expect(row?.status).toBe('added')
      expect(row?.area).toBe('staged')
    })

    it(`reports a submodule DELETE under ignore = ${mode}, like git status`, async () => {
      const rootPath = createRootWithSubmodule(tmpDir, mode)
      git(rootPath, ['add', '-A'])
      git(rootPath, ['commit', '-m', 'add submodule'])
      rmSync(path.join(rootPath, SUBMODULE_PATH), { recursive: true, force: true })
      invalidateGitReadCaches()

      expect(git(rootPath, ['status', '--short'])).toContain(` D ${SUBMODULE_PATH}`)

      const result = await getStatus(rootPath)

      expect(result.entries.find((entry) => entry.path === SUBMODULE_PATH)?.status).toBe('deleted')
    })

    it(`reports a staged submodule RENAME under ignore = ${mode}, like git status`, async () => {
      const rootPath = createRootWithSubmodule(tmpDir, mode)
      git(rootPath, ['add', '-A'])
      git(rootPath, ['commit', '-m', 'add submodule'])
      git(rootPath, ['mv', SUBMODULE_PATH, 'vendor/renamed'])
      invalidateGitReadCaches()

      expect(git(rootPath, ['status', '--short'])).toContain('vendor/renamed')

      const result = await getStatus(rootPath)

      expect(result.entries.map((entry) => entry.path)).toContain('vendor/renamed')
    })
  }

  it('reports a staged ADD even under ignore = all, because git does', async () => {
    // `submodule.<name>.ignore` reaches worktree-vs-index only. A staged gitlink is
    // index-vs-HEAD, so Git lists it whatever the config says — only the explicit
    // `--ignore-submodules=all` command-line flag suppresses it, and Orca never
    // asks a user's config to behave like that flag.
    const rootPath = createRootWithSubmodule(tmpDir, 'all')

    expect(git(rootPath, ['status', '--short'])).toContain(`A  ${SUBMODULE_PATH}`)

    const result = await getStatus(rootPath)

    expect(result.entries.find((entry) => entry.path === SUBMODULE_PATH)?.status).toBe('added')
  })

  it('reports a staged pointer bump under ignore = all, because git does', async () => {
    const rootPath = createRootWithSubmodule(tmpDir, 'all')
    git(rootPath, ['add', '-A'])
    git(rootPath, ['commit', '-m', 'add submodule'])
    const submodulePath = path.join(rootPath, SUBMODULE_PATH)
    writeFileSync(path.join(submodulePath, 'subfile.txt'), 'two\n')
    git(submodulePath, ['commit', '-am', 'advance submodule'])
    git(rootPath, ['add', SUBMODULE_PATH])
    invalidateGitReadCaches()

    expect(git(rootPath, ['status', '--short'])).toContain(`M  ${SUBMODULE_PATH}`)

    const result = await getStatus(rootPath)

    const row = result.entries.find((entry) => entry.path === SUBMODULE_PATH)
    expect(row?.area).toBe('staged')
    expect(row?.status).toBe('modified')
  })

  it('still hides the UNSTAGED pointer drift under ignore = all, because git does', async () => {
    // The contrast that keeps the original fix alive: worktree-vs-index is exactly
    // what the setting governs, and this row is the one nobody edited.
    const rootPath = createRootWithSubmodule(tmpDir, 'all')
    git(rootPath, ['add', '-A'])
    git(rootPath, ['commit', '-m', 'add submodule'])
    const submodulePath = path.join(rootPath, SUBMODULE_PATH)
    writeFileSync(path.join(submodulePath, 'subfile.txt'), 'two\n')
    git(submodulePath, ['commit', '-am', 'advance submodule'])
    invalidateGitReadCaches()

    expect(git(rootPath, ['status', '--short'])).not.toContain(SUBMODULE_PATH)

    const result = await getStatus(rootPath)

    expect(result.entries.map((entry) => entry.path)).not.toContain(SUBMODULE_PATH)
  })
})
