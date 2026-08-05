// @vitest-environment happy-dom
//
// Behavioural gate for `allowedAgents` on the agent rosters that are NOT the tab catalog.
//
// Why a second file next to agent-allowlist-surfaces.policy.test.tsx: those three screens
// all read the tab catalog, so one shared gate covers them. These three read two entirely
// different module constants — COMMIT_MESSAGE_AGENT_SPECS and AI_VAULT_AGENTS — and each
// reached for its raw list, so a fleet that hides Codex everywhere else still offered it as
// a commit-message writer and listed its sessions in the vault filter. Kept separate for the
// test-file line budget, not because the contract differs.
//
// Same delivery as the sibling file: the REAL policy module, fed the way main feeds it.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'
import {
  toEnterprisePolicyView,
  type EnterprisePolicyView
} from '../../../shared/enterprise-policy-view'
import { syncEnterprisePolicy } from './enterprise-policy-access'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AiCommitPrSettingsFields } from '@/components/feature-wall/AiCommitPrSettingsFields'
import { VaultViewMenu } from '@/components/right-sidebar/AiVaultViewMenu'
import { AI_VAULT_AGENTS } from '../../../shared/ai-vault-types'
import { listCommitMessageAgentCapabilities } from '../../../shared/commit-message-agent-spec'

const ALLOWED = ['claude', 'opencode'] as const
const BLOCKED = ['codex', 'copilot', 'gemini', 'cursor', 'grok'] as const

const CORPORATE_VIEW: EnterprisePolicyView = toEnterprisePolicyView(
  makeLockdownPolicy({ allowedAgents: [...ALLOWED] })
)
const UNRESTRICTED_VIEW: EnterprisePolicyView = toEnterprisePolicyView(makeEnterprisePolicy())

async function deliverPolicy(view: EnterprisePolicyView): Promise<void> {
  ;(window as unknown as { api?: unknown }).api = {
    enterprisePolicy: { get: async () => view }
  }
  await syncEnterprisePolicy()
}

function expectNoBlockedAgent(rendered: readonly string[]): void {
  const haystack = rendered.join('\n').toLowerCase()
  for (const blocked of BLOCKED) {
    expect({ blocked, present: haystack.includes(blocked) }).toEqual({ blocked, present: false })
  }
}

function renderCommitAgentPicker(): void {
  render(
    <TooltipProvider>
      <AiCommitPrSettingsFields
        config={{} as never}
        selectPortalRoot={null}
        agentSelectValue={undefined}
        activeCapability={undefined}
        activeModel={null}
        activeThinking={undefined}
        isCustom={false}
        unsupportedAgentLabel={null}
        onAgentChange={vi.fn()}
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        writeConfig={vi.fn()}
      />
    </TooltipProvider>
  )
}

/** Open the first combobox on screen and read back every option it offers. */
async function openedOptionTexts(): Promise<string[]> {
  const trigger = screen.getAllByRole('combobox')[0] ?? screen.getAllByRole('button')[0]
  if (!trigger) {
    throw new Error('nothing to open')
  }
  await userEvent.click(trigger)
  return screen.queryAllByRole('option').map((option) => option.textContent ?? '')
}

function renderVaultAgentFilter(): void {
  render(
    <TooltipProvider>
      <VaultViewMenu
        agents={AI_VAULT_AGENTS}
        sort="updated"
        group="project"
        hideEmptySessions={false}
        adjustmentCount={0}
        onAgentEnabledChange={vi.fn()}
        onAllAgentsEnabledChange={vi.fn()}
        onSortChange={vi.fn()}
        onGroupChange={vi.fn()}
        onHideEmptySessionsChange={vi.fn()}
        onReset={vi.fn()}
      />
    </TooltipProvider>
  )
}

async function vaultAgentRowTexts(): Promise<string[]> {
  await userEvent.click(screen.getAllByRole('button')[0] as HTMLElement)
  return screen
    .queryAllByRole('menuitemcheckbox')
    .map((item) => item.textContent ?? '')
    .filter((text) => text.trim() !== '')
}

beforeEach(async () => {
  await deliverPolicy(UNRESTRICTED_VIEW)
})

afterEach(() => {
  cleanup()
})

describe('Source control → AI text generation agent picker under allowedAgents', () => {
  // Guards the guard: if the roster ever stops carrying a blocked id, the case below
  // would pass while proving nothing.
  it('has blocked agents to hide in the first place', () => {
    const ids = listCommitMessageAgentCapabilities().map((capability) => capability.id)

    expect(ids).toEqual(expect.arrayContaining(['codex', 'copilot']))
  })

  it('offers the blocked agents when no corporate policy is deployed', async () => {
    renderCommitAgentPicker()

    expect((await openedOptionTexts()).join('\n').toLowerCase()).toContain('codex')
  })

  it('drops the agents the policy does not list', async () => {
    await deliverPolicy(CORPORATE_VIEW)
    renderCommitAgentPicker()

    const offered = await openedOptionTexts()
    expect(offered.join('\n').toLowerCase()).toContain('claude')
    expectNoBlockedAgent(offered)
  })
})

describe('AI Vault → agent filter under allowedAgents', () => {
  it('has blocked agents to hide in the first place', () => {
    expect(AI_VAULT_AGENTS).toEqual(expect.arrayContaining(['codex', 'gemini', 'copilot']))
  })

  it('offers the blocked agents when no corporate policy is deployed', async () => {
    renderVaultAgentFilter()

    expect((await vaultAgentRowTexts()).join('\n').toLowerCase()).toContain('codex')
  })

  it('drops the agents the policy does not list', async () => {
    await deliverPolicy(CORPORATE_VIEW)
    renderVaultAgentFilter()

    const rows = await vaultAgentRowTexts()
    expect(rows.join('\n').toLowerCase()).toContain('claude')
    expectNoBlockedAgent(rows)
  })
})
