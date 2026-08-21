// The fork's shipped default must leave the update-notice lane ON.
//
// `lockdown: true` turns every inheriting switch on, so the bundled file has to say
// `"disableAutoUpdate": false` explicitly — deleting that one line ships a build where
// the feature the fleet asked for never runs, and nothing else would catch it.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import { resolveEnterprisePolicy } from '../../shared/enterprise-policy'

const BUNDLED_POLICY = path.join(process.cwd(), 'resources', 'enterprise-policy.json')

describe('bundled enterprise policy', () => {
  const errors: ParseError[] = []
  const document = parseJsonc(readFileSync(BUNDLED_POLICY, 'utf8'), errors, {
    allowTrailingComma: true
  }) as unknown

  it('parses as JSONC with no errors', () => {
    expect(errors).toEqual([])
  })

  it('keeps the corporate release-notice lane on under lockdown', () => {
    const policy = resolveEnterprisePolicy(document)
    expect(policy.lockdown).toBe(true)
    expect(policy.disableAutoUpdate).toBe(false)
    expect(policy.githubEnterpriseHost).toBe('github.samsungds.net')
  })

  it('reports no unknown keys or type complaints', () => {
    expect(resolveEnterprisePolicy(document).warnings).toEqual([])
  })
})
