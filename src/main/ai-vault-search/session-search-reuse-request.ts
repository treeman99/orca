import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { markSessionSearchReusedInService } from '../ai-vault/session-scanner-service-spawn'
import { sessionSearchPolicy } from './session-search-policy'

export type SessionSearchReuseDeps = {
  mark: (paths: string[]) => Promise<void>
  enabled: () => boolean
}

const defaultDeps: SessionSearchReuseDeps = {
  mark: markSessionSearchReusedInService,
  enabled: () => sessionSearchPolicy().enabled
}

/**
 * A renderer reused a past session (resumed, continued, dragged into a tab, copied its prompt), so
 * its transcript's two weeks restart; see session-search-reuse.ts.
 *
 * Local sessions only: a remote host owns its own index and this desktop never stamps it, which only
 * ever lets a remote copy expire sooner. Off when no index runs, so reuse never spawns the scanner
 * child for nothing.
 */
export async function markAiVaultSessionReused(
  args: unknown,
  deps: SessionSearchReuseDeps = defaultDeps
): Promise<void> {
  if (!deps.enabled() || !args || typeof args !== 'object' || !('filePath' in args)) {
    return
  }
  const filePath = args.filePath
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return
  }
  const executionHostId = 'executionHostId' in args ? args.executionHostId : undefined
  if (executionHostId !== undefined && executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return
  }
  // A child that is restarting loses one stamp; the transcript keeps its mtime clock regardless.
  await deps.mark([filePath]).catch(() => undefined)
}
