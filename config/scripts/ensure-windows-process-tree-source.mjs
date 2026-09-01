import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stageWindowsProcessTreeNodeAddonApiHeaders } from './windows-process-tree-gyp-rebuild.mjs'

export function windowsProcessTreePackageDir(projectDir) {
  return join(projectDir, 'node_modules', '@vscode', 'windows-process-tree')
}

/**
 * Stage what node-gyp needs before building `@vscode/windows-process-tree`.
 *
 * The pnpm patch points `include_dirs` at `deps/node-addon-api` because
 * node-addon-api reports its own paths relative to cwd (`include_dir` resolves
 * to `../../../../node-addon-api@7.1.0/...`), and node-gyp on Windows evaluates
 * those from the pnpm store realpath. Nothing fills that directory, so every
 * build path must stage the headers itself or the compile dies on `napi.h`.
 *
 * The gyp rewrites are a fallback for a patch that stopped applying: pnpm skips
 * a broken hunk silently, which is what `pnpm-patch-integrity.test.mjs` guards.
 *
 * @returns {boolean} false when the optional package is not installed.
 */
export function ensureWindowsProcessTreeBuildSource(projectDir) {
  const packageDir = windowsProcessTreePackageDir(projectDir)
  if (!existsSync(packageDir)) {
    return false
  }
  const bindingPath = join(packageDir, 'binding.gyp')
  const processPath = join(packageDir, 'src', 'process.cc')
  // Why: header staging must still run for a package whose sources node-gyp never reads.
  const repairable = existsSync(bindingPath) && existsSync(processPath)
  let bindingGyp = repairable ? readFileSync(bindingPath, 'utf8') : ''
  let processCc = repairable ? readFileSync(processPath, 'utf8') : ''
  const originalBinding = bindingGyp
  const originalProcess = processCc

  for (const dynamicDependency of [
    String.raw`<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except`,
    String.raw`<!(node -p \"require.resolve('node-addon-api/node_addon_api.gyp')\"):node_addon_api_except`,
    '../../node-addon-api/node_addon_api.gyp:node_addon_api_except'
  ]) {
    bindingGyp = bindingGyp.replace(`"${dynamicDependency}",`, '')
  }
  bindingGyp = bindingGyp.replace(
    '"include_dirs": []',
    '"include_dirs": ["deps/node-addon-api"],\n          "defines": ["NAPI_CPP_EXCEPTIONS", "_HAS_EXCEPTIONS=1"]'
  )
  if (!bindingGyp.includes('"ExceptionHandling": 1')) {
    bindingGyp = bindingGyp.replace(
      '"VCCLCompilerTool": {',
      '"VCCLCompilerTool": {\n              "ExceptionHandling": 1,'
    )
  }
  bindingGyp = bindingGyp.replace(
    /\r?\n\s*"msvs_configuration_attributes": \{\s*"SpectreMitigation": "Spectre"\s*\},?/s,
    ''
  )
  processCc = processCc.replace(/process_count < 1024 && /, '')

  if (bindingGyp !== originalBinding) {
    writeFileSync(bindingPath, bindingGyp)
  }
  if (processCc !== originalProcess) {
    writeFileSync(processPath, processCc)
  }
  stageWindowsProcessTreeNodeAddonApiHeaders(packageDir)
  if (bindingGyp !== originalBinding || processCc !== originalProcess) {
    console.warn('[windows-process-tree] Repaired un-applied pnpm patch hunks before build.')
  }
  return true
}
