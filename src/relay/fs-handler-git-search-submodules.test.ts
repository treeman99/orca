/**
 * Real-git coverage for the relay's submodule pass. Kept alongside the main-process
 * twin (src/main/ipc/filesystem-search-git-submodules.test.ts) because a divergence
 * between them only shows up over SSH, where nobody is looking.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { searchWithGitGrep } from './fs-handler-git-fallback'

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

beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), 'orca-relay-search-submodule-'))
  const libPath = path.join(fixtureRoot, 'libalpha')
  await execFileAsync('git', ['init', '-q', '-b', 'main', libPath], { env: GIT_ENV })
  await writeFile(path.join(libPath, 'code.ts'), 'export const x = "NEEDLE"\n')
  await git(libPath, ['add', '-A'])
  await git(libPath, ['commit', '-qm', 'init'])

  parentPath = path.join(fixtureRoot, 'parent')
  await execFileAsync('git', ['init', '-q', '-b', 'main', parentPath], { env: GIT_ENV })
  await writeFile(path.join(parentPath, 'README.md'), '# NEEDLE doc\n')
  await git(parentPath, ['add', '-A'])
  await git(parentPath, ['commit', '-qm', 'init'])
  await git(parentPath, [
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    '-q',
    libPath,
    'vendor/libalpha'
  ])
  await git(parentPath, ['commit', '-qm', 'submodule'])
}, 60_000)

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
})

describe('relay git grep fallback across submodules', () => {
  it('finds matches in the parent and inside the submodule', async () => {
    const result = await searchWithGitGrep(parentPath, 'NEEDLE', { maxResults: 100 })

    expect(result.files.map((file) => file.relativePath).sort()).toEqual([
      'README.md',
      'vendor/libalpha/code.ts'
    ])
    expect(result.engine).toBe('git-grep')
  })

  it('reports a submodule skipped for an untranslatable glob', async () => {
    const result = await searchWithGitGrep(parentPath, 'NEEDLE', {
      maxResults: 100,
      includePattern: 'vendor/*/code.ts'
    })

    expect(result.skippedSubmodules).toEqual(['vendor/libalpha'])
  })

  it('degrades to the parent pass on a directory that is not a repo', async () => {
    const result = await searchWithGitGrep(fixtureRoot, 'NEEDLE', { maxResults: 100 })

    expect(result.files).toEqual([])
  })
})
