/**
 * Main-process submodule write stack against a real Git binary, kept in lockstep with
 * src/relay/git-handler-submodule-write.test.ts so an SSH workspace behaves identically.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { getStatus, getSubmoduleStatus, invalidateGitReadCaches } from './status'
import {
  commitSubmoduleChanges,
  listSubmodules,
  pullSubmodule,
  pushSubmodule,
  stageSubmoduleFiles,
  unstageSubmoduleFiles
} from './submodule-write-ops'
import {
  advanceSubmoduleRemote,
  commitAll,
  createRootWithSubmodule,
  git,
  SUBMODULE_PATH,
  type SubmoduleFixture
} from './submodule-write-test-repo'

describe('submodule write operations (real git)', () => {
  let tmpDir: string
  let fixture: SubmoduleFixture

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'orca-submodule-write-'))
    fixture = createRootWithSubmodule(tmpDir)
    invalidateGitReadCaches()
  })

  afterEach(async () => {
    invalidateGitReadCaches()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function submoduleFile(name: string): string {
    return path.join(fixture.submoduleWorktreePath, name)
  }

  describe('listSubmodules', () => {
    it('reports name, forward-slash path and initialized state', async () => {
      const result = await listSubmodules(fixture.rootPath)

      expect(result).toEqual({
        submodules: [{ name: SUBMODULE_PATH, path: SUBMODULE_PATH, initialized: true }],
        didHitLimit: false
      })
    })

    it('reports an uninitialized submodule as not initialized', async () => {
      git(fixture.rootPath, ['submodule', 'deinit', '-f', '--', SUBMODULE_PATH])
      invalidateGitReadCaches()

      const result = await listSubmodules(fixture.rootPath)

      expect(result.submodules).toEqual([
        { name: SUBMODULE_PATH, path: SUBMODULE_PATH, initialized: false }
      ])
    })

    it('caps at 10 and flags didHitLimit', async () => {
      const lines = Array.from(
        { length: 12 },
        (_, index) => `[submodule "sub${index}"]\n\tpath = vendor/sub${index}/\n\turl = ./x\n`
      ).join('')
      writeFileSync(path.join(fixture.rootPath, '.gitmodules'), lines)
      invalidateGitReadCaches()

      const result = await listSubmodules(fixture.rootPath)

      expect(result.didHitLimit).toBe(true)
      expect(result.submodules).toHaveLength(10)
      // Trailing slash from .gitmodules must not survive into the path the UI keys on.
      expect(result.submodules[0]).toEqual({
        name: 'sub0',
        path: 'vendor/sub0',
        initialized: false
      })
    })

    it('degrades to an empty list for a folder workspace that is not a git repo', async () => {
      const plainFolder = path.join(tmpDir, 'plain')
      mkdirSync(plainFolder, { recursive: true })

      await expect(listSubmodules(plainFolder)).resolves.toEqual({
        submodules: [],
        didHitLimit: false
      })
    })
  })

  it('stages and unstages inside the submodule only', async () => {
    appendFileSync(submoduleFile('subfile.txt'), 'edited\n')
    appendFileSync(path.join(fixture.rootPath, 'rootfile.txt'), 'parent-edit\n')

    await stageSubmoduleFiles(fixture.rootPath, SUBMODULE_PATH, ['subfile.txt'])
    invalidateGitReadCaches()
    const staged = await getSubmoduleStatus(fixture.rootPath, SUBMODULE_PATH, { staged: true })
    expect(staged.entries.map((entry) => [entry.path, entry.area])).toEqual([
      ['subfile.txt', 'staged']
    ])

    // The parent's own edit must still be unstaged — the write was scoped to the submodule.
    const parent = await getStatus(fixture.rootPath)
    expect(parent.entries.find((entry) => entry.path === 'rootfile.txt')?.area).toBe('unstaged')

    await unstageSubmoduleFiles(fixture.rootPath, SUBMODULE_PATH, ['subfile.txt'])
    invalidateGitReadCaches()
    const afterUnstage = await getSubmoduleStatus(fixture.rootPath, SUBMODULE_PATH)
    expect(afterUnstage.entries.map((entry) => [entry.path, entry.area])).toEqual([
      ['subfile.txt', 'unstaged']
    ])
  })

  it('unstages in a submodule that has no commit yet (unborn HEAD)', async () => {
    const unbornPath = path.join(fixture.rootPath, 'vendor', 'unborn')
    mkdirSync(unbornPath, { recursive: true })
    git(unbornPath, ['init', '-q', '-b', 'main', '.'])
    writeFileSync(path.join(unbornPath, 'new.txt'), 'fresh\n')
    git(unbornPath, ['add', 'new.txt'])
    writeFileSync(
      path.join(fixture.rootPath, '.gitmodules'),
      `[submodule "vendor/unborn"]\n\tpath = vendor/unborn\n\turl = ./unborn\n`
    )
    invalidateGitReadCaches()

    await unstageSubmoduleFiles(fixture.rootPath, 'vendor/unborn', ['new.txt'])

    expect(git(unbornPath, ['status', '--porcelain'])).toContain('?? new.txt')
  })

  it('commits in the submodule without touching the parent', async () => {
    appendFileSync(submoduleFile('subfile.txt'), 'edited\n')
    await stageSubmoduleFiles(fixture.rootPath, SUBMODULE_PATH, ['subfile.txt'])
    const parentHeadBefore = git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()

    const result = await commitSubmoduleChanges(fixture.rootPath, SUBMODULE_PATH, 'sub commit')

    expect(result).toEqual({ success: true })
    expect(git(fixture.submoduleWorktreePath, ['log', '-1', '--format=%s']).trim()).toBe(
      'sub commit'
    )
    expect(git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHeadBefore)
  })

  it('returns a failure result instead of throwing when there is nothing to commit', async () => {
    const result = await commitSubmoduleChanges(fixture.rootPath, SUBMODULE_PATH, 'empty')

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('pushes the submodule branch and sets its upstream', async () => {
    git(fixture.submoduleWorktreePath, ['checkout', '-q', '-B', 'main'])
    appendFileSync(submoduleFile('subfile.txt'), 'pushed\n')
    commitAll(fixture.submoduleWorktreePath, 'sub push me')

    await pushSubmodule(fixture.rootPath, SUBMODULE_PATH, true)

    expect(
      git(fixture.submoduleWorktreePath, [
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{u}'
      ]).trim()
    ).toBe('origin/main')
    expect(git(fixture.submoduleRemotePath, ['log', '-1', '--format=%s', 'main']).trim()).toBe(
      'sub push me'
    )
    // Parent still points at the old commit; publishing the submodule is not a parent write.
    expect(readFileSync(path.join(fixture.rootPath, 'rootfile.txt'), 'utf8')).toBe('root\n')
  })

  it('pulls the submodule forward when it is behind only', async () => {
    git(fixture.submoduleWorktreePath, ['checkout', '-q', '-B', 'main'])
    advanceSubmoduleRemote(tmpDir, fixture, 'remote work')
    git(fixture.submoduleWorktreePath, ['fetch', '-q', 'origin'])
    invalidateGitReadCaches()
    const parentHeadBefore = git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()
    expect(
      (await getSubmoduleStatus(fixture.rootPath, SUBMODULE_PATH)).upstreamStatus
    ).toMatchObject({ ahead: 0, behind: 1 })

    await pullSubmodule(fixture.rootPath, SUBMODULE_PATH)
    invalidateGitReadCaches()

    expect(git(fixture.submoduleWorktreePath, ['log', '-1', '--format=%s']).trim()).toBe(
      'remote work'
    )
    expect(
      (await getSubmoduleStatus(fixture.rootPath, SUBMODULE_PATH)).upstreamStatus
    ).toMatchObject({ ahead: 0, behind: 0 })
    // The gitlink moves only when the parent commits it; a submodule pull is not a parent write.
    expect(git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHeadBefore)
  })

  it('fills upstreamStatus on the submodule status so Publish/Sync can be decided', async () => {
    git(fixture.submoduleWorktreePath, ['checkout', '-q', '-B', 'main'])
    invalidateGitReadCaches()

    const inSync = await getSubmoduleStatus(fixture.rootPath, SUBMODULE_PATH)
    expect(inSync.upstreamStatus).toEqual({
      hasUpstream: true,
      upstreamName: 'origin/main',
      ahead: 0,
      behind: 0
    })

    appendFileSync(submoduleFile('subfile.txt'), 'ahead\n')
    commitAll(fixture.submoduleWorktreePath, 'ahead by one')
    invalidateGitReadCaches()

    const ahead = await getSubmoduleStatus(fixture.rootPath, SUBMODULE_PATH)
    expect(ahead.upstreamStatus?.ahead).toBe(1)

    // An unpublished branch must report no upstream, so the panel can offer Publish.
    git(fixture.submoduleWorktreePath, ['checkout', '-q', '-b', 'unpublished'])
    invalidateGitReadCaches()

    const unpublished = await getSubmoduleStatus(fixture.rootPath, SUBMODULE_PATH)
    expect(unpublished.upstreamStatus?.hasUpstream).toBe(false)
  })
})
