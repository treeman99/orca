import { ipcMain } from 'electron'
import {
  discardSubmoduleChanges,
  resolveSubmoduleWorktreePath,
  restoreSubmodulePointer
} from '../../git/status'
import {
  commitSubmoduleChanges,
  listSubmodules,
  pullSubmodule,
  pushSubmodule,
  stageSubmoduleFiles,
  unstageSubmoduleFiles
} from '../../git/submodule-write-ops'
import {
  getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE
} from '../../providers/ssh-git-dispatch'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import { validateGitRelativeFilePath } from '../filesystem-path-containment'
import {
  resolveSubmoduleStagingIpcTarget,
  type SubmodulePathsIpcArgs
} from '../submodule-staging-ipc-target'
import type { GitSubmoduleListResult } from '../../../shared/git-submodule-list'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

export function registerFilesystemGitSubmoduleHandlers(context: FilesystemHandlerContext): void {
  const { store } = context

  ipcMain.handle(
    'git:submoduleDiscard',
    async (
      _event,
      args: {
        worktreePath: string
        submodulePath: string
        filePath: string
        connectionId?: string
      }
    ): Promise<void> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.discardSubmoduleChanges(
          args.worktreePath,
          args.submodulePath,
          args.filePath
        )
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      // Why validate against the SUBMODULE root: `filePath` is relative to it, so checking it
      // against the parent would accept a name that escapes the submodule.
      const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, args.submodulePath)
      const filePath = validateGitRelativeFilePath(submoduleWorktreePath, args.filePath)
      await discardSubmoduleChanges(worktreePath, args.submodulePath, filePath, gitOptions)
    }
  )

  // Why a dedicated list: the panel treats each submodule as its own repository, so it
  // needs the inventory (and which entries are initialized) before it can poll statuses.
  ipcMain.handle(
    'git:submoduleList',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string }
    ): Promise<GitSubmoduleListResult> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.listSubmodules(args.worktreePath)
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return listSubmodules(worktreePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:submoduleStage',
    async (_event, args: SubmodulePathsIpcArgs): Promise<void> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.stageSubmoduleFiles(args.worktreePath, args.submodulePath, args.filePaths)
      }
      const resolved = await resolveSubmoduleStagingIpcTarget(args, store)
      await stageSubmoduleFiles(
        resolved.worktreePath,
        args.submodulePath,
        resolved.filePaths,
        resolved.gitOptions
      )
    }
  )

  ipcMain.handle(
    'git:submoduleUnstage',
    async (_event, args: SubmodulePathsIpcArgs): Promise<void> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.unstageSubmoduleFiles(args.worktreePath, args.submodulePath, args.filePaths)
      }
      const resolved = await resolveSubmoduleStagingIpcTarget(args, store)
      await unstageSubmoduleFiles(
        resolved.worktreePath,
        args.submodulePath,
        resolved.filePaths,
        resolved.gitOptions
      )
    }
  )

  ipcMain.handle(
    'git:submoduleCommit',
    async (
      _event,
      args: {
        worktreePath: string
        submodulePath: string
        message: string
        connectionId?: string
      }
    ): Promise<{ success: boolean; error?: string }> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.commitSubmodule(args.worktreePath, args.submodulePath, args.message)
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return commitSubmoduleChanges(worktreePath, args.submodulePath, args.message, gitOptions)
    }
  )

  ipcMain.handle(
    'git:submodulePush',
    async (
      _event,
      args: {
        worktreePath: string
        submodulePath: string
        publish?: boolean
        connectionId?: string
      }
    ): Promise<void> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.pushSubmodule(args.worktreePath, args.submodulePath, args.publish)
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await pushSubmodule(worktreePath, args.submodulePath, args.publish === true, gitOptions)
    }
  )

  ipcMain.handle(
    'git:submodulePull',
    async (
      _event,
      args: { worktreePath: string; submodulePath: string; connectionId?: string }
    ): Promise<void> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.pullSubmodule(args.worktreePath, args.submodulePath)
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await pullSubmodule(worktreePath, args.submodulePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:submoduleRestorePointer',
    async (
      _event,
      args: { worktreePath: string; submodulePath: string; connectionId?: string }
    ): Promise<void> => {
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.restoreSubmodulePointer(args.worktreePath, args.submodulePath)
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await restoreSubmodulePointer(worktreePath, args.submodulePath, gitOptions)
    }
  )
}
