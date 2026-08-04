/**
 * Expanding a submodule over SSH must apply `submodule.<name>.ignore` to the rows
 * inside it, exactly as the local path does.
 *
 * The narrowing inside getStatusOp is gated on `options.submoduleIgnorePolicyCache`.
 * GitHandler.getSubmoduleStatus used to call getStatusOp without it, so a NESTED
 * gitlink inside an expanded submodule kept the very row the ignore setting exists
 * to silence — but only over SSH. The main process has no such gate, because
 * getSubmoduleStatus routes through getStatus, so the two halves disagreed.
 *
 * Why real Git: the drifted nested gitlink and the `.gitmodules` that silences it
 * are Git state; no stubbed executor produces the `1 .M SC.. inner` row.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
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
const NESTED_PATH = 'inner'

type StatusRow = { path: string; area: string }
type StatusResponse = { entries: StatusRow[] }

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

/**
 * root -> vendor/sub -> inner, where `vendor/sub/.gitmodules` sets
 * `submodule.inner.ignore = all` and `inner`'s gitlink is left drifted — the
 * shape a branch switch leaves behind, with nobody having edited anything.
 */
function createRootWithNestedSubmodule(tmpDir: string): string {
  const innerOrigin = path.join(tmpDir, 'inner-origin')
  const subOrigin = path.join(tmpDir, 'sub-origin')
  const rootPath = path.join(tmpDir, 'root')
  for (const dir of [innerOrigin, subOrigin, rootPath]) {
    mkdirSync(dir, { recursive: true })
  }

  gitInit(innerOrigin)
  writeFileSync(path.join(innerOrigin, 'i.txt'), 'one\n')
  gitCommit(innerOrigin, 'inner init')

  gitInit(subOrigin)
  writeFileSync(path.join(subOrigin, 's.txt'), 'sub\n')
  gitCommit(subOrigin, 'sub init')
  git(subOrigin, ['submodule', 'add', '-q', innerOrigin, NESTED_PATH])
  git(subOrigin, ['config', '-f', '.gitmodules', `submodule.${NESTED_PATH}.ignore`, 'all'])
  gitCommit(subOrigin, 'sub carries inner with ignore = all')

  gitInit(rootPath)
  writeFileSync(path.join(rootPath, 'r.txt'), 'root\n')
  gitCommit(rootPath, 'root init')
  git(rootPath, ['submodule', 'add', '-q', subOrigin, SUBMODULE_PATH])
  git(rootPath, ['submodule', 'update', '-q', '--init', '--recursive'])
  gitCommit(rootPath, 'root carries vendor/sub')

  // Advance inner upstream, then move the checkout onto it. vendor/sub still
  // records the older commit, so its gitlink for `inner` is drifted.
  writeFileSync(path.join(innerOrigin, 'i.txt'), 'two\n')
  gitCommit(innerOrigin, 'inner advances')
  const nestedCheckout = path.join(rootPath, SUBMODULE_PATH, NESTED_PATH)
  git(nestedCheckout, ['fetch', '-q', 'origin'])
  git(nestedCheckout, ['checkout', '-q', 'origin/main'])

  return rootPath
}

describe('GitHandler — nested submodule ignore inside an expanded submodule', () => {
  let dispatcher: MockDispatcher
  let handler: GitHandler
  let tmpDir: string
  let rootPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-nested-submodule-'))
    dispatcher = createMockDispatcher()
    handler = new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
    rootPath = createRootWithNestedSubmodule(tmpDir)
  })

  afterEach(async () => {
    handler.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('sets up a submodule whose own git status hides the drifted nested gitlink', () => {
    // Pins the fixture: without this the assertion below could pass for the wrong
    // reason (no nested row produced at all).
    const submoduleWorktree = path.join(rootPath, SUBMODULE_PATH)
    expect(git(submoduleWorktree, ['status', '--short'])).toBe('')
    expect(
      git(submoduleWorktree, ['status', '--porcelain=v2', '--ignore-submodules=none'])
    ).toContain(NESTED_PATH)
  })

  it('honours submodule.<name>.ignore for rows inside the expanded submodule', async () => {
    const { entries } = (await dispatcher.callRequest('git.submoduleStatus', {
      worktreePath: rootPath,
      submodulePath: SUBMODULE_PATH
    })) as StatusResponse

    expect(entries.map((entry) => entry.path)).not.toContain(NESTED_PATH)
  })
})
