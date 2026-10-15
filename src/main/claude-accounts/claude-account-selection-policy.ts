// Fork: the account the Claude profile routers launch with. Under disableManagedClaudeAccounts it
// is none, so a launch keeps its inherited auth (AWS_*, CLAUDE_CODE_USE_BEDROCK, the SSO cache):
// no account folder, no env rewriting, and the WSL router never reaches its pinned-Node lane.
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { getSelectedClaudeAccountIdForTarget } from './runtime-selection'

export function getSelectedClaudeAccountIdUnderEnterprisePolicy(
  ...args: Parameters<typeof getSelectedClaudeAccountIdForTarget>
): string | null {
  return getEnterprisePolicy().disableManagedClaudeAccounts
    ? null
    : getSelectedClaudeAccountIdForTarget(...args)
}
