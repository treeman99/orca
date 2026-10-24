import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readMergeConflictInputs } from './merge-conflict-inputs'

describe('readMergeConflictInputs against real Git conflicts', () => {
  let repo: string
  let localizedGitDir: string | undefined

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'orca-merge-conflict-'))
    git(['init'])
    git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
    git(['config', 'user.email', 'test@example.com'])
    git(['config', 'user.name', 'Test User'])
    git(['config', 'commit.gpgsign', 'false'])
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(repo, { recursive: true, force: true })
    if (localizedGitDir) {
      await rm(localizedGitDir, { recursive: true, force: true })
      localizedGitDir = undefined
    }
  })

  function git(args: string[]): string {
    return execFileSync('git', args, { cwd: repo, stdio: 'pipe', encoding: 'utf8' })
  }

  /** Merge/rebase exit non-zero on a conflict; that is the state under test. */
  function gitExpectingConflict(args: string[]): void {
    const result = spawnSync('git', args, { cwd: repo, stdio: 'pipe', encoding: 'utf8' })
    expect(result.status, result.stdout + result.stderr).not.toBe(0)
  }

  function commitFile(relativePath: string, content: string | Buffer, message: string): void {
    mkdirSync(path.dirname(path.join(repo, relativePath)), { recursive: true })
    writeFileSync(path.join(repo, relativePath), content)
    git(['add', '--', relativePath])
    git(['commit', '-m', message])
  }

  function divergeAndMerge(relativePath: string, base: string, ours: string, theirs: string): void {
    commitFile(relativePath, base, 'base')
    git(['checkout', '-b', 'feature'])
    commitFile(relativePath, theirs, 'theirs')
    git(['checkout', 'main'])
    commitFile(relativePath, ours, 'ours')
    gitExpectingConflict(['merge', 'feature'])
  }

  function shortOid(ref: string): string {
    return git(['rev-parse', '--short', ref]).trim()
  }

  it('reads all three stages and both side labels of a both_modified merge conflict', async () => {
    divergeAndMerge('file.txt', 'a\nb\nc\n', 'a\nours\nc\n', 'a\ntheirs\nc\n')

    expect(await readMergeConflictInputs(repo, 'file.txt')).toEqual({
      base: { content: 'a\nb\nc\n', exists: true, isBinary: false },
      ours: { content: 'a\nours\nc\n', exists: true, isBinary: false },
      theirs: { content: 'a\ntheirs\nc\n', exists: true, isBinary: false },
      operation: 'merge',
      oursLabel: { shortOid: shortOid('HEAD'), refNames: ['main'] },
      theirsLabel: { shortOid: shortOid('MERGE_HEAD'), refNames: ['feature'] }
    })
  })

  function addOnBothSides(relativePath: string): void {
    commitFile('seed.txt', 'seed\n', 'seed')
    git(['checkout', '-b', 'feature'])
    commitFile(relativePath, 'from feature\n', 'feature adds')
    git(['checkout', 'main'])
    commitFile(relativePath, 'from main\n', 'main adds')
    gitExpectingConflict(['merge', 'feature'])
  }

  /**
   * Orca pins its Git children to English (git-output-locale.ts) and a host Git may ship no ko
   * catalog, so a localized Git is simulated: real Git with every diagnostic line translated.
   */
  function useLocalizedGit(): void {
    const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()
    const binDir = mkdtempSync(path.join(tmpdir(), 'orca-localized-git-'))
    localizedGitDir = binDir
    const wrapper = path.join(binDir, 'git')
    writeFileSync(
      wrapper,
      [
        '#!/bin/bash',
        'set -o pipefail',
        `{ ${JSON.stringify(realGit)} "$@" 2>&1 1>&3 3>&- | sed -e 's/^fatal: .*/치명적: 경로가 해당 스테이지에 없습니다/' -e 's/^hint: .*/힌트: 번역됨/' 1>&2; } 3>&1`,
        ''
      ].join('\n')
    )
    chmodSync(wrapper, 0o755)
    vi.stubEnv('PATH', `${binDir}${path.delimiter}${process.env.PATH ?? ''}`)
    vi.stubEnv('LANG', 'ko_KR.UTF-8')
    vi.stubEnv('LC_ALL', 'ko_KR.UTF-8')
    vi.stubEnv('LANGUAGE', 'ko')
  }

  it('reports a both_added conflict as having no base stage', async () => {
    addOnBothSides('added.txt')

    const inputs = await readMergeConflictInputs(repo, 'added.txt')

    expect(inputs.base).toEqual({ content: '', exists: false, isBinary: false })
    expect(inputs.ours).toEqual({ content: 'from main\n', exists: true, isBinary: false })
    expect(inputs.theirs).toEqual({ content: 'from feature\n', exists: true, isBinary: false })
  })

  it.skipIf(process.platform === 'win32')(
    'finds the missing base of a both_added conflict under a localized Git',
    async () => {
      addOnBothSides('added.txt')
      useLocalizedGit()
      const probe = spawnSync('git', ['show', ':1:added.txt'], { cwd: repo, encoding: 'utf8' })
      expect(probe.status).toBe(128)
      expect(probe.stderr).not.toContain('not at stage')

      const inputs = await readMergeConflictInputs(repo, 'added.txt')

      expect(inputs.base).toEqual({ content: '', exists: false, isBinary: false })
      expect(inputs.ours.content).toBe('from main\n')
      expect(inputs.theirs.content).toBe('from feature\n')
    }
  )

  it('reads every stage of a conflict whose path has spaces and Hangul', async () => {
    divergeAndMerge('회의 자료/주간 메모.txt', '기본\n', '우리 쪽\n', '들어온 쪽\n')

    const inputs = await readMergeConflictInputs(repo, '회의 자료/주간 메모.txt')

    expect(inputs.base).toEqual({ content: '기본\n', exists: true, isBinary: false })
    expect(inputs.ours).toEqual({ content: '우리 쪽\n', exists: true, isBinary: false })
    expect(inputs.theirs).toEqual({ content: '들어온 쪽\n', exists: true, isBinary: false })
  })

  it('labels the incoming side of a rebase conflict from REBASE_HEAD', async () => {
    commitFile('file.txt', 'a\nb\nc\n', 'base')
    git(['checkout', '-b', 'feature'])
    commitFile('file.txt', 'a\nreplayed\nc\n', 'feature change')
    const replayed = shortOid('HEAD')
    git(['checkout', 'main'])
    commitFile('file.txt', 'a\nupstream\nc\n', 'main change')
    git(['checkout', 'feature'])
    gitExpectingConflict(['rebase', 'main'])

    const inputs = await readMergeConflictInputs(repo, 'file.txt')

    expect(inputs.operation).toBe('rebase')
    expect(inputs.ours.content).toBe('a\nupstream\nc\n')
    expect(inputs.theirs.content).toBe('a\nreplayed\nc\n')
    expect(inputs.theirsLabel).toEqual({ shortOid: replayed, refNames: ['feature'] })
    expect(shortOid('REBASE_HEAD')).toBe(replayed)
    // Why: every rebase step runs on a detached HEAD, so the bare "HEAD" decoration is dropped.
    expect(inputs.oursLabel).toEqual({ shortOid: shortOid('HEAD'), refNames: ['main'] })
  })

  it('accepts a Windows-style relative path for a nested file', async () => {
    divergeAndMerge('dir/nested.txt', 'base\n', 'ours\n', 'theirs\n')

    const inputs = await readMergeConflictInputs(repo, 'dir\\nested.txt')

    expect(inputs.ours.content).toBe('ours\n')
    expect(inputs.theirs.content).toBe('theirs\n')
  })

  it('marks a binary stage without returning its bytes', async () => {
    divergeAndMerge('blob.bin', 'base\0', 'ours\0', 'theirs\0')

    const inputs = await readMergeConflictInputs(repo, 'blob.bin')

    expect(inputs.ours).toEqual({ content: '', exists: true, isBinary: true })
    expect(inputs.theirs).toEqual({ content: '', exists: true, isBinary: true })
  })

  it('fails instead of reporting absence when a stage blob is unreadable', async () => {
    divergeAndMerge('file.txt', 'base\n', 'ours\n', 'theirs\n')
    const baseOid = git(['rev-parse', ':1:file.txt']).trim()
    await unlink(path.join(repo, '.git', 'objects', baseOid.slice(0, 2), baseOid.slice(2)))

    await expect(readMergeConflictInputs(repo, 'file.txt')).rejects.toThrow()
  })
})
