/**
 * Real-git coverage for the submodule half of the git-grep fallback.
 *
 * Mocked child_process cannot prove this: the bug was that `git grep --untracked`
 * refuses `--recurse-submodules`, so only a real repo with real submodules shows
 * whether the second pass actually reaches inside them.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { searchWithGitGrep } from './filesystem-search-git'

const execFileAsync = promisify(execFile)

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'orca-test',
  GIT_AUTHOR_EMAIL: 'orca-test@example.com',
  GIT_COMMITTER_NAME: 'orca-test',
  GIT_COMMITTER_EMAIL: 'orca-test@example.com'
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd, env: GIT_ENV })
}

let fixtureRoot: string
let parentPath: string

async function createLibrary(name: string): Promise<string> {
  const libPath = path.join(fixtureRoot, name)
  await execFileAsync('git', ['init', '-q', '-b', 'main', libPath], { env: GIT_ENV })
  await writeFile(path.join(libPath, 'code.ts'), 'export const x = "NEEDLE"\n')
  await git(libPath, ['add', '-A'])
  await git(libPath, ['commit', '-qm', 'init'])
  return libPath
}

beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), 'orca-search-submodule-'))
  const alpha = await createLibrary('libalpha')
  const beta = await createLibrary('libbeta')

  parentPath = path.join(fixtureRoot, 'parent')
  await execFileAsync('git', ['init', '-q', '-b', 'main', parentPath], { env: GIT_ENV })
  // Why only .md in the parent: this mirrors the reported repo shape — docs at the
  // top level, every line of code behind a submodule.
  await writeFile(path.join(parentPath, 'README.md'), '# NEEDLE doc\n')
  await git(parentPath, ['add', '-A'])
  await git(parentPath, ['commit', '-qm', 'init'])
  for (const [lib, at] of [
    [alpha, 'vendor/libalpha'],
    [beta, 'vendor/libbeta']
  ]) {
    await git(parentPath, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, at])
  }
  await git(parentPath, ['commit', '-qm', 'submodules'])
  // Untracked parent file: proves --untracked still applies to the parent pass.
  await writeFile(path.join(parentPath, 'NOTES.md'), 'untracked NEEDLE\n')
}, 60_000)

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
})

function relativePaths(files: { relativePath: string }[]): string[] {
  return files.map((file) => file.relativePath).sort()
}

describe('git grep fallback across submodules', () => {
  it('finds matches in the parent and inside every initialized submodule', async () => {
    const result = await searchWithGitGrep(
      parentPath,
      { query: 'NEEDLE', rootPath: parentPath },
      100
    )

    expect(relativePaths(result.files)).toEqual([
      'NOTES.md',
      'README.md',
      'vendor/libalpha/code.ts',
      'vendor/libbeta/code.ts'
    ])
    expect(result.totalMatches).toBe(4)
    expect(result.engine).toBe('git-grep')
    expect(result.skippedSubmodules).toBeUndefined()
  })

  it('resolves submodule hits to absolute paths under the parent root', async () => {
    const result = await searchWithGitGrep(
      parentPath,
      { query: 'NEEDLE', rootPath: parentPath },
      100
    )

    const hit = result.files.find((file) => file.relativePath === 'vendor/libalpha/code.ts')
    expect(hit?.filePath).toBe(path.join(parentPath, 'vendor', 'libalpha', 'code.ts'))
  })

  it('stops at maxResults and reports truncation', async () => {
    const result = await searchWithGitGrep(parentPath, { query: 'NEEDLE', rootPath: parentPath }, 2)

    expect(result.totalMatches).toBe(2)
    expect(result.truncated).toBe(true)
  })

  it('passes a bare include glob through to the submodule pass unchanged', async () => {
    const result = await searchWithGitGrep(
      parentPath,
      { query: 'NEEDLE', rootPath: parentPath, includePattern: '*.ts' },
      100
    )

    expect(relativePaths(result.files)).toEqual([
      'vendor/libalpha/code.ts',
      'vendor/libbeta/code.ts'
    ])
  })

  it('rebases a submodule-rooted include glob onto the submodule', async () => {
    const result = await searchWithGitGrep(
      parentPath,
      { query: 'NEEDLE', rootPath: parentPath, includePattern: 'vendor/libalpha/*.ts' },
      100
    )

    expect(relativePaths(result.files)).toEqual(['vendor/libalpha/code.ts'])
    expect(result.skippedSubmodules).toBeUndefined()
  })

  it('reports submodules skipped because a glob has no submodule-relative form', async () => {
    const result = await searchWithGitGrep(
      parentPath,
      { query: 'NEEDLE', rootPath: parentPath, includePattern: 'vendor/*/code.ts' },
      100
    )

    expect(relativePaths(result.files)).toEqual([])
    expect(result.skippedSubmodules).toEqual(['vendor/libalpha', 'vendor/libbeta'])
  })

  it('degrades to the parent pass on a folder workspace that is not a repo', async () => {
    const result = await searchWithGitGrep(
      fixtureRoot,
      { query: 'NEEDLE', rootPath: fixtureRoot },
      100
    )

    expect(result.files).toEqual([])
    expect(result.engine).toBe('git-grep')
  })

  it('leaves a deinitialized submodule unsearched instead of re-scanning the parent', async () => {
    await git(parentPath, ['submodule', 'deinit', '-f', 'vendor/libbeta'])
    try {
      const result = await searchWithGitGrep(
        parentPath,
        { query: 'NEEDLE', rootPath: parentPath },
        100
      )

      expect(relativePaths(result.files)).toEqual([
        'NOTES.md',
        'README.md',
        'vendor/libalpha/code.ts'
      ])
    } finally {
      await git(parentPath, [
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'update',
        '--init',
        'vendor/libbeta'
      ])
    }
  })
})
