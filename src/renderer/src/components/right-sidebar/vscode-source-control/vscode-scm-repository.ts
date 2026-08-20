import { basename } from '@/lib/path'
import {
  getSubmoduleBranchLabel,
  type SubmoduleBranchLabel
} from '../source-control-submodule-branch'
import { isSubmoduleGitlinkRow } from '../source-control-submodule-gitlink-row'
import type {
  GitConflictOperation,
  GitStatusEntry,
  GitUpstreamStatus
} from '../../../../../shared/git-status-types'
import type { GitSubmoduleSummary } from '../../../../../shared/git-submodule-list'

/** The parent worktree's own repository section. Fixed so it always sorts first. */
export const VSCODE_SCM_PARENT_REPOSITORY_ID = '<parent>'

export type VscodeScmRepositoryStatus =
  | { kind: 'loaded' }
  | { kind: 'loading' }
  /** Submodule directory exists but holds no checkout — a normal, quiet state. */
  | { kind: 'uninitialized' }
  | { kind: 'failed'; message: string }

/**
 * One collapsible Source Control section. The parent worktree is always the
 * first; every initialized submodule is its own repository, exactly as VS Code's
 * Git extension opens `.gitmodules` entries as independent Repositories.
 *
 * `entries` are RAW: a submodule's rows are relative to the submodule root and
 * carry no `submoduleRoot`, because inside its own section a row is a first-class
 * resource of that repository — and that relative path is what the submodule's
 * own git will be handed once mutations are wired.
 */
export type VscodeScmRepository = {
  id: string
  role: 'parent' | 'submodule'
  /** Folder name shown in the section header. */
  name: string
  /** Full path shown as the header's tooltip. */
  title: string
  /** Parent-relative submodule path; null for the parent worktree. */
  submodulePath: string | null
  branch: SubmoduleBranchLabel | null
  upstreamStatus: GitUpstreamStatus | null
  conflictOperation: GitConflictOperation | null
  entries: readonly GitStatusEntry[]
  /** Status listing was capped, so the section is showing a partial list. */
  truncated: boolean
  /** `.gitmodules` declares more submodules than the detection cap; some have no section. */
  detectionTruncated: boolean
  status: VscodeScmRepositoryStatus
}

/** Minimal shape of a submodule's own `git status`, as the panel keeps it. */
export type VscodeScmSubmoduleStatusState =
  | { status: 'loading' }
  | {
      status: 'loaded'
      entries: GitStatusEntry[]
      branch?: string
      head?: string
      upstreamStatus?: GitUpstreamStatus
      conflictOperation?: GitConflictOperation
      didHitLimit?: boolean
    }
  | { status: 'error'; error: string; uninitialized: boolean }

/**
 * The submodules that get their own section: every INITIALIZED `.gitmodules` entry,
 * dirty or not, matching VS Code's `git.detectSubmodules`. A clean submodule still
 * earns a section — that is the only place its branch is ever shown.
 *
 * Uninitialized entries are dropped rather than rendered as failures: they have no
 * checkout, so there is no status to read and nothing the user can act on here.
 *
 * The traversal check is defence in depth. `.gitmodules` is repo-controlled content, and
 * these paths are handed to git as the working directory for a write; the host refuses an
 * escaping path too, but a path that cannot be trusted should never reach a mutation call.
 */
export function selectDetectedSubmodulePaths(submodules: readonly GitSubmoduleSummary[]): string[] {
  const paths = new Set<string>()
  for (const submodule of submodules) {
    if (submodule.initialized && submodule.path && !hasUnsafeSubmodulePathSegment(submodule.path)) {
      paths.add(submodule.path)
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b))
}

/**
 * Fallback enumeration for a host that has no `git.submoduleList`: the submodules the
 * parent's own status already flagged as dirty, deduplicated (one submodule can carry both
 * a staged and an unstaged gitlink row).
 *
 * Why keep it: without `git.submoduleList` the panel cannot see a CLEAN submodule, but it
 * can still see the dirty ones — and showing those read-only beats showing nothing, which
 * would read as "this repository has no submodules".
 *
 * `submoduleRoot` rows are excluded: those live INSIDE some submodule and are never a
 * repository of their own from the parent's point of view.
 */
export function collectDirtySubmodulePaths(entries: readonly GitStatusEntry[]): string[] {
  const paths = new Set<string>()
  for (const entry of entries) {
    if (
      isSubmoduleGitlinkRow(entry) &&
      !entry.submoduleRoot &&
      !hasUnsafeSubmodulePathSegment(entry.path)
    ) {
      paths.add(entry.path)
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b))
}

function hasUnsafeSubmodulePathSegment(submodulePath: string): boolean {
  return submodulePath
    .split('/')
    .some((segment) => segment === '' || segment === '.' || segment === '..')
}

export function buildVscodeScmParentRepository(input: {
  worktreePath: string | null
  branch: string | null
  entries: readonly GitStatusEntry[]
  upstreamStatus: GitUpstreamStatus | null
  conflictOperation: GitConflictOperation | null
  truncated: boolean
  /** Set when the submodule scan hit its cap; the notice belongs on the parent section. */
  detectionTruncated?: boolean
}): VscodeScmRepository {
  const worktreePath = input.worktreePath ?? ''
  return {
    id: VSCODE_SCM_PARENT_REPOSITORY_ID,
    role: 'parent',
    name: basename(worktreePath) || worktreePath,
    title: worktreePath,
    submodulePath: null,
    branch: input.branch ? { name: input.branch, detached: false, differsFromParent: false } : null,
    upstreamStatus: input.upstreamStatus,
    conflictOperation: input.conflictOperation,
    entries: input.entries,
    truncated: input.truncated,
    detectionTruncated: input.detectionTruncated === true,
    status: { kind: 'loaded' }
  }
}

function toRepositoryStatus(state: VscodeScmSubmoduleStatusState | undefined): {
  status: VscodeScmRepositoryStatus
  entries: readonly GitStatusEntry[]
  truncated: boolean
} {
  if (!state || state.status === 'loading') {
    return { status: { kind: 'loading' }, entries: [], truncated: false }
  }
  if (state.status === 'error') {
    return {
      status: state.uninitialized
        ? { kind: 'uninitialized' }
        : { kind: 'failed', message: state.error },
      entries: [],
      truncated: false
    }
  }
  return {
    status: { kind: 'loaded' },
    entries: state.entries,
    truncated: state.didHitLimit === true
  }
}

export function buildVscodeScmSubmoduleRepositories(input: {
  submodulePaths: readonly string[]
  statusByPath: Readonly<Record<string, VscodeScmSubmoduleStatusState>>
  parentBranch: string | null
}): VscodeScmRepository[] {
  return input.submodulePaths.map((submodulePath) => {
    const state = input.statusByPath[submodulePath]
    const resolved = toRepositoryStatus(state)
    const loaded = state?.status === 'loaded' ? state : null
    return {
      id: submodulePath,
      role: 'submodule',
      name: basename(submodulePath) || submodulePath,
      title: submodulePath,
      submodulePath,
      branch: getSubmoduleBranchLabel(state, input.parentBranch ?? undefined),
      upstreamStatus: loaded?.upstreamStatus ?? null,
      conflictOperation: loaded?.conflictOperation ?? null,
      detectionTruncated: false,
      ...resolved
    }
  })
}
