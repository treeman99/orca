import { useAppStore } from '@/store'
import { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'
import { NO_OPEN_IN_APPLICATIONS } from '@/lib/open-in-application-selection'
import { parseExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import {
  getOpenInEntryAvailability,
  getWorktreeOpenInEntries,
  openWorktreePath,
  type OpenInMenuEntry
} from '@/components/sidebar/WorktreeOpenInMenu'

export type OpenInPathEntry = OpenInMenuEntry & {
  disabled: boolean
  metadata?: string
}

export type OpenInPathEntries = {
  entries: OpenInPathEntry[]
  /** False when there is no path to act on, so the submenu trigger can lock too. */
  hasPath: boolean
  openEntry: (entry: OpenInMenuEntry) => void
}

type UseOpenInPathEntriesArgs = {
  path: string | null | undefined
  connectionId?: string | null
  /** Runtime that owns `path`, when it is not the active one. */
  runtimeEnvironmentId?: string | null
  /** The owner the caller already resolved (its reveal owner); wins over `runtimeEnvironmentId`. */
  owner?: ExecutionHostId | 'unresolved'
}

function ownerRoute(
  owner: ExecutionHostId | 'unresolved' | undefined,
  runtimeEnvironmentId: string | null | undefined
): { runtimeEnvironmentId: string | null | undefined; ownerUnresolved: boolean } {
  if (owner === undefined) {
    return { runtimeEnvironmentId, ownerUnresolved: false }
  }
  const parsed = owner === 'unresolved' ? null : parseExecutionHostId(owner)
  return {
    runtimeEnvironmentId: parsed?.kind === 'runtime' ? parsed.environmentId : null,
    ownerUnresolved: owner === 'unresolved'
  }
}

export function useOpenInPathEntries({
  path,
  connectionId,
  runtimeEnvironmentId: requestedEnvironmentId,
  owner
}: UseOpenInPathEntriesArgs): OpenInPathEntries {
  const openInApplications = useAppStore(
    (s) => s.settings?.openInApplications ?? NO_OPEN_IN_APPLICATIONS
  )
  const { runtimeEnvironmentId, ownerUnresolved } = ownerRoute(owner, requestedEnvironmentId)
  const hasPath = Boolean(path)
  // Availability must resolve the same owner openWorktreePath will re-check on click.
  const entries = getWorktreeOpenInEntries(openInApplications, getLocalFileManagerLabel()).map(
    (entry) => {
      const availability = getOpenInEntryAvailability(
        entry,
        connectionId,
        runtimeEnvironmentId,
        ownerUnresolved
      )
      return {
        ...entry,
        disabled: !hasPath || availability.disabled,
        metadata: availability.metadata
      }
    }
  )

  return {
    entries,
    hasPath,
    openEntry: (entry) => {
      if (!path) {
        return
      }
      void openWorktreePath({
        target: entry.target,
        worktreePath: path,
        connectionId,
        command: entry.command,
        runtimeEnvironmentId
      })
    }
  }
}
