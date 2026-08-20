/**
 * Old-host degrade marker for the submodule write operations.
 *
 * `git.submoduleList/Stage/Unstage/Commit/Push` are newer than the oldest relay and
 * remote host a client may pair with, and an unknown RPC method comes back as a raw
 * JSON-RPC method-not-found. Both the SSH provider and the runtime client convert that
 * into this one message so the renderer can recognize "this host cannot do submodule
 * writes" instead of showing a protocol error, or worse, appearing to succeed.
 */
export const SUBMODULE_WRITE_UNSUPPORTED_MESSAGE =
  'Submodule write support is unavailable on this host. Update Orca on the remote host (reconnect the SSH target), then try again.'

/** Matches even when a transport wraps the message (Electron IPC prefixes its own text). */
export function isSubmoduleWriteUnsupportedMessage(message: unknown): boolean {
  return typeof message === 'string' && message.includes(SUBMODULE_WRITE_UNSUPPORTED_MESSAGE)
}
