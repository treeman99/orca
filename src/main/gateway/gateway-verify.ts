// Asks `gateway-cli verify` whether a usable session exists.
//
// The CLI owns the credential, so this is the only way to know: there is no token cache
// to read and no environment variable to inspect. Its output format is not documented
// yet, which is why every judgement lives in the defensive parser rather than here.

import { execFile, type ExecFileException } from 'node:child_process'
import { parseGatewayVerifyOutput, type GatewayVerification } from '../../shared/gateway-cli-output'
import { getSpawnArgsForWindows } from '../win32-utils'
import { buildGatewayCommandEnv, resolveGatewayCommand } from './gateway-cli-command'

// The parser owns the shape; re-exported so consumers import it from this lane's module.
export type { GatewayVerification }

// Same cold-start budget as the availability probe; endpoint protection is the cost here.
const VERIFY_TIMEOUT_MS = 20_000

/** True when the child ran to completion, so its output is worth parsing. */
function didProduceOutput(error: ExecFileException): boolean {
  return typeof error.code === 'number' && !error.killed
}

export async function runGatewayVerify(): Promise<GatewayVerification> {
  const env = buildGatewayCommandEnv()
  const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(resolveGatewayCommand(env), ['verify'])

  return new Promise<GatewayVerification>((resolve) => {
    execFile(
      spawnCmd,
      spawnArgs,
      { timeout: VERIFY_TIMEOUT_MS, windowsHide: true, env },
      (error, stdout, stderr) => {
        // A non-zero exit is a normal "not signed in" answer, so it still gets parsed;
        // only a child that never ran (or was killed on timeout) has nothing to read.
        if (error && !didProduceOutput(error)) {
          resolve({ signedIn: false, expiresAt: null, identity: null, detail: error.message })
          return
        }
        const exitCode = typeof error?.code === 'number' ? error.code : 0
        resolve(parseGatewayVerifyOutput({ stdout, stderr, exitCode }))
      }
    )
  })
}
