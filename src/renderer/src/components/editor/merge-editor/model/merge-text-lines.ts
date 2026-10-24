import type { InputNumber, LineRange, MergeEol, MergeLines } from './merge-editor-types'

const LINE_BREAK = /\r\n|\r|\n/

// Why: a trailing line break leaves a final empty line, so joining restores it exactly.
export function splitLines(text: string): string[] {
  return text.split(LINE_BREAK)
}

export function joinLines(lines: readonly string[], eol: MergeEol): string {
  return lines.join(eol)
}

export function sliceLines(lines: readonly string[], range: LineRange): string[] {
  return lines.slice(range.start - 1, range.endExclusive - 1)
}

export function linesEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index])
}

export function inputLines(lines: MergeLines, input: InputNumber): string[] {
  return input === 1 ? lines.input1Lines : lines.input2Lines
}

export function detectEol(text: string): MergeEol {
  let crlf = 0
  let lf = 0
  for (const match of text.matchAll(/\r?\n/g)) {
    if (match[0].length === 2) {
      crlf += 1
    } else {
      lf += 1
    }
  }
  return crlf > lf ? '\r\n' : '\n'
}
