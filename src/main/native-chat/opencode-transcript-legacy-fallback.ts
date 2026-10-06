// Fork: opencode releases before its SQLite store wrote a JSON storage tree (storage/message/<id>/…)
// that upstream's database reader never sees. The database wins; the tree is read only when it
// holds a session the database does not. Exported under upstream's names via alias imports so the
// call sites stay byte-identical to upstream.

import { existsSync } from 'node:fs'
import { readOpenCodeTranscript, resolveOpenCodeTranscriptPaths } from './opencode-transcript-store'
import { subscribeOpenCodeTranscript } from './opencode-transcript-watch'
import {
  openCodeTranscriptDefaultDeps,
  readOpenCodeNativeChatTranscriptFull,
  readOpenCodeNativeChatTranscriptTail,
  type OpenCodeTailResult,
  type OpenCodeTranscriptDeps
} from './transcript-opencode'
import { subscribeOpenCodeNativeChatTranscript } from './transcript-opencode-subscribe'
import type { ReadTranscriptResult } from './transcript-reader'
import type {
  NativeChatTranscriptSubscription,
  SubscribeNativeChatTranscriptArgs
} from './transcript-watch-contract'

function hasLegacyOpenCodeSession(sessionId: string): boolean {
  const paths = resolveOpenCodeTranscriptPaths(sessionId)
  return paths !== null && existsSync(paths.messageDir)
}

function isNotFound(result: { error: string; notFound?: true } | object): boolean {
  return 'notFound' in result && result.notFound === true
}

export async function readOpenCodeNativeChatTranscriptFullWithLegacyFallback(
  sessionId: string,
  deps: OpenCodeTranscriptDeps = {},
  signal?: AbortSignal
): Promise<ReadTranscriptResult> {
  const result = await readOpenCodeNativeChatTranscriptFull(sessionId, deps, signal)
  if (!isNotFound(result) || !hasLegacyOpenCodeSession(sessionId)) {
    return result
  }
  return readOpenCodeTranscript({ sessionId, ...(signal ? { signal } : {}) })
}

export async function readOpenCodeNativeChatTranscriptTailWithLegacyFallback(
  args: { sessionId: string; limit: number; beforeOffset?: number },
  deps: OpenCodeTranscriptDeps = {},
  signal?: AbortSignal
): Promise<OpenCodeTailResult> {
  const result = await readOpenCodeNativeChatTranscriptTail(args, deps, signal)
  if (!isNotFound(result) || !hasLegacyOpenCodeSession(args.sessionId)) {
    return result
  }
  const legacy = await readOpenCodeTranscript({
    sessionId: args.sessionId,
    limit: args.limit,
    ...(signal ? { signal } : {})
  })
  // The tree is windowed from the newest messages directly, so there is nothing older to page.
  return 'error' in legacy ? legacy : { ...legacy, hasMore: false, beforeOffset: 0 }
}

export function subscribeOpenCodeNativeChatTranscriptWithLegacyFallback(
  args: SubscribeNativeChatTranscriptArgs,
  setupSignal?: AbortSignal,
  deps: OpenCodeTranscriptDeps = {}
): NativeChatTranscriptSubscription {
  if (!hasLegacyOpenCodeSession(args.sessionId)) {
    return subscribeOpenCodeNativeChatTranscript(args, setupSignal, deps)
  }
  let inner: NativeChatTranscriptSubscription | null = null
  let closed = false
  const resolveDbPath = deps.resolveDbPath ?? openCodeTranscriptDefaultDeps.resolveDbPath
  void resolveDbPath(args.sessionId, setupSignal)
    .catch(() => null)
    .then((dbPath) => {
      if (closed || setupSignal?.aborted) {
        return
      }
      inner = dbPath
        ? subscribeOpenCodeNativeChatTranscript(args, setupSignal, deps)
        : subscribeOpenCodeTranscript(args)
    })
  return {
    watching: true,
    unsubscribe: () => {
      closed = true
      inner?.unsubscribe()
    }
  }
}
