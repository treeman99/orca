import { describe, expect, it } from 'vitest'
import { buildMergeEditorSession, type MergeEditorSession } from './merge-editor-session'
import { initialMergeViewState, textEditorContentOnLeave } from './merge-editor-result-state'
import { countUnhandledRanges, reduceMergeHandledState } from './model/merge-handled-state'

const lf = (...lines: string[]): string => lines.map((line) => `${line}\n`).join('')

// b: changed only on our side (auto-merged), d: a true conflict.
const BASE = lf('a', 'b', 'c', 'd', 'e')
const OURS = lf('a', 'B', 'c', 'D-ours', 'e')
const THEIRS = lf('a', 'b', 'c', 'D-theirs', 'e')
const MARKED = lf(
  'a',
  'B',
  'c',
  '<<<<<<< HEAD',
  'D-ours',
  '=======',
  'D-theirs',
  '>>>>>>> feature',
  'e'
)

function mergeSession(operation: 'merge' | 'rebase' = 'merge'): MergeEditorSession {
  const result = buildMergeEditorSession(
    {
      base: { content: BASE, exists: true, isBinary: false },
      ours: { content: OURS, exists: true, isBinary: false },
      theirs: { content: THEIRS, exists: true, isBinary: false },
      operation,
      oursLabel: { shortOid: '1111111', refNames: ['main'] },
      theirsLabel: { shortOid: '2222222', refNames: ['feature'] }
    },
    MARKED,
    'merge'
  )
  if (result.kind !== 'ready') {
    throw new Error('expected a session')
  }
  return result.session
}

describe('initialMergeViewState', () => {
  it('recomputes a marked buffer: one-sided changes taken, the conflict left at base', () => {
    const { result, handled } = initialMergeViewState(mergeSession(), MARKED)
    expect(result).toBe(lf('a', 'B', 'c', 'd', 'e'))
    expect(countUnhandledRanges(handled)).toBe(1)
  })

  it('keeps a buffer without markers as the result and reads its states back', () => {
    const resolved = lf('a', 'B', 'c', 'D-theirs', 'e')
    const { result, handled } = initialMergeViewState(mergeSession(), resolved)
    expect(result).toBe(resolved)
    expect(countUnhandledRanges(handled)).toBe(0)
  })
})

describe('textEditorContentOnLeave', () => {
  it('puts the unhandled conflict back as markers, Current first, named by its refs', () => {
    const session = mergeSession()
    const { result, handled } = initialMergeViewState(session, MARKED)
    expect(textEditorContentOnLeave(session, result, handled)).toBe(
      lf('a', 'B', 'c', '<<<<<<< main', 'D-ours', '=======', 'D-theirs', '>>>>>>> feature', 'e')
    )
  })

  it('writes Current first during a rebase too, where Current is the left input', () => {
    const session = mergeSession('rebase')
    const { result, handled } = initialMergeViewState(session, MARKED)
    expect(textEditorContentOnLeave(session, result, handled)).toContain(
      lf('<<<<<<< main', 'D-ours', '=======', 'D-theirs', '>>>>>>> feature')
    )
  })

  it('leaves the result untouched once every range is handled', () => {
    const session = mergeSession()
    const { result, handled } = initialMergeViewState(session, MARKED)
    const conflictId = session.doc.ranges.findIndex((range) => range.isConflicting)
    const ignoredBoth = reduceMergeHandledState(
      reduceMergeHandledState(handled, { kind: 'ignore', rangeId: conflictId, input: 1 }),
      { kind: 'ignore', rangeId: conflictId, input: 2 }
    )
    expect(textEditorContentOnLeave(session, result, ignoredBoth)).toBe(result)
  })
})
