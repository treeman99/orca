import { describe, expect, it, vi } from 'vitest'
import { prepareRendererForAppRestart } from './renderer-restart-preparation'

describe('prepareRendererForAppRestart', () => {
  it('aborts when the dispatched shutdown checkpoint prevents unload', async () => {
    const eventTarget = new EventTarget()
    const started = vi.fn()
    const aborted = vi.fn()
    const checkpoint = vi.fn((event: Event) => event.preventDefault())
    eventTarget.addEventListener('restart-started', started)
    eventTarget.addEventListener('restart-aborted', aborted)
    eventTarget.addEventListener('beforeunload', checkpoint)

    await expect(
      prepareRendererForAppRestart(eventTarget, {
        startedEventName: 'restart-started',
        abortedEventName: 'restart-aborted'
      })
    ).rejects.toThrow('Renderer shutdown checkpoint was not completed.')

    expect(started).toHaveBeenCalledTimes(1)
    expect(checkpoint).toHaveBeenCalledTimes(1)
    expect(aborted).toHaveBeenCalledTimes(1)
  })
})
