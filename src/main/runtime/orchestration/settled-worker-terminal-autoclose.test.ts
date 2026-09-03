import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../orca-runtime'
import { autoCloseSettledWorkerTerminal } from './settled-worker-terminal-autoclose'

const completeWorkerTerminalRelease = vi.hoisted(() =>
  vi.fn(async () => ({ state: 'released', processAction: 'closed_agent_terminal' }))
)

vi.mock('../rpc/methods/orchestration-worker-release-completion', () => ({
  completeWorkerTerminalRelease
}))

vi.mock('../../observability/diagnostic-log', () => ({ writeDiagnosticLine: vi.fn() }))

function makeRuntime(options: {
  autoClose: boolean
  disposition?: 'requested' | 'retained' | 'already_released'
  federated?: boolean
}): {
  runtime: OrcaRuntimeService
  requestWorkerTerminalRelease: ReturnType<typeof vi.fn>
} {
  const requestWorkerTerminalRelease = vi.fn(() =>
    options.disposition === 'retained'
      ? { disposition: 'retained', resource: null, reason: 'user_takeover' }
      : options.disposition === 'already_released'
        ? { disposition: 'already_released', resource: { id: 'res-1' } }
        : { disposition: 'requested', resource: { id: 'res-1' } }
  )
  const runtime = {
    shouldAutoCloseSettledWorkerTerminals: () => options.autoClose,
    getOrchestrationDb: () => ({
      getFederatedDispatch: () => (options.federated ? { id: 'dispatch-1' } : undefined),
      requestWorkerTerminalRelease
    })
  } as unknown as OrcaRuntimeService
  return { runtime, requestWorkerTerminalRelease }
}

describe('autoCloseSettledWorkerTerminal', () => {
  beforeEach(() => {
    completeWorkerTerminalRelease.mockClear()
  })

  it('does nothing while the preference is off', () => {
    const { runtime, requestWorkerTerminalRelease } = makeRuntime({ autoClose: false })

    autoCloseSettledWorkerTerminal(runtime, 'dispatch-1')

    expect(requestWorkerTerminalRelease).not.toHaveBeenCalled()
    expect(completeWorkerTerminalRelease).not.toHaveBeenCalled()
  })

  it('releases the worker terminal — closing its tab — once the preference is on', async () => {
    const { runtime } = makeRuntime({ autoClose: true })

    autoCloseSettledWorkerTerminal(runtime, 'dispatch-1')

    await vi.waitFor(() =>
      expect(completeWorkerTerminalRelease).toHaveBeenCalledWith(
        expect.objectContaining({ dispatchId: 'dispatch-1', resource: { id: 'res-1' } })
      )
    )
  })

  it('leaves a terminal the user took over alone', async () => {
    const { runtime, requestWorkerTerminalRelease } = makeRuntime({
      autoClose: true,
      disposition: 'retained'
    })

    autoCloseSettledWorkerTerminal(runtime, 'dispatch-1')

    await vi.waitFor(() => expect(requestWorkerTerminalRelease).toHaveBeenCalled())
    expect(completeWorkerTerminalRelease).not.toHaveBeenCalled()
  })

  it('never closes a terminal a connected worker server owns', () => {
    const { runtime, requestWorkerTerminalRelease } = makeRuntime({
      autoClose: true,
      federated: true
    })

    autoCloseSettledWorkerTerminal(runtime, 'dispatch-1')

    expect(requestWorkerTerminalRelease).not.toHaveBeenCalled()
    expect(completeWorkerTerminalRelease).not.toHaveBeenCalled()
  })
})
