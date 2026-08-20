/**
 * Explicit old-host degrade for the submodule write operations.
 *
 * `git.submoduleList/Stage/Unstage/Commit/Push` postdate the oldest relay and remote host
 * a client may pair with. Both skew paths report the gap differently — the runtime RPC
 * returns `method_not_found`, the SSH provider rethrows a marker message through Electron
 * IPC — so both are folded into one typed error here. The panel can then say "this host
 * does not support submodule writes" instead of surfacing a protocol error, and must never
 * treat the failure as a completed write.
 */
import { isSubmoduleWriteUnsupportedMessage } from '../../../shared/git-submodule-write-support'
import { RuntimeRpcCallError } from './runtime-rpc-client'

export class SubmoduleWriteUnsupportedError extends Error {
  readonly code = 'submodule-write-unsupported' as const

  constructor(message: string) {
    super(message)
    this.name = 'SubmoduleWriteUnsupportedError'
  }
}

export function isSubmoduleWriteUnsupportedError(
  error: unknown
): error is SubmoduleWriteUnsupportedError {
  return error instanceof SubmoduleWriteUnsupportedError
}

/** Wrap one submodule write call so a skewed host surfaces as the typed error. */
export async function withSubmoduleWriteSupport<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isUnsupportedHostError(error)) {
      throw new SubmoduleWriteUnsupportedError(describeUnsupportedHost(error))
    }
    throw error
  }
}

function isUnsupportedHostError(error: unknown): boolean {
  if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
    return true
  }
  return error instanceof Error && isSubmoduleWriteUnsupportedMessage(error.message)
}

function describeUnsupportedHost(error: unknown): string {
  return error instanceof RuntimeRpcCallError
    ? 'Submodule write support is unavailable on this remote host. Update Orca on the host, then try again.'
    : ((error as Error).message ?? 'Submodule write support is unavailable on this host.')
}
