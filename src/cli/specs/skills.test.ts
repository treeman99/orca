import { describe, expect, it } from 'vitest'
import { SKILL_COMMAND_SPECS } from './skills'

function spec(path: string): (typeof SKILL_COMMAND_SPECS)[number] {
  const found = SKILL_COMMAND_SPECS.find((entry) => entry.path.join(' ') === path)
  if (!found) {
    throw new Error(`Missing skill spec: ${path}`)
  }
  return found
}

describe('skill command specs', () => {
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
