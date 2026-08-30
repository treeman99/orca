import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')
const PATCH = readFileSync(
  join(projectDir, 'config/patches/@vscode__windows-process-tree@0.8.0.patch'),
  'utf8'
)
const PACKAGE_DIR = join(projectDir, 'node_modules', '@vscode', 'windows-process-tree')
const RESOLVED_GYP = "require.resolve('node-addon-api/node_addon_api.gyp')"

describe('windows-process-tree node-addon-api gyp path', () => {
  it('stages headers without a pnpm-sensitive gyp dependency', () => {
    expect(PATCH).not.toContain('+        "../../node-addon-api')
    expect(PATCH).toContain('+          "include_dirs": ["deps/node-addon-api"],')
    expect(PATCH).toContain('+          "defines": ["NAPI_CPP_EXCEPTIONS", "_HAS_EXCEPTIONS=1"],')
    // Staging lives in the shared module both build paths call, not in the
    // relay script that used to own it.
    const sourceModule = readFileSync(
      join(projectDir, 'config/scripts/ensure-windows-process-tree-source.mjs'),
      'utf8'
    )
    expect(sourceModule).toContain(
      "const NAPI_HEADERS = ['napi.h', 'napi-inl.h', 'napi-inl.deprecated.h']"
    )
    expect(sourceModule).toContain('for (const header of NAPI_HEADERS)')
    expect(sourceModule).toContain("import { createRequire } from 'node:module'")
    expect(sourceModule).toContain("import { dirname, join } from 'node:path'")
    expect(sourceModule).toContain(
      "createRequire(join(packageDir, 'package.json')).resolve('node-addon-api/package.json')"
    )
    expect(sourceModule).toContain('Repaired un-applied pnpm patch hunks before build.')
  })

  it('resolves node_addon_api.gyp to a real file from the package directory', () => {
    const resolved = execFileSync(process.execPath, ['-p', RESOLVED_GYP], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8'
    }).trim()
    expect(isAbsolute(resolved)).toBe(true)
    expect(existsSync(resolved)).toBe(true)
  })
})
