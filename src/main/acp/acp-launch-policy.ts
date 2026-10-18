// Fork-owned: acp-structured-launch-resolution.ts takes its enterprise gate on the same import line
// as an upstream helper, because upstream keeps that file at its max-lines cap (v1.4.229).
export { acpSessionNotRestoredItem } from './acp-session-reopen-failure'
export { assertAgentAllowedByEnterprisePolicy as assertAcpAgentAllowed } from '../enterprise/agent-allowlist-guard'
