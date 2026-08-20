import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as BoundedFileReader from '../../shared/node-bounded-file-reader'
import path from 'node:path'
import {
  createBoundedFileReaderModuleMock,
  createFsPromisesModuleMock,
  createGitRunnerModuleMock
} from './status-test-harness'

const {
  gitExecFileAsyncMock,
  gitExecFileAsyncBufferMock,
  gitStreamOptionsMock,
  lstatMock,
  realpathMock,
  readFileMock,
  statMock,
  rmMock,
  existsSyncMock
} = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn(),
  gitExecFileAsyncBufferMock: vi.fn(),
  gitStreamOptionsMock: vi.fn(),
  lstatMock: vi.fn(),
  realpathMock: vi.fn(),
  readFileMock: vi.fn(),
  statMock: vi.fn(),
  rmMock: vi.fn(),
  existsSyncMock: vi.fn()
}))

vi.mock('./runner', () =>
  createGitRunnerModuleMock({
    gitExecFileAsyncMock,
    gitExecFileAsyncBufferMock,
    gitStreamOptionsMock
  })
)

vi.mock('fs/promises', () =>
  createFsPromisesModuleMock({ lstatMock, realpathMock, readFileMock, statMock, rmMock })
)

vi.mock('fs', () => ({
  existsSync: existsSyncMock
}))

vi.mock('../../shared/node-bounded-file-reader', async (importOriginal) =>
  createBoundedFileReaderModuleMock(await importOriginal<typeof BoundedFileReader>(), {
    readFileMock,
    statMock
  })
)

import {
  clearEffectiveUpstreamStatusCacheForTests,
  clearSubmodulePathsCacheForTests,
  getDiff,
  getSubmoduleStatus,
  listSubmodulePaths,
  resolveSubmoduleWorktreePath
} from './status'

describe('submodule diff routing', () => {
  const OLD_OID = 'a'.repeat(40)
  const NEW_OID = 'b'.repeat(40)
  const PARENT = path.resolve('/repo-sm')
  const SUBMODULE = path.join(PARENT, 'flutter_mine')

  beforeEach(() => {
    clearSubmodulePathsCacheForTests()
    gitExecFileAsyncMock.mockReset()
    gitExecFileAsyncBufferMock.mockReset()
    lstatMock.mockReset()
    readFileMock.mockReset()
    statMock.mockReset()
    existsSyncMock.mockReset()
    statMock.mockResolvedValue({ isFile: () => true, size: 12 })
    // Route git invocations by argv/cwd so the routing logic can resolve the
    // gitlink oids without touching a real repo.
    gitExecFileAsyncMock.mockImplementation((args: string[], options?: { cwd?: string }) => {
      if (args[0] === 'config' && args.includes('.gitmodules')) {
        // Only the parent worktree declares the submodule; the recursion into the
        // submodule worktree must see no nested submodules.
        return Promise.resolve({
          stdout: options?.cwd === PARENT ? 'submodule.flutter_mine.path flutter_mine\n' : ''
        })
      }
      if (args[0] === 'ls-files') {
        return Promise.resolve({ stdout: `160000 ${OLD_OID} 0\tflutter_mine\n` })
      }
      if (args[0] === 'ls-tree') {
        return Promise.resolve({ stdout: `160000 commit ${OLD_OID}\tflutter_mine\n` })
      }
      if (args[0] === 'rev-parse') {
        return Promise.resolve({ stdout: `${NEW_OID}\n` })
      }
      return Promise.resolve({ stdout: '' })
    })
  })

  it('synthesizes a Subproject commit pointer diff for the gitlink root', async () => {
    const result = await getDiff(PARENT, 'flutter_mine', false)

    expect(result.kind).toBe('text')
    expect(result.originalContent).toBe(`Subproject commit ${OLD_OID}\n`)
    expect(result.modifiedContent).toBe(`Subproject commit ${NEW_OID}\n`)
  })

  // The range-first route is gone: an inner row only ever comes from the submodule's own
  // `git status`, so its diff is the submodule's own working-tree diff even while the parent's
  // recorded gitlink and the checked-out HEAD differ. Reading the range instead is what made a
  // list of the user's edits open someone else's committed change.
  it('reads inner files from the submodule worktree even when the gitlink moved', async () => {
    gitExecFileAsyncBufferMock.mockImplementation((args: string[]) => {
      const spec = String(args.at(-1))
      if (spec.startsWith(`${OLD_OID}:`) || spec.startsWith(`${NEW_OID}:`)) {
        throw new Error('inner diff must not read across the recorded commit range')
      }
      return Promise.resolve({ stdout: Buffer.from('') })
    })

    await getDiff(PARENT, 'flutter_mine/lib/main.dart', false)

    for (const call of gitExecFileAsyncBufferMock.mock.calls) {
      const spec = String((call[0] as string[]).at(-1))
      expect(spec.startsWith(`${OLD_OID}:`)).toBe(false)
      expect(spec.startsWith(`${NEW_OID}:`)).toBe(false)
    }
  })

  it('reads inner files from the working tree when the commit is unchanged', async () => {
    // Override the gitlink oids so recorded == checked-out (no pointer move),
    // routing the inner diff back to the index/working-tree blob read.
    gitExecFileAsyncMock.mockImplementation((args: string[], options?: { cwd?: string }) => {
      if (args[0] === 'config' && args.includes('.gitmodules')) {
        return Promise.resolve({
          stdout: options?.cwd === PARENT ? 'submodule.flutter_mine.path flutter_mine\n' : ''
        })
      }
      if (args[0] === 'ls-files') {
        return Promise.resolve({ stdout: `160000 ${OLD_OID} 0\tflutter_mine\n` })
      }
      if (args[0] === 'rev-parse') {
        return Promise.resolve({ stdout: `${OLD_OID}\n` })
      }
      return Promise.resolve({ stdout: '' })
    })
    gitExecFileAsyncBufferMock.mockResolvedValueOnce({ stdout: Buffer.from('old\n') })
    readFileMock.mockResolvedValue(Buffer.from('new'))

    const result = await getDiff(PARENT, 'flutter_mine/lib/main.dart', false)

    expect(gitExecFileAsyncBufferMock).toHaveBeenCalledWith(['show', ':lib/main.dart'], {
      cwd: SUBMODULE,
      maxBuffer: 10 * 1024 * 1024
    })
    expect(readFileMock).toHaveBeenCalledWith(path.join(SUBMODULE, 'lib/main.dart'))
    expect(result.kind).toBe('text')
    expect(result.originalContent).toBe('old\n')
    expect(result.modifiedContent).toBe('new')
  })

  it('rejects inner submodule diffs whose .gitmodules path escapes the worktree', async () => {
    // A crafted .gitmodules path must not let the inner diff read escape the
    // selected worktree; loadDiff routes through resolveSubmoduleWorktreePath.
    gitExecFileAsyncMock.mockImplementation((args: string[], options?: { cwd?: string }) => {
      if (args[0] === 'config' && args.includes('.gitmodules')) {
        return Promise.resolve({
          stdout: options?.cwd === PARENT ? 'submodule.evil.path ../evil\n' : ''
        })
      }
      return Promise.resolve({ stdout: '' })
    })

    await expect(getDiff(PARENT, '../evil/secret.txt', false)).rejects.toThrow('Access denied')
  })

  it('rejects gitlink pointer diffs whose .gitmodules path escapes the worktree', async () => {
    gitExecFileAsyncMock.mockImplementation((args: string[], options?: { cwd?: string }) => {
      if (args[0] === 'config' && args.includes('.gitmodules')) {
        return Promise.resolve({
          stdout: options?.cwd === PARENT ? 'submodule.evil.path ../evil\n' : ''
        })
      }
      return Promise.resolve({ stdout: '' })
    })

    await expect(getDiff(PARENT, '../evil', false)).rejects.toThrow('Access denied')
  })
})

describe('resolveSubmoduleWorktreePath', () => {
  it('resolves a relative submodule path inside the worktree', () => {
    expect(resolveSubmoduleWorktreePath('/repo', 'flutter_mine')).toBe(
      path.resolve('/repo', 'flutter_mine')
    )
  })

  it('rejects absolute and escaping submodule paths', () => {
    expect(() => resolveSubmoduleWorktreePath('/repo', path.resolve('/etc'))).toThrow(
      'Access denied'
    )
    expect(() => resolveSubmoduleWorktreePath('/repo', '../outside')).toThrow('Access denied')
  })
})

describe('listSubmodulePaths', () => {
  beforeEach(() => {
    clearSubmodulePathsCacheForTests()
    gitExecFileAsyncMock.mockReset()
  })

  it('keeps cached .gitmodules paths separate per WSL distro', async () => {
    gitExecFileAsyncMock.mockImplementation((_args: string[], options?: { wslDistro?: string }) =>
      Promise.resolve({
        stdout:
          options?.wslDistro === 'debian'
            ? 'submodule.lib.path debian-lib\n'
            : 'submodule.lib.path ubuntu-lib\n'
      })
    )

    await expect(listSubmodulePaths('/repo', { wslDistro: 'ubuntu' })).resolves.toEqual([
      'ubuntu-lib'
    ])
    await expect(listSubmodulePaths('/repo', { wslDistro: 'debian' })).resolves.toEqual([
      'debian-lib'
    ])

    expect(gitExecFileAsyncMock).toHaveBeenCalledTimes(2)
  })
})

describe('getSubmoduleStatus', () => {
  beforeEach(() => {
    clearEffectiveUpstreamStatusCacheForTests()
    gitExecFileAsyncMock.mockReset()
    gitExecFileAsyncBufferMock.mockReset()
    gitStreamOptionsMock.mockReset()
    lstatMock.mockReset()
    readFileMock.mockReset()
    existsSyncMock.mockReset()
    gitExecFileAsyncMock.mockResolvedValue({ stdout: '' })
  })

  it('runs status inside the submodule worktree and returns inner entries', async () => {
    readFileMock.mockResolvedValue('gitdir: /repo/flutter_mine/.git\n')
    existsSyncMock.mockReturnValue(false)
    gitExecFileAsyncMock.mockImplementation((args: string[]) => {
      // The root guard runs first: an empty prefix means "this IS the repository root".
      if (args[0] === 'rev-parse' && args[1] === '--show-prefix') {
        return Promise.resolve({ stdout: '\n' })
      }
      if (args.includes('--porcelain=v2')) {
        return Promise.resolve({
          stdout:
            '1 .M N... 100644 100644 100644 ce013625030ba8dba906f756967f9e9ca394464a ce013625030ba8dba906f756967f9e9ca394464a lib/main.dart\n'
        })
      }
      return Promise.resolve({ stdout: '' })
    })

    const result = await getSubmoduleStatus('/repo', 'flutter_mine')

    expect(result.entries).toContainEqual({
      path: 'lib/main.dart',
      status: 'modified',
      area: 'unstaged'
    })
  })

  // The expansion is the submodule's own status and nothing else. A moved gitlink with a
  // clean submodule worktree therefore reports nothing, whatever area was requested.
  it('never synthesizes rows from the recorded commit range', async () => {
    readFileMock.mockResolvedValue('gitdir: /repo/flutter_mine/.git\n')
    existsSyncMock.mockReturnValue(false)
    gitExecFileAsyncMock.mockImplementation((args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-prefix') {
        return Promise.resolve({ stdout: '\n' })
      }
      if (args.includes('--name-status')) {
        throw new Error('the expansion must not diff the recorded commit range')
      }
      return Promise.resolve({ stdout: '' })
    })

    expect((await getSubmoduleStatus('/repo', 'flutter_mine')).entries).toEqual([])
    expect((await getSubmoduleStatus('/repo', 'flutter_mine', { staged: true })).entries).toEqual(
      []
    )
  })

  // `resolveSubmoduleWorktreePath` only proves containment; a submodule that is currently a
  // plain directory would let git walk up and answer for the PARENT repository.
  it('refuses a path that is inside a repository but not its root', async () => {
    readFileMock.mockResolvedValue('gitdir: /repo/flutter_mine/.git\n')
    existsSyncMock.mockReturnValue(false)
    gitExecFileAsyncMock.mockImplementation((args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-prefix') {
        return Promise.resolve({ stdout: 'flutter_mine/\n' })
      }
      return Promise.resolve({ stdout: '' })
    })

    await expect(getSubmoduleStatus('/repo', 'flutter_mine')).rejects.toThrow(/Access denied/)
  })
})
