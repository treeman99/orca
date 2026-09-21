// Fork-owned fields on upstream terminal contracts, kept here so runtime-terminal-contracts.ts
// stays under its line budget as upstream grows it.
import type { TerminalPaneGroupPlacement } from './terminal-pane-placement'

// Why: 'verified' means the agent was observed working on the prompt; 'resent'
// means a swallowed Enter was rescued; 'unverified' means the write went out but
// nothing proved the agent took it — the caller has to look, not assume.
export type AgentPromptSubmitOutcome = 'verified' | 'resent' | 'unverified'

export type TerminalSendForkFields = {
  submit?: AgentPromptSubmitOutcome
}

export type TerminalCreateForkFields = {
  /** Advisory worker-column anchor; the renderer drops it when it cannot honor it. */
  paneGroupPlacement?: TerminalPaneGroupPlacement
}

// Bundled under one name, and upstream's TerminalPaneLayoutNode re-exported beside it, so
// runtime-terminal-contracts.ts imports one module on one line: the fork's import replaces
// upstream's instead of adding to it, keeping that file inside max-lines (README §6).
export type ForkTerminalFields = {
  send: TerminalSendForkFields
  create: TerminalCreateForkFields
}
export type { TerminalPaneLayoutNode } from './terminal-tab-types'
