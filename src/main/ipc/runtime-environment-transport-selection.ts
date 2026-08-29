import type { RuntimeOrchestrationEnvelope } from '../../shared/runtime-rpc-envelope'
import { isOrchestrationMutation } from '../../shared/orchestration-rpc-contract'

// Which transport a remote RPC gets, decided purely from its method name. Split out of
// runtime-environment-transport-routing for max-lines; these are pure predicates.

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

export function shouldUseOneShotRequest(method: string): boolean {
  // Why: snapshot recovery must remain available while a retained shared-control stream is reconnecting after a HUB restart.
  return method === 'session.tabs.list' || method === 'session.tabs.listAll'
}

export function shouldKeepDedicatedSubscriptionSocket(method: string): boolean {
  return method === 'browser.screencast' || method === 'terminal.multiplex'
}

export function shouldUseSharedControlSubscription(method: string): boolean {
  return (
    method === 'runtime.clientEvents.subscribe' ||
    method === 'session.tabs.subscribe' ||
    method === 'session.tabs.subscribeAll' ||
    method === 'accounts.subscribe' ||
    method === 'notifications.subscribe' ||
    method === 'files.watch'
  )
}
