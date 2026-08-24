import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readOpenCodeTranscript, resolveOpenCodeTranscriptPaths } from './opencode-transcript-store'

let home: string

function storage(): string {
  return join(home, '.local', 'share', 'opencode', 'storage')
}

function writeMessage(sessionId: string, id: string, body: Record<string, unknown>): void {
  const dir = join(storage(), 'message', sessionId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, sessionID: sessionId, ...body }))
}

function writePart(messageId: string, id: string, body: Record<string, unknown>): void {
  const dir = join(storage(), 'part', messageId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, messageID: messageId, ...body }))
}

const read = (sessionId: string, limit?: number) =>
  readOpenCodeTranscript({
    sessionId,
    ...(limit ? { limit } : {}),
    environment: {},
    homeDirectory: home
  })

describe('readOpenCodeTranscript', () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'orca-opencode-'))
  })
  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('joins each message with its parts, oldest first', async () => {
    writeMessage('ses_a', 'msg_001', { role: 'user', time: { created: 10 } })
    writePart('msg_001', 'prt_001', { type: 'text', text: 'build me a header' })
    writeMessage('ses_a', 'msg_002', { role: 'assistant', time: { created: 20 } })
    writePart('msg_002', 'prt_001', { type: 'step-start' })
    writePart('msg_002', 'prt_002', { type: 'text', text: 'on it' })

    const result = await read('ses_a')
    expect('messages' in result && result.messages).toMatchObject([
      { role: 'user', blocks: [{ type: 'text', text: 'build me a header' }] },
      { role: 'assistant', blocks: [{ type: 'text', text: 'on it' }] }
    ])
  })

  it('reports a session with no message directory as retry-worthy', async () => {
    // The same first-flush race a JSONL transcript has: opencode creates the session before the
    // first message lands, and settling that into a permanent error strands the chat view.
    expect(await read('ses_missing')).toMatchObject({ notFound: true })
  })

  it('skips a half-written file instead of failing the session', async () => {
    writeMessage('ses_b', 'msg_001', { role: 'user', time: { created: 1 } })
    writePart('msg_001', 'prt_001', { type: 'text', text: 'first' })
    mkdirSync(join(storage(), 'part', 'msg_002'), { recursive: true })
    writeFileSync(join(storage(), 'part', 'msg_002', 'prt_001.json'), '{"type":"text"')
    writeMessage('ses_b', 'msg_002', { role: 'assistant', time: { created: 2 } })

    const result = await read('ses_b')
    expect('messages' in result && result.messages).toHaveLength(1)
  })

  it('windows to the newest messages before reading their parts', async () => {
    for (const index of [1, 2, 3]) {
      const id = `msg_00${index}`
      writeMessage('ses_c', id, { role: 'user', time: { created: index } })
      writePart(id, 'prt_001', { type: 'text', text: `turn ${index}` })
    }
    const result = await read('ses_c', 2)
    expect('messages' in result && result.messages.map((m) => m.blocks)).toEqual([
      [{ type: 'text', text: 'turn 2' }],
      [{ type: 'text', text: 'turn 3' }]
    ])
  })

  // The id names a directory under the storage root; a traversal-shaped id must not resolve.
  it('refuses a session id that is not a plain identifier', async () => {
    expect(resolveOpenCodeTranscriptPaths('../../etc')).toBeNull()
    expect(await read('../../etc')).toMatchObject({ error: expect.stringContaining('Unusable') })
  })

  it('honours XDG_DATA_HOME for the storage root', () => {
    const paths = resolveOpenCodeTranscriptPaths('ses_a', { XDG_DATA_HOME: '/data' }, home)
    expect(paths?.messageDir).toBe(join('/data', 'opencode', 'storage', 'message', 'ses_a'))
  })
})
