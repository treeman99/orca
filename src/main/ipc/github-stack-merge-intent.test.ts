// Fork-owned: the stack-merge opt-in must travel from the renderer, never be supplied by main.
// Kept in its own file so an upstream split of the GitHub IPC suite cannot carry it away.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = await vi.hoisted(async () => {
  const { createGitHubIpcMocks } = await import('./github-ipc-module-mocks')
  return createGitHubIpcMocks()
})

vi.mock('electron', () => mocks.electron)
vi.mock('../github/client', () => mocks.client)
vi.mock('../github/work-item-details', () => mocks.workItemDetails)
vi.mock('../github/pr-refresh-coordinator', () => mocks.prRefresh)
vi.mock('../telemetry/client', () => mocks.telemetry)
vi.mock('../telemetry/cohort-classifier', () => mocks.cohort)
vi.mock('./ui', () => mocks.ui)

import { registerGitHubHandlers } from './github'
import { createGitHubIpcHarness } from './github-ipc-test-harness'

const { mergePR: mergePRMock } = mocks.client

describe('registerGitHubHandlers stack-merge intent', () => {
  const harness = createGitHubIpcHarness(mocks)
  const { handlers, store, stats } = harness

  beforeEach(harness.reset)

  // The renderer surfaces that cannot show a stack's scope send no opt-in; the handler must not
  // supply one on their behalf, or main is back to promoting stack merges silently.
  it('sends no stack-merge opt-in when the renderer did not confirm the scope', async () => {
    mergePRMock.mockResolvedValue({ ok: false, error: 'blocked' })

    registerGitHubHandlers(store as never, stats as never)

    await handlers['gh:mergePR'](
      { sender: { id: 1 } },
      { repoPath: '/workspace/repo', prNumber: 42, method: 'squash' }
    )

    expect(mergePRMock).toHaveBeenCalledWith(
      '/workspace/repo',
      42,
      'squash',
      null,
      null,
      {},
      undefined
    )
  })

  it('forwards the stack-merge opt-in from the review sidebar', async () => {
    mergePRMock.mockResolvedValue({ ok: true })

    registerGitHubHandlers(store as never, stats as never)

    await handlers['gh:mergePR'](
      { sender: { id: 1 } },
      {
        repoPath: '/workspace/repo',
        prNumber: 42,
        method: 'squash',
        stackMergeIntent: 'confirmed-stack-scope'
      }
    )

    expect(mergePRMock).toHaveBeenCalledWith(
      '/workspace/repo',
      42,
      'squash',
      null,
      null,
      {},
      'confirmed-stack-scope'
    )
  })
})
