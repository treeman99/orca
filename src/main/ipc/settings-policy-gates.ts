// Fork-owned: the enterprise gates settings.ts consumes, behind one import line. Upstream fills that
// file to the max-lines cap (v1.4.204, again v1.4.238), so a second fork import would not fit.
// The hook toggle keeps upstream's name so its call site stays byte-identical to upstream; the gate
// lives in the wrapper.
export { applyAgentStatusHooksEnabledUnderEnterprisePolicy as applyAgentStatusHooksEnabled } from '../agent-hooks/enterprise-agent-hook-policy'
export { isRemoteOrcaServerDisabled } from '../enterprise/remote-orca-server-guard'
