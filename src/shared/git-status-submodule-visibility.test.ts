import { describe, expect, it } from 'vitest'
import { buildGitStatusCommandArgs } from './git-status-command-args'
import { StatusPorcelainParser, parseSubmoduleStatus } from './git-status-porcelain-parser'

// Fixtures below are verbatim `git status --porcelain=v2 --branch --untracked-files=all`
// output captured from a real Git 2.50 repo: root on `main`, submodule `vendor/sub`
// checked out on `other-branch`, with a modified, a staged and an untracked file inside it.

const ROOT_STATUS_SUBMODULE_ON_OTHER_BRANCH = [
  '# branch.oid f587eaff6a7b013ca6ee05a75ea82f25c091220b',
  '# branch.head main',
  '1 .M N... 100644 100644 100644 5b475abeecd8a04097835a95e90bc4e89ad41661 5b475abeecd8a04097835a95e90bc4e89ad41661 rootfile.txt',
  '1 .M S.MU 160000 160000 160000 031c1df1f5107f0c449f65f563df0ee61d6769f1 031c1df1f5107f0c449f65f563df0ee61d6769f1 vendor/sub',
  ''
].join('\n')

const SUBMODULE_INNER_STATUS = [
  '# branch.oid 031c1df1f5107f0c449f65f563df0ee61d6769f1',
  '# branch.head other-branch',
  '# branch.upstream origin/other-branch',
  '# branch.ab +0 -0',
  '1 M. N... 100644 100644 100644 184a104a45b38327335b4835b7908a39aac657ca 8cd6ae50d874e7835e8fecee0939c677ce055d58 other.txt',
  '1 .M N... 100644 100644 100644 156b98802ec9ee418b505b0e31dfd54a5d23387a 156b98802ec9ee418b505b0e31dfd54a5d23387a subfile.txt',
  '? newfile.txt',
  ''
].join('\n')

function parse(output: string): StatusPorcelainParser {
  const parser = new StatusPorcelainParser()
  parser.update(output, 0)
  parser.finish()
  return parser
}

describe('buildGitStatusCommandArgs', () => {
  it('asks for git status default submodule reporting so repo config cannot blank the row', () => {
    // Why: a checked-in `.gitmodules` carrying `ignore = all` (or a
    // `diff.ignoreSubmodules` config) otherwise removes the gitlink row entirely
    // and the submodule disappears from Source Control on every clone.
    expect(buildGitStatusCommandArgs()).toEqual([
      '-c',
      'core.quotePath=false',
      'status',
      '--porcelain=v2',
      '--branch',
      '--untracked-files=all',
      '--ignore-submodules=none'
    ])
  })

  it('keeps --ignored=matching last when ignored paths are requested', () => {
    expect(buildGitStatusCommandArgs({ includeIgnored: true }).slice(-2)).toEqual([
      '--ignore-submodules=none',
      '--ignored=matching'
    ])
  })
})

describe('root status with a submodule on a different branch', () => {
  it('reports the root branch and marks the submodule row expandable', () => {
    const parser = parse(ROOT_STATUS_SUBMODULE_ON_OTHER_BRANCH)

    expect(parser.branch.branch).toBe('refs/heads/main')
    const submoduleRow = parser.entries.find((entry) => entry.path === 'vendor/sub')
    expect(submoduleRow?.submodule).toEqual({
      commitChanged: false,
      trackedChanges: true,
      untrackedChanges: true
    })
  })

  it('does not list the submodule inner files — they only exist in its own status', () => {
    // Why: this is the whole reason a second status runs inside the submodule.
    const parser = parse(ROOT_STATUS_SUBMODULE_ON_OTHER_BRANCH)

    expect(parser.entries.map((entry) => entry.path)).toEqual(['rootfile.txt', 'vendor/sub'])
  })
})

describe('submodule inner status', () => {
  it('reports the submodule own branch, not the root branch', () => {
    const parser = parse(SUBMODULE_INNER_STATUS)

    expect(parser.branch.branch).toBe('refs/heads/other-branch')
    expect(parser.branch.head).toBe('031c1df1f5107f0c449f65f563df0ee61d6769f1')
  })

  it('captures modified, staged and untracked inner files separately', () => {
    const parser = parse(SUBMODULE_INNER_STATUS)

    expect(parser.entries).toEqual([
      { path: 'other.txt', status: 'modified', area: 'staged' },
      { path: 'subfile.txt', status: 'modified', area: 'unstaged' },
      { path: 'newfile.txt', status: 'untracked', area: 'untracked' }
    ])
  })
})

describe('parseSubmoduleStatus over the sub-state field', () => {
  it('keeps the dirty markers that make a row expandable', () => {
    expect(parseSubmoduleStatus('S.MU', 'M')).toEqual({
      commitChanged: false,
      trackedChanges: true,
      untrackedChanges: true
    })
    expect(parseSubmoduleStatus('SCMU', 'M')).toEqual({
      commitChanged: true,
      trackedChanges: true,
      untrackedChanges: true
    })
  })

  it('loses the dirty markers when the repo suppressed them via submodule.<name>.ignore=dirty', () => {
    // Why: documents the degraded shape Git emits under `ignore = dirty` (SC..),
    // which is exactly what --ignore-submodules=none prevents.
    expect(parseSubmoduleStatus('SC..', 'M')).toEqual({
      commitChanged: true,
      trackedChanges: false,
      untrackedChanges: false
    })
  })
})
