// A source-level audit, not a behaviour test, and deliberately so: the runtime guard in
// profile-cloud-auth-config short-circuits before any endpoint is resolved, so no behavioural test
// can observe whether a vendor host is still sitting in the tree waiting for that guard to be
// dropped. An upstream merge restores those constants without touching the guard, and nothing
// else in the suite would notice. This is what notices.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The vendor account and relay hosts this build removes. Other `onorca.dev` addresses are
// intentionally still present and belong to unrelated features — the docs and changelog links, the
// plugin kill list, and the vendor-link guard's own host table — so match these two exactly.
const REMOVED_HOSTS = ['login.onorca.dev', 'relay.onorca.dev']

const SRC_ROOT = new URL('../../', import.meta.url).pathname
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

// The only two files allowed to name them, because naming them is their entire purpose: the module
// documenting what was removed, and this audit's own search list. Keep this list at two — a third
// entry means someone wanted an exception, which is the thing being guarded against.
const ALLOWED_TO_NAME_THEM = [
  'shared/orca-cloud-removal.ts',
  'main/orca-profiles/orca-cloud-host-absence.test.ts'
]

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') {
      continue
    }
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found)
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(full)
    }
  }
  return found
}

describe('removed Orca cloud hosts', () => {
  it('appear nowhere under src/, including tests and fixtures', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const relative = file.slice(SRC_ROOT.length)
      if (ALLOWED_TO_NAME_THEM.includes(relative)) {
        continue
      }
      const source = readFileSync(file, 'utf8')
      for (const host of REMOVED_HOSTS) {
        if (source.includes(host)) {
          offenders.push(`${relative} → ${host}`)
        }
      }
    }

    // Fixtures count too: a hostname that reads as sample data is still the string a reviewer
    // greps the bundle for, and still the value a careless copy turns back into a live default.
    expect(offenders).toEqual([])
  })
})
