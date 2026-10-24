import { describe, expect, it } from 'vitest'
import type {
  GitMergeConflictInputs,
  GitMergeConflictStage
} from '../../../../../shared/git-merge-conflict-inputs'
import { buildMergeEditorSession } from './merge-editor-session'

const lf = (...lines: string[]): string => lines.map((line) => `${line}\n`).join('')

function stage(content: string, overrides: Partial<GitMergeConflictStage> = {}) {
  return { content, exists: true, isBinary: false, ...overrides }
}

function inputs(overrides: Partial<GitMergeConflictInputs> = {}): GitMergeConflictInputs {
  return {
    base: stage(lf('a', 'b', 'c')),
    ours: stage(lf('a', 'OURS', 'c')),
    theirs: stage(lf('a', 'THEIRS', 'c')),
    operation: 'merge',
    oursLabel: { shortOid: '1111111', refNames: ['main'] },
    theirsLabel: { shortOid: '2222222', refNames: ['feature'] },
    ...overrides
  }
}

function ready(result: ReturnType<typeof buildMergeEditorSession>) {
  if (result.kind !== 'ready') {
    throw new Error(`expected a session, got ${result.reason}`)
  }
  return result.session
}

describe('buildMergeEditorSession', () => {
  it('puts Incoming left and Current right during a merge', () => {
    const session = ready(buildMergeEditorSession(inputs(), lf('a', 'x', 'c'), 'merge'))
    expect(session.doc.input1Lines).toContain('THEIRS')
    expect(session.doc.input2Lines).toContain('OURS')
    expect(session.inputs.map((source) => source.label?.refNames[0])).toEqual(['feature', 'main'])
    expect(session.currentInput).toBe(2)
    expect(session.fromMarkers).toBeUndefined()
  })

  it('puts Current left during a rebase', () => {
    const session = ready(
      buildMergeEditorSession(inputs({ operation: 'rebase' }), lf('a', 'x', 'c'), 'merge')
    )
    expect(session.doc.input1Lines).toContain('OURS')
    expect(session.currentInput).toBe(1)
  })

  it('reads both_added against an empty base', () => {
    const session = ready(
      buildMergeEditorSession(
        inputs({ base: stage('', { exists: false }) }),
        lf('a', 'x', 'c'),
        'merge'
      )
    )
    expect(session.doc.baseLines).toEqual([''])
    expect(session.doc.ranges.some((range) => range.isConflicting)).toBe(true)
  })

  it('rebuilds the inputs from the markers when the host could not read the stages', () => {
    const working = lf('top', '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> feature', 'end')
    const session = ready(buildMergeEditorSession(null, working, 'merge'))
    expect(session.fromMarkers).toEqual({ hasBase: false })
    expect(session.doc.input1Lines).toEqual(['top', 'theirs', 'end', ''])
    expect(session.doc.input2Lines).toEqual(['top', 'ours', 'end', ''])
    expect(session.inputs.map((source) => source.side)).toEqual(['theirs', 'ours'])
  })

  it.each([
    ['binary', inputs({ ours: stage('', { isBinary: true }) }), 'binary'],
    ['too large', inputs({ tooLarge: true }), 'too-large'],
    ['deleted on one side', inputs({ theirs: stage('', { exists: false }) }), 'missing-side'],
    ['unreadable with no markers to rebuild from', null, 'no-markers']
  ] as const)('leaves a %s conflict to the text editor', (_name, read, reason) => {
    expect(buildMergeEditorSession(read, lf('plain'), 'merge')).toEqual({
      kind: 'unavailable',
      reason
    })
  })
})
