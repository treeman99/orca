import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANONICAL_GUIDE_NAMES, STUB_TOPICS } from './generate-bundled-skill-guides.mjs'

const projectDir = path.resolve(import.meta.dirname, '../..')

/**
 * Third-party engineering-discipline skills this fork vendors so a locked-down corporate
 * install gets them without npx, GitHub, or a plugin marketplace. The whole reason they may
 * ship is that they reach no network, so that property is a gate, not a claim in a doc.
 */
const QUALITY_SKILLS = [
  'verification-before-completion',
  'test-driven-development',
  'systematic-debugging',
  'karpathy-guidelines',
  'claude-md-improver'
]

/**
 * Every way a skill file could pull something over the network. `npm test` and `pnpm test`
 * are deliberately absent: they run the user's own suite and fetch nothing.
 */
const NETWORK_PATTERNS = [
  /https?:\/\//,
  /\bWebFetch\b/,
  /\bWebSearch\b/,
  /\bmcp__/,
  /\bcurl\b/,
  /\bwget\b/,
  /\buvx\b/,
  /\bnpx\s/,
  /\bpip install\b/,
  /\bnpm install\b/
]

/**
 * The one accepted hit, kept explicit so a re-vendor cannot widen it silently: the skill
 * writes a Quick Start section into a CLAUDE.md, and `npm install` is a line of that
 * template's example content. Nothing runs it.
 */
const ALLOWED_HITS = new Map([['claude-md-improver/SKILL.md', /\bnpm install\b/]])

async function walk(dir, base = dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(full, base)))
    } else if (entry.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'))
    }
  }
  return out
}

describe('bundled quality skills', () => {
  it('ships each one as a full skill, never a discovery stub', () => {
    // A stub tells the reader to run `orca skills get`. These are handed to Codex, Gemini and
    // OpenCode workers too, and those have no Orca CLI guarantee — the bytes must be the skill.
    for (const name of QUALITY_SKILLS) {
      expect(CANONICAL_GUIDE_NAMES, name).toContain(name)
      expect(STUB_TOPICS, name).not.toContain(name)
    }
  })

  it('carries a license file next to every vendored skill', async () => {
    for (const name of QUALITY_SKILLS) {
      const license = path.join(projectDir, 'skills', name, 'LICENSE')
      expect((await stat(license)).size, name).toBeGreaterThan(0)
    }
  })

  it('records upstream provenance in the guide source', async () => {
    for (const name of QUALITY_SKILLS) {
      const guide = await readFile(path.join(projectDir, 'skill-guides', `${name}.md`), 'utf8')
      expect(guide, name).toContain('## 출처와 라이선스')
      expect(guide, name).toMatch(/- 라이선스: |- 저작권: /u)
    }
  })

  it('reaches no network from any shipped file', async () => {
    for (const name of QUALITY_SKILLS) {
      const root = path.join(projectDir, 'skills', name)
      for (const relative of await walk(root)) {
        // Upstream license texts cite their own canonical URL; that is provenance, not a fetch.
        if (relative === 'LICENSE') {
          continue
        }
        const text = await readFile(path.join(root, relative), 'utf8')
        const allowed = ALLOWED_HITS.get(`${name}/${relative}`)
        for (const pattern of NETWORK_PATTERNS) {
          if (allowed && allowed.source === pattern.source) {
            continue
          }
          expect(text, `${name}/${relative} matched ${pattern}`).not.toMatch(pattern)
        }
      }
    }
  })

  it('is routed by the orchestration guide rather than left to auto-trigger', async () => {
    const guide = await readFile(path.join(projectDir, 'skill-guides', 'orchestration.md'), 'utf8')
    const section = guide.match(/## Quality Skill Routing\n([\s\S]*?)(?=\n## )/u)?.[1] ?? ''

    expect(section).not.toBe('')
    for (const name of QUALITY_SKILLS) {
      expect(section, name).toContain(`\`${name}\``)
    }
    // The routing is worthless if the coordinator relies on description matching: a worker's
    // whole prompt is the preamble plus the TASK block.
    expect(section).toContain('Name the skill; do not rely on auto-trigger')
    expect(section).toContain('[QUALITY]')
    // C-1: a worker that opens a local prompt hangs until the run is abandoned.
    expect(section).toContain('orca orchestration ask')
    expect(section).toContain('never AskUserQuestion')
    // The skill that must reach every worker, and the ordering that makes it useful.
    expect(section).toContain('Verification belongs before `worker_done`, not after')
    // claude-md-improver writes project memory; a worker must never be handed that authority.
    expect(section).toContain('`claude-md-improver` is coordinator-only')
  })

  it('binds the coordinator to re-verify before it accepts or releases a worker', async () => {
    const guide = await readFile(path.join(projectDir, 'skill-guides', 'orchestration.md'), 'utf8')
    const guidance = guide.match(/## Agent Guidance\n([\s\S]*?)(?=\n## )/u)?.[1] ?? ''

    expect(guidance).toContain('Before `worker_done`, a worker runs the task')
    expect(guidance).toContain('Coordinators re-run the verification themselves')
    // Wrapped across a line break in the guide, so match tolerantly rather than by literal.
    expect(guidance).toMatch(/before\s+`worker-release`/u)
  })
})
