import type {
  GitMergeConflictInputs,
  GitMergeConflictRefLabel
} from '../../../../../shared/git-merge-conflict-inputs'
import type { GitConflictOperation } from '../../../../../shared/git-status-types'
import {
  createMergeDocument,
  detectEol,
  reconstructInputsFromMarkers,
  type InputNumber,
  type MergeDocument
} from './model/merge-editor-model'

export type MergeSide = 'ours' | 'theirs'

export type MergeInputSource = { side: MergeSide; label?: GitMergeConflictRefLabel }

export type MergeEditorSession = {
  doc: MergeDocument
  /** input1, input2 — merge and cherry-pick put Incoming first, rebase puts Current first (O2). */
  inputs: readonly [MergeInputSource, MergeInputSource]
  /** The input holding ours; restored markers write it first, as git does. */
  currentInput: InputNumber
  /** Set when the inputs were rebuilt from the working file's markers (D5). */
  fromMarkers?: { hasBase: boolean }
}

export type MergeSessionUnavailableReason = 'binary' | 'too-large' | 'missing-side' | 'no-markers'

export type MergeSessionResult =
  | { kind: 'ready'; session: MergeEditorSession }
  | { kind: 'unavailable'; reason: MergeSessionUnavailableReason }

function layoutSides(
  operation: GitConflictOperation,
  ours: { text: string; source: MergeInputSource },
  theirs: { text: string; source: MergeInputSource },
  base: string,
  eol: MergeDocument['eol']
): Omit<MergeEditorSession, 'fromMarkers'> {
  const [first, second] = operation === 'rebase' ? [ours, theirs] : [theirs, ours]
  return {
    doc: createMergeDocument({ base, input1: first.text, input2: second.text, eol }),
    inputs: [first.source, second.source],
    currentInput: operation === 'rebase' ? 1 : 2
  }
}

/**
 * The merge view's inputs: the index stages when the host read them, else the working file's
 * markers (`inputs === null`, an older host). Binary, oversized and one-sided conflicts stay in
 * the text editor (D7).
 */
export function buildMergeEditorSession(
  inputs: GitMergeConflictInputs | null,
  workingText: string,
  fallbackOperation: GitConflictOperation
): MergeSessionResult {
  const eol = detectEol(workingText)
  if (inputs === null) {
    const rebuilt = reconstructInputsFromMarkers(workingText)
    if (!rebuilt) {
      return { kind: 'unavailable', reason: 'no-markers' }
    }
    // Why: git writes HEAD's side first, so the rebuilt input1 is always ours.
    const session = layoutSides(
      fallbackOperation,
      { text: rebuilt.input1, source: { side: 'ours' } },
      { text: rebuilt.input2, source: { side: 'theirs' } },
      rebuilt.base,
      eol
    )
    return { kind: 'ready', session: { ...session, fromMarkers: { hasBase: rebuilt.hasBase } } }
  }
  if (inputs.tooLarge) {
    return { kind: 'unavailable', reason: 'too-large' }
  }
  if (inputs.base.isBinary || inputs.ours.isBinary || inputs.theirs.isBinary) {
    return { kind: 'unavailable', reason: 'binary' }
  }
  if (!inputs.ours.exists || !inputs.theirs.exists) {
    return { kind: 'unavailable', reason: 'missing-side' }
  }
  return {
    kind: 'ready',
    session: layoutSides(
      inputs.operation,
      { text: inputs.ours.content, source: { side: 'ours', label: inputs.oursLabel } },
      { text: inputs.theirs.content, source: { side: 'theirs', label: inputs.theirsLabel } },
      // Why: both_added has no common ancestor stage; an empty base makes every line an addition.
      inputs.base.exists ? inputs.base.content : '',
      eol
    )
  }
}

export function inputSource(session: MergeEditorSession, input: InputNumber): MergeInputSource {
  return session.inputs[input - 1]
}
