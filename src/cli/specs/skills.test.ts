import { describe, expect, it } from 'vitest'
import { effectiveAllowedFlags } from '../args'
import { formatCommandHelp } from '../help'
import { SKILL_COMMAND_SPECS } from './skills'

function spec(path: string): (typeof SKILL_COMMAND_SPECS)[number] {
  const found = SKILL_COMMAND_SPECS.find((entry) => entry.path.join(' ') === path)
  if (!found) {
    throw new Error(`Missing skill spec: ${path}`)
  }
  return found
}

describe('skill command specs', () => {
  it('describes compact retrieval as the default and --full as the full guide', () => {
    const help = formatCommandHelp(spec('skills get'))

    expect(help).toContain('Prints the compact guide by default')
    expect(help).toContain('--full                 Print the full guide with bundled references')
    expect(help).not.toContain('--full                 Include all supported V1 issue context')
  })

  it('documents the per-reference selector beside --full', () => {
    const help = formatCommandHelp(spec('skills get'))

    expect(help).toContain('Usage: orca skills get <topic> [--full | --reference <name>] [--json]')
    expect(help).toContain('--reference <name>     Print one bundled reference by name')
    expect(help).toContain('--references           List the bundled reference names for a topic')
    expect(help).toContain('orca skills get orchestration --reference recovery-and-cleanup')
    expect(effectiveAllowedFlags(spec('skills get'))).toEqual(
      expect.arrayContaining(['reference', 'references'])
    )
  })

  // Replaces upstream's `skills share` flag-surface assertion: the command is gone, and what
  // matters now is that it cannot come back through an unnoticed spec restore on a sync.
  it('exposes no publishing command and keeps the local lanes', () => {
    const paths = SKILL_COMMAND_SPECS.map((entry) => entry.path.join(' '))

    expect(paths).not.toContain('skills share')
    expect(paths).toEqual(
      expect.arrayContaining(['skills installed', 'skills list', 'skills get', 'skills install'])
    )
    expect(spec('skills installed').notes?.join(' ')).not.toContain('skills share')
  })
})
