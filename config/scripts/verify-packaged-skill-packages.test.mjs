import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { verifyPackagedSkillPackages } = require('./verify-packaged-skill-packages.cjs')

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const temporaryDirectories = []

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** A packaged Resources dir laid out the way extraResources produces it. */
function makeResourcesDir({ includePackages = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orca-packaged-skills-'))
  temporaryDirectories.push(root)
  mkdirSync(join(root, 'skills'), { recursive: true })
  cpSync(join(REPO_ROOT, 'resources', 'skills'), join(root, 'skills'), { recursive: true })
  if (includePackages) {
    cpSync(join(REPO_ROOT, 'skills'), join(root, 'skills', 'packages'), { recursive: true })
  }
  return root
}

describe('verifyPackagedSkillPackages', () => {
  it('accepts the layout this repo actually packages', () => {
    expect(() => verifyPackagedSkillPackages(makeResourcesDir())).not.toThrow()
  })

  // Why: electron-builder only logs a warning for a missing extraResources source, so the
  // installer would ship with no offline install path and nothing would say so.
  it('rejects a build whose skill packages were not copied', () => {
    expect(() => verifyPackagedSkillPackages(makeResourcesDir({ includePackages: false }))).toThrow(
      /missing packaged skill packages/
    )
  })

  it('rejects packaged bytes that disagree with the manifest beside them', () => {
    const root = makeResourcesDir()
    writeFileSync(join(root, 'skills', 'packages', 'orca-cli', 'SKILL.md'), '# tampered\n', 'utf8')

    expect(() => verifyPackagedSkillPackages(root)).toThrow(/does not match the manifest hash/)
  })

  it('rejects a package the manifest lists but packaging dropped', () => {
    const root = makeResourcesDir()
    rmSync(join(root, 'skills', 'packages', 'orca-cli'), { recursive: true, force: true })

    expect(() => verifyPackagedSkillPackages(root)).toThrow(/manifest lists "orca-cli"/)
  })
})
