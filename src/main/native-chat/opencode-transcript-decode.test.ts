import { describe, expect, it } from 'vitest'
import { compareOpenCodeIds, decodeOpenCodeMessage } from './opencode-transcript-decode'

// Shapes copied from a real session under ~/.local/share/opencode/storage.
const textPart = {
  id: 'prt_c131cea85001AM7KYU0iKtfbkH',
  type: 'text',
  text: '좋아, 헤더/본문/푸터 3영역 기준으로 진행할게.',
  time: { start: 1769847189208, end: 1769847189208 }
}
const toolPart = {
  id: 'prt_c131e96f7001MKU5or3leQdnd5',
  type: 'tool',
  callID: 'call_76V5R0UvjGn0QRAtTIFzdGLv',
  tool: 'glob',
  state: {
    status: 'completed',
    input: { pattern: '**/*', path: '/Users/daegun/Workspace' },
    output: 'No files found',
    time: { start: 1769847298338, end: 1769847298356 }
  }
}

// Real epoch ms: `timestampMs` treats small numbers as seconds, and opencode writes ms.
const assistant = {
  id: 'msg_c131e9217001Bx5mPLUxuqdk7L',
  role: 'assistant',
  time: { created: 1769847296535 }
}

describe('decodeOpenCodeMessage', () => {
  it('renders a text part as the message body', () => {
    expect(decodeOpenCodeMessage(assistant, [textPart])).toEqual([
      {
        id: textPart.id,
        role: 'assistant',
        blocks: [{ type: 'text', text: '좋아, 헤더/본문/푸터 3영역 기준으로 진행할게.' }],
        timestamp: 1769847189208,
        source: 'transcript'
      }
    ])
  })

  it('keys the bubble to the USER role from the envelope', () => {
    const [message] = decodeOpenCodeMessage({ ...assistant, role: 'user' }, [textPart])
    expect(message?.role).toBe('user')
  })

  // Codex's convention: a call and its result are separate bubbles so the renderer folds them
  // independently. opencode stores both on ONE part, so this is where they split.
  it('splits a tool part into a call and its result', () => {
    expect(decodeOpenCodeMessage(assistant, [toolPart])).toEqual([
      {
        id: `${toolPart.id}:call`,
        role: 'assistant',
        blocks: [
          {
            type: 'tool-call',
            name: 'glob',
            input: { pattern: '**/*', path: '/Users/daegun/Workspace' }
          }
        ],
        timestamp: 1769847298338,
        source: 'transcript'
      },
      {
        id: `${toolPart.id}:result`,
        role: 'tool',
        blocks: [{ type: 'tool-result', output: 'No files found' }],
        timestamp: 1769847298338,
        source: 'transcript'
      }
    ])
  })

  it('marks a failed tool result', () => {
    const failed = { ...toolPart, state: { status: 'error', error: 'boom', input: {} } }
    const [, result] = decodeOpenCodeMessage(assistant, [failed])
    expect(result?.blocks).toEqual([{ type: 'tool-result', output: 'boom', isError: true }])
  })

  // A running tool has no output yet, and the window is REPLACED on the next read rather than
  // appended to — an empty result bubble would render blank and then duplicate.
  it('emits only the call while a tool is still running', () => {
    const running = { ...toolPart, state: { status: 'running', input: {} } }
    expect(decodeOpenCodeMessage(assistant, [running]).map(({ role }) => role)).toEqual([
      'assistant'
    ])
  })

  it('drops turn bookkeeping and withheld reasoning', () => {
    expect(
      decodeOpenCodeMessage(assistant, [
        { id: 'prt_a', type: 'step-start' },
        { id: 'prt_b', type: 'step-finish', reason: 'tool-calls' },
        { id: 'prt_c', type: 'patch', files: ['/tmp/x'] },
        // OpenAI returns encrypted reasoning with an empty text field.
        { id: 'prt_d', type: 'reasoning', text: '' }
      ])
    ).toEqual([])
  })

  it('surfaces reasoning that does carry text', () => {
    const [message] = decodeOpenCodeMessage(assistant, [
      { id: 'prt_e', type: 'reasoning', text: 'checking the header first' }
    ])
    expect(message).toMatchObject({ role: 'reasoning', blocks: [{ type: 'text' }] })
  })

  it('falls back to the envelope timestamp for a part that has none', () => {
    const [message] = decodeOpenCodeMessage(assistant, [{ id: 'prt_f', type: 'text', text: 'hi' }])
    expect(message?.timestamp).toBe(1769847296535)
  })
})

// The ordering contract the whole reader rests on: `step-start` carries no timestamp at all, so
// ids are the only total order available. Verified against real sessions — id order matched
// `time.created` for every message.
describe('compareOpenCodeIds', () => {
  it('orders ids the way their creation times run', () => {
    const ids = [
      'msg_c131e9217001Bx5mPLUxuqdk7L',
      'msg_c131cbf40001IVNqIDKHdYNEeh',
      'msg_c13200f54001sGn2jFEz643Q1w'
    ]
    expect([...ids].sort(compareOpenCodeIds)).toEqual([
      'msg_c131cbf40001IVNqIDKHdYNEeh',
      'msg_c131e9217001Bx5mPLUxuqdk7L',
      'msg_c13200f54001sGn2jFEz643Q1w'
    ])
  })
})
