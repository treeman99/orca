import { describe, expect, it } from 'vitest'
import { groupSubmoduleChildEntries } from './source-control-submodule-child-groups'
import type { GitStatusEntry } from '../../../../shared/git-status-types'

function entry(path: string, area: GitStatusEntry['area']): GitStatusEntry {
  return { path, status: 'modified', area }
}

describe('groupSubmoduleChildEntries', () => {
  it('orders groups the way the submodule repository would show them', () => {
    const groups = groupSubmoduleChildEntries([
      entry('c.txt', 'untracked'),
      entry('a.txt', 'unstaged'),
      entry('b.txt', 'staged')
    ])

    expect(groups.map((group) => group.area)).toEqual(['staged', 'unstaged', 'untracked'])
    expect(groups.map((group) => group.entries.map((item) => item.path))).toEqual([
      ['b.txt'],
      ['a.txt'],
      ['c.txt']
    ])
  })

  it('emits no group for an area with nothing in it', () => {
    expect(groupSubmoduleChildEntries([entry('a.txt', 'unstaged')]).map((g) => g.area)).toEqual([
      'unstaged'
    ])
  })

  it('preserves the order within a group', () => {
    const groups = groupSubmoduleChildEntries([
      entry('b.txt', 'unstaged'),
      entry('a.txt', 'unstaged')
    ])

    expect(groups[0]?.entries.map((item) => item.path)).toEqual(['b.txt', 'a.txt'])
  })

  // An older relay still sends these; the label that used to explain them is gone, so
  // rendering them would leave unexplained rows in a list that claims to be `git status`.
  it('drops commit-range rows an older relay may still send', () => {
    const range: GitStatusEntry = { ...entry('a.txt', 'unstaged'), submoduleCommitRange: true }

    expect(groupSubmoduleChildEntries([range, entry('b.txt', 'unstaged')])).toEqual([
      { area: 'unstaged', entries: [entry('b.txt', 'unstaged')] }
    ])
  })

  it('returns nothing when every row was a commit-range row', () => {
    const range: GitStatusEntry = { ...entry('a.txt', 'unstaged'), submoduleCommitRange: true }

    expect(groupSubmoduleChildEntries([range])).toEqual([])
  })

  it('returns nothing for an empty status', () => {
    expect(groupSubmoduleChildEntries([])).toEqual([])
  })
})
