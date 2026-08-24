// Live opencode transcript updates.
//
// The other agents append to one file, so Orca watches that file and forwards the new bytes.
// opencode has no such file: new turns create files under `message/<sessionID>/`, and content
// arrives as files under `part/<msgID>/` that are also REWRITTEN in place (a tool part is
// created running, then updated with its output). There is no append cursor to advance, so this
// re-reads the window and replaces it whenever the tree changes.
//
// Replacing rather than appending is why a change signature is compared first: without it every
// filesystem event — including the ones other opencode sessions cause under the shared `part`
// root — would push an identical transcript at the renderer.

import { watch, type FSWatcher } from 'node:fs'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import { readOpenCodeTranscript, resolveOpenCodeTranscriptPaths } from './opencode-transcript-store'
import type {
  NativeChatTranscriptSubscription,
  SubscribeNativeChatTranscriptArgs
} from './transcript-watch-contract'
import { join } from 'node:path'

const DEFAULT_DEBOUNCE_MS = 250
/** Backstop for filesystems where fs.watch reports nothing (network mounts, some containers). */
const DEFAULT_POLL_MS = 2_000

function transcriptSignature(messages: readonly NativeChatMessage[]): string {
  // Ids alone are not enough: a tool part keeps its id and gains its output later.
  return messages
    .map((message) => `${message.id}:${JSON.stringify(message.blocks).length}`)
    .join('|')
}

export function subscribeOpenCodeTranscript(
  args: SubscribeNativeChatTranscriptArgs
): NativeChatTranscriptSubscription {
  const paths = resolveOpenCodeTranscriptPaths(args.sessionId)
  if (!paths) {
    return { unsubscribe: () => {}, watching: false }
  }
  const limit = args.initialLimit
  let closed = false
  let signature: string | null = null
  let reading = false
  let rereadRequested = false
  let debounce: ReturnType<typeof setTimeout> | null = null
  const watchers: FSWatcher[] = []

  const drain = async (): Promise<void> => {
    if (closed || reading) {
      rereadRequested = reading
      return
    }
    reading = true
    try {
      const result = await readOpenCodeTranscript({
        sessionId: args.sessionId,
        ...(limit ? { limit } : {})
      })
      if (closed) {
        return
      }
      if ('error' in result) {
        if (signature === null) {
          args.onInitialSnapshot?.([], false, 0, result.notFound ? undefined : result.error)
          // Leave the signature unset so a session that has not flushed yet still delivers its
          // first real snapshot rather than treating the miss as the initial state.
        }
        return
      }
      const next = transcriptSignature(result.messages)
      if (next === signature) {
        return
      }
      const first = signature === null
      signature = next
      if (first) {
        args.onInitialSnapshot?.(result.messages, false, 0)
      } else {
        args.onReplace?.(result.messages, false, 0)
      }
    } finally {
      reading = false
      if (rereadRequested && !closed) {
        rereadRequested = false
        void drain()
      }
    }
  }

  const schedule = (): void => {
    if (closed || debounce) {
      return
    }
    debounce = setTimeout(() => {
      debounce = null
      void drain()
    }, args.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  }

  // Both roots matter and neither is sufficient: `message/<session>` fires when a turn starts,
  // `part` (recursive, shared across sessions) fires when its content lands. Watch failures are
  // not fatal — the poll below is what actually owns liveness, exactly as for the file watcher.
  for (const [target, options] of [
    [paths.messageDir, {}],
    [join(paths.storageDir, 'part'), { recursive: true }]
  ] as const) {
    try {
      watchers.push(watch(target, options, schedule))
    } catch {
      // Unwatchable root: the poll still reconciles.
    }
  }
  const poll = setInterval(() => void drain(), args.reconciliationIntervalMs ?? DEFAULT_POLL_MS)
  void drain()

  return {
    watching: true,
    unsubscribe: () => {
      closed = true
      clearInterval(poll)
      if (debounce) {
        clearTimeout(debounce)
        debounce = null
      }
      for (const watcher of watchers) {
        try {
          watcher.close()
        } catch {
          // Already closed by an error event.
        }
      }
    }
  }
}
