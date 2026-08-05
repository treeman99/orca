/**
 * Relay counterpart to src/main/git/status-submodule-branch-switch.test.ts.
 *
 * The two divergences fixed there — commit-range rows masquerading as the user's
 * uncommitted edits, and `--ignore-submodules=none` overriding a configured
 * `submodule.<name>.ignore` — both live below OrcaRuntimeService, so an SSH
 * workspace must narrow exactly the same rows. Assertions are kept in lockstep
 * with the main-process file; a drift here is invisible locally.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
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

type GitStatusRow = {
  path: string
  status: string
  area: string
  submodule?: { commitChanged: boolean; trackedChanges: boolean; untrackedChanges: boolean }
  submoduleCommitRange?: true
}
type StatusResponse = { entries: GitStatusRow[] }

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], {
    cwd: dir,
    stdio: 'pipe',
    encoding: 'utf8'
  })
}

/** `main` records the pulled submodule commit; `feature` still records the older
 *  one and the checkout is left on the newer — what `git checkout` always does. */
function createPullThenSwitchRepo(tmpDir: string): { rootPath: string; submodulePath: string } {
  const originPath = path.join(tmpDir, 'sub-origin')
  const rootPath = path.join(tmpDir, 'root')
  mkdirSync(originPath, { recursive: true })
  mkdirSync(rootPath, { recursive: true })

  gitInit(originPath)
  writeFileSync(path.join(originPath, 'subfile.txt'), 'one\n')
  gitCommit(originPath, 'sub init')

  gitInit(rootPath)
  writeFileSync(path.join(rootPath, 'rootfile.txt'), 'root\n')
  gitCommit(rootPath, 'root init')
  git(rootPath, ['submodule', 'add', '-q', originPath, SUBMODULE_PATH])
  gitCommit(rootPath, 'add submodule')
  git(rootPath, ['branch', 'feature'])

  const submodulePath = path.join(rootPath, SUBMODULE_PATH)
  for (const name of ['pulled-a.txt', 'pulled-b.txt', 'pulled-c.txt']) {
    writeFileSync(path.join(submodulePath, name), 'from develop\n')
  }
  gitCommit(submodulePath, 'work pulled from develop')
  gitCommit(rootPath, 'bump submodule')
  git(rootPath, ['checkout', '-q', 'feature'])

  return { rootPath, submodulePath }
}

describe('GitHandler — submodule after pull-then-switch-branch', () => {
  let dispatcher: MockDispatcher
  let handler: GitHandler
  let tmpDir: string
  let rootPath: string
  let submodulePath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-submodule-switch-'))
    dispatcher = createMockDispatcher()
    handler = new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
    const repo = createPullThenSwitchRepo(tmpDir)
    rootPath = repo.rootPath
    submodulePath = repo.submodulePath
  })

  afterEach(async () => {
    handler.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  /** Stage ONLY `.gitmodules`: the shared `gitCommit` helper runs `git add .`,
   *  which would record the drifted gitlink and erase the state under test. */
  function pinCheckedInIgnore(mode: string): void {
    git(rootPath, ['config', '-f', '.gitmodules', `submodule.${SUBMODULE_PATH}.ignore`, mode])
    git(rootPath, ['add', '.gitmodules'])
    git(rootPath, [
      '-c',
      'user.email=orca-test@example.com',
      '-c',
      'user.name=Orca Test',
      'commit',
      '-m',
      `submodule ignore = ${mode}`
    ])
  }

  async function rootStatus(): Promise<StatusResponse> {
    return (await dispatcher.callRequest('git.status', {
      worktreePath: rootPath
    })) as StatusResponse
  }

  // SSH parity for the main-process contract: an expanded submodule shows what
  // `git status` in that folder shows, path for path. Split relay behaviour here is
  // exactly the asymmetry this file exists to catch.
  it('shows exactly what git status shows in the submodule, and nothing else', async () => {
    appendFileSync(path.join(submodulePath, 'subfile.txt'), 'my edit\n')

    const { entries } = (await dispatcher.callRequest('git.submoduleStatus', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH
    })) as StatusResponse

    expect(entries.map((entry) => entry.path)).toEqual(['subfile.txt'])
    for (const pulled of ['pulled-a.txt', 'pulled-b.txt', 'pulled-c.txt']) {
      expect(entries.map((entry) => entry.path)).not.toContain(pulled)
    }
  })

  it('is empty when the pointer moved but the submodule worktree is clean', async () => {
    const { entries } = (await dispatcher.callRequest('git.submoduleStatus', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH
    })) as StatusResponse

    expect(entries).toEqual([])
  })

  it('ignores the staged area rather than synthesizing a range', async () => {
    const { entries } = (await dispatcher.callRequest('git.submoduleStatus', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH,
      area: 'staged'
    })) as StatusResponse

    expect(entries).toEqual([])
  })

  it('drops the commit-drift-only gitlink row when the repo configured ignore = all', async () => {
    pinCheckedInIgnore('all')

    expect(git(rootPath, ['status', '--porcelain'])).not.toContain(SUBMODULE_PATH)

    const { entries } = await rootStatus()

    expect(entries.map((entry) => entry.path)).not.toContain(SUBMODULE_PATH)
  })

  it('still reports tracked dirt inside an ignore = all submodule', async () => {
    pinCheckedInIgnore('all')
    appendFileSync(path.join(submodulePath, 'subfile.txt'), 'my edit\n')

    const { entries } = await rootStatus()

    expect(entries.find((entry) => entry.path === SUBMODULE_PATH)?.submodule).toEqual({
      commitChanged: false,
      trackedChanges: true,
      untrackedChanges: false
    })
  })

  it('is identical to plain git status when no ignore is configured', async () => {
    const { entries } = await rootStatus()

    expect(entries.map((entry) => entry.path)).toEqual([SUBMODULE_PATH])
    expect(git(rootPath, ['status', '--porcelain']).trim()).toBe(`M ${SUBMODULE_PATH}`)
  })
})
