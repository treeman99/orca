import { describe, expect, it, vi } from 'vitest'
import { completeMerge, type MergeCompletionSteps } from './merge-editor-completion'

function recordingSteps(overrides: Partial<MergeCompletionSteps> = {}) {
  const calls: string[] = []
  const steps: MergeCompletionSteps = {
    confirmWithUnhandled: async (count) => {
      calls.push(`confirm:${count}`)
      return true
    },
    save: async (content) => {
      calls.push(`save:${content}`)
      return true
    },
    stage: async () => {
      calls.push('stage')
    },
    refreshStatus: async () => {
      calls.push('refresh')
    },
    leaveMergeView: () => {
      calls.push('leave')
    },
    ...overrides
  }
  return { calls, steps }
}

describe('completeMerge', () => {
  it('asks first when conflicts are unhandled, then saves before staging', async () => {
    const { calls, steps } = recordingSteps()
    await expect(completeMerge('merged', 2, steps)).resolves.toEqual({ kind: 'completed' })
    expect(calls).toEqual(['confirm:2', 'save:merged', 'stage', 'refresh', 'leave'])
  })

  it('writes and stages nothing when the user backs out of the prompt', async () => {
    const { calls, steps } = recordingSteps({ confirmWithUnhandled: async () => false })
    await expect(completeMerge('merged', 1, steps)).resolves.toEqual({ kind: 'cancelled' })
    expect(calls).toEqual([])
  })

  it('does not ask when every conflict is handled', async () => {
    const { calls, steps } = recordingSteps()
    await completeMerge('merged', 0, steps)
    expect(calls[0]).toBe('save:merged')
  })

  it('never stages a result the save did not write', async () => {
    const { calls, steps } = recordingSteps({ save: async () => false })
    await expect(completeMerge('merged', 0, steps)).resolves.toEqual({ kind: 'not-saved' })
    expect(calls).toEqual([])
  })

  it('stays in the merge view when staging fails', async () => {
    const failure = new Error('index.lock exists')
    const { calls, steps } = recordingSteps({ stage: () => Promise.reject(failure) })
    await expect(completeMerge('merged', 0, steps)).resolves.toEqual({
      kind: 'stage-failed',
      error: failure
    })
    expect(calls).toEqual(['save:merged'])
  })

  it('still leaves once staged when only the status refresh fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { calls, steps } = recordingSteps({
      refreshStatus: () => Promise.reject(new Error('offline'))
    })
    await expect(completeMerge('merged', 0, steps)).resolves.toEqual({ kind: 'completed' })
    expect(calls).toEqual(['save:merged', 'stage', 'leave'])
  })
})
