// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import { FirstPromptCard } from '../components/right-sidebar/ai-vault-first-prompt-card'
import { prepareAiVaultSessionForResume } from './ai-vault-session-resume-preparation'

// Fork: reuse restarts session search retention (src/main/ai-vault-search/session-search-reuse.ts).

afterEach(() => {
  cleanup()
})

function session(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'local:claude:s1:/repo/session.jsonl',
    executionHostId: 'local',
    agent: 'claude',
    sessionId: 's1',
    title: 'A past session',
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: '/repo/session.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-09-01T00:00:00.000Z',
    messageCount: 2,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: "claude --resume 's1'",
    subagent: null,
    ...overrides
  }
}

function stubApi(): { markSessionReused: ReturnType<typeof vi.fn> } {
  const markSessionReused = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      aiVault: {
        markSessionReused,
        prepareSessionResume: vi.fn(),
        getFirstUserPrompt: vi.fn().mockResolvedValue({ prompt: 'reuse this opening ask' })
      },
      ui: { writeClipboardText: vi.fn().mockResolvedValue(undefined) }
    }
  })
  return { markSessionReused }
}

it('marks a local session reused on every resume path, and never a remote one', async () => {
  const { markSessionReused } = stubApi()
  await prepareAiVaultSessionForResume(session())
  expect(markSessionReused).toHaveBeenCalledWith({
    filePath: '/repo/session.jsonl',
    executionHostId: 'local'
  })

  markSessionReused.mockClear()
  await prepareAiVaultSessionForResume(session({ executionHostId: 'ssh:box' }))
  expect(markSessionReused).not.toHaveBeenCalled()
})

it('never lets a failed stamp fail the resume', async () => {
  const { markSessionReused } = stubApi()
  markSessionReused.mockRejectedValue(new Error('child restarting'))
  await expect(prepareAiVaultSessionForResume(session())).resolves.toMatchObject({
    sessionId: 's1'
  })
})

it('counts copying the first prompt as reuse, and opening the card as not', async () => {
  const { markSessionReused } = stubApi()
  render(<FirstPromptCard session={session()} preview={null} />)
  await screen.findByText('reuse this opening ask')
  expect(markSessionReused).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: /copy/i }))
  await waitFor(() =>
    expect(markSessionReused).toHaveBeenCalledWith({
      filePath: '/repo/session.jsonl',
      executionHostId: 'local'
    })
  )
})
