/**
 * Main-process half of the submodule visibility fix, kept in lockstep with
 * src/relay/git-handler-submodule-branch-status.test.ts so a local workspace and
 * an SSH one show the same rows, branch and diff.
 *
 * Why real Git: the defect is in what Git reports. A submodule parked on its own
 * branch keeps a permanently moved gitlink (so the recorded->checkout range
 * overlaps every edit), and a checked-in `submodule.<name>.ignore` blanks the
 * gitlink row outright. Neither survives a stubbed executor.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { getStatus, getSubmoduleStatus, getDiff, invalidateGitReadCaches } from './status'

const SUBMODULE_PATH = 'vendor/sub'
const SUBMODULE_BRANCH = 'other-branch'

function git(dir: string, args: string[]): string {
  // Why -c protocol.file.allow: `submodule add` from a local path is refused by
  // default since the CVE-2022-39253 fix, which every supported Git carries.
  // Why inline identity: the `submodule add` checkout inherits no local config
  // and CI may have no global identity.
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

/**
 * Root on `main`, submodule on `other-branch` carrying a commit the root has not
 * recorded, plus an unstaged, a staged and an untracked file inside it.
 */
function createRootWithSubmoduleOnOwnBranch(tmpDir: string): string {
  const originPath = path.join(tmpDir, 'sub-origin')
  const rootPath = path.join(tmpDir, 'root')
  mkdirSync(originPath, { recursive: true })
  mkdirSync(rootPath, { recursive: true })

  git(originPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(originPath, 'subfile.txt'), 'one\n')
  writeFileSync(path.join(originPath, 'other.txt'), 'two\n')
  commitAll(originPath, 'sub init')

  git(rootPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(rootPath, 'rootfile.txt'), 'root\n')
  commitAll(rootPath, 'root init')
  git(rootPath, ['submodule', 'add', '-q', originPath, SUBMODULE_PATH])
  commitAll(rootPath, 'add submodule')

  const submodulePath = path.join(rootPath, SUBMODULE_PATH)
  git(submodulePath, ['checkout', '-q', '-b', SUBMODULE_BRANCH])
  appendFileSync(path.join(submodulePath, 'other.txt'), 'committed-on-other-branch\n')
  commitAll(submodulePath, 'work committed on other-branch')

  appendFileSync(path.join(submodulePath, 'subfile.txt'), 'unstaged-edit\n')
  appendFileSync(path.join(submodulePath, 'other.txt'), 'staged-edit\n')
  git(submodulePath, ['add', 'other.txt'])
  writeFileSync(path.join(submodulePath, 'newfile.txt'), 'brand new\n')
  appendFileSync(path.join(rootPath, 'rootfile.txt'), 'root-dirty\n')

  return rootPath
}

describe('submodule on its own branch', () => {
  let tmpDir: string
  let rootPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'orca-submodule-branch-'))
    rootPath = createRootWithSubmoduleOnOwnBranch(tmpDir)
    invalidateGitReadCaches()
  })

  afterEach(async () => {
    invalidateGitReadCaches()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('reports the submodule own branch, not the root branch', async () => {
    const rootStatus = await getStatus(rootPath)
    const result = await getSubmoduleStatus(rootPath, SUBMODULE_PATH)

    expect(rootStatus.branch).toBe('refs/heads/main')
    expect(result.branch).toBe(`refs/heads/${SUBMODULE_BRANCH}`)
    expect(result.head).toMatch(/^[0-9a-f]{40}$/)
  })

  it('reports the submodule as a single gitlink row with no inner files', async () => {
    // Why: this is the whole reason a second status runs inside the submodule —
    // the root status never names the files the user edited.
    const rootStatus = await getStatus(rootPath)

    expect(rootStatus.entries.map((entry) => entry.path).sort()).toEqual([
      'rootfile.txt',
      SUBMODULE_PATH
    ])
    expect(rootStatus.entries.find((entry) => entry.path === SUBMODULE_PATH)?.submodule).toEqual({
      commitChanged: true,
      trackedChanges: true,
      untrackedChanges: true
    })
  })

  it('lists the inner unstaged, staged and untracked changes separately', async () => {
    const { entries } = await getSubmoduleStatus(rootPath, SUBMODULE_PATH)

    const seen = entries.map((entry) => `${entry.area}:${entry.path}`)
    expect(seen).toContain('unstaged:subfile.txt')
    expect(seen).toContain('staged:other.txt')
    expect(seen).toContain('untracked:newfile.txt')
  })

  it('keeps the uncommitted rows that the commit range overlaps', async () => {
    // Why: the gitlink is permanently moved on this layout, so range rows arrive
    // on every poll; letting them win deleted the user's staged edit.
    const { entries } = await getSubmoduleStatus(rootPath, SUBMODULE_PATH)

    expect(entries.some((entry) => entry.path === 'other.txt' && entry.area === 'staged')).toBe(
      true
    )
  })

  it('still reports the gitlink row when .gitmodules sets ignore = all', async () => {
    // Why: `ignore = all` lives in the checked-in .gitmodules, so it suppresses
    // the row on every clone and the submodule vanishes from Source Control.
    // `trackedChanges` is the marker that keeps it visible AND expandable, and it
    // survives on purpose — see shared/git-submodule-ignore-policy.ts. The commit
    // pointer and untracked content are the parts `all` legitimately silences.
    git(rootPath, ['config', '-f', '.gitmodules', `submodule.${SUBMODULE_PATH}.ignore`, 'all'])
    invalidateGitReadCaches()

    const status = await getStatus(rootPath)

    expect(status.entries.find((entry) => entry.path === SUBMODULE_PATH)?.submodule).toEqual({
      commitChanged: false,
      trackedChanges: true,
      untrackedChanges: false
    })
  })

  it('keeps the tracked-dirt marker when .gitmodules sets ignore = dirty', async () => {
    // Why: `ignore = dirty` degrades the sub-state field to `SC..`, dropping the
    // markers that make the row expandable at all. Orca keeps the tracked marker
    // so a user's uncommitted edits inside the submodule stay reachable; the
    // untracked marker follows the configured intent.
    git(rootPath, ['config', '-f', '.gitmodules', `submodule.${SUBMODULE_PATH}.ignore`, 'dirty'])
    invalidateGitReadCaches()

    const status = await getStatus(rootPath)

    expect(status.entries.find((entry) => entry.path === SUBMODULE_PATH)?.submodule).toEqual({
      commitChanged: true,
      trackedChanges: true,
      untrackedChanges: false
    })
  })

  it('diffs an uncommitted inner edit instead of the empty commit range', async () => {
    // Why: `subfile.txt` is untouched by the recorded->checkout range, so routing
    // on "the gitlink moved" rendered an empty diff for a file just modified.
    const diff = await getDiff(rootPath, `${SUBMODULE_PATH}/subfile.txt`, false)

    expect(diff.originalContent).toBe('one\n')
    expect(diff.modifiedContent).toBe('one\nunstaged-edit\n')
  })

  it('still shows the commit range for a file only changed by the moved gitlink', async () => {
    // Why: the fallback must not swallow the committed-range route, which is the
    // only way to see work the submodule committed but the root has not recorded.
    const submodulePath = path.join(rootPath, SUBMODULE_PATH)
    git(submodulePath, ['reset', '-q'])
    git(submodulePath, ['checkout', '--', 'other.txt'])
    invalidateGitReadCaches()

    const diff = await getDiff(rootPath, `${SUBMODULE_PATH}/other.txt`, false)

    expect(diff.originalContent).toBe('two\n')
    expect(diff.modifiedContent).toBe('two\ncommitted-on-other-branch\n')
  })
})
