import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')
// pnpm 12 moved every `pnpm.*` block out of package.json and into pnpm-workspace.yaml.
const patchPaths = readPatchedDependencyPaths(
  readFileSync(join(projectDir, 'pnpm-workspace.yaml'), 'utf8')
)

/** Two-space-indented `'<pkg>@<ver>': <path>` entries under `patchedDependencies:`. */
function readPatchedDependencyPaths(workspaceYaml) {
  const paths = []
  let inBlock = false
  for (const rawLine of workspaceYaml.split('\n')) {
    if (/^patchedDependencies:\s*$/.test(rawLine)) {
      inBlock = true
      continue
    }
    if (!inBlock) {
      continue
    }
    if (!/^\s+\S/.test(rawLine)) {
      break
    }
    const entry = /^\s+(?:'[^']+'|"[^"]+"|[^:]+):\s*(\S+)\s*$/.exec(rawLine)
    if (entry) {
      paths.push(entry[1])
    }
  }
  return paths
}

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/

/**
 * Count what each hunk actually contains, reading its whole body rather than
 * stopping at the count its header declares. Stopping early only catches a body
 * that is too short; a body that is too *long* — what a hand-edited hunk leaves
 * behind — then reads as a match. Both directions are corruption.
 */
function readHunks(patchText) {
  const lines = patchText.split('\n')
  const hunks = []
  let index = 0
  while (index < lines.length) {
    const header = HUNK_HEADER.exec(lines[index])
    if (!header) {
      index += 1
      continue
    }
    const declaredOld = header[1] === undefined ? 1 : Number(header[1])
    const declaredNew = header[2] === undefined ? 1 : Number(header[2])
    let oldSeen = 0
    let newSeen = 0
    let cursor = index + 1
    while (cursor < lines.length) {
      const line = lines[cursor]
      if (line.startsWith('@@') || line.startsWith('diff --git ') || line.startsWith('index ')) {
        break
      }
      // The trailing newline of the file is not a context line.
      if (line === '' && cursor === lines.length - 1) {
        break
      }
      if (line.startsWith('\\')) {
        cursor += 1
        continue
      }
      if (line.startsWith('+')) {
        newSeen += 1
      } else if (line.startsWith('-')) {
        oldSeen += 1
      } else if (line.startsWith(' ') || line === '') {
        oldSeen += 1
        newSeen += 1
      } else {
        break
      }
      cursor += 1
    }
    hunks.push({
      header: lines[index],
      line: index + 1,
      declaredOld,
      declaredNew,
      oldSeen,
      newSeen
    })
    index = cursor
  }
  return hunks
}

describe('pnpm patch integrity', () => {
  // Why this gate exists: pnpm applies a malformed hunk as a no-op, reports no
  // warning, and exits 0 -- even with `ignorePatchFailures: false`. A patch
  // edited by hand can therefore stop applying and only surface much later, as
  // a compiler error on the one platform that builds the patched source.
  // Why both directions: `@vscode/windows-process-tree@0.8.0` shipped a hunk
  // declaring -12 +11 over a body of -14 +13. pnpm 12 applied it anyway; pnpm 11
  // silently skipped it, and the Windows build failed with MSB8040.
  it.each(patchPaths)('%s has no hunk whose header disagrees with its body', (patchPath) => {
    const hunks = readHunks(readFileSync(join(projectDir, patchPath), 'utf8'))
    expect(hunks.length).toBeGreaterThan(0)
    const truncated = hunks
      .filter((hunk) => hunk.oldSeen !== hunk.declaredOld || hunk.newSeen !== hunk.declaredNew)
      .map(
        (hunk) =>
          `${patchPath}:${hunk.line} ${hunk.header} declares -${hunk.declaredOld} +${hunk.declaredNew}, body has -${hunk.oldSeen} +${hunk.newSeen}`
      )
    expect(truncated).toEqual([])
  })

  // The gyp hunks these patches carry are load-bearing on Windows: upstream asks
  // for Spectre-mitigated libraries the build agents do not install, so an
  // unapplied patch fails node-gyp with MSB8040 during the native rebuild.
  it.each([['node-pty'], ['@vscode/windows-process-tree']])(
    '%s installs without the upstream Spectre requirement',
    (moduleName) => {
      const bindingGyp = join(projectDir, 'node_modules', moduleName, 'binding.gyp')
      expect(existsSync(bindingGyp)).toBe(true)
      expect(readFileSync(bindingGyp, 'utf8')).not.toContain('SpectreMitigation')
    }
  )
})
