// Sample identifiers shared by the guide's figures.
//
// Not translatable: a reader compares these against their own repo, so a translated branch
// name or path would stop looking like the thing it stands for. Same exemption the shell
// commands get — a translator must not rewrite them.

export const GUIDE_SAMPLE = {
  project: 'my-project',
  projectPath: '~/work/my-project',
  worktreeName: 'refund-fix',
  worktreeBranch: 'feature/refund-fix',
  worktreePath: '~/work/refund-fix',
  folderPath: '~/work/notes',
  folderWorkspaceName: 'notes',
  baseBranch: 'main',
  agent: 'claude',
  agentAlt: 'opencode',
  devCommand: 'pnpm dev',
  gitTab: 'git',
  changedFile: 'src/payment/retry.ts',
  changedTestFile: 'src/payment/retry.test.ts',
  upstream: 'origin/feature/refund-fix',
  none: '\u2014'
} as const

// The sidebar prints this section title untranslated (SidebarHeader.tsx), so the figure must
// print it untranslated too, or the guide names a label nobody can find on screen.
export const SIDEBAR_PROJECTS_TITLE = 'Projects'
