import { useCallback, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { VscodeScmContext } from './use-vscode-scm-context'
import { useVscodeScmPointerRestore } from './use-vscode-scm-pointer-restore'
import { useVscodeScmSubmoduleMutations } from './use-vscode-scm-submodule-mutations'
import { isVscodeScmPointerRestoreRow } from './vscode-scm-row-actions'
import { VSCODE_SCM_PARENT_REPOSITORY_ID, type VscodeScmRepository } from './vscode-scm-repository'
import type { VscodeScmActionButton } from './vscode-scm-action-button'
import type { VscodeScmRepositoryMutations } from './VscodeScmRepositorySection'
import type { PendingDiscardConfirmation } from '../source-control/commit/discard-dialog'

type ScopedDiscard = { repositoryId: string; pending: PendingDiscardConfirmation }

export type VscodeScmSectionMutations = {
  mutationsFor: (repository: VscodeScmRepository) => VscodeScmRepositoryMutations | null
  pendingDiscard: PendingDiscardConfirmation | null
  cancelDiscard: () => void
  confirmDiscard: () => void
}

/**
 * One mutation surface per section. The parent drives the worktree's own git; a submodule
 * drives its own repository through the submodule-scoped API, which asserts host-side that
 * the target is a repository root before writing.
 */
export function useVscodeScmSectionMutations(input: {
  scm: VscodeScmContext
  refreshSubmodule: (submodulePath: string) => void
  /** False when the paired host predates the submodule write RPCs. */
  submoduleWriteSupported: boolean
}): VscodeScmSectionMutations {
  const { refreshSubmodule, scm, submoduleWriteSupported } = input
  const submodule = useVscodeScmSubmoduleMutations(scm, refreshSubmodule)
  const pointerRestore = useVscodeScmPointerRestore(scm)
  const [messageByRepository, setMessageByRepository] = useState<Record<string, string>>({})
  const [smartCommit, setSmartCommit] = useState(false)
  const [scopedDiscard, setScopedDiscard] = useState<ScopedDiscard | null>(null)

  // Why keyed by worktree AND repository: VS Code keeps a separate commit message per
  // repository, and switching worktrees must not carry one over.
  const messageKeyFor = useCallback(
    (repositoryId: string) => `${scm.worktreeId ?? ''}::${repositoryId}`,
    [scm.worktreeId]
  )

  const clearMessage = useCallback(
    (repositoryId: string) =>
      setMessageByRepository((prev) => ({ ...prev, [messageKeyFor(repositoryId)]: '' })),
    [messageKeyFor]
  )

  const runParent = useCallback(
    async (button: VscodeScmActionButton): Promise<void> => {
      if (button.kind === 'publish') {
        await scm.publish()
        return
      }
      if (button.kind === 'sync') {
        await scm.sync()
        return
      }
      if (button.kind !== 'commit') {
        return
      }
      const message = messageByRepository[messageKeyFor(VSCODE_SCM_PARENT_REPOSITORY_ID)] ?? ''
      if (await scm.commit(message, { stageAllFirst: button.stagesAllFirst })) {
        clearMessage(VSCODE_SCM_PARENT_REPOSITORY_ID)
      }
    },
    [clearMessage, messageByRepository, messageKeyFor, scm]
  )

  const runSubmodule = useCallback(
    async (repository: VscodeScmRepository, button: VscodeScmActionButton): Promise<void> => {
      const submodulePath = repository.submodulePath
      if (!submodulePath) {
        return
      }
      const message = messageByRepository[messageKeyFor(repository.id)] ?? ''
      const stageablePaths = button.stagesAllFirst
        ? repository.entries.filter((entry) => entry.area !== 'staged').map((entry) => entry.path)
        : []
      if (await submodule.run(submodulePath, button, message, stageablePaths)) {
        clearMessage(repository.id)
      }
    },
    [clearMessage, messageByRepository, messageKeyFor, submodule]
  )

  const mutationsFor = useCallback(
    (repository: VscodeScmRepository): VscodeScmRepositoryMutations | null => {
      // A section whose status could not be read has nothing to act on.
      if (repository.status.kind !== 'loaded') {
        return null
      }
      const submodulePath = repository.submodulePath
      const isParent = repository.role === 'parent'
      const messageKey = messageKeyFor(repository.id)
      const shared = {
        message: messageByRepository[messageKey] ?? '',
        onMessageChange: (next: string) =>
          setMessageByRepository((prev) => ({ ...prev, [messageKey]: next })),
        smartCommit,
        onToggleSmartCommit: () => setSmartCommit((prev) => !prev),
        onRequestDiscard: (pending: PendingDiscardConfirmation) =>
          setScopedDiscard({ repositoryId: repository.id, pending })
      }
      if (isParent || !submodulePath) {
        return {
          ...shared,
          busy: scm.busy || pointerRestore.busy,
          unavailableReason: null,
          error: scm.lastError ?? pointerRestore.error,
          onDismissError: () => {
            scm.clearError()
            pointerRestore.clearError()
          },
          onStage: (paths) => void scm.stage(paths),
          onUnstage: (paths) => void scm.unstage(paths),
          onRun: (button) => void runParent(button)
        }
      }
      return {
        ...shared,
        busy: submodule.busyPath === submodulePath,
        unavailableReason: submoduleWriteSupported ? null : submoduleWriteUnavailableMessage(),
        error: submodule.errorByPath[submodulePath] ?? null,
        onDismissError: () => submodule.clearError(submodulePath),
        onStage: (paths) => void submodule.stage(submodulePath, paths),
        onUnstage: (paths) => void submodule.unstage(submodulePath, paths),
        onRun: (button) => void runSubmodule(repository, button)
      }
    },
    [
      messageByRepository,
      messageKeyFor,
      pointerRestore,
      runParent,
      runSubmodule,
      scm,
      smartCommit,
      submodule,
      submoduleWriteSupported
    ]
  )

  const confirmDiscard = useCallback(() => {
    if (!scopedDiscard) {
      return
    }
    const { pending, repositoryId } = scopedDiscard
    setScopedDiscard(null)
    if (repositoryId !== VSCODE_SCM_PARENT_REPOSITORY_ID) {
      const paths = pending.kind === 'entry' ? [pending.entry.path] : [...pending.paths]
      void submodule.discard(repositoryId, paths)
      return
    }
    // Why routed here and not by the caller: a gitlink row's discard is a different git
    // operation, and deciding that at the button would let the two answers drift.
    if (pending.kind === 'entry' && isVscodeScmPointerRestoreRow(pending.entry, 'parent')) {
      void pointerRestore.restore(pending.entry.path)
      return
    }
    void scm.discard(pending.kind === 'entry' ? [pending.entry.path] : [...pending.paths])
  }, [pointerRestore, scm, scopedDiscard, submodule])

  return {
    mutationsFor,
    pendingDiscard: scopedDiscard?.pending ?? null,
    cancelDiscard: useCallback(() => setScopedDiscard(null), []),
    confirmDiscard
  }
}

function submoduleWriteUnavailableMessage(): string {
  return translate(
    'sourceControl.submoduleWriteUnsupportedHost',
    'This host does not support submodule write operations. Update Orca on the remote host to stage, commit, or push inside a submodule.'
  )
}
