import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'

/**
 * Fork: a past session was taken up again — resumed, continued, dragged into a tab, or its prompt
 * copied — so its transcript's session search retention restarts for two weeks
 * (src/main/ai-vault-search/session-search-reuse.ts). Viewing a session or seeing it in results is
 * not reuse. Fire-and-forget: retention bookkeeping never blocks or fails the action itself.
 */
export function markAiVaultSessionReused(session: {
  filePath: string
  executionHostId?: string | null
}): void {
  // Why the typeof: shared preparation code also runs where no renderer window exists.
  const mark = typeof window === 'undefined' ? undefined : window.api?.aiVault?.markSessionReused
  const filePath = session.filePath?.trim()
  if (typeof mark !== 'function' || !filePath) {
    return
  }
  if (session.executionHostId && session.executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return
  }
  void mark({ filePath: session.filePath, executionHostId: LOCAL_EXECUTION_HOST_ID }).catch(
    () => undefined
  )
}
