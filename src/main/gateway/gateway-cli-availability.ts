// Is the gateway CLI usable? The Settings section needs to say "install it first"
// rather than fail a sign-in with a spawn error the user cannot read.
//
// The probe resolves an absolute path and re-merges Windows' registry PATH first — see
// gateway-cli-command.ts for why a bare name reports "not installed" on a machine where
// the CLI works in a terminal.

import { runProcess } from '../../shared/child-process/run-process'
import { buildGatewayCommandEnv, resolveGatewayCommand } from './gateway-cli-command'

// Why 20s and not a couple of seconds: a cold start behind corporate endpoint protection
// routinely takes over ten. The AWS lane's old 5s budget expired and was reported to the
// user as "CLI is not installed".
const VERSION_TIMEOUT_MS = 20_000

// `gateway-cli/1.2.3` or `gateway-cli 1.2.3`, then any leading semver as a fallback.
const NAMED_VERSION_RE = /gateway-cli[/ ]v?(\d[\w.\-+]*)/i
const BARE_VERSION_RE = /\bv?(\d+\.\d+\.\d+[\w.\-+]*)/

export type GatewayCliAvailability = { available: boolean; version: string | null }

export async function detectGatewayCli(): Promise<GatewayCliAvailability> {
  const env = buildGatewayCommandEnv()
  // `runProcess` owns the Windows `.cmd` shim, so the bare resolved path goes in as-is.
  const result = await runProcess({
    program: resolveGatewayCommand(env),
    args: ['--version'],
    env,
    timeoutMs: VERSION_TIMEOUT_MS
  }).catch(() => null)

  // A child that never started (ENOENT) rejects; one killed on timeout produced no answer.
  // Only those two mean "not installed" — a non-zero exit means the binary ran.
  if (!result || result.timedOut) {
    return { available: false, version: null }
  }
  // CLIs print the version to stdout or stderr depending on the framework.
  const output = `${result.stdout} ${result.stderr}`.trim()
  const version = output.match(NAMED_VERSION_RE)?.[1] ?? output.match(BARE_VERSION_RE)?.[1] ?? null
  return { available: true, version: result.code === 0 ? version : null }
}
