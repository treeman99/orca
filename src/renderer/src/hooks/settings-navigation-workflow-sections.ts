import { ARTIFACT_SHARING_REMOVED } from '../../../shared/artifact-sharing-removal'
import { getArtifactsSettingsSearchEntries } from '@/components/settings/artifacts-settings-search'
import { getAutomationsSettingsSearchEntries } from '@/components/settings/automations-settings-search'
import { getBrowserPaneCombinedSearchEntries } from '@/components/settings/browser-pane-search'
import { getCommitMessageAiPaneSearchEntries } from '@/components/settings/commit-message-ai-search'
import { getFloatingWorkspaceSearchEntries } from '@/components/settings/floating-workspace-search'
import { getGitPaneSearchEntries } from '@/components/settings/git-search'
import { getMobileEmulatorSearchEntries } from '@/components/settings/mobile-emulator-search'
import { getQuickCommandsPaneSearchEntries } from '@/components/settings/quick-commands-search'
import { translate } from '@/i18n/i18n'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import {
  CalendarClock,
  Files,
  GitBranch,
  Globe,
  PanelsTopLeft,
  Play,
  SquareTerminal,
  TabletSmartphone
} from 'lucide-react'
import type { SettingsNavigationBuildOptions } from './settings-navigation-build-options'

export function buildWorkflowSettingsSections(
  { isWebClient, policy }: SettingsNavigationBuildOptions,
  terminalPaneSearchEntries: SettingsNavSection['searchEntries']
): SettingsNavSection[] {
  const showDesktopOnlySettings = !isWebClient
  return [
    {
      id: 'automations',
      title: translate('auto.hooks.useSettingsNavigationMetadata.automationsTitle', 'Automations'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.automationsDescription',
        'Schedule agent work and choose whether Automations appears in the sidebar.'
      ),
      icon: CalendarClock,
      searchEntries: getAutomationsSettingsSearchEntries(),
      group: 'workflows'
    },
    // Dropping the registry entry also drops it from settings search and the Cmd+J palette;
    // settings-pane-policy-visibility covers the deep-link path the registry cannot.
    ...(!ARTIFACT_SHARING_REMOVED
      ? [
          {
            id: 'artifacts',
            title: translate(
              'auto.hooks.useSettingsNavigationMetadata.artifactsTitle',
              'Artifacts'
            ),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.artifactsDescription',
              'Share HTML and Markdown files with your team and manage their public links.'
            ),
            icon: Files,
            searchEntries: getArtifactsSettingsSearchEntries(),
            group: 'workflows' as const,
            badge: translate('auto.hooks.useSettingsNavigationMetadata.40d80bad8a', 'Beta')
          }
        ]
      : []),
    {
      id: 'git',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.09607cb0fe',
        'Git & Source Control'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.ab4b21b58e',
        'Branch naming, base refs, and Git AI Author.'
      ),
      icon: GitBranch,
      // Why: Git AI Author is rendered inside Git, so shared
      // metadata must search both surfaces wherever Git appears.
      searchEntries: [...getGitPaneSearchEntries(), ...getCommitMessageAiPaneSearchEntries()],
      group: 'workflows'
    },
    {
      id: 'terminal',
      title: translate('auto.hooks.useSettingsNavigationMetadata.a9fb10afca', 'Terminal'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.c33bfd664c',
        'Shells, renderer, sessions, and terminal behavior.'
      ),
      icon: SquareTerminal,
      searchEntries: terminalPaneSearchEntries,
      group: 'workflows'
    },
    {
      id: 'quick-commands',
      title: translate('auto.hooks.useSettingsNavigationMetadata.3fc3db144f', 'Quick Commands'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.42ae40842f',
        'Saved terminal commands, scoped globally or per project.'
      ),
      icon: Play,
      searchEntries: getQuickCommandsPaneSearchEntries(),
      group: 'workflows'
    },
    ...(showDesktopOnlySettings
      ? [
          {
            id: 'browser',
            title: translate('auto.hooks.useSettingsNavigationMetadata.8c197f74a1', 'Browser'),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.e815fd01bd',
              'Home page, link routing, and session cookies.'
            ),
            icon: Globe,
            searchEntries: getBrowserPaneCombinedSearchEntries(),
            group: 'workflows'
          }
        ]
      : []),
    ...(showDesktopOnlySettings && !policy.disableMobileEmulator
      ? [
          {
            id: 'mobile-emulator',
            title: translate(
              'auto.hooks.useSettingsNavigationMetadata.1e761cff2b',
              'Mobile Emulator'
            ),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.3d65d3f1b9',
              'Configure mobile emulator support for Orca and coding agents.'
            ),
            icon: TabletSmartphone,
            searchEntries: getMobileEmulatorSearchEntries(),
            group: 'workflows'
          }
        ]
      : []),
    {
      id: 'floating-workspace',
      title: translate('auto.hooks.useSettingsNavigationMetadata.65b19f5bde', 'Floating Workspace'),
      description: showDesktopOnlySettings
        ? translate(
            'auto.hooks.useSettingsNavigationMetadata.2d0659f6f0',
            'Global terminal, browser, and markdown tabs.'
          )
        : translate(
            'auto.hooks.useSettingsNavigationMetadata.floatingWorkspaceWebDescription',
            'Global terminal and markdown tabs.'
          ),
      icon: PanelsTopLeft,
      searchEntries: getFloatingWorkspaceSearchEntries({
        includeBrowser: showDesktopOnlySettings
      }),
      group: 'workflows'
    }
  ]
}
