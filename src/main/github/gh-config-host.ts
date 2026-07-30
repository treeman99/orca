// Reads the host `gh` is configured for out of gh's OWN config file.
//
// Why a file read and not `gh auth status`: this feeds the enterprise policy, which is
// resolved synchronously on hot paths (every Gitea ref parse, every allowlist check), so
// it cannot await a subprocess. The Settings readout keeps using `gh auth status` because
// there it can, and that is the live truth including env-supplied tokens.
//
// Why it exists at all: `gh auth login --hostname <ghes>` writes here and touches nothing
// else. Until this was read, a machine set up in the order people actually use — install
// Orca, point gh at the company host afterwards — left Orca resolving to github.com, with
// no way back short of wiping userData.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeHost } from '../../shared/enterprise-policy'

export type GhConfigEnv = Record<string, string | undefined>

// hosts.yml holds one block per host and nothing else; a file far larger than this is
// not gh's and must not be scanned line by line.
const MAX_HOSTS_FILE_BYTES = 256 * 1024

function pathFor(platform: NodeJS.Platform): typeof path {
  return platform === 'win32' ? path.win32 : path.posix
}

/**
 * Where gh keeps `hosts.yml`, or null when no location can be derived.
 *
 * Mirrors gh's own `config.ConfigDir()` exactly, including that the precedence is
 * EXCLUSIVE rather than a candidate list: `GH_CONFIG_DIR` wins outright, else
 * `XDG_CONFIG_HOME/gh`, else `%AppData%\GitHub CLI` on Windows, else `~/.config/gh`.
 * Falling through to a lower location when the chosen one is missing would read a config
 * gh itself ignores — and would make `GH_CONFIG_DIR` unusable for pinning gh away from a
 * developer's real config, which is how the test suites isolate this.
 */
export function ghHostsFilePath(env: GhConfigEnv, platform: NodeJS.Platform): string | null {
  const platformPath = pathFor(platform)
  const explicit = env.GH_CONFIG_DIR?.trim()
  if (explicit) {
    return platformPath.join(explicit, 'hosts.yml')
  }
  const xdg = env.XDG_CONFIG_HOME?.trim()
  if (xdg) {
    return platformPath.join(xdg, 'gh', 'hosts.yml')
  }
  const appData = platform === 'win32' ? (env.AppData ?? env.APPDATA) : undefined
  if (appData) {
    return platformPath.join(appData, 'GitHub CLI', 'hosts.yml')
  }
  const home = env.HOME ?? env.USERPROFILE
  return home ? platformPath.join(home, '.config', 'gh', 'hosts.yml') : null
}

/**
 * Top-level keys of hosts.yml — one per authenticated host.
 *
 * Not a YAML parse on purpose: the shape is fixed (unindented `host:` lines, everything
 * belonging to a host indented under it), and pulling in a parser to read six characters
 * would be the larger risk. Comments, blank lines, and indented keys are skipped.
 */
export function parseGhHostsFile(contents: string): string[] {
  const hosts: string[] = []
  const seen = new Set<string>()
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || /^[\s#-]/.test(line)) {
      continue
    }
    const match = line.match(/^([^\s:#][^:]*):\s*(?:#.*)?$/)
    const host = normalizeHost(match?.[1])
    if (host && !seen.has(host)) {
      seen.add(host)
      hosts.push(host)
    }
  }
  return hosts
}

/**
 * The single host gh is configured for, or null.
 *
 * Null for two or more hosts on purpose — that is gh's own `DefaultHost()` behavior, and
 * guessing which of them is "the corporate one" would put a company label on requests
 * that really do leave for github.com.
 */
export function readGhConfiguredHost(
  env: GhConfigEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  readFile: (filePath: string) => string = (filePath) =>
    readFileSync(filePath, { encoding: 'utf8' })
): string | null {
  const filePath = ghHostsFilePath(env, platform)
  if (!filePath) {
    return null
  }
  let contents: string
  try {
    contents = readFile(filePath)
  } catch {
    // Missing is the normal case; unreadable is gh's problem, not ours to report.
    return null
  }
  if (contents.length > MAX_HOSTS_FILE_BYTES) {
    return null
  }
  const hosts = parseGhHostsFile(contents)
  return hosts.length === 1 ? (hosts[0] ?? null) : null
}
