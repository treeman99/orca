/**
 * Old-host degrade contract for the submodule write RPCs. Both skew paths must land on the
 * same typed error: a remote host that never registered the method (runtime RPC
 * `method_not_found`) and an SSH relay that predates it (the marker message the main-process
 * provider rethrows through Electron IPC).
 */
import { describe, expect, it } from 'vitest'
import { SUBMODULE_WRITE_UNSUPPORTED_MESSAGE } from '../../../shared/git-submodule-write-support'
import { RuntimeRpcCallError } from './runtime-rpc-result'
import {
  isSubmoduleWriteUnsupportedError,
  withSubmoduleWriteSupport
} from './runtime-git-submodule-write-support'

function methodNotFound(): RuntimeRpcCallError {
  return new RuntimeRpcCallError({
    id: 'rpc-1',
    ok: false,
    error: { code: 'method_not_found', message: 'Unknown method: git.submoduleStage' }
  })
}

describe('withSubmoduleWriteSupport', () => {
  it('passes a successful call through untouched', async () => {
    await expect(withSubmoduleWriteSupport(async () => 'ok')).resolves.toBe('ok')
  })

  it('converts a remote host method_not_found into the typed error', async () => {
    const error = await withSubmoduleWriteSupport(async () => {
      throw methodNotFound()
    }).catch((caught: unknown) => caught)

    expect(isSubmoduleWriteUnsupportedError(error)).toBe(true)
  })

  it('converts the SSH marker message, even wrapped by Electron IPC', async () => {
    const wrapped = new Error(
      `Error invoking remote method 'git:submoduleStage': Error: ${SUBMODULE_WRITE_UNSUPPORTED_MESSAGE}`
    )

    const error = await withSubmoduleWriteSupport(async () => {
      throw wrapped
    }).catch((caught: unknown) => caught)

    expect(isSubmoduleWriteUnsupportedError(error)).toBe(true)
  })

  // Why it must stay narrow: a real failure silently reported as "unsupported" would let the
  // panel hide the write actions instead of telling the user their write failed.
  it('rethrows every other error unchanged', async () => {
    const other = new RuntimeRpcCallError({
      id: 'rpc-2',
      ok: false,
      error: { code: 'internal', message: 'index.lock exists' }
    })

    const error = await withSubmoduleWriteSupport(async () => {
      throw other
    }).catch((caught: unknown) => caught)

    expect(error).toBe(other)
    expect(isSubmoduleWriteUnsupportedError(error)).toBe(false)
  })
})
