import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import type { Bot } from '../../../../../../shared/bot-types'
import GroupMentionInput from './GroupMentionInput'
import GroupMessageRow from './GroupMessageRow'
import { formatGroupRelativeTime, type GroupThreadView } from './group-thread-view-state'

export type GroupThreadListProps = {
  threads: readonly GroupThreadView[]
  members: readonly Bot[]
  membersById: ReadonlyMap<string, Bot>
  now: number
  /** Thread whose inline reply form is open; null while every thread shows the link. */
  replyThread: string | null
  replyDrafts: Readonly<Record<string, string>>
  onToggleThread: (thread: string, expanded: boolean) => void
  onOpenReply: (thread: string) => void
  onChangeReplyDraft: (thread: string, text: string) => void
  onSubmitReply: (thread: string) => void
}

function ThreadFoldRow({
  view,
  now,
  onOpen
}: {
  view: GroupThreadView
  now: number
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      title={translate(
        'auto.components.sidebar.bots.group.GroupThreadList.6a24b91f',
        'Open this thread'
      )}
      onClick={onOpen}
    >
      <ChevronRight className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {view.headText ||
          translate('auto.components.sidebar.bots.group.GroupThreadList.7b35ca20', 'Thread')}
      </span>
      <span className="shrink-0 text-[0.625rem]">
        {translate(
          'auto.components.sidebar.bots.group.GroupThreadList.8c46db31',
          '{{value0}} replies · {{value1}}',
          { value0: view.replyCount, value1: formatGroupRelativeTime(view.lastActivityAt, now) }
        )}
      </span>
    </button>
  )
}

/**
 * The room log, folded into threads.
 *
 * Every thread owns its own reply box, including the open one — that is what lets the main
 * composer below mean exactly one thing ("start a new thread") with no mode to read.
 */
export function GroupThreadList({
  threads,
  members,
  membersById,
  now,
  replyThread,
  replyDrafts,
  onToggleThread,
  onOpenReply,
  onChangeReplyDraft,
  onSubmitReply
}: GroupThreadListProps): React.JSX.Element {
  return (
    <>
      {threads.map((view) =>
        !view.expanded ? (
          <ThreadFoldRow
            key={`fold:${view.thread}`}
            view={view}
            now={now}
            onOpen={() => onToggleThread(view.thread, true)}
          />
        ) : (
          <div
            key={`thread:${view.thread}`}
            className="flex flex-col gap-1.5 border-l-2 border-border pl-1.5"
          >
            {view.showCollapseRow ? (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-1.5 px-2 pt-1 text-left text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => onToggleThread(view.thread, false)}
              >
                <ChevronDown className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                {translate(
                  'auto.components.sidebar.bots.group.GroupThreadList.9d57ec42',
                  'Collapse thread'
                )}
              </button>
            ) : null}

            {view.entries.map((entry) => (
              <GroupMessageRow
                key={entry.id}
                entry={entry}
                speaker={
                  entry.from.kind === 'member' ? (membersById.get(entry.from.botId) ?? null) : null
                }
                now={now}
              />
            ))}

            {replyThread === view.thread ? (
              <form
                className="flex items-end gap-1.5 px-2 pb-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  onSubmitReply(view.thread)
                }}
              >
                <GroupMentionInput
                  autoFocus
                  aria-label={translate(
                    'auto.components.sidebar.bots.group.GroupThreadList.ae68fd53',
                    'Reply in thread'
                  )}
                  placeholder={translate(
                    'auto.components.sidebar.bots.group.GroupThreadList.bf790e64',
                    'Reply in thread…'
                  )}
                  members={members}
                  value={replyDrafts[view.thread] ?? ''}
                  onChange={(text) => onChangeReplyDraft(view.thread, text)}
                  onSubmitDraft={() => onSubmitReply(view.thread)}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={(replyDrafts[view.thread] ?? '').trim() === ''}
                >
                  {translate(
                    'auto.components.sidebar.bots.group.GroupThreadList.c081af75',
                    'Reply'
                  )}
                </Button>
              </form>
            ) : (
              <button
                type="button"
                className="w-fit cursor-pointer px-2 pb-1 text-left text-[0.65rem] text-primary transition-colors hover:underline"
                onClick={() => onOpenReply(view.thread)}
              >
                {translate(
                  'auto.components.sidebar.bots.group.GroupThreadList.d192b086',
                  'Reply in thread'
                )}
              </button>
            )}
          </div>
        )
      )}
    </>
  )
}

export default GroupThreadList
