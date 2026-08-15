// Is the gateway CLI usable? The Settings section needs to say "install it first"
// rather than fail a sign-in with a spawn error the user cannot read.
//
// The probe resolves an absolute path and re-merges Windows' registry PATH first — see
// gateway-cli-command.ts for why a bare name reports "not installed" on a machine where
// the CLI works in a terminal.

import { execFile, type ExecFileException } from 'node:child_process'
import { getSpawnArgsForWindows } from '../win32-utils'
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
  const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(resolveGatewayCommand(env), ['--version'])

  return new Promise<GatewayCliAvailability>((resolve) => {
    execFile(
      spawnCmd,
      spawnArgs,
      { timeout: VERSION_TIMEOUT_MS, windowsHide: true, env },
      (error, stdout, stderr) => {
        // A non-zero exit means the binary ran but does not know `--version`; only a
        // failure to spawn at all (ENOENT) means it is missing.
        if (error && !didSpawn(error)) {
          resolve({ available: false, version: null })
          return
        }
        // CLIs print the version to stdout or stderr depending on the framework.
        const output = `${stdout} ${stderr}`.trim()
        const version =
          output.match(NAMED_VERSION_RE)?.[1] ?? output.match(BARE_VERSION_RE)?.[1] ?? null
        resolve({ available: true, version: error ? null : version })
      }
    )
  })
}

/** True when the child actually started, i.e. the error is an exit status, not ENOENT. */
function didSpawn(error: ExecFileException): boolean {
  return typeof error.code === 'number' && error.code !== 0
}
