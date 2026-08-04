/** Shared by the create operation and its claim validation; kept in its own
 *  module so those two do not import each other in a cycle. */
export const SSH_AGENT_SESSION_CAPABILITY_PROBE_TIMEOUT_MS = 5_000
