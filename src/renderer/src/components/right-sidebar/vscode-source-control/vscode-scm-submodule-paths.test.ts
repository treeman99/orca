import { describe, expect, it } from 'vitest'
import {
  resolveVscodeScmSubmoduleInnerPath,
  resolveVscodeScmSubmoduleInnerPaths
} from './vscode-scm-submodule-paths'

describe('resolveVscodeScmSubmoduleInnerPath', () => {
  it('passes an ordinary submodule-relative path through', () => {
    expect(resolveVscodeScmSubmoduleInnerPath('vendor/a', { path: 'src/client.ts' })).toBe(
      'src/client.ts'
    )
  })

  // These reach git as the argument to a write; a path that escapes the submodule would
  // land in the parent repository.
  it('refuses traversal, empty and dot segments on either side', () => {
    expect(resolveVscodeScmSubmoduleInnerPath('vendor/a', { path: '../escape.txt' })).toBeNull()
    expect(resolveVscodeScmSubmoduleInnerPath('vendor/a', { path: 'a/../../root.txt' })).toBeNull()
    expect(resolveVscodeScmSubmoduleInnerPath('vendor/a', { path: 'a//b.txt' })).toBeNull()
    expect(resolveVscodeScmSubmoduleInnerPath('vendor/a', { path: './a.txt' })).toBeNull()
    expect(resolveVscodeScmSubmoduleInnerPath('../outside', { path: 'a.txt' })).toBeNull()
    expect(resolveVscodeScmSubmoduleInnerPath('vendor/a', { path: '' })).toBeNull()
  })
})

describe('resolveVscodeScmSubmoduleInnerPaths', () => {
  it('resolves a whole selection', () => {
    expect(resolveVscodeScmSubmoduleInnerPaths('vendor/a', ['a.txt', 'src/b.ts'])).toEqual([
      'a.txt',
      'src/b.ts'
    ])
  })

  // All-or-nothing: staging the safe half of a batch would half-apply a rejected action.
  it('drops the whole batch when any path is untrustworthy', () => {
    expect(resolveVscodeScmSubmoduleInnerPaths('vendor/a', ['a.txt', '../escape'])).toBeNull()
  })
})
