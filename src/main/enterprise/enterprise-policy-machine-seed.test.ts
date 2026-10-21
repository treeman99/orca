// The installer writes config/nsis/enterprise-policy.machine-seed.json to %ProgramData% when no
// machine-wide file exists. That file then outranks the bundled policy, so it must not change a
// single resolved value on the day it appears — and a switch the bundled policy turns on with
// `false` has to be repeated in the seed, because the bundled floor only ever adds `true`.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'
import {
  applyBuiltInAgentAllowlist,
  applyEnterprisePolicyBaseline
} from '../../shared/enterprise-policy-baseline'
import { resolveEnterprisePolicy, type EnterprisePolicy } from '../../shared/enterprise-policy'

function readPolicy(relativePath: string): unknown {
  const errors: ParseError[] = []
  const document: unknown = parseJsonc(
    readFileSync(path.join(process.cwd(), relativePath), 'utf8'),
    errors,
    { allowTrailingComma: true }
  )
  expect(errors, relativePath).toEqual([])
  return document
}

// Mirrors getEnterprisePolicy(): adopted file → bundled floor → built-in agent floor → resolve.
function resolveAdopted(adopted: unknown, bundled: unknown): EnterprisePolicy {
  const floored =
    bundled === null ? adopted : applyEnterprisePolicyBaseline(adopted, bundled).document
  return resolveEnterprisePolicy(applyBuiltInAgentAllowlist(floored).document, {}, 'policy')
}

const SEED = readPolicy('config/nsis/enterprise-policy.machine-seed.json')
const BUNDLED = readPolicy('resources/enterprise-policy.json')

describe('installer-seeded machine-wide policy', () => {
  it('resolves to exactly what the bundled policy alone resolves to', () => {
    const seeded = resolveAdopted(SEED, BUNDLED)
    const bundledOnly = resolveAdopted(BUNDLED, null)
    expect(seeded.warnings).toEqual([])
    expect(seeded).toEqual(bundledOnly)
  })

  it('stays locked down', () => {
    expect(resolveAdopted(SEED, BUNDLED).lockdown).toBe(true)
  })
})
