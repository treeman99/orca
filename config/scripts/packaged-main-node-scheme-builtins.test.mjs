// Fork-owned: kept apart from upstream's packaged-runtime suite, which sits at the max-lines cap.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { removeTree } from '../../src/shared/windows-transient-lock-removal.ts'

const require = createRequire(import.meta.url)
const { verifyPackagedMainRuntimeDeps } = require('../packaged-runtime-node-modules.cjs')

describe('packaged main runtime deps', () => {
  // Why: node:sqlite is a core module absent from builtinModules, so the guard must
  // treat the reserved node: scheme as builtin rather than a missing npm package.
  it('accepts node: scheme builtins that are absent from builtinModules', async () => {
    const resourcesDir = await mkdtemp(join(tmpdir(), 'orca-runtime-node-scheme-'))
    try {
      await writeFile(join(resourcesDir, 'app.asar'), '', 'utf8')

      const sources = new Map([
        ['out\\main\\index.js', 'const { DatabaseSync } = require("node:sqlite")'],
        [
          'out\\main\\agent-hooks\\managed-agent-hook-controls.js',
          'const test = require("node:test")'
        ]
      ])
      const asar = {
        listPackage: () => [...sources.keys()].map((entry) => `\\${entry}`),
        extractFile: (_asarPath, internalPath) => Buffer.from(sources.get(internalPath), 'utf8')
      }

      expect(() => verifyPackagedMainRuntimeDeps(resourcesDir, asar)).not.toThrow()
    } finally {
      await removeTree(resourcesDir)
    }
  })
})
