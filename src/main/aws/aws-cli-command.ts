// Resolving the AWS CLI on Windows. Two failures the fork hit in the field, both
// invisible on macOS and Linux:
//
//   1. Electron's main process carries the PATH it was launched with. An AWS CLI
//      installed (or PATH-registered) after that login sees `aws --version` work in a
//      fresh terminal while Orca still reports "not installed". The repo already solved
//      this for PTYs — `mergePersistedWindowsPath()` re-reads PATH from the registry —
//      and the AWS lane simply never called it.
//   2. A bare `aws` does not resolve a `.cmd`/`.bat` shim, and PATHEXT is ignored.
//
// `platform` and `fileExists` are parameters, not `process.*` reads, so the win32
// branch is testable from macOS/Linux CI.

import type { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { mergePersistedWindowsPath } from '../pty/windows-environment-path'

export type AwsCommandOptions = {
  platform?: NodeJS.Platform
  fileExists?: (candidate: string) => boolean
  /** Forwarded to the registry PATH read so a test can fake `reg.exe`. */
  execFileSync?: typeof execFileSync
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

// Where the AWS CLI v2 MSI lands. Only consulted after PATH, so an explicit PATH entry
// (or a pip-installed v1) still wins.
function installerCandidates(env: NodeJS.ProcessEnv): string[] {
  const perMachine = [
    readEnv(env, 'ProgramW6432'),
    readEnv(env, 'ProgramFiles'),
    readEnv(env, 'ProgramFiles(x86)'),
    'C:\\Program Files'
  ]
  const candidates = perMachine
    .filter((root): root is string => Boolean(root))
    .map((root) => path.win32.join(root, 'Amazon', 'AWS CLI', 'aws.exe'))

  // The MSI's per-user mode, which a standard corporate account often has to use.
  const localAppData = readEnv(env, 'LOCALAPPDATA')
  if (localAppData) {
    candidates.push(path.win32.join(localAppData, 'Amazon', 'AWSCLIV2', 'aws.exe'))
  }
  return candidates
}

/**
 * Environment for spawning the AWS CLI. On Windows this is `process.env` with the
 * registry's PATH merged back in; elsewhere it is `process.env` unchanged.
 *
 * `AWS_PAGER: ''` because the CLI otherwise pipes through a configured pager, which
 * would hold `aws sso login`'s authorization URL and device code hostage.
 */
export function buildAwsCommandEnv(
  base: NodeJS.ProcessEnv = process.env,
  options: AwsCommandOptions = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, AWS_PAGER: '' }
  mergePersistedWindowsPath(env, {
    platform: options.platform ?? process.platform,
    env: base,
    execFileSync: options.execFileSync
  })
  return env
}

/**
 * Absolute path to the AWS CLI executable, or `'aws'` when nothing resolved — a bare
 * name still lets the spawn attempt (and fail with a readable error) rather than
 * turning an unusual install layout into a hard "not installed".
 */
export function resolveAwsCommand(
  env: NodeJS.ProcessEnv = process.env,
  options: AwsCommandOptions = {}
): string {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return 'aws'
  }
  const exists = options.fileExists ?? existsSync
  const extensions = splitList(readEnv(env, 'PATHEXT') ?? DEFAULT_PATHEXT)

  for (const directory of splitList(readEnv(env, 'PATH'))) {
    for (const extension of extensions) {
      // Lowercased because PATHEXT is conventionally uppercase and NTFS does not care —
      // this only keeps the path readable in logs and error messages.
      const candidate = path.win32.join(directory, `aws${extension.toLowerCase()}`)
      if (exists(candidate)) {
        return candidate
      }
    }
  }

  for (const candidate of installerCandidates(env)) {
    if (exists(candidate)) {
      return candidate
    }
  }
  return 'aws'
}
