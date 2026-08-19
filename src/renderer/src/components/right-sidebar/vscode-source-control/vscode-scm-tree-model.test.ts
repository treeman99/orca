import { describe, expect, it } from 'vitest'
import { buildVscodeScmRows, buildVscodeScmTreeRows } from './vscode-scm-tree-model'
import type { GitStatusEntry } from '../../../../../shared/types'

function entry(path: string, area: GitStatusEntry['area'] = 'unstaged'): GitStatusEntry {
  return { path, status: 'modified', area }
}

describe('buildVscodeScmTreeRows', () => {
  it('compresses single-child directory chains into one row', () => {
    const rows = buildVscodeScmTreeRows([entry('src/main/git/status.ts')])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      kind: 'directory',
      key: 'src/main/git',
      label: 'src/main/git',
      depth: 0,
      fileCount: 1
    })
    expect(rows[1]).toMatchObject({
      kind: 'file',
      key: 'unstaged:src/main/git/status.ts',
      depth: 1
    })
  })

  it('stops compressing where the chain branches', () => {
    const rows = buildVscodeScmTreeRows([entry('src/main/a.ts'), entry('src/relay/b.ts')])
    const directories = rows.filter((row) => row.kind === 'directory')
    expect(directories.map((row) => row.kind === 'directory' && row.label)).toEqual([
      'src',
      'main',
      'relay'
    ])
  })

  it('stops compressing at a directory that holds its own files', () => {
    const rows = buildVscodeScmTreeRows([entry('src/index.ts'), entry('src/lib/util.ts')])
    const labels = rows
      .filter((row) => row.kind === 'directory')
      .map((row) => (row.kind === 'directory' ? row.label : ''))
    expect(labels).toEqual(['src', 'lib'])
  })

  it('counts every descendant file on the compressed directory row', () => {
    const rows = buildVscodeScmTreeRows([entry('a/b/one.ts'), entry('a/b/two.ts')])
    const directory = rows.find((row) => row.kind === 'directory')
    expect(directory).toMatchObject({ label: 'a/b', fileCount: 2 })
  })

  it('renders directories before files at the same depth', () => {
    const rows = buildVscodeScmTreeRows([entry('root.ts'), entry('dir/nested.ts')])
    expect(rows[0]).toMatchObject({ kind: 'directory', label: 'dir' })
    expect(rows.at(-1)).toMatchObject({ kind: 'file' })
  })

  it('omits the subtree of a collapsed directory but keeps its row', () => {
    const rows = buildVscodeScmTreeRows([entry('a/b/one.ts'), entry('c.ts')], new Set(['a/b']))
    expect(rows.map((row) => (row.kind === 'directory' ? row.label : row.entry.path))).toEqual([
      'a/b',
      'c.ts'
    ])
  })

  it('ignores entries with an empty path instead of emitting a phantom row', () => {
    expect(buildVscodeScmTreeRows([entry('')])).toEqual([])
  })

  it('keys rows by area so the same path can appear in two groups', () => {
    const [staged] = buildVscodeScmTreeRows([entry('a.ts', 'staged')])
    const [unstaged] = buildVscodeScmTreeRows([entry('a.ts', 'unstaged')])
    expect(staged.key).not.toBe(unstaged.key)
  })
})

describe('buildVscodeScmRows', () => {
  it('keeps list mode flat and in the order the group supplied', () => {
    const rows = buildVscodeScmRows([entry('z/late.ts'), entry('a/early.ts')], 'list')
    expect(rows.every((row) => row.depth === 0)).toBe(true)
    expect(rows.map((row) => (row.kind === 'file' ? row.entry.path : ''))).toEqual([
      'z/late.ts',
      'a/early.ts'
    ])
  })

  it('delegates to the tree builder in tree mode', () => {
    const rows = buildVscodeScmRows([entry('a/b.ts')], 'tree')
    expect(rows[0]).toMatchObject({ kind: 'directory', label: 'a' })
  })
})
