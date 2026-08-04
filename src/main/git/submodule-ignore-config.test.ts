/**
 * An aborted config read must not be recorded as "no ignore policy configured".
 *
 * readConfig used to swallow every failure, including AbortError, and return ''.
 * Two empty strings build an inert policy, and the caller then cached it for the
 * full TTL — so every poll in that window skipped the narrowing entirely
 * (isSubmoduleIgnorePolicyInert short-circuits) and the gitlink rows the repo
 * asked to hide flashed back until the entry expired. `git.status` forwards an
 * AbortSignal, so switching worktrees mid-poll was enough to trigger it.
 *
 * runNumstat in status.ts rethrows aborts for exactly this reason.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import {
  clearSubmoduleIgnorePolicyCache,
  getSubmoduleIgnorePolicyCacheCountForTests,
  readSubmoduleIgnorePolicy
} from './submodule-ignore-config'
import { isSubmoduleIgnorePolicyInert } from '../../shared/git-submodule-ignore-policy'

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

function createRepoWithIgnoreAll(tmpDir: string): string {
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
  git(rootPath, ['submodule', 'add', '-q', originPath, 'vendor/sub'])
  git(rootPath, ['config', '-f', '.gitmodules', 'submodule.vendor/sub.ignore', 'all'])
  git(rootPath, ['add', '-A'])
  git(rootPath, ['commit', '-m', 'submodule with ignore = all'])
  return rootPath
}

describe('readSubmoduleIgnorePolicy under abort', () => {
  let tmpDir: string
  let rootPath: string

  beforeEach(() => {
    clearSubmoduleIgnorePolicyCache()
    tmpDir = mkdtempSync(path.join(tmpdir(), 'orca-ignore-abort-'))
    rootPath = createRepoWithIgnoreAll(tmpDir)
  })

  afterEach(async () => {
    clearSubmoduleIgnorePolicyCache()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('reads the checked-in policy when nothing is aborted', async () => {
    const policy = await readSubmoduleIgnorePolicy(rootPath)

    expect(policy.byPath.get('vendor/sub')).toBe('all')
    expect(isSubmoduleIgnorePolicyInert(policy)).toBe(false)
  })

  it('rejects instead of returning an inert policy when the read is aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      readSubmoduleIgnorePolicy(rootPath, { signal: controller.signal })
    ).rejects.toThrow()
  })

  it('caches nothing when the read is aborted, so the next poll still narrows', async () => {
    const controller = new AbortController()
    controller.abort()

    await readSubmoduleIgnorePolicy(rootPath, { signal: controller.signal }).catch(() => undefined)

    // The poison: an inert policy pinned here would make every poll for the whole
    // TTL skip narrowing.
    expect(getSubmoduleIgnorePolicyCacheCountForTests()).toBe(0)

    const policy = await readSubmoduleIgnorePolicy(rootPath)
    expect(policy.byPath.get('vendor/sub')).toBe('all')
  })
})
