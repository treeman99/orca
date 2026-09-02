/**
 * Transport-selection predicates split out of `runtime-environment-transport-routing.ts`.
 *
 * Why a module: the fork's remote-Orca-server guard sits in that file's three exported entry
 * points and pushes it past the `max-lines` budget; these two predicates are the part with no
 * dependency on the routing state.
 */
import { isOrchestrationMutation } from '../../shared/orchestration-rpc-contract'
import type { RuntimeOrchestrationEnvelope } from '../../shared/runtime-rpc-envelope'

export function shouldUseCachedRequestConnection(method: string): boolean {
  return method === 'terminal.send' || method === 'terminal.updateViewport'
}

export function shouldUseSharedControlEnvelope(
  method: string,
  params: unknown,
  envelope: RuntimeOrchestrationEnvelope | undefined
): RuntimeOrchestrationEnvelope | undefined {
  return envelope && method.startsWith('orchestration.') && !isOrchestrationMutation(method, params)
    ? envelope
    : undefined
}
