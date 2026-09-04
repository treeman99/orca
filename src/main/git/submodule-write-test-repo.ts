/**
 * Real-git fixtures for the submodule write-operation suites.
 *
 * Why real Git: the contract under test is what Git does when a submodule is NOT a
 * repository root — it walks up to the parent and mutates that instead. No stubbed
 * executor reproduces that, and it is exactly the accident the root guard exists for.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { runProcessSync } from '../../shared/child-process/run-process'

const IDENTITY = [
  '-c',
  'user.email=orca-test@example.com',
  '-c',
  'user.name=Orca Test',
  // Local-path `submodule add` is refused by default since the CVE-2022-39253 fix.
  '-c',
  'protocol.file.allow=always'
]

export function git(dir: string, args: string[]): string {
  // `runProcessSync` reports the exit code instead of throwing, but a fixture that
  // silently continued past a failed setup step would test the wrong tree.
  const result = runProcessSync({ program: 'git', args: [...IDENTITY, ...args], cwd: dir })
  if (result.code !== 0 || result.timedOut) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(
      `git ${args.join(' ')} failed (${result.timedOut ? 'timed out' : result.code}): ${detail}`
    )
  }
  return result.stdout
}

export function commitAll(dir: string, message: string): void {
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-m', message, '--allow-empty'])
}

export const SUBMODULE_PATH = 'vendor/sub'

export type SubmoduleFixture = {
  rootPath: string
  submoduleWorktreePath: string
  submoduleRemotePath: string
}

/** Parent on `main` with one initialized submodule that has a real remote to push to. */
export function createRootWithSubmodule(tmpDir: string): SubmoduleFixture {
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
  writeFileSync(path.join(rootPath, 'rootfile.txt'), 'root\n')
  commitAll(rootPath, 'root init')
  git(rootPath, ['submodule', 'add', '-q', originPath, SUBMODULE_PATH])
  commitAll(rootPath, 'add submodule')

  return {
    rootPath,
    submoduleWorktreePath: path.join(rootPath, SUBMODULE_PATH),
    submoduleRemotePath: originPath
  }
}

/**
 * Deinitialize the submodule, then plant a file whose name also exists in the parent.
 * The directory is now an ordinary folder inside the parent repository — the state where
 * an unguarded command silently operates on the parent's copy of that file.
 */
export function deinitSubmoduleLeavingParentDecoy(fixture: SubmoduleFixture): {
  decoyRelativePath: string
  parentContents: string
} {
  git(fixture.rootPath, ['submodule', 'deinit', '-f', '--', SUBMODULE_PATH])
  rmSync(path.join(fixture.rootPath, '.git', 'modules'), { recursive: true, force: true })
  mkdirSync(fixture.submoduleWorktreePath, { recursive: true })
  return { decoyRelativePath: 'rootfile.txt', parentContents: 'root\n' }
}

/**
 * Land a commit on the submodule remote's `main` without touching the submodule checkout,
 * leaving it BEHIND. Pushed from a throwaway clone because the origin keeps `main`
 * unchecked-out (detached) so pushes to it are accepted.
 */
export function advanceSubmoduleRemote(
  tmpDir: string,
  fixture: SubmoduleFixture,
  message: string
): void {
  const publisherPath = path.join(tmpDir, `publisher-${message.replace(/\W+/g, '-')}`)
  git(tmpDir, ['clone', '-q', '--branch', 'main', fixture.submoduleRemotePath, publisherPath])
  writeFileSync(path.join(publisherPath, 'subfile.txt'), `${message}\n`)
  commitAll(publisherPath, message)
  git(publisherPath, ['push', '-q', 'origin', 'HEAD:main'])
}
