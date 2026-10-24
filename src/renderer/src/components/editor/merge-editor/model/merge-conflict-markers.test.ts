import { describe, expect, it } from 'vitest'
import {
  computeAutoMergedResult,
  createMergeDocument,
  hasConflictMarkers,
  reconstructInputsFromMarkers,
  resultWithConflictMarkers
} from './merge-editor-model'

const lf = (...lines: string[]): string => lines.map((line) => `${line}\n`).join('')

describe('resultWithConflictMarkers', () => {
  // b: input1 only (handled), d: a true conflict, f: another true conflict.
  const doc = createMergeDocument({
    base: lf('a', 'b', 'c', 'd', 'e', 'f', 'g'),
    input1: lf('a', 'B', 'c', 'D1', 'e', 'F1', 'g'),
    input2: lf('a', 'b', 'c', 'D2', 'e', 'F2', 'g'),
    eol: '\n'
  })
  const auto = computeAutoMergedResult(doc)

  it('wraps only the unhandled ranges, input1 first, with the given labels', () => {
    expect(
      resultWithConflictMarkers(doc, auto, [1], { input1: 'Incoming', input2: 'Current' })
    ).toBe(
      lf('a', 'B', 'c', '<<<<<<< Incoming', 'D1', '=======', 'D2', '>>>>>>> Current', 'e', 'f', 'g')
    )
  })

  it('keeps a hand-merged range as the first side and writes bare markers without labels', () => {
    const handMerged = auto.replace('f\n', 'F1 and F2\n')
    expect(resultWithConflictMarkers(doc, handMerged, [1, 2])).toBe(
      lf(
        'a',
        'B',
        'c',
        '<<<<<<<',
        'D1',
        '=======',
        'D2',
        '>>>>>>>',
        'e',
        '<<<<<<<',
        'F1 and F2',
        '=======',
        'F2',
        '>>>>>>>',
        'g'
      )
    )
  })

  it('writes input2 first when asked, so a merge restores the git order (Current first)', () => {
    expect(
      resultWithConflictMarkers(doc, auto, [1], { input1: 'feature', input2: 'HEAD' }, 2)
    ).toBe(
      lf('a', 'B', 'c', '<<<<<<< HEAD', 'D2', '=======', 'D1', '>>>>>>> feature', 'e', 'f', 'g')
    )
  })

  it('keeps a hand-merged range in the first block when input2 goes first', () => {
    const handMerged = auto.replace('f\n', 'F1 and F2\n')
    expect(resultWithConflictMarkers(doc, handMerged, [2], undefined, 2)).toBe(
      lf('a', 'B', 'c', 'd', 'e', '<<<<<<<', 'F1 and F2', '=======', 'F1', '>>>>>>>', 'g')
    )
  })

  it('round-trips through reconstructInputsFromMarkers with Current as the first block', () => {
    const marked = resultWithConflictMarkers(doc, auto, [1, 2], undefined, 2)
    expect(reconstructInputsFromMarkers(marked)).toMatchObject({
      input1: lf('a', 'B', 'c', 'D2', 'e', 'F2', 'g'),
      input2: lf('a', 'B', 'c', 'D1', 'e', 'F1', 'g')
    })
  })

  it('writes the markers with the document EOL', () => {
    const crlf = createMergeDocument({
      base: 'a\r\nb\r\n',
      input1: 'a\r\nB1\r\n',
      input2: 'a\r\nB2\r\n',
      eol: '\r\n'
    })
    expect(resultWithConflictMarkers(crlf, computeAutoMergedResult(crlf), [0])).toBe(
      'a\r\n<<<<<<<\r\nB1\r\n=======\r\nB2\r\n>>>>>>>\r\n'
    )
  })
})

describe('hasConflictMarkers', () => {
  it.each([
    ['a\n<<<<<<< HEAD\nb\n', true],
    ['<<<<<<<\r\nb', true],
    ['a <<<<<<< HEAD\n', false],
    ['=======\n>>>>>>> theirs\n', false]
  ])('%j -> %s', (text, expected) => {
    expect(hasConflictMarkers(text)).toBe(expected)
  })
})

describe('reconstructInputsFromMarkers', () => {
  it('splits a two-way conflict into both sides and a base with the blocks emptied', () => {
    const text = lf(
      'top',
      '<<<<<<< HEAD',
      'ours 1',
      '=======',
      'theirs 1',
      'theirs 2',
      '>>>>>>> feature',
      'middle',
      '<<<<<<< HEAD',
      '=======',
      'theirs only',
      '>>>>>>> feature',
      'bottom'
    )
    expect(reconstructInputsFromMarkers(text)).toEqual({
      base: lf('top', 'middle', 'bottom'),
      input1: lf('top', 'ours 1', 'middle', 'bottom'),
      input2: lf('top', 'theirs 1', 'theirs 2', 'middle', 'theirs only', 'bottom'),
      hasBase: false
    })
  })

  it('takes the base from diff3 sections and keeps CRLF and a missing final newline', () => {
    const text = [
      'top',
      '<<<<<<< HEAD',
      'ours',
      '||||||| merged common ancestors',
      'original',
      '=======',
      'theirs',
      '>>>>>>> feature',
      'bottom'
    ].join('\r\n')
    expect(reconstructInputsFromMarkers(text)).toEqual({
      base: 'top\r\noriginal\r\nbottom',
      input1: 'top\r\nours\r\nbottom',
      input2: 'top\r\ntheirs\r\nbottom',
      hasBase: true
    })
  })

  it.each([
    ['no markers', lf('a', '=======', 'b')],
    ['an unterminated block', lf('<<<<<<< HEAD', 'a', '=======', 'b')],
    ['a block closed before its separator', lf('<<<<<<< HEAD', 'a', '>>>>>>> x')]
  ])('returns null for %s', (_name, text) => {
    expect(reconstructInputsFromMarkers(text)).toBeNull()
  })
})
