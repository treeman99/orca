import { isBinaryBuffer } from '../../../shared/binary-buffer'
import type {
  GitMergeConflictInputs,
  GitMergeConflictRefLabel,
  GitMergeConflictStage
} from '../../../shared/git-merge-conflict-inputs'
import type { GitConflictOperation } from '../../../shared/git-status-types'
import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitReadOptionsForWorktree } from '../git-runtime-options'
import { isMaxBufferOverflowError } from '../max-buffer-overflow'
import { gitExecFileAsync, gitExecFileAsyncBuffer } from '../runner'
import { detectConflictOperation } from './git-conflict-operation'
import { literalPathspec } from './git-pathspec'
import { MAX_GIT_SHOW_BYTES } from './git-show-max-bytes'

type IndexStageEntry = { mode: string; oid: string }

const GITLINK_MODE = '160000'

const INCOMING_REF_BY_OPERATION: Record<GitConflictOperation, string | null> = {
  merge: 'MERGE_HEAD',
  rebase: 'REBASE_HEAD',
  'cherry-pick': 'CHERRY_PICK_HEAD',
  unknown: null
}

/** Index stages :1/:2/:3 of a conflicted path plus the commits on each side. */
export async function readMergeConflictInputs(
  worktreePath: string,
  filePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitMergeConflictInputs> {
  // Why: Git prints index paths with forward slashes even on Windows.
  const gitPath = filePath.replace(/\\/g, '/')
  const [stages, sides] = await Promise.all([
    readConflictStages(worktreePath, gitPath, options),
    readConflictSides(worktreePath, options)
  ])
  return { ...stages, ...sides }
}

async function readConflictStages(
  worktreePath: string,
  gitPath: string,
  options: GitRuntimeOptions
): Promise<Pick<GitMergeConflictInputs, 'base' | 'ours' | 'theirs'>> {
  const entries = await readUnmergedIndexEntries(worktreePath, gitPath, options)
  const [base, ours, theirs] = await Promise.all(
    ['1', '2', '3'].map((stage) => readStageBlob(worktreePath, entries.get(stage), options))
  )
  return { base, ours, theirs }
}

// Why ls-files: its machine output says which stages exist, so absence never hangs on Git's
// translatable "not at stage N" diagnostic, and any failed read means failure, not absence.
async function readUnmergedIndexEntries(
  worktreePath: string,
  gitPath: string,
  options: GitRuntimeOptions
): Promise<Map<string, IndexStageEntry>> {
  const { stdout } = await gitExecFileAsync(
    ['ls-files', '-u', '-z', '--', literalPathspec(gitPath, worktreePath, options)],
    gitReadOptionsForWorktree(worktreePath, options)
  )
  const entries = new Map<string, IndexStageEntry>()
  for (const record of stdout.split('\0')) {
    const tab = record.indexOf('\t')
    // Why the exact path check: a pathspec naming a directory also matches every file under it.
    if (tab === -1 || record.slice(tab + 1) !== gitPath) {
      continue
    }
    const [mode = '', oid = '', stage = ''] = record.slice(0, tab).split(' ')
    entries.set(stage, { mode, oid })
  }
  return entries
}

async function readStageBlob(
  worktreePath: string,
  entry: IndexStageEntry | undefined,
  options: GitRuntimeOptions
): Promise<GitMergeConflictStage> {
  if (!entry) {
    return { content: '', exists: false, isBinary: false }
  }
  // Why: a submodule conflict stages commit ids, which have no text to merge.
  if (entry.mode === GITLINK_MODE) {
    return { content: '', exists: true, isBinary: true }
  }
  try {
    const { stdout } = await gitExecFileAsyncBuffer(['cat-file', 'blob', entry.oid], {
      ...gitReadOptionsForWorktree(worktreePath, options),
      maxBuffer: MAX_GIT_SHOW_BYTES
    })
    return isBinaryBuffer(stdout)
      ? { content: '', exists: true, isBinary: true }
      : { content: stdout.toString('utf-8'), exists: true, isBinary: false }
  } catch (error) {
    if (isMaxBufferOverflowError(error)) {
      return { content: '', exists: true, isBinary: true }
    }
    throw error
  }
}

async function readConflictSides(
  worktreePath: string,
  options: GitRuntimeOptions
): Promise<Pick<GitMergeConflictInputs, 'operation' | 'oursLabel' | 'theirsLabel'>> {
  const operation = await detectConflictOperation(worktreePath, options)
  const incomingRef = INCOMING_REF_BY_OPERATION[operation]
  const [oursLabel, theirsLabel] = await Promise.all([
    readRefLabel(worktreePath, 'HEAD', options),
    incomingRef ? readRefLabel(worktreePath, incomingRef, options) : undefined
  ])
  return {
    operation,
    ...(oursLabel ? { oursLabel } : {}),
    ...(theirsLabel ? { theirsLabel } : {})
  }
}

// Why swallow: labels only decorate the input headers, so a failed read must not block the merge.
async function readRefLabel(
  worktreePath: string,
  ref: string,
  options: GitRuntimeOptions
): Promise<GitMergeConflictRefLabel | undefined> {
  try {
    const { stdout } = await gitExecFileAsync(
      ['log', '-1', '--no-show-signature', '--no-color', '--format=%h%x00%D', ref, '--'],
      gitReadOptionsForWorktree(worktreePath, options)
    )
    return parseRefLabel(stdout)
  } catch {
    return undefined
  }
}

function parseRefLabel(stdout: string): GitMergeConflictRefLabel | undefined {
  const [shortOid = '', decorations = ''] = stdout.trim().split('\0')
  if (!shortOid) {
    return undefined
  }
  const refNames = decorations
    .split(', ')
    .map((name) => name.replace(/^HEAD -> /, '').trim())
    // Why drop a bare HEAD: a detached HEAD (every rebase step) decorates as just "HEAD".
    .filter((name) => name !== '' && name !== 'HEAD')
  return { shortOid, refNames }
}
