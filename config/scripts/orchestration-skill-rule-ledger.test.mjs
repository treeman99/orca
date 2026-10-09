// Fork-owned: the project rule ledger this fork adds to the binary-served orchestration guide.
// Upstream deleted orchestration-skill-guidance.test.mjs in v1.4.223 (#25791), which used to carry
// these assertions; they live here so the next upstream test cleanup cannot take them along.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')
const guidePath = join(projectDir, 'skill-guides', 'orchestration.md')
const stubPath = join(projectDir, 'skills', 'orchestration', 'SKILL.md')

function readKernel() {
  return readFileSync(guidePath, 'utf8')
}

/** One `## <title>` section of the kernel, up to the next heading. */
function getSection(text, title) {
  const start = text.indexOf(`## ${title}`)
  if (start === -1) {
    return ''
  }
  const next = text.indexOf('\n## ', start + 1)
  return next === -1 ? text.slice(start) : text.slice(start, next)
}

describe('orchestration project rule ledger', () => {
  // Why in the kernel and not a conditional reference: a rule the coordinator only reads
  // conditionally is a rule nothing ever injects.
  it('keeps the ledger section in the kernel, before the conditional references', () => {
    const kernel = readKernel()

    expect(kernel.indexOf('## Project Rule Ledger')).toBeGreaterThan(
      kernel.indexOf('## Completion accounting')
    )
    expect(kernel.indexOf('## Conditional references')).toBeGreaterThan(
      kernel.indexOf('## Project Rule Ledger')
    )
  })

  // Why: the ledger is fork-owned and lives mid-file, exactly where an upstream merge resolved
  // the wrong way drops it without a conflict marker or a type error. Assert the load point,
  // the injection contract, and the human gate separately — a merge that keeps the section but
  // loses `rules.md` from the opening sequence leaves a protocol nothing ever enters.
  it('carries the project rule ledger into the binary-served guide', () => {
    const ledger = getSection(readKernel(), 'Project Rule Ledger')

    expect(ledger).toContain('Read `.claude/harness/rules.md` once, before the first `task-create`')
    expect(ledger).toContain('inert where that directory is absent')
    expect(ledger).toContain('`scope` matches')
    expect(ledger).toContain('cap the selection at 5')
    expect(ledger).toContain('[PROJECT RULES]')
    expect(ledger).toContain('Never inject the whole file')
    expect(ledger).toContain('.claude/harness/candidates.md')
    expect(ledger).toContain('.claude/harness/retired.md')
    expect(ledger).toContain('Never promote silently')
    expect(ledger).toContain('never write a learning into `CLAUDE.md` or `AGENTS.md`')
    expect(ledger).toContain('observed twice')
    expect(ledger).toContain('12 blocks and 200 lines')
  })

  // Why: promotion criteria without a trigger point is a protocol that never runs. Both
  // boundaries must survive — end-of-run alone loses everything when a session dies mid-flight,
  // and start-of-run alone leaves the user answering for work they no longer remember.
  it('binds candidate settlement to both ledger boundaries', () => {
    const ledger = getSection(readKernel(), 'Project Rule Ledger')

    expect(ledger).toContain('After the last worker of a run settles')
    expect(ledger).toContain('at the start of the next run')
    expect(ledger).toContain('before the first `task-create`')
    expect(ledger).toContain('Never carry an unsettled candidate silently into a third run')
  })

  it('records added requirements, not only corrections to finished work', () => {
    const ledger = getSection(readKernel(), 'Project Rule Ledger')

    expect(ledger).toContain('corrects an accepted `worker_done`')
    expect(ledger).toContain('supplies a project-specific requirement mid-run')
    expect(ledger).toContain("a preference about this one task's output is not a rule")
  })

  it('makes the coordinator load the ledger as part of its opening sequence', () => {
    const opening = getSection(readKernel(), 'Canonical supervised loop')

    expect(opening).toContain('read `.claude/harness/rules.md` when that directory exists')
  })

  it('keeps the ledger out of the installable stub so it cannot drift from the binary', () => {
    const stub = readFileSync(stubPath, 'utf8')

    expect(stub).not.toContain('.claude/harness')
    expect(stub).not.toContain('PROJECT RULES')
  })
})
