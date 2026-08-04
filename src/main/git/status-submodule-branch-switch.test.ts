/**
 * Regression cover for "submodule changes I never made show up as mine".
 *
 * Ordinary flow: pull on one branch, switch to another. `git checkout` never
 * rewinds a submodule worktree, so the parent's recorded gitlink and the
 * submodule's checked-out HEAD drift apart with nobody having edited anything.
 * Two things went wrong on top of that:
 *
 * 1. `getSubmoduleStatus` synthesizes the recorded->checkout commit range as
 *    `unstaged` rows, so every file the pull brought in sat next to the one file
 *    the user actually edited, indistinguishable from it. Those rows now carry
 *    `submoduleCommitRange` so the panel can say they are committed already.
 * 2. `--ignore-submodules=none` overrode a repo- or user-configured
 *    `submodule.<name>.ignore`, so the gitlink row appeared in Orca while the
 *    same repo's `git status` stayed silent. The configured intent is now
 *    re-applied to the parsed rows.
 *
 * Why real Git: both live in what Git reports for a gitlink, which no stubbed
 * executor reproduces.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { getStatus, getSubmoduleStatus, invalidateGitReadCaches } from './status'

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

function commitAll(dir: string, message: string): void {
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-m', message, '--allow-empty'])
}

/**
 * `main` records the submodule at the commit the "develop pull" brought in
 * (three new files); `feature` still records the older commit. The checkout is
 * left on the newer commit, which is exactly what `git checkout feature` does.
 */
function createPullThenSwitchRepo(tmpDir: string): string {
  const originPath = path.join(tmpDir, 'sub-origin')
  const rootPath = path.join(tmpDir, 'root')
  mkdirSync(originPath, { recursive: true })
  mkdirSync(rootPath, { recursive: true })

  git(originPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(originPath, 'subfile.txt'), 'one\n')
  commitAll(originPath, 'sub init')

  git(rootPath, ['init', '-q', '-b', 'main', '.'])
  writeFileSync(path.join(rootPath, 'rootfile.txt'), 'root\n')
  commitAll(rootPath, 'root init')
  git(rootPath, ['submodule', 'add', '-q', originPath, SUBMODULE_PATH])
  commitAll(rootPath, 'add submodule')

  git(rootPath, ['branch', 'feature'])

  // The "develop pull": three files land in the submodule and main records them.
  const submodulePath = path.join(rootPath, SUBMODULE_PATH)
  for (const name of ['pulled-a.txt', 'pulled-b.txt', 'pulled-c.txt']) {
    writeFileSync(path.join(submodulePath, name), 'from develop\n')
  }
  commitAll(submodulePath, 'work pulled from develop')
  commitAll(rootPath, 'bump submodule')

  git(rootPath, ['checkout', '-q', 'feature'])
  return rootPath
}

/** Check in a `.gitmodules` carrying `ignore = <mode>`, which reaches every clone. */
function pinCheckedInIgnore(rootPath: string, mode: string): void {
  git(rootPath, ['config', '-f', '.gitmodules', `submodule.${SUBMODULE_PATH}.ignore`, mode])
  git(rootPath, ['add', '.gitmodules'])
  git(rootPath, ['commit', '-m', `submodule ignore = ${mode}`])
}

describe('submodule after pull-then-switch-branch', () => {
  let tmpDir: string
  let rootPath: string
  let submodulePath: string

  beforeEach(() => {
    invalidateGitReadCaches()
    tmpDir = mkdtempSync(path.join(tmpdir(), 'orca-submodule-switch-'))
    rootPath = createPullThenSwitchRepo(tmpDir)
    submodulePath = path.join(rootPath, SUBMODULE_PATH)
  })

  afterEach(async () => {
    invalidateGitReadCaches()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('reports only the one file the user edited in the submodule via git status', () => {
    appendFileSync(path.join(submodulePath, 'subfile.txt'), 'my edit\n')

    // What the user sees in their terminal, inside the submodule.
    expect(git(submodulePath, ['status', '--porcelain'])).toBe(' M subfile.txt\n')
  })

  it('marks the pulled files as committed-in-submodule, never as the user edit', async () => {
    appendFileSync(path.join(submodulePath, 'subfile.txt'), 'my edit\n')

    const result = await getSubmoduleStatus(rootPath, SUBMODULE_PATH)

    const byPath = new Map(result.entries.map((entry) => [entry.path, entry]))
    // The three files the pull brought in are still surfaced (that is what makes a
    // moved pointer reviewable at all) but every one of them is tagged.
    for (const pulled of ['pulled-a.txt', 'pulled-b.txt', 'pulled-c.txt']) {
      expect(byPath.get(pulled)?.submoduleCommitRange).toBe(true)
    }
    // The file the user actually edited is a working-tree row and stays untagged.
    expect(byPath.get('subfile.txt')?.submoduleCommitRange).toBeUndefined()
    expect(byPath.get('subfile.txt')?.area).toBe('unstaged')
  })

  it('tags every range row when the submodule worktree is otherwise clean', async () => {
    const result = await getSubmoduleStatus(rootPath, SUBMODULE_PATH)

    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.entries.every((entry) => entry.submoduleCommitRange === true)).toBe(true)
  })

  it('drops the commit-drift-only gitlink row when the repo configured ignore = all', async () => {
    pinCheckedInIgnore(rootPath, 'all')

    // The user's terminal does not mention the submodule.
    expect(git(rootPath, ['status', '--porcelain'])).not.toContain(SUBMODULE_PATH)

    const result = await getStatus(rootPath)

    expect(result.entries.map((entry) => entry.path)).not.toContain(SUBMODULE_PATH)
  })

  it('still reports tracked dirt inside an ignore = all submodule', async () => {
    // The deviation that keeps 927bc56b4d's fix alive: uncommitted edits are never
    // hidden, even when the repo asked for the submodule to stay quiet.
    pinCheckedInIgnore(rootPath, 'all')
    appendFileSync(path.join(submodulePath, 'subfile.txt'), 'my edit\n')
    invalidateGitReadCaches()

    const result = await getStatus(rootPath)

    const gitlinkRow = result.entries.find((entry) => entry.path === SUBMODULE_PATH)
    expect(gitlinkRow?.submodule).toEqual({
      commitChanged: false,
      trackedChanges: true,
      untrackedChanges: false
    })
  })

  it('keeps the commit-drift row under ignore = dirty, exactly as git status does', async () => {
    pinCheckedInIgnore(rootPath, 'dirty')

    expect(git(rootPath, ['status', '--porcelain'])).toContain(SUBMODULE_PATH)

    const result = await getStatus(rootPath)

    expect(result.entries.find((entry) => entry.path === SUBMODULE_PATH)?.submodule).toEqual({
      commitChanged: true,
      trackedChanges: false,
      untrackedChanges: false
    })
  })

  it('is identical to plain git status when no ignore is configured', async () => {
    const result = await getStatus(rootPath)

    expect(result.entries.map((entry) => entry.path)).toEqual([SUBMODULE_PATH])
    expect(git(rootPath, ['status', '--porcelain']).trim()).toBe(`M ${SUBMODULE_PATH}`)
  })
})
