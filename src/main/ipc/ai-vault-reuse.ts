// Why this indirection: upstream's ai-vault.ts sits at its max-lines budget, so the fork's
// session-reuse registration rides upstream's existing import and call site rather than adding
// two lines there (README §6). Re-exported under upstream's own name so that call stays
// byte-identical to upstream and cannot conflict on the next sync.
import {
  registerAiVaultResumeHandler as registerUpstreamAiVaultResumeHandler,
  type AiVaultResumeHandlerOptions
} from './ai-vault-resume'
import { registerAiVaultSessionReuseHandler } from './ai-vault-session-reuse'

export type { AiVaultResumeHandlerOptions }

export function registerAiVaultResumeHandler(options: AiVaultResumeHandlerOptions): void {
  registerUpstreamAiVaultResumeHandler(options)
  // Fork: reuse restarts session search retention.
  registerAiVaultSessionReuseHandler()
}
