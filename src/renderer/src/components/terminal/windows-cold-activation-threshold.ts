// Fork: Windows keeps the pre-v1.4.201 eager-mount budget for a worktree activation.
//
// Why: #20034 dropped the budget from 4 to 0, which moved every hidden sibling's mount
// (WebGL context, sync-IPC scrollback read, daemon reattach) off the switch and onto idle
// frames right after the reveal — the window in which the user starts typing into the pane
// they just revealed. On the corporate Windows build that surfaced as intermittent stalls
// where keystrokes and the Claude cursor did not paint for a while; v1.4.200 never showed it.
// Mounting during the switch costs a slower switch, which is the trade v1.4.200 shipped.
export const WINDOWS_COLD_ACTIVATION_TAB_DEFER_THRESHOLD = 4

// Why the renderer's own user agent, not the execution host: the mount cost is paid by the
// machine drawing the panes, which for a web client is not the host running the PTYs.
export function resolveColdActivationTabDeferThreshold(
  upstreamThreshold: number,
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): number {
  return userAgent.includes('Windows')
    ? Math.max(upstreamThreshold, WINDOWS_COLD_ACTIVATION_TAB_DEFER_THRESHOLD)
    : upstreamThreshold
}
