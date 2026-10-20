// @vitest-environment happy-dom

// Behavioural gate for the corporate skill bundle's takeover of the skill setup panels: for a
// name the bundle owns, Install/Update must reach the bundle lane and never the build's
// `orca skills install`, which would overwrite the fleet's customized skill with the stub.

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillFreshnessInventory } from '../../../../shared/skill-freshness'
import type { CorporateSkillBundleStatus } from '../../../../shared/corporate-skill-bundle'
import { _skillFreshnessCacheForTests } from '@/hooks/useSkillFreshness'
import { resetCorporateSkillBundleStoreForTests } from '../app-update/corporate-skill-bundle-store'
import { TooltipProvider } from '../ui/tooltip'
import { AgentSkillSetupPanel } from './AgentSkillSetupPanel'

vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  notifyInstalledAgentSkillsChanged: vi.fn(),
  notifyInstalledAgentSkillsRefreshed: vi.fn()
}))

vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: ({ command }: { command: string }) => (
    <div data-testid="setup-terminal">{command}</div>
  )
}))

const TARGET = { host: 'github.samsungds.net', repository: 'daegun-kim/ORCA_skill' }
const COMMIT = 'e'.repeat(40)

function observed(state: 'available' | 'up-to-date', names: string[]): CorporateSkillBundleStatus {
  const base = {
    target: TARGET,
    checkedAt: 1,
    branch: 'main',
    commitSha: COMMIT,
    skills: names.map((name) => ({
      name,
      placements: [
        { home: 'agents' as const, path: `/h/.agents/skills/${name}`, state: 'current' as const }
      ]
    }))
  }
  return state === 'available'
    ? { ...base, state, changedNames: [names[0]], dismissed: false }
    : { ...base, state }
}

const EMPTY_INVENTORY: SkillFreshnessInventory = {
  schemaVersion: 1,
  installations: [],
  eligibleUpdateNames: [],
  scanIssues: [],
  scannedAt: 1
}

const lane = {
  getStatus: vi.fn(),
  check: vi.fn(),
  update: vi.fn(),
  dismiss: vi.fn(),
  onStatus: vi.fn(() => () => undefined)
}

function installApi(status: CorporateSkillBundleStatus): void {
  lane.getStatus.mockResolvedValue(status)
  lane.check.mockResolvedValue(status)
  lane.update.mockResolvedValue({
    ok: true,
    commitSha: COMMIT,
    installedNames: ['orca-cli', 'orchestration'],
    skippedPaths: [],
    status
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: { freshnessInventory: vi.fn().mockResolvedValue(EMPTY_INVENTORY) },
      appUpdate: { skillBundle: lane },
      ui: { writeClipboardText: vi.fn() }
    }
  })
}

function panelProps(skillName: string): ComponentProps<typeof AgentSkillSetupPanel> {
  return {
    title: 'Orchestration skill',
    description: null,
    command: `orca skills install --skill ${skillName}`,
    terminalTitle: 'Orchestration setup',
    terminalAriaLabel: 'Orchestration skill install terminal',
    terminalWorktreeId: 'settings-orchestration-skill-terminal',
    installed: true,
    loading: false,
    error: null,
    freshnessSkillName: skillName,
    onRecheck: vi.fn()
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function mount(skillName: string): Promise<void> {
  await act(async () =>
    root?.render(
      <TooltipProvider>
        <AgentSkillSetupPanel {...panelProps(skillName)} />
      </TooltipProvider>
    )
  )
  await act(async () => {})
}

async function clickButton(label: string): Promise<void> {
  const button = [...(container?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  expect(button, `button "${label}"`).toBeDefined()
  await act(async () => button?.click())
  await act(async () => {})
}

function terminalOpened(): boolean {
  return container?.querySelector('[data-testid="setup-terminal"]') != null
}

beforeEach(() => {
  _skillFreshnessCacheForTests.reset()
  resetCorporateSkillBundleStoreForTests()
  for (const fn of [lane.getStatus, lane.check, lane.update, lane.dismiss]) {
    fn.mockReset()
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
  resetCorporateSkillBundleStoreForTests()
  Reflect.deleteProperty(window, 'api')
})

describe('a skill the corporate bundle owns', () => {
  it('updates the whole bundle from the corporate repository instead of opening the build install', async () => {
    installApi(observed('available', ['orca-cli', 'orchestration', 'ponytail']))
    await mount('orchestration')

    expect(container?.textContent).toContain('Update available')
    expect(container?.textContent).toContain('github.samsungds.net/daegun-kim/ORCA_skill')
    expect(container?.textContent).toContain('orca-cli, orchestration, ponytail')

    await clickButton('Update')

    expect(lane.update).toHaveBeenCalledTimes(1)
    expect(terminalOpened()).toBe(false)
  })

  it('reports the bundle verdict, not the build one', async () => {
    installApi(observed('up-to-date', ['orchestration']))
    await mount('orchestration')
    expect(container?.textContent).toContain('Up to date')
  })

  it('keeps the names a failed check still owns, and never falls back to the build install', async () => {
    installApi({
      state: 'unavailable',
      reason: 'lookup-failed',
      target: TARGET,
      checkedAt: 1,
      managedNames: ['orca-cli', 'orchestration']
    })
    await mount('orca-cli')

    expect(container?.textContent).toContain('Check failed')
    await clickButton('Update')
    expect(lane.update).toHaveBeenCalledTimes(1)
    expect(terminalOpened()).toBe(false)
  })

  it('asks the lane at once when the panel opens before the first background check', async () => {
    installApi({ state: 'unknown', managedNames: [] })
    await mount('orchestration')
    expect(lane.check).toHaveBeenCalled()
  })
})

describe('a skill the corporate bundle does not own', () => {
  it('keeps the build install for a name outside the bundle', async () => {
    installApi(observed('available', ['orca-cli', 'orchestration']))
    await mount('orca-linear')

    await clickButton('Update')
    expect(lane.update).not.toHaveBeenCalled()
    expect(terminalOpened()).toBe(true)
  })

  it('hands every name back to the build when the administrator turned the lane off', async () => {
    installApi({ state: 'disabled' })
    await mount('orchestration')

    await clickButton('Update')
    expect(lane.update).not.toHaveBeenCalled()
    expect(terminalOpened()).toBe(true)
  })
})
