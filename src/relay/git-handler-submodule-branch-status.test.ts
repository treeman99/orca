/**
 * Relay counterpart to the main-process submodule visibility fix.
 *
 * Why real Git: the bug was in what Git reports, not in how the relay parses it —
 * a submodule parked on its own branch keeps a permanently moved gitlink, and a
 * checked-in `submodule.<name>.ignore` blanks the row. Neither reproduces against
 * a stubbed executor. These assertions must match src/main/git/status.test.ts so
 * an SSH workspace and a local one show the same thing.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { GitHandler } from './git-handler'
import { RelayContext } from './context'
import {
  createMockDispatcher,
  gitInit,
  gitCommit,
  type MockDispatcher,
  type RelayDispatcher
} from './git-handler-test-setup'

const SUBMODULE_PATH = 'vendor/sub'
const SUBMODULE_BRANCH = 'other-branch'

type GitStatusRow = { path: string; status: string; area: string }
type SubmoduleStatusResponse = { entries: GitStatusRow[]; branch?: string; head?: string }
type DiffResponse = { originalContent: string; modifiedContent: string }

function git(dir: string, args: string[]): string {
  // Why -c protocol.file.allow: `submodule add` from a local path is refused by
  // default since the CVE-2022-39253 fix, which every supported Git carries.
  return execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], {
    cwd: dir,
    stdio: 'pipe',
    encoding: 'utf8'
  })
}

/**
 * Root on `main`, submodule on `other-branch` with a commit the root has not
 * recorded, plus an unstaged, a staged and an untracked file inside it.
 */
function createRootWithSubmoduleOnOwnBranch(tmpDir: string): {
  rootPath: string
  submodulePath: string
} {
  const originPath = path.join(tmpDir, 'sub-origin')
  const rootPath = path.join(tmpDir, 'root')
  execFileSync('mkdir', ['-p', originPath, rootPath])

  gitInit(originPath)
  writeFileSync(path.join(originPath, 'subfile.txt'), 'one\n')
  writeFileSync(path.join(originPath, 'other.txt'), 'two\n')
  gitCommit(originPath, 'sub init')

  gitInit(rootPath)
  writeFileSync(path.join(rootPath, 'rootfile.txt'), 'root\n')
  gitCommit(rootPath, 'root init')
  git(rootPath, ['submodule', 'add', '-q', originPath, SUBMODULE_PATH])
  gitCommit(rootPath, 'add submodule')

  const submodulePath = path.join(rootPath, SUBMODULE_PATH)
  git(submodulePath, ['checkout', '-q', '-b', SUBMODULE_BRANCH])
  appendFileSync(path.join(submodulePath, 'other.txt'), 'committed-on-other-branch\n')
  gitCommit(submodulePath, 'work committed on other-branch')

  appendFileSync(path.join(submodulePath, 'subfile.txt'), 'unstaged-edit\n')
  appendFileSync(path.join(submodulePath, 'other.txt'), 'staged-edit\n')
  git(submodulePath, ['add', 'other.txt'])
  writeFileSync(path.join(submodulePath, 'newfile.txt'), 'brand new\n')

  return { rootPath, submodulePath }
}

describe('GitHandler — submodule on its own branch', () => {
  let dispatcher: MockDispatcher
  let handler: GitHandler
  let tmpDir: string
  let rootPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-submodule-branch-'))
    dispatcher = createMockDispatcher()
    handler = new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
    rootPath = createRootWithSubmoduleOnOwnBranch(tmpDir).rootPath
  })

  afterEach(async () => {
    handler.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function submoduleStatus(): Promise<SubmoduleStatusResponse> {
    return (await dispatcher.callRequest('git.submoduleStatus', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH
    })) as SubmoduleStatusResponse
  }

  it('reports the submodule own branch, not the root branch', async () => {
    const rootStatus = (await dispatcher.callRequest('git.status', {
      worktreePath: rootPath
    })) as { branch?: string }

    const result = await submoduleStatus()

    expect(rootStatus.branch).toBe('refs/heads/main')
    expect(result.branch).toBe(`refs/heads/${SUBMODULE_BRANCH}`)
    expect(result.head).toMatch(/^[0-9a-f]{40}$/)
  })

  it('lists the inner unstaged, staged and untracked changes separately', async () => {
    // Why: the root status reports the submodule as a single gitlink row and
    // never names these files, so losing them here loses them from the panel.
    const { entries } = await submoduleStatus()

    const seen = entries.map((entry) => `${entry.area}:${entry.path}`)
    expect(seen).toContain('unstaged:subfile.txt')
    expect(seen).toContain('staged:other.txt')
    expect(seen).toContain('untracked:newfile.txt')
  })

  it('keeps the uncommitted rows that the commit range overlaps', async () => {
    // Why: the gitlink is permanently moved on this layout, so the range rows
    // arrive on every poll; letting them win deleted the user's staged edit.
    const { entries } = await submoduleStatus()

    const otherTxt = entries.filter((entry) => entry.path === 'other.txt')
    expect(otherTxt.some((entry) => entry.area === 'staged')).toBe(true)
  })

  it('still reports the gitlink row when .gitmodules sets ignore = all', async () => {
    // Why: `ignore = all` is checked in, so it suppresses the row on every clone
    // and the submodule vanishes from Source Control entirely.
    git(rootPath, ['config', '-f', '.gitmodules', `submodule.${SUBMODULE_PATH}.ignore`, 'all'])

    const status = (await dispatcher.callRequest('git.status', {
      worktreePath: rootPath
    })) as { entries: (GitStatusRow & { submodule?: { trackedChanges: boolean } })[] }

    const row = status.entries.find((entry) => entry.path === SUBMODULE_PATH)
    expect(row).toBeDefined()
    expect(row?.submodule?.trackedChanges).toBe(true)
  })

  it('diffs an uncommitted inner edit instead of the empty commit range', async () => {
    // Why: `subfile.txt` is untouched by the recorded->checkout range, so routing
    // on "the gitlink moved" rendered an empty diff for a file just modified.
    const diff = (await dispatcher.callRequest('git.diff', {
      worktreePath: rootPath,
      filePath: `${SUBMODULE_PATH}/subfile.txt`,
      staged: false
    })) as DiffResponse

    expect(diff.originalContent).toBe('one\n')
    expect(diff.modifiedContent).toBe('one\nunstaged-edit\n')
  })

  it('still shows the commit range for a file only changed by the moved gitlink', async () => {
    // Why: the fallback must not swallow the committed-range route, which is the
    // only way to see work the submodule committed but the root has not recorded.
    git(path.join(rootPath, SUBMODULE_PATH), ['checkout', '--', 'other.txt'])
    git(path.join(rootPath, SUBMODULE_PATH), ['reset', '-q'])

    const diff = (await dispatcher.callRequest('git.diff', {
      worktreePath: rootPath,
      filePath: `${SUBMODULE_PATH}/other.txt`,
      staged: false
    })) as DiffResponse

    expect(diff.originalContent).toBe('two\n')
    expect(diff.modifiedContent).toBe('two\ncommitted-on-other-branch\n')
  })
})
