const { readFileSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { parse: parseJsonc } = require('jsonc-parser')

const POLICY_FILE_NAME = 'enterprise-policy.json'
const PREFIX = '[verify-packaged-enterprise-policy]'
// Why: electron-builder only logs `file source doesn't exist` and keeps going when an
// extraResources entry is missing (app-builder-lib/out/fileMatcher.js copyFiles). For this
// fork that warning would ship an installer that locks nothing, so assert the real output.
const REMEDY = `If an unlocked build is intended, drop the ${POLICY_FILE_NAME} entry from extraResources instead of weakening this check.`

// Why this key gets its own assertion: `allowedAgents` is the one restriction that does NOT
// inherit `lockdown`, and the runtime resolver treats absent, misspelled, non-array, and
// empty alike — as "no restriction" — while only warning to a stderr a Start-Menu-launched
// Windows GUI throws away. So a one-character typo ships an installer that reports itself
// fully locked down and still offers every vendor CLI in every picker.
function verifyAgentAllowlist(policyPath, allowedAgents) {
  const remedy = `To ship a lockdown build with no agent restriction, list every agent id explicitly.`
  if (allowedAgents === undefined) {
    throw new Error(
      `${PREFIX} ${policyPath} sets "lockdown": true but has no "allowedAgents"; the app would offer every agent. ${remedy}`
    )
  }
  if (!Array.isArray(allowedAgents) || allowedAgents.length === 0) {
    throw new Error(
      `${PREFIX} ${policyPath} has an "allowedAgents" the app would ignore: it must be a non-empty array of agent ids. ${remedy}`
    )
  }
  const unusable = allowedAgents.filter((id) => typeof id !== 'string' || id.trim() === '')
  if (unusable.length > 0) {
    throw new Error(
      `${PREFIX} ${policyPath} has "allowedAgents" entries that are not agent ids: ${JSON.stringify(unusable)}`
    )
  }
}

function verifyPackagedEnterprisePolicy(resourcesDir) {
  const policyPath = join(resourcesDir, POLICY_FILE_NAME)
  let stats
  try {
    stats = statSync(policyPath)
  } catch {
    throw new Error(`${PREFIX} missing bundled policy at ${policyPath}. ${REMEDY}`)
  }
  if (!stats.isFile()) {
    throw new Error(`${PREFIX} ${policyPath} is not a file`)
  }
  const errors = []
  // Matches the runtime loader: JSONC with comments and trailing commas, BOM stripped.
  const document = parseJsonc(readFileSync(policyPath, 'utf8').replace(/^\uFEFF/, ''), errors, {
    allowTrailingComma: true
  })
  if (errors.length > 0) {
    throw new Error(`${PREFIX} ${policyPath} is not valid JSONC; the app would ignore it`)
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new Error(`${PREFIX} ${policyPath} must contain a JSON object`)
  }
  if (document.lockdown !== true) {
    throw new Error(`${PREFIX} ${policyPath} does not set "lockdown": true. ${REMEDY}`)
  }
  verifyAgentAllowlist(policyPath, document.allowedAgents)
  console.log(`${PREFIX} OK — bundled policy present and locked down at ${policyPath}`)
}

module.exports = { verifyPackagedEnterprisePolicy }
