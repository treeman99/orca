import { z } from 'zod'
import { GitSubmoduleStatus } from './git-params'

/**
 * A file inside a submodule. `submodulePath` reuses the GitSubmoduleStatus rules (non-empty,
 * never a leading `-`) so the arg-injection guard cannot drift between the two surfaces;
 * `area` is dropped because a discard has no area.
 */
export const GitSubmoduleFilePath = GitSubmoduleStatus.omit({ area: true }).extend({
  // Relative to the SUBMODULE root, not the parent worktree.
  filePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing file path'))
})

export const GitSubmodulePointer = GitSubmoduleStatus.omit({ area: true })

/** Files inside a submodule. Paths are relative to the SUBMODULE root. */
export const GitSubmodulePaths = GitSubmodulePointer.extend({
  filePaths: z.array(z.string().min(1, 'Missing file path')).max(2000)
})

export const GitSubmoduleCommit = GitSubmodulePointer.extend({
  message: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing commit message'))
})

export const GitSubmodulePush = GitSubmodulePointer.extend({
  publish: z.boolean().optional()
})
