import { useAppStore } from '@/store'
import { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'
import { NO_OPEN_IN_APPLICATIONS } from '@/lib/open-in-application-selection'
import { settingsForRuntimeOwner } from '@/runtime/runtime-client-target'
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
}

export function useOpenInPathEntries({
  path,
  connectionId,
  runtimeEnvironmentId
}: UseOpenInPathEntriesArgs): OpenInPathEntries {
  const openInApplications = useAppStore(
    (s) => s.settings?.openInApplications ?? NO_OPEN_IN_APPLICATIONS
  )
  const settings = useAppStore((s) => s.settings)
  const hasPath = Boolean(path)
  // Availability must resolve the same owner openWorktreePath will re-check on click.
  const guardSettings = settingsForRuntimeOwner(settings, runtimeEnvironmentId)
  const entries = getWorktreeOpenInEntries(openInApplications, getLocalFileManagerLabel()).map(
    (entry) => {
      const availability = getOpenInEntryAvailability(entry, guardSettings, connectionId)
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
