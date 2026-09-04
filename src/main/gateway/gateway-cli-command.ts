// Resolving `gateway-cli` on Windows. Two failures the fork hit with the AWS CLI this
// lane replaced, both invisible on macOS and Linux:
//
//   1. Electron's main process carries the PATH it was launched with. A CLI installed
//      (or PATH-registered) after that login sees `gateway-cli --version` work in a
//      fresh terminal while Orca still reports "not installed". The repo already solved
//      this for PTYs — `mergePersistedWindowsPath()` re-reads PATH from the registry.
//   2. A bare `gateway-cli` does not resolve a `.cmd`/`.bat` shim, and PATHEXT is ignored.
//
// There is deliberately no installer-location fallback and no pager variable: we do not
// know where gateway-cli installs or what it calls its pager, and a guessed path or an
// invented environment variable is worse than a readable spawn failure.
//
// `platform` and `fileExists` are parameters, not `process.*` reads, so the win32
// branch is testable from macOS/Linux CI.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { GATEWAY_CLI_BINARY } from '../../shared/gateway-auth'
import { mergePersistedWindowsPath, type ExecFileSync } from '../pty/windows-environment-path'

export type GatewayCommandOptions = {
  platform?: NodeJS.Platform
  fileExists?: (candidate: string) => boolean
  /** Forwarded to the registry PATH read so a test can fake `reg.exe`. */
  execFileSync?: ExecFileSync
}

// Windows' own default when the variable is missing.
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/** `process.env` is case-insensitive on win32; a plain object in a test is not. */
function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const direct = env[name]
  if (direct !== undefined) {
    return direct
  }
  const lowered = name.toLowerCase()
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === lowered)
  return key ? env[key] : undefined
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * Environment for spawning the gateway CLI. On Windows this is `process.env` with the
 * registry's PATH merged back in; elsewhere it is `process.env` unchanged. Nothing else
 * is touched — the CLI owns the credential and Orca injects no variable of its own.
 */
export function buildGatewayCommandEnv(
  base: NodeJS.ProcessEnv = process.env,
  options: GatewayCommandOptions = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  mergePersistedWindowsPath(env, {
    platform: options.platform ?? process.platform,
    env: base,
    execFileSync: options.execFileSync
  })
  return env
}

/**
 * Absolute path to the gateway CLI, or the bare name when nothing resolved — that still
 * lets the spawn attempt (and fail with a readable OS error) rather than turning an
 * unusual install layout into a hard "not installed".
 */
export function resolveGatewayCommand(
  env: NodeJS.ProcessEnv = process.env,
  options: GatewayCommandOptions = {}
): string {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return GATEWAY_CLI_BINARY
  }
  const exists = options.fileExists ?? existsSync
  const extensions = splitList(readEnv(env, 'PATHEXT') ?? DEFAULT_PATHEXT)

  for (const directory of splitList(readEnv(env, 'PATH'))) {
    for (const extension of extensions) {
      // Lowercased because PATHEXT is conventionally uppercase and NTFS does not care —
      // this only keeps the path readable in logs and error messages.
      const candidate = path.win32.join(
        directory,
        `${GATEWAY_CLI_BINARY}${extension.toLowerCase()}`
      )
      if (exists(candidate)) {
        return candidate
      }
    }
  }
  return GATEWAY_CLI_BINARY
}
