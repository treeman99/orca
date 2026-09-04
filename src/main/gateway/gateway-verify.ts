// Asks `gateway-cli verify` whether a usable session exists.
//
// The CLI owns the credential, so this is the only way to know: there is no token cache
// to read and no environment variable to inspect. Its output format is not documented
// yet, which is why every judgement lives in the defensive parser rather than here.

import { runProcess } from '../../shared/child-process/run-process'
import { parseGatewayVerifyOutput, type GatewayVerification } from '../../shared/gateway-cli-output'
import { buildGatewayCommandEnv, resolveGatewayCommand } from './gateway-cli-command'

// The parser owns the shape; re-exported so consumers import it from this lane's module.
export type { GatewayVerification }

// Same cold-start budget as the availability probe; endpoint protection is the cost here.
const VERIFY_TIMEOUT_MS = 20_000

export async function runGatewayVerify(): Promise<GatewayVerification> {
  const env = buildGatewayCommandEnv()
  // `runProcess` owns the Windows `.cmd` shim, so the bare resolved path goes in as-is.
  const result = await runProcess({
    program: resolveGatewayCommand(env),
    args: ['verify'],
    env,
    timeoutMs: VERIFY_TIMEOUT_MS
  }).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))

  // A non-zero exit is a normal "not signed in" answer, so it still gets parsed; only a
  // child that never ran (rejected) or was killed on timeout has nothing to read.
  if (result instanceof Error || result.timedOut) {
    return {
      signedIn: false,
      evidence: 'none',
      expiresAt: null,
      identity: null,
      detail: result instanceof Error ? result.message : 'gateway-cli verify timed out'
    }
  }
  return parseGatewayVerifyOutput({
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.code ?? 0
  })
}
