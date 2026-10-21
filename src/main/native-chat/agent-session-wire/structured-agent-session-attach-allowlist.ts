import { refuseDisallowedAgent } from '../../enterprise/agent-allowlist-guard'
import {
  attachStructuredAgentSession as attachStructuredAgentSessionUngated,
  attachStructuredAgentSessionForStart as attachStructuredAgentSessionForStartUngated
} from './structured-agent-session-attach-orchestration'

// Fork: the corporate allowlist on the structured lane's two attach entry points. Callers import
// these under upstream's names, so their call sites — and the orchestration module — stay
// byte-identical to upstream (that module sits at the max-lines cap).

type Attach = typeof attachStructuredAgentSessionUngated
type AttachForStart = typeof attachStructuredAgentSessionForStartUngated

// Why here and not in the three RPC handlers: create-by-intent, create-by-attach-params,
// ensure and the surface-hold resume all funnel through this call. Refusing before the
// session is reserved leaves no record, no journal and no idempotency row behind — and
// nothing enters the attach queue, so `drainAttaches` has nothing to wait on.
// Why a rejection and not a throw: this returns a Promise but is not `async`, so a
// synchronous throw would escape a caller's `.catch`.
export function attachStructuredAgentSession(...args: Parameters<Attach>): ReturnType<Attach> {
  return refuseDisallowedAgent(args[2].agent) ?? attachStructuredAgentSessionUngated(...args)
}

// Why repeated here: the delivery loop's resume reaches this export directly, so the gate in
// attachStructuredAgentSession alone would let a since-disallowed agent's child respawn.
export function attachStructuredAgentSessionForStart(
  ...args: Parameters<AttachForStart>
): ReturnType<AttachForStart> {
  return (
    refuseDisallowedAgent(args[2].agent) ?? attachStructuredAgentSessionForStartUngated(...args)
  )
}
