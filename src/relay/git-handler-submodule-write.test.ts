/**
 * Relay counterpart to src/main/git/submodule-write-ops.test.ts and
 * ...-root-guard.test.ts. Both halves must ship together: split, an SSH workspace keeps
 * the old behaviour (or, for the root guard, the old accident) while local looks fixed.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { GitHandler } from './git-handler'
import { RelayContext } from './context'
import type { GitSubmoduleListResult } from '../shared/git-submodule-list'
import {
  createMockDispatcher,
  type MockDispatcher,
  type RelayDispatcher
} from './git-handler-test-setup'

const SUBMODULE_PATH = 'vendor/sub'
const DECOY_PATH = 'rootfile.txt'

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

function commitAll(dir: string, message: string): void {
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-m', message, '--allow-empty'])
}

function createRootWithSubmodule(tmpDir: string): { rootPath: string; subPath: string } {
  const originPath = path.join(tmpDir, 'sub-origin')
  const rootPath = path.join(tmpDir, 'root')
  mkdirSync(originPath, { recursive: true })
  mkdirSync(rootPath, { recursive: true })

  git(originPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(originPath, 'subfile.txt'), 'one\n')
  commitAll(originPath, 'sub init')
  // Why detach: pushing to a checked-out branch of a non-bare repo is refused.
  git(originPath, ['checkout', '-q', '--detach'])

  git(rootPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(rootPath, DECOY_PATH), 'root\n')
  commitAll(rootPath, 'root init')
  git(rootPath, ['submodule', 'add', '-q', originPath, SUBMODULE_PATH])
  commitAll(rootPath, 'add submodule')

  return { rootPath, subPath: path.join(rootPath, SUBMODULE_PATH) }
}

describe('GitHandler — submodule write operations', () => {
  let dispatcher: MockDispatcher
  let handler: GitHandler
  let tmpDir: string
  let rootPath: string
  let subPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-submodule-write-'))
    dispatcher = createMockDispatcher()
    handler = new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
    const repo = createRootWithSubmodule(tmpDir)
    rootPath = repo.rootPath
    subPath = repo.subPath
  })

  afterEach(async () => {
    handler.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function submoduleList(): Promise<GitSubmoduleListResult> {
    return (await dispatcher.callRequest('git.submoduleList', {
      worktreePath: rootPath
    })) as GitSubmoduleListResult
  }

  it('lists the submodule with its name, path and initialized state', async () => {
    await expect(submoduleList()).resolves.toEqual({
      submodules: [{ name: SUBMODULE_PATH, path: SUBMODULE_PATH, initialized: true }],
      didHitLimit: false
    })
  })

  it('caps the list at 10 and strips trailing slashes', async () => {
    writeFileSync(
      path.join(rootPath, '.gitmodules'),
      Array.from(
        { length: 12 },
        (_, index) => `[submodule "sub${index}"]\n\tpath = vendor/sub${index}/\n\turl = ./x\n`
      ).join('')
    )

    const result = await submoduleList()

    expect(result.didHitLimit).toBe(true)
    expect(result.submodules).toHaveLength(10)
    expect(result.submodules[0]).toEqual({ name: 'sub0', path: 'vendor/sub0', initialized: false })
  })

  it('degrades to an empty list outside a git repository (folder workspace)', async () => {
    const plainFolder = path.join(tmpDir, 'plain')
    mkdirSync(plainFolder, { recursive: true })

    await expect(
      dispatcher.callRequest('git.submoduleList', { worktreePath: plainFolder })
    ).resolves.toEqual({ submodules: [], didHitLimit: false })
  })

  it('stages and unstages inside the submodule only', async () => {
    appendFileSync(path.join(subPath, 'subfile.txt'), 'edited\n')
    appendFileSync(path.join(rootPath, DECOY_PATH), 'parent-edit\n')

    await dispatcher.callRequest('git.submoduleStage', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH,
      filePaths: ['subfile.txt']
    })

    expect(git(subPath, ['status', '--porcelain'])).toMatch(/^M {2}subfile\.txt/m)
    expect(git(rootPath, ['status', '--porcelain', '--', DECOY_PATH])).toMatch(/^ M /)

    await dispatcher.callRequest('git.submoduleUnstage', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH,
      filePaths: ['subfile.txt']
    })

    expect(git(subPath, ['status', '--porcelain'])).toMatch(/^ M subfile\.txt/m)
  })

  it('unstages in a submodule with no commit yet (unborn HEAD)', async () => {
    const unbornPath = path.join(rootPath, 'vendor', 'unborn')
    mkdirSync(unbornPath, { recursive: true })
    git(unbornPath, ['init', '-q', '-b', 'main', '.'])
    writeFileSync(path.join(unbornPath, 'new.txt'), 'fresh\n')
    git(unbornPath, ['add', 'new.txt'])

    await dispatcher.callRequest('git.submoduleUnstage', {
      worktreePath: rootPath,
      submodulePath: 'vendor/unborn',
      filePaths: ['new.txt']
    })

    expect(git(unbornPath, ['status', '--porcelain'])).toContain('?? new.txt')
  })

  it('commits and pushes the submodule without touching the parent', async () => {
    git(subPath, ['checkout', '-q', '-B', 'main'])
    appendFileSync(path.join(subPath, 'subfile.txt'), 'edited\n')
    await dispatcher.callRequest('git.submoduleStage', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH,
      filePaths: ['subfile.txt']
    })
    const parentHead = git(rootPath, ['rev-parse', 'HEAD']).trim()

    await expect(
      dispatcher.callRequest('git.submoduleCommit', {
        worktreePath: rootPath,
        submodulePath: SUBMODULE_PATH,
        message: 'sub commit'
      })
    ).resolves.toEqual({ success: true })

    await dispatcher.callRequest('git.submodulePush', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH,
      publish: true
    })

    expect(git(subPath, ['log', '-1', '--format=%s']).trim()).toBe('sub commit')
    expect(git(rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHead)
    expect(git(path.join(tmpDir, 'sub-origin'), ['log', '-1', '--format=%s', 'main']).trim()).toBe(
      'sub commit'
    )
  })

  it('pulls the submodule forward when it is behind only', async () => {
    git(subPath, ['checkout', '-q', '-B', 'main'])
    // Land a commit on the submodule remote without touching the checkout, leaving it behind.
    const publisherPath = path.join(tmpDir, 'publisher')
    git(tmpDir, ['clone', '-q', '--branch', 'main', path.join(tmpDir, 'sub-origin'), publisherPath])
    writeFileSync(path.join(publisherPath, 'subfile.txt'), 'remote work\n')
    commitAll(publisherPath, 'remote work')
    git(publisherPath, ['push', '-q', 'origin', 'HEAD:main'])
    const parentHead = git(rootPath, ['rev-parse', 'HEAD']).trim()

    await dispatcher.callRequest('git.submodulePull', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH
    })

    expect(git(subPath, ['log', '-1', '--format=%s']).trim()).toBe('remote work')
    expect(git(subPath, ['rev-list', '--count', 'HEAD..origin/main']).trim()).toBe('0')
    expect(git(rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHead)
  })

  it('fills upstreamStatus on the submodule status so Publish/Sync can be decided', async () => {
    git(subPath, ['checkout', '-q', '-B', 'main'])

    const inSync = (await dispatcher.callRequest('git.submoduleStatus', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH
    })) as { upstreamStatus?: { hasUpstream: boolean; ahead: number } }
    expect(inSync.upstreamStatus).toEqual({
      hasUpstream: true,
      upstreamName: 'origin/main',
      ahead: 0,
      behind: 0
    })

    appendFileSync(path.join(subPath, 'subfile.txt'), 'ahead\n')
    commitAll(subPath, 'ahead by one')

    const ahead = (await dispatcher.callRequest('git.submoduleStatus', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH
    })) as { upstreamStatus?: { ahead: number } }
    expect(ahead.upstreamStatus?.ahead).toBe(1)
  })

  describe('root guard — the submodule is no longer a repository', () => {
    let parentHead: string

    beforeEach(() => {
      git(rootPath, ['submodule', 'deinit', '-f', '--', SUBMODULE_PATH])
      rmSync(path.join(rootPath, '.git', 'modules'), { recursive: true, force: true })
      mkdirSync(subPath, { recursive: true })
      appendFileSync(path.join(rootPath, DECOY_PATH), 'user-edit\n')
      parentHead = git(rootPath, ['rev-parse', 'HEAD']).trim()
    })

    function expectParentUntouched(): void {
      expect(git(rootPath, ['status', '--porcelain', '--', DECOY_PATH])).toMatch(/^ M /)
      expect(git(rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHead)
    }

    it('rejects git.submoduleStage', async () => {
      await expect(
        dispatcher.callRequest('git.submoduleStage', {
          worktreePath: rootPath,
          submodulePath: SUBMODULE_PATH,
          filePaths: [DECOY_PATH]
        })
      ).rejects.toThrow(/not a git repository/)
      expectParentUntouched()
    })

    it('rejects git.submoduleUnstage', async () => {
      await expect(
        dispatcher.callRequest('git.submoduleUnstage', {
          worktreePath: rootPath,
          submodulePath: SUBMODULE_PATH,
          filePaths: [DECOY_PATH]
        })
      ).rejects.toThrow(/not a git repository/)
      expectParentUntouched()
    })

    it('rejects git.submoduleCommit as a failure result, not a parent commit', async () => {
      git(rootPath, ['add', '--', DECOY_PATH])

      const result = (await dispatcher.callRequest('git.submoduleCommit', {
        worktreePath: rootPath,
        submodulePath: SUBMODULE_PATH,
        message: 'should not land'
      })) as { success: boolean; error?: string }

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not a git repository/)
      expect(git(rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHead)
    })

    it('rejects git.submodulePush', async () => {
      await expect(
        dispatcher.callRequest('git.submodulePush', {
          worktreePath: rootPath,
          submodulePath: SUBMODULE_PATH,
          publish: true
        })
      ).rejects.toThrow(/not a git repository/)
      expectParentUntouched()
    })

    it('rejects git.submodulePull', async () => {
      // Unguarded this would merge remote commits into the PARENT's checked-out branch.
      await expect(
        dispatcher.callRequest('git.submodulePull', {
          worktreePath: rootPath,
          submodulePath: SUBMODULE_PATH
        })
      ).rejects.toThrow(/not a git repository/)
      expectParentUntouched()
    })

    it('rejects git.submoduleDiscard', async () => {
      await expect(
        dispatcher.callRequest('git.submoduleDiscard', {
          worktreePath: rootPath,
          submodulePath: SUBMODULE_PATH,
          filePath: DECOY_PATH
        })
      ).rejects.toThrow(/not a git repository/)
      expectParentUntouched()
    })

    it('rejects a plain subdirectory of the parent repository', async () => {
      await expect(
        dispatcher.callRequest('git.submoduleStage', {
          worktreePath: rootPath,
          submodulePath: 'vendor',
          filePaths: ['x.txt']
        })
      ).rejects.toThrow(/not a git repository root/)
      expectParentUntouched()
    })

    it('rejects a submodule path that escapes the parent worktree', async () => {
      await expect(
        dispatcher.callRequest('git.submoduleStage', {
          worktreePath: rootPath,
          submodulePath: '../sub-origin',
          filePaths: ['subfile.txt']
        })
      ).rejects.toThrow(/outside the worktree/)
      expectParentUntouched()
    })
  })
})
