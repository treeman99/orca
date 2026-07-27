// Is the AWS CLI on PATH? The Settings section needs to say "install it first" rather
// than fail a sign-in with a spawn error the user cannot read.

import { execFile } from 'node:child_process'

const VERSION_TIMEOUT_MS = 5000

export type AwsCliAvailability = { available: boolean; version: string | null }

export async function detectAwsCli(): Promise<AwsCliAvailability> {
  return new Promise<AwsCliAvailability>((resolve) => {
    execFile(
      'aws',
      ['--version'],
      { timeout: VERSION_TIMEOUT_MS, windowsHide: true },
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
