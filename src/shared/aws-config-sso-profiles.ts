// Parses the AWS shared config file (~/.aws/config) into the SSO-capable profiles a
// user can sign in as. Pure so the INI edge cases are unit tested without a filesystem.
//
// Two shapes exist and both are current:
//
//   [profile dev]                 legacy: the profile carries the portal URL itself
//   sso_start_url = https://…
//   sso_region = us-east-1
//
//   [sso-session corp]            sso-session: the URL lives in a shared block and
//   sso_start_url = https://…     profiles point at it by name (what `aws configure
//   sso_region = us-east-1        sso` writes today)
//   [profile dev]
//   sso_session = corp
//
// Anything without a resolvable start URL is not an SSO profile and is dropped — this
// list exists to answer "what can I sign in as", not "what profiles do I have".

import type { AwsSsoProfile } from './aws-sso-auth'

type Section = { kind: 'profile' | 'sso-session'; name: string; keys: Map<string, string> }

const SECTION_RE = /^\[([^\]]+)\]\s*(?:[#;].*)?$/
const KEY_VALUE_RE = /^(\s*)([^=\s][^=]*?)\s*=\s*(.*?)\s*$/

function classify(header: string): Section | null {
  const trimmed = header.trim()
  if (trimmed === 'default') {
    return { kind: 'profile', name: 'default', keys: new Map() }
  }
  const profile = trimmed.match(/^profile\s+(.+)$/)
  if (profile) {
    return { kind: 'profile', name: profile[1].trim(), keys: new Map() }
  }
  const session = trimmed.match(/^sso-session\s+(.+)$/)
  if (session) {
    return { kind: 'sso-session', name: session[1].trim(), keys: new Map() }
  }
  // `[services …]`, `[plugins]`, and anything else this feature does not read.
  return null
}

function stripInlineComment(value: string): string {
  // AWS only treats ` #`/` ;` (whitespace-prefixed) as an inline comment, so a URL
  // fragment or a password-ish value keeps its own '#'.
  return value.replace(/\s+[#;].*$/, '').trim()
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith(';')
}

/** Every `[profile …]`/`[sso-session …]` section, in file order. */
function readSections(contents: string): Section[] {
  const sections: Section[] = []
  let current: Section | null = null
  // A `key =` with no value opens a nested block (e.g. `s3 =`); its indented children
  // are not profile keys and must not overwrite one.
  let nestedIndent: number | null = null

  for (const line of contents.split(/\r?\n/)) {
    if (isBlankOrComment(line)) {
      continue
    }
    const header = line.match(SECTION_RE)
    if (header) {
      nestedIndent = null
      current = classify(header[1])
      if (current) {
        sections.push(current)
      }
      continue
    }
    const pair = line.match(KEY_VALUE_RE)
    if (!pair || !current) {
      continue
    }
    const indent = pair[1].length
    if (nestedIndent !== null && indent > nestedIndent) {
      continue
    }
    nestedIndent = null
    const key = pair[2].trim().toLowerCase()
    const value = stripInlineComment(pair[3])
    if (value.length === 0) {
      nestedIndent = indent
      continue
    }
    current.keys.set(key, value)
  }

  return sections
}

/** SSO-capable profiles from an AWS config file's contents, in file order. */
export function parseAwsConfigSsoProfiles(contents: string): AwsSsoProfile[] {
  const sections = readSections(contents)
  const sessions = new Map(
    sections.filter((section) => section.kind === 'sso-session').map((s) => [s.name, s.keys])
  )

  const profiles: AwsSsoProfile[] = []
  const seen = new Set<string>()
  for (const section of sections) {
    if (section.kind !== 'profile' || seen.has(section.name)) {
      continue
    }
    const sessionName = section.keys.get('sso_session') ?? null
    const session = sessionName ? sessions.get(sessionName) : undefined
    const startUrl = section.keys.get('sso_start_url') ?? session?.get('sso_start_url') ?? null
    if (!startUrl) {
      continue
    }
    seen.add(section.name)
    profiles.push({
      name: section.name,
      startUrl,
      ssoRegion: section.keys.get('sso_region') ?? session?.get('sso_region') ?? null,
      accountId: section.keys.get('sso_account_id') ?? null,
      roleName: section.keys.get('sso_role_name') ?? null,
      sessionName
    })
  }
  return profiles
}
