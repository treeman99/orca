import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LinearAgentSkillGuide } from './LinearAgentSkillGuide'

const baseStatus = {
  connected: true,
  connectionChecking: false,
  skillInstalled: false,
  skillChecking: false,
  visibleInTasks: true
}

describe('LinearAgentSkillGuide', () => {
  it('renders the setup checklist with an inlined skill panel', () => {
    const markup = renderToStaticMarkup(
      <LinearAgentSkillGuide
        status={baseStatus}
        onOpenTaskSources={vi.fn()}
        onManageLinearAccess={vi.fn()}
        skillPanel={<div data-testid="skill-panel">Skill install panel</div>}
      />
    )

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
    const markup = renderToStaticMarkup(
      <LinearAgentSkillGuide
        status={{
          ...baseStatus,
          skillInstalled: true
        }}
        onOpenTaskSources={vi.fn()}
        onManageLinearAccess={vi.fn()}
        skillPanel={<div>Skill panel</div>}
      />
    )

    expect(markup).toContain('All set')
  })

  it('keeps durable progress while a skill recheck is in flight', () => {
    const markup = renderToStaticMarkup(
      <LinearAgentSkillGuide
        status={{
          ...baseStatus,
          skillInstalled: true,
          skillChecking: true
        }}
        onOpenTaskSources={vi.fn()}
        onManageLinearAccess={vi.fn()}
        skillPanel={<div>Skill panel</div>}
      />
    )

    expect(markup).toContain('Checking…')
    expect(markup).not.toContain('2 of 3 ready')
    expect(markup).not.toContain('All set')
  })

  it('keeps durable progress while a connection check is in flight', () => {
    const markup = renderToStaticMarkup(
      <LinearAgentSkillGuide
        status={{
          ...baseStatus,
          skillInstalled: true,
          connectionChecking: true
        }}
        onOpenTaskSources={vi.fn()}
        onManageLinearAccess={vi.fn()}
        skillPanel={<div>Skill panel</div>}
      />
    )

    expect(markup).toContain('Checking…')
    expect(markup).not.toContain('2 of 3 ready')
  })
})
