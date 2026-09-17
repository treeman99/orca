import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// Fork: uninstalling Orca removes the session search index, and an update never does.
// Nothing here can run NSIS; this pins the macro's shape so a merge cannot silently drop the delete
// or move it outside the update guard.

const HOOKS = readFileSync(join(process.cwd(), 'config/nsis/orca-installer-hooks.nsh'), 'utf8')
const INDEX_FILES = ['', '-wal', '-shm', '-journal'].map(
  (suffix) => `Delete "$APPDATA\\Orca\\ai-vault\\session-search.sqlite${suffix}"`
)

function uninstallMacro() {
  const start = HOOKS.indexOf('!macro customUnInstall')
  const end = HOOKS.indexOf('!macroend', start)
  expect(start).toBeGreaterThanOrEqual(0)
  return HOOKS.slice(start, end)
}

/** The body of the first `${ifNot} ${isUpdated}` block, matched to its own `${endIf}`. */
function genuineUninstallBlock(macro) {
  const open = macro.indexOf('${ifNot} ${isUpdated}')
  expect(open).toBeGreaterThanOrEqual(0)
  const tokens = /\$\{(ifNot|if|endIf)\}/g
  tokens.lastIndex = open + 1
  let depth = 1
  for (let match = tokens.exec(macro); match; match = tokens.exec(macro)) {
    depth += match[1] === 'endIf' ? -1 : 1
    if (depth === 0) {
      return macro.slice(open, match.index)
    }
  }
  throw new Error('unterminated ${ifNot} ${isUpdated} block')
}

it('deletes every session search index file on a genuine uninstall', () => {
  const block = genuineUninstallBlock(uninstallMacro())
  for (const line of INDEX_FILES) {
    expect(block).toContain(line)
  }
})

it('never deletes the index outside the update guard', () => {
  const macro = uninstallMacro()
  const outside = macro.replace(genuineUninstallBlock(macro), '')
  expect(outside).not.toContain('session-search.sqlite')
})

it('reads APPDATA as the uninstalling user even on a per-machine install', () => {
  const block = genuineUninstallBlock(uninstallMacro())
  const current = block.indexOf('SetShellVarContext current')
  const firstDelete = block.indexOf(INDEX_FILES[0])
  const restore = block.indexOf('SetShellVarContext all')
  expect(current).toBeGreaterThanOrEqual(0)
  expect(current).toBeLessThan(firstDelete)
  expect(restore).toBeGreaterThan(firstDelete)
})

it('names the same file the app writes', async () => {
  const { sessionSearchDatabasePath } =
    await import('../../src/main/ai-vault-search/session-search-database-path.ts')
  expect(sessionSearchDatabasePath('ROOT').replaceAll('\\', '/')).toBe(
    'ROOT/ai-vault/session-search.sqlite'
  )
})
