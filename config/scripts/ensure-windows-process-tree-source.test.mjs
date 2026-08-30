import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ensureWindowsProcessTreeBuildSource,
  windowsProcessTreePackageDir
} from './ensure-windows-process-tree-source.mjs'

const projectDir = resolve(import.meta.dirname, '../..')

describe('windows-process-tree build source', () => {
  // The patch redirects include_dirs into the package, so whatever it names has
  // to hold the headers by the time node-gyp runs -- otherwise the Windows
  // compile fails with C1083 on napi.h.
  it('stages napi headers into the directory binding.gyp includes', () => {
    expect(ensureWindowsProcessTreeBuildSource(projectDir)).toBe(true)
    const packageDir = windowsProcessTreePackageDir(projectDir)
    const includeDirs = JSON.parse(
      /"include_dirs":\s*(\[[^\]]*\])/.exec(
        readFileSync(join(packageDir, 'binding.gyp'), 'utf8')
      )[1]
    )
    expect(includeDirs).not.toEqual([])
    for (const header of ['napi.h', 'napi-inl.h', 'napi-inl.deprecated.h']) {
      expect(
        includeDirs.some((dir) => existsSync(join(packageDir, dir, header))),
        `${header} is missing from ${includeDirs.join(', ')}`
      ).toBe(true)
    }
  })

  // Both build paths need the staging: the relay addon build and the Electron
  // native rebuild that postinstall and electron-builder's beforeBuild run.
  it.each([
    ['config/scripts/rebuild-native-deps.mjs'],
    ['config/scripts/build-windows-process-tree-relay-addon.mjs']
  ])('%s stages the source before node-gyp', (scriptPath) => {
    expect(readFileSync(join(projectDir, scriptPath), 'utf8')).toContain(
      'ensureWindowsProcessTreeBuildSource('
    )
  })
})
