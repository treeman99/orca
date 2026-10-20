import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// Fork: the installer seeds %ProgramData%\Orca\enterprise-policy.json only when it is absent.
// Nothing here can run NSIS; this pins the macro's shape so a merge cannot silently drop the
// seed, turn it into an overwrite, or let an uninstall delete a file an administrator may own.

const NSIS_DIR = join(process.cwd(), 'config', 'nsis')
const HOOKS = readFileSync(join(NSIS_DIR, 'orca-installer-hooks.nsh'), 'utf8')
const SEED_NSH = readFileSync(join(NSIS_DIR, 'enterprise-policy-machine-seed.nsh'), 'utf8')

function macroBody(source, name) {
  const start = source.indexOf(`!macro ${name}`)
  expect(start, name).toBeGreaterThanOrEqual(0)
  return source.slice(start, source.indexOf('!macroend', start))
}

it('runs the seed from customInstall', () => {
  expect(HOOKS).toContain('!include "${__FILEDIR__}\\enterprise-policy-machine-seed.nsh"')
  expect(macroBody(HOOKS, 'customInstall')).toContain(
    '!insertmacro ORCA_SEED_MACHINE_ENTERPRISE_POLICY'
  )
})

it('never overwrites an existing machine-wide file, and never prompts', () => {
  const body = macroBody(SEED_NSH, 'ORCA_SEED_MACHINE_ENTERPRISE_POLICY')
  // bFailIfExists = 1: the existence check and the write are one call.
  expect(body).toMatch(
    /kernel32::CopyFileW\(w "[^"]+", w "\$0\\Orca\\enterprise-policy\.json", i 1\)/
  )
  // `File` straight into ProgramData would overwrite, and its error prompt stalls a silent install.
  expect(body).not.toMatch(/File\s+"\/oname=\$0/)
})

it('ships the seed file the macro names', () => {
  expect(SEED_NSH).toContain(
    '!define ORCA_ENTERPRISE_POLICY_SEED "${__FILEDIR__}\\enterprise-policy.machine-seed.json"'
  )
  expect(existsSync(join(NSIS_DIR, 'enterprise-policy.machine-seed.json'))).toBe(true)
})

it('leaves the machine-wide file behind on uninstall', () => {
  expect(macroBody(HOOKS, 'customUnInstall')).not.toContain('enterprise-policy')
})
