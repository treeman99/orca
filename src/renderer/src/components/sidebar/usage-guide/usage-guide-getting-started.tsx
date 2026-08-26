// Section 1 of the usage guide, assembled from its three parts.
//
// Every UI label the reader is told to look for is quoted through the SAME catalog key the
// real control uses, not retyped. Orca's chrome is localized, so a hardcoded English
// "Create worktree" would name a button a Korean reader never sees.

import type React from 'react'
import { UsageGuideAddProjectPart } from './usage-guide-add-project'
import { UsageGuideFirstWorkspacePart } from './usage-guide-first-workspace'
import { UsageGuideWorkspaceKindsPart } from './usage-guide-workspace-kinds'

export function UsageGuideGettingStartedSection(): React.JSX.Element {
  return (
    <>
      <UsageGuideAddProjectPart />
      <UsageGuideWorkspaceKindsPart />
      <UsageGuideFirstWorkspacePart />
    </>
  )
}
