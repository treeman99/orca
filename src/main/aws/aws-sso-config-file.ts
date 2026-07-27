// Reads the AWS shared config file and hands back the SSO-capable profiles.
// Parsing lives in src/shared/aws-config-sso-profiles.ts; this module is only I/O.

import { readFileSync } from 'node:fs'
import { parseAwsConfigSsoProfiles } from '../../shared/aws-config-sso-profiles'
import type { AwsSsoProfile } from '../../shared/aws-sso-auth'
import { awsConfigFilePath } from './aws-cli-paths'

export type AwsSsoConfigRead = {
  /** The file that was read, or null when there is no AWS config file at all. */
  configPath: string | null
  profiles: AwsSsoProfile[]
}

export function readAwsSsoProfiles(env: NodeJS.ProcessEnv = process.env): AwsSsoConfigRead {
  const configPath = awsConfigFilePath(env)
  let contents: string
  try {
    contents = readFileSync(configPath, 'utf8')
  } catch (error) {
    // A missing file is the normal "never ran aws configure sso" case; anything else
    // (permissions, a directory in the way) is worth a line in the log.
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn(`[aws-sso] could not read ${configPath}: ${String(error)}`)
    }
    return { configPath: null, profiles: [] }
  }
  return { configPath, profiles: parseAwsConfigSsoProfiles(contents) }
}
