// Fork-owned per-agent overrides on upstream's TUI agent table. Kept out of tui-agent-config.ts,
// which upstream keeps at its max-lines cap; `TuiAgentConfig` is re-exported so the fork's import
// replaces upstream's type import there instead of adding a line (README §6).
import type { TuiAgentConfig } from './tui-agent-config-types'

export type { TuiAgentConfig } from './tui-agent-config-types'

export const FORK_TUI_AGENT_OVERRIDES: Readonly<Record<string, Partial<TuiAgentConfig>>> = {
  opencode: {
    // Why: under ConPTY the bracketed-paste frame never reaches opencode's composer — a
    // dispatched prompt lands nowhere and the pane sits empty, while the same text written as
    // plain input arrives. Measured on the corporate Windows build; macOS was never affected.
    promptDeliveryMode: 'plain-text'
  }
}
