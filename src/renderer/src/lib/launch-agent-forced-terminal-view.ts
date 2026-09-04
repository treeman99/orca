/**
 * Fork surface: the tab bar's `+` menu offers terminal and chat as two SEPARATE rows, so an
 * agent row there must open a raw terminal whatever `openAgentTabsInChatByDefault` says. A
 * hidden setting deciding what the agent row does is what made "+ → Claude opened a chat
 * window" unexplainable from the menu.
 *
 * It lives in its own module so upstream growth in `launch-agent-in-new-tab.ts` cannot push
 * the fork lines into a `max-lines` bypass, and so the override has one home rather than two
 * ternaries that can drift apart.
 */
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { SessionOptionValue } from '../../../shared/native-chat-session-options'
import type { Tab } from '../../../shared/tab-types'
import { initialAgentTabViewModeProps } from '@/lib/native-chat-initial-view-mode'
import {
  resolveInitialNativeChatSessionOptions,
  type InitialNativeChatSessionOptionsArgs
} from '@/components/native-chat/native-chat-launch-session-options'

type LaunchViewModeSettings = Pick<
  GlobalSettings,
  'experimentalNativeChat' | 'openAgentTabsInChatByDefault' | 'nativeChatSessionOptions'
>

export type LaunchAgentViewModeResolution = {
  initialViewModeProps: { viewMode?: Tab['viewMode'] }
  /**
   * Chat session options belong to a chat launch: baking them into a command line the user
   * asked to be a plain terminal would change what actually runs.
   */
  sessionOptions: Record<string, SessionOptionValue> | undefined
}

export function resolveLaunchAgentViewMode(
  args: { forceTerminalView?: boolean },
  settings: LaunchViewModeSettings | null | undefined,
  options: InitialNativeChatSessionOptionsArgs
): LaunchAgentViewModeResolution {
  if (args.forceTerminalView) {
    return { initialViewModeProps: {}, sessionOptions: undefined }
  }
  return {
    initialViewModeProps: initialAgentTabViewModeProps(settings, options),
    sessionOptions: resolveInitialNativeChatSessionOptions(settings, options)
  }
}
