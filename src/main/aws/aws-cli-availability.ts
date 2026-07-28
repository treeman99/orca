// Is the AWS CLI usable? The Settings section needs to say "install it first" rather
// than fail a sign-in with a spawn error the user cannot read.
//
// The probe resolves an absolute path and re-merges Windows' registry PATH first — see
// aws-cli-command.ts for why a bare `aws` reports "not installed" on a machine where
// `aws --version` works in a terminal.

import { execFile } from 'node:child_process'
import { getSpawnArgsForWindows } from '../win32-utils'
import { buildAwsCommandEnv, resolveAwsCommand } from './aws-cli-command'

// Why 20s and not a couple of seconds: AWS CLI v2 is a frozen PyInstaller bundle, and a
// cold start behind corporate endpoint protection routinely takes over ten. The old 5s
// budget expired and was reported to the user as "AWS CLI is not installed".
const VERSION_TIMEOUT_MS = 20_000

export type AwsCliAvailability = { available: boolean; version: string | null }

export async function detectAwsCli(): Promise<AwsCliAvailability> {
  const env = buildAwsCommandEnv()
  const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(resolveAwsCommand(env), ['--version'])

  return new Promise<AwsCliAvailability>((resolve) => {
    execFile(
      spawnCmd,
      spawnArgs,
      { timeout: VERSION_TIMEOUT_MS, windowsHide: true, env },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ available: false, version: null })
          return
        }
        // `aws --version` prints to stdout on v2 and to stderr on v1.
        const output = `${stdout} ${stderr}`.trim()
        const version = output.match(/aws-cli\/(\S+)/)?.[1] ?? null
        resolve({ available: true, version })
      }
    )
  })
}
