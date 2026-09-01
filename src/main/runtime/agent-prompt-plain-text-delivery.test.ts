// Which bytes an Orca-written prompt actually puts on the wire.
//
// opencode under ConPTY never receives a bracketed-paste frame — the dispatched prompt lands
// nowhere and the pane sits empty, while the same text written as plain input arrives. Every
// prompt Orca writes goes through `sendTerminalAgentPrompt`, so the choice belongs there and is
// declared per agent, not per platform: the frame is correct for everyone else.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PROMPT_BRACKETED_PASTE_END,
  AGENT_PROMPT_BRACKETED_PASTE_START
} from '../../shared/agent-prompt-injection'
import { OrcaRuntimeService } from './orca-runtime'
import { makeStore } from './runtime-rpc-worktree-store-fixtures'

const WORKTREE_PATH = '/tmp/worktree-a'
const PTY_ID = 'pty-plain'
const PROMPT = 'run the task'

vi.mock('../git/worktree', () => {
  const worktrees = [
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'feature/plain-text',
      isBare: false,
      isMainWorktree: false
    }
  ]
  return {
    listWorktrees: vi.fn().mockResolvedValue(worktrees),
    listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
  }
})

async function writePrompt(
  launchAgent: 'opencode' | 'aider',
  prompt: string = PROMPT
): Promise<{ writes: string[]; joined: string }> {
  const runtime = new OrcaRuntimeService(makeStore() as never)
  const writes: string[] = []
  runtime.setPtyController({
    spawn: vi.fn().mockResolvedValue({ id: PTY_ID }),
    write: (_ptyId, data) => {
      writes.push(data)
      return true
    },
    kill: () => true,
    getForegroundProcess: async () => null
  })
  const { handle } = await runtime.createTerminal(`path:${WORKTREE_PATH}`, { launchAgent })
  const send = runtime.sendTerminalAgentPrompt(handle, prompt).catch(() => undefined)
  await vi.runAllTimersAsync()
  await send
  return { writes, joined: writes.join('') }
}

describe('agent prompt delivery mode', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes opencode a plain prompt with no paste frame', async () => {
    vi.useFakeTimers()
    const { writes, joined } = await writePrompt('opencode')

    expect(joined).toContain(PROMPT)
    expect(joined).not.toContain(AGENT_PROMPT_BRACKETED_PASTE_START)
    expect(joined).not.toContain(AGENT_PROMPT_BRACKETED_PASTE_END)
    // Still submitted: the point is the framing, not skipping Enter.
    expect(writes.filter((data) => data === '\r')).toHaveLength(1)
  })

  // Dropping the frame must not drop what it carried: a raw ESC in a prompt would otherwise
  // reach the pane as a control sequence instead of text.
  it('still neutralizes an escape in a plain-text prompt', async () => {
    vi.useFakeTimers()
    const { joined } = await writePrompt('opencode', 'before\x1b[31mafter')

    expect(joined).not.toContain('\x1b[31m')
    expect(joined).toContain('<ESC>[31mafter')
  })

  it('keeps the paste frame for an agent that reads one', async () => {
    vi.useFakeTimers()
    const { joined } = await writePrompt('aider')

    expect(joined).toContain(AGENT_PROMPT_BRACKETED_PASTE_START)
    expect(joined).toContain(AGENT_PROMPT_BRACKETED_PASTE_END)
  })
})
