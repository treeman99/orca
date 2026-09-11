import { reportWorkerTerminalUserInput } from '@/lib/worker-terminal-takeover-report'
import { subscribeToTerminalTypedUserInput } from '../terminal-typed-user-input'
import type { ConnectPanePtySession } from './connect-pane-pty-session'

/**
 * Worker user_takeover from typed input only — never from a mouse report or the cursor keys a
 * wheel synthesizes over a split worker pane.
 *
 * Why its own installer, after installPtyInputForward: the classifier pairs the core user-input
 * signal with the next onData to see the bytes, so it subscribes to onData. The input forwarder
 * must stay the first onData subscriber (deferPtyInput and the test harness route through it), so
 * this cannot live in installDirectSshRetryStatus, which runs before the forwarder.
 */
export function installTypedUserInputTakeover(session: ConnectPanePtySession): void {
  session.typedUserInputTakeoverDisposable = subscribeToTerminalTypedUserInput(
    session.pane.terminal,
    {
      // Hibernation activity keeps recording from the core signal in installDirectSshRetryStatus.
      onUserInput: () => {},
      onTypedInput: () =>
        reportWorkerTerminalUserInput(session.cacheKey, session.runtimeEnvironmentId)
    }
  )
}
