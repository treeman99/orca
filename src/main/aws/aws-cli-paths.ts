// Where the AWS CLI keeps the two things this feature reads: the shared config file
// (profiles) and the SSO token cache (whether a sign-in is still valid).
//
// Orca never writes either one — `aws sso login` does. We only locate them.

import { app } from 'electron'
import { homedir } from 'node:os'
import path from 'node:path'

// Why app.getPath('home') first: the E2E suite redirects Electron's home to a
// disposable directory, and a spec must not read the developer's real AWS config.
function userHome(): string {
  try {
    return app?.getPath?.('home') ?? homedir()
  } catch {
    return homedir()
  }
}

/** The config file `aws` would read, honoring AWS_CONFIG_FILE like the CLI does. */
export function awsConfigFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AWS_CONFIG_FILE?.trim()
  return override ? override : path.join(userHome(), '.aws', 'config')
}

/** The directory holding `aws sso login`'s cached access tokens. */
export function awsSsoCacheDirectoryPath(): string {
  return path.join(userHome(), '.aws', 'sso', 'cache')
}
