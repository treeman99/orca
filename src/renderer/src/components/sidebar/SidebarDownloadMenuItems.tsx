// Fork-only: where this fleet gets Orca builds and the skill bundle. Corporate GHES,
// not vendor links, so `disableVendorLinks` deliberately does not hide these rows.

import React from 'react'
import { Download, ExternalLink, Puzzle } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'

export const ORCA_DOWNLOAD_URL = 'https://github.samsungds.net/daegun-kim/Orca_ds/releases'
// Skills ship without releases; users download straight from the repository page.
export const SKILL_DOWNLOAD_URL = 'https://github.samsungds.net/daegun-kim/ORCA_skill'

function DownloadMenuItem({
  label,
  url,
  icon
}: {
  label: string
  url: string
  icon: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenuItem onSelect={() => void window.api.shell.openUrl(url)}>
      {icon}
      {label}
      <ExternalLink className="ml-auto size-3 text-muted-foreground" />
    </DropdownMenuItem>
  )
}

export function SidebarDownloadMenuItems(): React.JSX.Element {
  return (
    <>
      <DownloadMenuItem
        label={translate(
          'auto.components.sidebar.SidebarSettingsHelpMenu.downloadOrca',
          'Download Orca'
        )}
        url={ORCA_DOWNLOAD_URL}
        icon={<Download className="size-3.5" />}
      />
      <DownloadMenuItem
        label={translate(
          'auto.components.sidebar.SidebarSettingsHelpMenu.downloadSkills',
          'Download Skills'
        )}
        url={SKILL_DOWNLOAD_URL}
        icon={<Puzzle className="size-3.5" />}
      />
    </>
  )
}
