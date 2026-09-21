import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LinearAgentSkillGuide, type LinearSetupReadiness } from './LinearAgentSkillGuide'

const baseReadiness: LinearSetupReadiness = {
  connected: true,
  checking: false,
  skillInstalled: false,
  skillChecking: false,
  skillUnverifiable: false,
  visible: true
}

function renderGuide(readiness: Partial<LinearSetupReadiness>): string {
  return renderToStaticMarkup(
    <LinearAgentSkillGuide
      readiness={{ ...baseReadiness, ...readiness }}
      onOpenTaskSources={vi.fn()}
      onManageLinearAccess={vi.fn()}
      skillPanel={<div data-testid="skill-panel">Skill install panel</div>}
    />
  )
}

describe('LinearAgentSkillGuide', () => {
  it('renders the setup checklist with an inlined skill panel', () => {
    const markup = renderGuide({})

    expect(markup).toContain('Setup checklist')
    // Fork: TASK_PROVIDERS is GitHub-only and the Task Sources pane is deleted, so the
    // third step and its button are not rendered and the checklist is two steps.
    expect(markup).toContain('1 of 2 ready')
    expect(markup).not.toContain('3. Show Linear in Tasks')
    expect(markup).not.toContain('Task Sources')
    expect(markup).toContain('Skill install panel')
    expect(markup).not.toContain('Ready below')
    expect(markup).not.toContain('Install below')
    expect(markup).not.toContain('Agent skill')
    expect(markup).not.toContain('Open Task Sources setup')
  })

  it('marks the checklist complete when every step is done', () => {
    expect(renderGuide({ skillInstalled: true })).toContain('All set')
  })

  it('keeps durable progress while a skill recheck is in flight', () => {
    const markup = renderGuide({ skillInstalled: true, skillChecking: true })

    expect(markup).toContain('Checking…')
    expect(markup).not.toContain('2 of 3 ready')
    expect(markup).not.toContain('All set')
  })

  it('keeps durable progress while a connection check is in flight', () => {
    const markup = renderGuide({ skillInstalled: true, checking: true })

    expect(markup).toContain('Checking…')
    expect(markup).not.toContain('2 of 3 ready')
  })

  // The reported bug: a scan that could not vouch for "not installed" was counted
  // as a step the user had left undone.
  it('reports an unverifiable skill scan as unknown instead of an unfinished step', () => {
    const markup = renderGuide({ skillUnverifiable: true })

    expect(markup).toContain('Cannot verify')
    // Fork: two steps, not three — see the first case.
    expect(markup).toContain('1/2')
    expect(markup).toContain('bg-amber-500')
    expect(markup).not.toContain('1 of 2 ready')
    expect(markup).not.toContain('All set')
  })

  it('still claims nothing while a rescan of an unverifiable step runs', () => {
    const markup = renderGuide({ skillUnverifiable: true, skillChecking: true })

    expect(markup).toContain('Checking…')
    expect(markup).not.toContain('Cannot verify')
  })

  it('lets a found skill outrank a stale unverifiable flag', () => {
    const markup = renderGuide({ skillInstalled: true, skillUnverifiable: true })

    expect(markup).toContain('All set')
    expect(markup).not.toContain('Cannot verify')
  })

  // The unknown-skill label is only the headline when the skill is the sole open
  // question; a plainly unfinished step must still read as the count.
  it('keeps the confirmed count when the unfinished step is the connection', () => {
    const markup = renderGuide({ connected: false, skillUnverifiable: true })

    // Fork: the visibility step is not counted, so nothing is confirmed yet.
    expect(markup).toContain('0 of 2 ready')
    expect(markup).not.toContain('Cannot verify')
  })

  // Fork: upstream headlines a hidden Linear over an unknown skill. This fork has no Tasks
  // pane and never shows that step, so `visible` must not change the pill at all.
  it('ignores Tasks visibility, which this fork neither shows nor counts', () => {
    const hidden = renderGuide({ visible: false, skillUnverifiable: true })
    const shown = renderGuide({ visible: true, skillUnverifiable: true })

    expect(hidden).toContain('Cannot verify')
    expect(hidden).toContain('1/2')
    expect(hidden).toBe(shown)
  })
})
