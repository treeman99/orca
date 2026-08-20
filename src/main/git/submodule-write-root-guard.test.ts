/**
 * The submodule write ops must refuse a path that is not a repository ROOT.
 *
 * Why this suite exists: `resolveSubmoduleWorktreePath` only proves the path stays inside
 * the parent. Once a submodule is deinitialized, moved, or left behind by a branch switch,
 * that directory is an ordinary folder and Git walks UP to the parent repository — so an
 * unguarded stage/unstage/commit/push/discard silently operates on the PARENT. Each case
 * below asserts both halves: the call is rejected, and the parent is untouched.
 *
 * Relay counterpart: src/relay/git-handler-submodule-write.test.ts.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { discardSubmoduleChanges, invalidateGitReadCaches } from './status'
import {
  commitSubmoduleChanges,
  pullSubmodule,
  pushSubmodule,
  stageSubmoduleFiles,
  unstageSubmoduleFiles
} from './submodule-write-ops'
import {
  createRootWithSubmodule,
  deinitSubmoduleLeavingParentDecoy,
  git,
  SUBMODULE_PATH,
  type SubmoduleFixture
} from './submodule-write-test-repo'

describe('submodule write ops reject a non-root path', () => {
  let tmpDir: string
  let fixture: SubmoduleFixture
  let decoyRelativePath: string
  let parentHead: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'orca-submodule-guard-'))
    fixture = createRootWithSubmodule(tmpDir)
    ;({ decoyRelativePath } = deinitSubmoduleLeavingParentDecoy(fixture))
    // A dirty parent file the unguarded command would stage, restore, or commit.
    appendFileSync(path.join(fixture.rootPath, decoyRelativePath), 'user-edit\n')
    parentHead = git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()
    invalidateGitReadCaches()
  })

  afterEach(async () => {
    invalidateGitReadCaches()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function expectParentUntouched(): void {
    // Still unstaged and still edited: nothing reached the parent index, worktree or HEAD.
    expect(git(fixture.rootPath, ['status', '--porcelain', '--', decoyRelativePath])).toMatch(
      /^ M /
    )
    expect(git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHead)
  }

  it('rejects submoduleStage', async () => {
    await expect(
      stageSubmoduleFiles(fixture.rootPath, SUBMODULE_PATH, [decoyRelativePath])
    ).rejects.toThrow(/not a git repository/)
    expectParentUntouched()
  })

  it('rejects submoduleUnstage', async () => {
    git(fixture.rootPath, ['add', '--', decoyRelativePath])
    const stagedHead = git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()

    await expect(
      unstageSubmoduleFiles(fixture.rootPath, SUBMODULE_PATH, [decoyRelativePath])
    ).rejects.toThrow(/not a git repository/)

    expect(git(fixture.rootPath, ['status', '--porcelain', '--', decoyRelativePath])).toMatch(/^M /)
    expect(git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()).toBe(stagedHead)
  })

  it('rejects submoduleCommit as a failure result, without committing to the parent', async () => {
    git(fixture.rootPath, ['add', '--', decoyRelativePath])

    const result = await commitSubmoduleChanges(fixture.rootPath, SUBMODULE_PATH, 'should not land')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not a git repository/)
    expect(git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()).toBe(parentHead)
  })

  it('rejects submodulePush', async () => {
    await expect(pushSubmodule(fixture.rootPath, SUBMODULE_PATH, true)).rejects.toThrow(
      /not a git repository/
    )
    expectParentUntouched()
  })

  it('rejects submodulePull', async () => {
    // Worse than useless unguarded: a pull in the deinitialized directory merges remote
    // commits into the PARENT's checked-out branch.
    await expect(pullSubmodule(fixture.rootPath, SUBMODULE_PATH)).rejects.toThrow(
      /not a git repository/
    )
    expectParentUntouched()
  })

  it('rejects submoduleDiscard', async () => {
    await expect(
      discardSubmoduleChanges(fixture.rootPath, SUBMODULE_PATH, decoyRelativePath)
    ).rejects.toThrow(/not a git repository/)
    expectParentUntouched()
  })

  // Negative control: without the root assertion these ops are not merely useless, they
  // hit the parent. If this ever stops committing to the parent the suite above is proving
  // nothing and the guard's justification needs revisiting.
  it('control: a raw git commit in the deinitialized directory lands on the parent', () => {
    git(fixture.rootPath, ['add', '--', decoyRelativePath])

    git(fixture.submoduleWorktreePath, ['commit', '-m', 'landed on the parent'])

    expect(git(fixture.rootPath, ['log', '-1', '--format=%s']).trim()).toBe('landed on the parent')
    expect(git(fixture.rootPath, ['rev-parse', 'HEAD']).trim()).not.toBe(parentHead)
  })

  it('rejects a submodule path that is a subdirectory of a repository', async () => {
    // `vendor` is a plain directory inside the parent: containment passes, root check must not.
    await expect(stageSubmoduleFiles(fixture.rootPath, 'vendor', ['x.txt'])).rejects.toThrow(
      /not a git repository root/
    )
    expectParentUntouched()
  })

  it('rejects a submodule path that escapes the parent worktree', async () => {
    await expect(
      stageSubmoduleFiles(fixture.rootPath, '../sub-origin', ['subfile.txt'])
    ).rejects.toThrow(/escapes the selected worktree/)
    expectParentUntouched()
  })
})
