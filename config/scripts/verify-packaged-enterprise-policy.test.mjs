import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { parse as parseJsonc } from 'jsonc-parser'
import { beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')
const { verifyPackagedEnterprisePolicy } = require('./verify-packaged-enterprise-policy.cjs')

const BUNDLED_SOURCE = join(process.cwd(), 'resources', 'enterprise-policy.json')

async function makeResourcesDir(contents) {
  const root = await mkdtemp(join(tmpdir(), 'orca-bundled-policy-'))
  if (contents !== null) {
    await writeFile(join(root, 'enterprise-policy.json'), contents, 'utf8')
  }
  return root
}

describe('bundled enterprise policy resource', () => {
  // Why: the loader resolves <resourcesPath>/enterprise-policy.json, and the code
  // supports all three platforms — a per-platform list would ship a mac/linux build
  // whose lockdown silently depends on a file nobody deployed.
  it('ships to the path the loader reads on every platform', () => {
    for (const platform of ['win', 'mac', 'linux']) {
      expect(electronBuilderConfig[platform].extraResources).toContainEqual({
        from: 'resources/enterprise-policy.json',
        to: 'enterprise-policy.json'
      })
    }
  })

  // A duplicate inside app.asar.unpacked would be a second file an auditor has to
  // reason about, and neither copy is the one the loader reads.
  it('is not also packed into app.asar', () => {
    expect(electronBuilderConfig.files).toContain('!resources/enterprise-policy.json')
  })

  it('runs the packaging assertion from afterPack', () => {
    expect(String(electronBuilderConfig.afterPack)).toContain('verifyPackagedEnterprisePolicy')
  })
})

describe('resources/enterprise-policy.json', () => {
  let document

  beforeAll(() => {
    const errors = []
    document = parseJsonc(readFileSync(BUNDLED_SOURCE, 'utf8'), errors, {
      allowTrailingComma: true
    })
    expect(errors).toEqual([])
  })

  it('locks the deployment down by default', () => {
    expect(document.lockdown).toBe(true)
  })

  // These are the enterprise/samsungds deployment's actual values; an upstream merge
  // that resets them would ship an installer aimed at the wrong host.
  it('carries the deployment targets of this fork', () => {
    expect(document.githubEnterpriseHost).toBe('github.samsungds.net')
    expect(document.allowedAgents).toEqual(['claude', 'opencode'])
    expect(document.llmEndpoints.map((endpoint) => endpoint.baseUrl)).toEqual([
      'https://llm.samsungds.net/v1'
    ])
  })

  // The file is read by whoever audits the deployment, and JSONC is what the loader
  // parses — stripping comments to satisfy a strict JSON tool would lose that.
  it('keeps its explanatory comments', () => {
    const source = readFileSync(BUNDLED_SOURCE, 'utf8')
    expect(source).toContain('%ProgramData%')
    expect(
      source.split('\n').filter((line) => line.trim().startsWith('//')).length
    ).toBeGreaterThan(5)
  })
})

describe('verifyPackagedEnterprisePolicy', () => {
  it('accepts the real bundled policy', async () => {
    const root = await makeResourcesDir(readFileSync(BUNDLED_SOURCE, 'utf8'))
    try {
      expect(() => verifyPackagedEnterprisePolicy(root)).not.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  // electron-builder only logs `file source doesn't exist` for a missing
  // extraResources entry, so without this the build would ship an unlocked app.
  it('fails packaging when the resource never landed', async () => {
    const root = await makeResourcesDir(null)
    try {
      expect(() => verifyPackagedEnterprisePolicy(root)).toThrow(/missing bundled policy/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails packaging when the policy would not parse at runtime', async () => {
    const root = await makeResourcesDir('{ "lockdown": true ')
    try {
      expect(() => verifyPackagedEnterprisePolicy(root)).toThrow(/not valid JSONC/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails packaging when the bundled policy locks nothing', async () => {
    const root = await makeResourcesDir('{ "githubEnterpriseHost": "github.samsungds.net" }')
    try {
      expect(() => verifyPackagedEnterprisePolicy(root)).toThrow(/does not set "lockdown": true/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
