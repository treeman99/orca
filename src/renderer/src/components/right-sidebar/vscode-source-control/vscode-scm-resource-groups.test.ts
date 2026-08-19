import { describe, expect, it } from 'vitest'
import {
  buildVscodeScmResourceGroups,
  countVscodeScmChanges,
  getVisibleVscodeScmGroups,
  isMergeGroupEntry
} from './vscode-scm-resource-groups'
import type { GitStatusEntry } from '../../../../../shared/types'

function entry(partial: Partial<GitStatusEntry> & Pick<GitStatusEntry, 'path'>): GitStatusEntry {
  return { status: 'modified', area: 'unstaged', ...partial }
}

describe('buildVscodeScmResourceGroups', () => {
  it('routes entries into VS Code’s four groups in view order', () => {
    const groups = buildVscodeScmResourceGroups(
      [
        entry({ path: 'a.ts', area: 'staged' }),
        entry({ path: 'b.ts', area: 'unstaged' }),
        entry({ path: 'c.ts', area: 'untracked', status: 'untracked' }),
        entry({ path: 'd.ts', conflictKind: 'both_modified', conflictStatus: 'unresolved' })
      ],
      'separate'
    )
    expect(groups.map((group) => group.id)).toEqual(['merge', 'index', 'workingTree', 'untracked'])
    expect(groups[0].entries.map((e) => e.path)).toEqual(['d.ts'])
    expect(groups[1].entries.map((e) => e.path)).toEqual(['a.ts'])
    expect(groups[2].entries.map((e) => e.path)).toEqual(['b.ts'])
    expect(groups[3].entries.map((e) => e.path)).toEqual(['c.ts'])
  })

  it('folds untracked into Changes under the default mixed policy', () => {
    const groups = buildVscodeScmResourceGroups([
      entry({ path: 'b.ts', area: 'unstaged' }),
      entry({ path: 'a.ts', area: 'untracked', status: 'untracked' })
    ])
    const workingTree = groups.find((group) => group.id === 'workingTree')
    expect(workingTree?.entries.map((e) => e.path)).toEqual(['a.ts', 'b.ts'])
    expect(groups.find((group) => group.id === 'untracked')?.entries).toEqual([])
  })

  it('drops untracked entries entirely under the hidden policy', () => {
    const groups = buildVscodeScmResourceGroups(
      [entry({ path: 'a.ts', area: 'untracked', status: 'untracked' })],
      'hidden'
    )
    expect(countVscodeScmChanges(groups)).toBe(0)
  })

  it('keeps a conflict in the merge group even though git reports it unstaged', () => {
    const conflict = entry({
      path: 'x.ts',
      area: 'unstaged',
      conflictKind: 'both_deleted',
      conflictStatus: 'unresolved'
    })
    expect(isMergeGroupEntry(conflict)).toBe(true)
    const groups = buildVscodeScmResourceGroups([conflict])
    expect(groups.find((group) => group.id === 'workingTree')?.entries).toEqual([])
    expect(groups.find((group) => group.id === 'merge')?.entries).toHaveLength(1)
  })

  it('keeps a locally resolved conflict in the merge group', () => {
    const groups = buildVscodeScmResourceGroups([
      entry({ path: 'x.ts', conflictKind: 'both_modified', conflictStatus: 'resolved_locally' })
    ])
    expect(groups.find((group) => group.id === 'merge')?.entries).toHaveLength(1)
  })

  it('sorts each group by path', () => {
    const groups = buildVscodeScmResourceGroups([
      entry({ path: 'z/1.ts' }),
      entry({ path: 'a/2.ts' }),
      entry({ path: 'm/3.ts' })
    ])
    expect(groups.find((group) => group.id === 'workingTree')?.entries.map((e) => e.path)).toEqual([
      'a/2.ts',
      'm/3.ts',
      'z/1.ts'
    ])
  })
})

describe('getVisibleVscodeScmGroups', () => {
  it('hides only merge and untracked when empty', () => {
    const groups = buildVscodeScmResourceGroups([], 'separate')
    expect(getVisibleVscodeScmGroups(groups).map((group) => group.id)).toEqual([
      'index',
      'workingTree'
    ])
  })

  it('shows the merge group as soon as it holds a conflict', () => {
    const groups = buildVscodeScmResourceGroups([
      entry({ path: 'x.ts', conflictKind: 'both_added', conflictStatus: 'unresolved' })
    ])
    expect(getVisibleVscodeScmGroups(groups).map((group) => group.id)).toContain('merge')
  })
})
