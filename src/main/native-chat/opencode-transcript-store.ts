// Reading an opencode session off disk.
//
// Every other native-chat agent appends one JSONL file, so Orca tails it by byte offset. opencode
// instead writes a TREE, and one turn is spread across it:
//
//   storage/session/<projectID>/<sessionID>.json   title, directory, timestamps
//   storage/message/<sessionID>/<msgID>.json       role + model, no text
//   storage/part/<msgID>/<partID>.json             the text / reasoning / tool parts
//
// So there is nothing to tail: rendering a turn means reading a message and joining its parts
// directory. This module does that walk and hands the decoder ordered objects. It reads the whole
// session each time rather than tracking offsets — a session is a few hundred small files, the
// caller already windows to the most recent turns, and an incremental cursor over a tree whose
// files can also be REWRITTEN (a tool part is created running, then updated with its output)
// would go stale in a way an append-only cursor cannot.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import { resolveOpenCodeStorageDirectory } from '../opencode/opencode-data-directory'
import {
  compareOpenCodeIds,
  decodeOpenCodeMessage,
  type OpenCodeMessageRecord,
  type OpenCodePartRecord
} from './opencode-transcript-decode'

/** Ids come from the agent's own hook, but they name directories — refuse traversal outright. */
const OPENCODE_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export type OpenCodeTranscriptPaths = {
  storageDir: string
  messageDir: string
  partDir: (messageId: string) => string
}

export function resolveOpenCodeTranscriptPaths(
  sessionId: string,
  environment?: NodeJS.ProcessEnv,
  homeDirectory?: string
): OpenCodeTranscriptPaths | null {
  if (!OPENCODE_ID_PATTERN.test(sessionId)) {
    return null
  }
  const storageDir = resolveOpenCodeStorageDirectory(environment, homeDirectory)
  return {
    storageDir,
    messageDir: join(storageDir, 'message', sessionId),
    partDir: (messageId) => join(storageDir, 'part', messageId)
  }
}

async function readJsonRecord(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf-8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    // A half-written file is normal here: opencode creates the part, then fills it in. The next
    // read picks it up rather than failing the whole session.
    return null
  }
}

async function listJsonIds(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .filter((id) => OPENCODE_ID_PATTERN.test(id))
    .sort(compareOpenCodeIds)
}

async function readMessageParts(
  paths: OpenCodeTranscriptPaths,
  messageId: string
): Promise<OpenCodePartRecord[]> {
  let partIds: string[]
  try {
    partIds = await listJsonIds(paths.partDir(messageId))
  } catch {
    // A message with no parts directory yet is an assistant turn that has produced nothing.
    return []
  }
  const parts = await Promise.all(
    partIds.map((partId) => readJsonRecord(join(paths.partDir(messageId), `${partId}.json`)))
  )
  return parts.filter((part): part is OpenCodePartRecord => part !== null)
}

export type ReadOpenCodeTranscriptResult =
  | { messages: NativeChatMessage[] }
  | { error: string; notFound?: true }

/**
 * Every message of `sessionId`, oldest first, decoded into the native-chat model.
 *
 * `limit` windows to the most recent MESSAGES before their parts are read, so a long session
 * does not fan out into thousands of file reads for turns nobody scrolled to.
 */
export async function readOpenCodeTranscript(args: {
  sessionId: string
  limit?: number
  environment?: NodeJS.ProcessEnv
  homeDirectory?: string
  signal?: AbortSignal
}): Promise<ReadOpenCodeTranscriptResult> {
  const paths = resolveOpenCodeTranscriptPaths(args.sessionId, args.environment, args.homeDirectory)
  if (!paths) {
    return { error: `Unusable opencode session id: ${args.sessionId}` }
  }
  let messageIds: string[]
  try {
    messageIds = await listJsonIds(paths.messageDir)
  } catch (err) {
    // Not yet flushed is retry-worthy, exactly as for a JSONL transcript that has no file yet.
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
      return { error: `No opencode transcript for session ${args.sessionId}`, notFound: true }
    }
    return { error: (err as Error | null)?.message ?? String(err) }
  }
  if (messageIds.length === 0) {
    return { error: `No opencode transcript for session ${args.sessionId}`, notFound: true }
  }
  const windowed =
    args.limit && args.limit > 0 ? messageIds.slice(-Math.floor(args.limit)) : messageIds
  const messages: NativeChatMessage[] = []
  for (const messageId of windowed) {
    args.signal?.throwIfAborted()
    const record = await readJsonRecord(join(paths.messageDir, `${messageId}.json`))
    if (!record) {
      continue
    }
    const envelope: OpenCodeMessageRecord = {
      id: messageId,
      role: typeof record.role === 'string' ? record.role : 'assistant',
      ...(typeof (record.time as { created?: number } | undefined)?.created === 'number'
        ? { time: { created: (record.time as { created: number }).created } }
        : {})
    }
    messages.push(...decodeOpenCodeMessage(envelope, await readMessageParts(paths, messageId)))
  }
  return { messages }
}
