import { describe, expect, it } from 'vitest'
import {
  limitDetectedSubmodules,
  MAX_DETECTED_SUBMODULES,
  parseSubmoduleConfigOutput
} from './git-submodule-list'

describe('parseSubmoduleConfigOutput', () => {
  it('reads the name and the path from each key', () => {
    expect(parseSubmoduleConfigOutput('submodule.vendor/sub.path vendor/sub')).toEqual([
      { name: 'vendor/sub', path: 'vendor/sub' }
    ])
  })

  it('keeps a name that contains dots', () => {
    expect(parseSubmoduleConfigOutput('submodule.vendor/lib.js.path vendor/lib.js')).toEqual([
      { name: 'vendor/lib.js', path: 'vendor/lib.js' }
    ])
  })

  it('normalizes trailing slashes and backslashes so a path is one stable UI key', () => {
    expect(parseSubmoduleConfigOutput('submodule.a.path vendor\\a//')).toEqual([
      { name: 'a', path: 'vendor/a' }
    ])
  })

  it('drops malformed lines and duplicate paths', () => {
    const output = [
      'submodule.a.path vendor/a',
      'submodule.b.url https://example.invalid/b',
      'garbage',
      'submodule.a-again.path vendor/a'
    ].join('\n')

    expect(parseSubmoduleConfigOutput(output)).toEqual([{ name: 'a', path: 'vendor/a' }])
  })

  it('returns nothing for an empty .gitmodules', () => {
    expect(parseSubmoduleConfigOutput('')).toEqual([])
  })
})

describe('limitDetectedSubmodules', () => {
  it('passes a list at the cap through unflagged', () => {
    const entries = Array.from({ length: MAX_DETECTED_SUBMODULES }, (_, i) => i)

    expect(limitDetectedSubmodules(entries)).toEqual({ entries, didHitLimit: false })
  })

  it('truncates and flags past the cap', () => {
    const entries = Array.from({ length: MAX_DETECTED_SUBMODULES + 1 }, (_, i) => i)

    const result = limitDetectedSubmodules(entries)

    expect(result.didHitLimit).toBe(true)
    expect(result.entries).toHaveLength(MAX_DETECTED_SUBMODULES)
  })
})
