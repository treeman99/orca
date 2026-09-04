// The gate that makes CLAUDE.md's fork-feature ledger enforceable.
//
// Why this exists at all: every gate this fork inserts into an upstream-owned file is
// a line nothing else references. When upstream splits that file — v1.4.196 retired 34
// `max-lines` bypasses in one release and dissolved most of them — the surrounding code
// moves and the inserted line does not. Typecheck stays green (nobody imported it), the
// tests that bracket the seam stay green (they mock either side of it), and the feature
// is simply gone. That has now happened across v1.4.176, .178, .182, .188, .193, .195
// and .196; each time it was found by a user, not by CI.
//
// So the ledger names, per feature, the exact text a merge must not drop, plus the
// surfaces that must not come back. A resolved anchor is not proof the feature works —
// it is proof the load-bearing line still exists somewhere a person decided it belongs.
// Behavioural tests remain the real coverage; this catches the silent deletion first.
//
// Adding a fork feature? Add it to config/fork-feature-ledger.json in the same commit.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '..', '..')
const ledger = JSON.parse(
  readFileSync(join(projectDir, 'config', 'fork-feature-ledger.json'), 'utf8')
)

function read(relativePath) {
  return readFileSync(join(projectDir, relativePath), 'utf8')
}

/** Consumers of one policy switch, excluding the resolver and its own tests. */
function countPolicySwitchConsumers(switchName) {
  const out = execFileSync(
    'git',
    ['grep', '-c', '--', `.${switchName}`, '--', 'src/'],
    { cwd: projectDir, encoding: 'utf8' }
  )
  let total = 0
  for (const line of out.split('\n')) {
    if (!line) {
      continue
    }
    const separator = line.lastIndexOf(':')
    const file = line.slice(0, separator)
    if (file.includes('.test.') || file.includes('.spec.')) {
      continue
    }
    if (file.startsWith('src/shared/enterprise-policy')) {
      continue
    }
    total += Number(line.slice(separator + 1)) || 0
  }
  return total
}

/** Entries in `dirname(pattern)` matching its `*`-bearing basename; [] when the directory is gone. */
function matchesInDirectory(pattern) {
  const directory = join(projectDir, dirname(pattern))
  if (!existsSync(directory)) {
    return []
  }
  const basename = pattern.slice(pattern.lastIndexOf('/') + 1)
  const matcher = new RegExp(
    `^${basename.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`
  )
  return readdirSync(directory).filter((entry) => matcher.test(entry))
}

describe('fork feature ledger', () => {
  it('lists at least one anchor for every feature', () => {
    expect(ledger.features.length).toBeGreaterThan(0)
    for (const feature of ledger.features) {
      expect(feature.id, JSON.stringify(feature)).toMatch(/^[a-z0-9-]+$/)
      expect(feature.summary.length, feature.id).toBeGreaterThan(10)
      expect(feature.present.length, feature.id).toBeGreaterThan(0)
    }
  })

  it.each(ledger.features.map((feature) => [feature.id, feature]))(
    'keeps every anchor of %s',
    (_id, feature) => {
      for (const anchor of feature.present) {
        expect(existsSync(join(projectDir, anchor.file)), `${feature.id}: ${anchor.file} is gone`).toBe(
          true
        )
        // Why the message spells out the recovery: whoever hits this is mid-merge and
        // needs to know the line moved with upstream's code, not that it was wrong.
        expect(
          read(anchor.file).includes(anchor.contains),
          `${feature.id}: ${anchor.file} no longer contains ${JSON.stringify(anchor.contains)}. ` +
            'Upstream likely moved this code — find its new home and re-apply the fork line there, ' +
            'then update config/fork-feature-ledger.json.'
        ).toBe(true)
      }
    }
  )

  it('keeps every removed surface removed', () => {
    for (const path of ledger.absentPaths) {
      const message =
        `${path} came back. Upstream re-adds a removed surface as NEW files, which merges ` +
        'without a conflict — delete it again (README §6).'
      // A `*` in the last segment names a family, not one file: upstream keeps adding
      // members to the cloud-relay workflow set, and an exact list would go stale silently.
      if (path.includes('*')) {
        expect(matchesInDirectory(path), message).toEqual([])
        continue
      }
      expect(existsSync(join(projectDir, path)), message).toBe(false)
    }
  })

  it.each(ledger.absentSymbols.map((entry) => [`${entry.file}:${entry.symbol}`, entry]))(
    'keeps %s out',
    (_label, entry) => {
      expect(read(entry.file).includes(entry.symbol), entry.why).toBe(false)
    }
  )

  // Why a floor and not an exact count: upstream legitimately adds call sites to a lane
  // this fork already gates, and that must not fail the build. A drop below the floor is
  // the direction that means a gate was lost.
  it.each(Object.entries(ledger.policySwitchMinConsumers))(
    '%s keeps at least its recorded consumers',
    (switchName, minimum) => {
      expect(
        countPolicySwitchConsumers(switchName),
        `${switchName} lost consumers. A merge dropped a gate, or the code moved and the ` +
          'gate did not follow.'
      ).toBeGreaterThanOrEqual(minimum)
    }
  )
})
