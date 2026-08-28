import type React from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import type { OpenInMenuEntry } from '@/components/sidebar/WorktreeOpenInMenu'

export function getOpenInPathEntryIcon(
  entry: Pick<OpenInMenuEntry, 'target' | 'command'>
): React.JSX.Element {
  if (entry.target === 'file-manager') {
    return <FolderOpen className="size-3.5" />
  }
  return entry.command ? (
    <OpenInApplicationIcon application={{ command: entry.command }} size={14} />
  ) : (
    <ExternalLink className="size-3.5" />
  )
}

/** Label plus the availability note shared by every "Open in" menu row. */
export function OpenInPathEntryLabel({
  label,
  metadata
}: {
  label: string
  metadata?: string
}): React.JSX.Element {
  return (
    <>
      <span className="min-w-0 truncate">{label}</span>
      {metadata ? (
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{metadata}</span>
      ) : null}
    </>
  )
}
