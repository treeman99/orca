// What the corporate skill bundle lane remembers between launches: which commit's notice
// the user closed, and which skill names the bundle owned at the last successful check.
//
// Plain JSON in the user's profile, like update-notice-dismissals.ts. The names outlive a
// restart so the build's own freshness check stays out of the bundle's skills before the
// first check of the session has answered.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const FILE_NAME = 'corporate-skill-bundle.json'
const COMMIT_SHA = /^[0-9a-f]{40}$/
const SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/

export type CorporateSkillBundleState = {
  dismissedCommit: string | null
  bundleNames: string[]
}

const EMPTY: CorporateSkillBundleState = { dismissedCommit: null, bundleNames: [] }

function stateFilePath(): string | null {
  try {
    const userData = app?.getPath?.('userData')
    return userData ? path.join(userData, FILE_NAME) : null
  } catch {
    return null
  }
}

export function readCorporateSkillBundleState(): CorporateSkillBundleState {
  const filePath = stateFilePath()
  if (!filePath || !existsSync(filePath)) {
    return EMPTY
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return EMPTY
    }
    const dismissed: unknown = Reflect.get(parsed, 'dismissedCommit')
    const names: unknown = Reflect.get(parsed, 'bundleNames')
    return {
      dismissedCommit:
        typeof dismissed === 'string' && COMMIT_SHA.test(dismissed) ? dismissed : null,
      bundleNames: Array.isArray(names)
        ? names.filter((name): name is string => typeof name === 'string' && SKILL_NAME.test(name))
        : []
    }
  } catch {
    return EMPTY
  }
}

export function writeCorporateSkillBundleState(next: Partial<CorporateSkillBundleState>): void {
  const filePath = stateFilePath()
  if (!filePath) {
    return
  }
  const merged = { ...readCorporateSkillBundleState(), ...next }
  try {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify(merged)}\n`, 'utf8')
  } catch {
    // A preference that cannot be saved only means the notice may come back.
  }
}
