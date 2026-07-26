import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCorporateLlmEndpointsForTests,
  corporateLlmModelId,
  registerCorporateLlmEndpoints
} from '../../../../shared/corporate-llm-session-catalog'
import {
  resolveNativeChatSessionOptionDefaults,
  updateNativeChatSessionOptionDefaults
} from '../../../../shared/native-chat-session-option-defaults'
import type { PersistedNativeChatSessionOptions } from '../../../../shared/native-chat-session-options'
import { buildAgentStartupPlan } from '../../../../shared/tui-agent-startup'
import { clearNativeChatSessionOptionCacheForTests } from './native-chat-session-option-cache'
import { createNativeChatPtySessionOptions } from './native-chat-pty-session-options'

const ENDPOINT = { id: 'inhouse-qwen', label: '사내 LLM (Qwen3-Coder)' }
const MODEL_ID = corporateLlmModelId(ENDPOINT.id)

describe('choosing the corporate LLM endpoint from the model picker', () => {
  beforeEach(() => {
    clearNativeChatSessionOptionCacheForTests()
    registerCorporateLlmEndpoints([ENDPOINT])
  })
  afterEach(() => clearCorporateLlmEndpointsForTests())

  it('lists the provisioned endpoint alongside the vendor models', () => {
    const surface = createNativeChatPtySessionOptions({
      agent: 'claude',
      scopeKey: 'pty-1',
      mode: 'live',
      dispatchCommand: vi.fn()
    })!
    const model = surface.getSnapshot()[0]

    expect(model?.settable).toBe(true)
    expect(model?.kind.type === 'select' && model.kind.choices.at(-1)).toEqual({
      value: MODEL_ID,
      label: ENDPOINT.label
    })
  })

  it('records the pick for the next launch instead of typing a command at the agent', async () => {
    const dispatchCommand = vi.fn()
    const persistSelection = vi.fn()
    const surface = createNativeChatPtySessionOptions({
      agent: 'claude',
      scopeKey: 'pty-1',
      mode: 'live',
      reportedValues: { model: 'sonnet' },
      dispatchCommand,
      persistSelection
    })!

    await surface.setOption('model', MODEL_ID)

    // A backend is chosen at spawn; /model would be a lie sent to a live process.
    expect(dispatchCommand).not.toHaveBeenCalled()
    expect(persistSelection).toHaveBeenCalledWith({
      modelId: MODEL_ID,
      optionId: 'model',
      value: MODEL_ID
    })
    expect(surface.getSnapshot()[0]).toMatchObject({
      id: 'model',
      valueSource: 'applied',
      kind: expect.objectContaining({ currentValue: MODEL_ID })
    })
  })

  it('carries the recorded pick into the next launch through persisted defaults', async () => {
    let persisted: PersistedNativeChatSessionOptions | undefined
    const surface = createNativeChatPtySessionOptions({
      agent: 'claude',
      scopeKey: 'pty-1',
      mode: 'live',
      reportedValues: { model: 'sonnet' },
      dispatchCommand: vi.fn(),
      persistSelection: ({ modelId, optionId, value }) => {
        persisted = updateNativeChatSessionOptionDefaults({
          persisted,
          agent: 'claude',
          modelId,
          optionId,
          value
        })
      }
    })!

    await surface.setOption('model', MODEL_ID)
    const plan = buildAgentStartupPlan({
      agent: 'claude',
      prompt: 'ship it',
      cmdOverrides: {},
      platform: 'win32',
      sessionOptions: resolveNativeChatSessionOptionDefaults(persisted, 'claude')
    })

    expect(plan?.env).toEqual({ ORCA_CORPORATE_LLM_ENDPOINT: ENDPOINT.id })
  })

  it('still dispatches /model when the pick is an ordinary vendor model', async () => {
    const dispatchCommand = vi.fn()
    const surface = createNativeChatPtySessionOptions({
      agent: 'claude',
      scopeKey: 'pty-1',
      mode: 'live',
      reportedValues: { model: 'sonnet' },
      dispatchCommand
    })!

    await surface.setOption('model', 'opus')

    expect(dispatchCommand).toHaveBeenCalledWith('/model opus', expect.anything())
  })
})
