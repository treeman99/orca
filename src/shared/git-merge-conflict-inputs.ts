import type { GitConflictOperation } from './git-status-types'

export type GitMergeConflictStage = {
  /** UTF-8 text; '' when isBinary or the result is tooLarge. */
  content: string
  /** Whether the stage is in the index (false for both_added's base). */
  exists: boolean
  isBinary: boolean
}

export type GitMergeConflictRefLabel = {
  shortOid: string
  /** `%D` split on ', ' with the 'HEAD -> ' prefix removed. */
  refNames: string[]
}

export type GitMergeConflictInputs = {
  /** Stage :1. */
  base: GitMergeConflictStage
  /** Stage :2 — the HEAD side ("Current"). */
  ours: GitMergeConflictStage
  /** Stage :3 — the MERGE_HEAD/REBASE_HEAD/CHERRY_PICK_HEAD side ("Incoming"). */
  theirs: GitMergeConflictStage
  operation: GitConflictOperation
  oursLabel?: GitMergeConflictRefLabel
  theirsLabel?: GitMergeConflictRefLabel
  /** The three contents exceeded the transport budget and were emptied; keep the text editor. */
  tooLarge?: boolean
}
