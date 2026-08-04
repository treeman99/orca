const { readFileSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { parse: parseJsonc } = require('jsonc-parser')

const POLICY_FILE_NAME = 'enterprise-policy.json'
const PREFIX = '[verify-packaged-enterprise-policy]'
// Why: electron-builder only logs `file source doesn't exist` and keeps going when an
// extraResources entry is missing (app-builder-lib/out/fileMatcher.js copyFiles). For this
// fork that warning would ship an installer that locks nothing, so assert the real output.
const REMEDY = `If an unlocked build is intended, drop the ${POLICY_FILE_NAME} entry from extraResources instead of weakening this check.`

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
  console.log(`${PREFIX} OK — bundled policy present and locked down at ${policyPath}`)
}

module.exports = { verifyPackagedEnterprisePolicy }
