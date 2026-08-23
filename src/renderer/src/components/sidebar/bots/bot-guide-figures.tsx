// Figures for the bot guide.
//
// Drawn, not screenshotted. A raster capture of this app goes stale the next time a padding
// changes, ships bytes in the bundle, and cannot follow the viewer's theme — these use the
// same tokens the real UI does, so a figure and the panel beside it always agree.
//
// Every word comes in as a prop. The figure owns layout; the dialog owns copy, because that is
// where translate() lives — a literal in here would be a user-visible string outside the
// catalog. Shell commands are the exception and stay a plain constant: a translator must never
// render `orca terminal list --json` into anything else.

import type React from 'react'

const FRAME =
  'overflow-hidden rounded-lg border border-border bg-worktree-sidebar text-worktree-sidebar-foreground'

function Caption({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="mt-1.5 text-[11px] text-muted-foreground">{children}</p>
}

export type RosterFigureRow = {
  emoji: string
  name: string
  role: string
  /** '' for a bot at rest; the working / waiting mark otherwise. */
  mark: string
}

/** The lane strip and a grouped roster, with the two activity marks. */
export function RosterFigure(props: {
  caption: React.ReactNode
  sessionsLabel: string
  botsLabel: string
  projectName: string
  rows: readonly RosterFigureRow[]
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={FRAME}>
        <div className="flex h-9 items-stretch border-b border-worktree-sidebar-border text-[12px]">
          <div className="flex flex-1 items-center justify-center gap-1.5 text-muted-foreground">
            {props.sessionsLabel}
          </div>
          <div className="flex flex-1 items-center justify-center gap-1.5 border-b-2 border-worktree-sidebar-ring font-medium">
            {props.botsLabel}
            <span className="rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">
              {props.rows.length}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 p-2 text-[12px]">
          <div className="flex items-center gap-1.5 px-1.5 py-1 font-semibold">
            <span aria-hidden="true">▾</span>
            <span aria-hidden="true">📁</span>
            <span className="flex-1">{props.projectName}</span>
            <span className="text-[11px] text-muted-foreground">{props.rows.length}</span>
          </div>
          <div className="ml-[13px] flex flex-col gap-0.5 border-l border-border/60 py-0.5 pl-1.5">
            {props.rows.map((row) => (
              <div key={row.name} className="flex items-start gap-2 rounded-md px-2 py-1">
                <span aria-hidden="true">{row.emoji}</span>
                <span className="flex flex-1 flex-col leading-snug">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-[10px] text-muted-foreground">{row.role}</span>
                </span>
                {row.mark ? (
                  <span className="text-[11px] text-muted-foreground" aria-hidden="true">
                    {row.mark}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption>
        <Caption>{props.caption}</Caption>
      </figcaption>
    </figure>
  )
}

/** The composer with a leading mention, beside what the addressed bot receives. */
export function HandoffFigure(props: {
  caption: React.ReactNode
  senderLabel: string
  receiverLabel: string
  mention: string
  body: string
  attribution: string
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className={`flex-1 ${FRAME} p-2`}>
          <div className="mb-1 text-[10px] tracking-[0.05em] text-muted-foreground uppercase">
            {props.senderLabel}
          </div>
          <div className="rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
            <span className="rounded bg-primary/15 px-1 font-semibold text-primary">
              {props.mention}
            </span>{' '}
            {props.body}
          </div>
        </div>
        <div
          className="flex rotate-90 items-center justify-center px-1 text-muted-foreground sm:rotate-0"
          aria-hidden="true"
        >
          →
        </div>
        <div className={`flex-1 ${FRAME} p-2`}>
          <div className="mb-1 text-[10px] tracking-[0.05em] text-muted-foreground uppercase">
            {props.receiverLabel}
          </div>
          <div className="rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
            <span className="text-muted-foreground">{props.attribution}</span>
            <br />
            <br />
            {props.body}
          </div>
        </div>
      </div>
      <figcaption>
        <Caption>{props.caption}</Caption>
      </figcaption>
    </figure>
  )
}

// Not translatable: these are commands the reader types verbatim.
const DISCOVERY_COMMANDS: readonly { text: string; muted: boolean }[] = [
  { text: '$ orca terminal list --json', muted: true },
  { text: '… "title": "bot:analyzer", "handle": "term_8f2c…"', muted: false },
  { text: '$ orca terminal send --terminal term_8f2c… \\', muted: true },
  { text: '    --text "…" --enter --json', muted: true }
]

/** How a bot's session is named, and how a teammate finds it. */
export function DiscoveryFigure(props: {
  caption: React.ReactNode
  tabs: readonly string[]
  /** Index of the tab drawn as active. */
  activeTab: number
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={`${FRAME} p-2`}>
        <div className="flex gap-1 text-[11px]">
          {props.tabs.map((tab, index) => (
            <span
              key={tab}
              className={
                index === props.activeTab
                  ? 'rounded-t-md border border-b-0 border-border bg-background px-2 py-1 font-medium'
                  : 'rounded-t-md px-2 py-1 text-muted-foreground'
              }
            >
              {tab}
            </span>
          ))}
        </div>
        <div className="rounded-md rounded-tl-none border border-border bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
          {DISCOVERY_COMMANDS.map((line) => (
            // whitespace-pre: the continuation line's indent is what makes it read as one command.
            <div
              key={line.text}
              className={line.muted ? 'whitespace-pre text-muted-foreground' : 'whitespace-pre'}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
      <figcaption>
        <Caption>{props.caption}</Caption>
      </figcaption>
    </figure>
  )
}

export type ChatViewFigureBubble = {
  author: string
  text: string
  /** The reader's own message: aligned right, tinted, no author line. */
  own: boolean
}

/** One session, two views: the raw pane on the left, the transcript read back on the right. */
export function ChatViewFigure(props: {
  caption: React.ReactNode
  terminalLabel: string
  chatLabel: string
  terminalLines: readonly string[]
  bubbles: readonly ChatViewFigureBubble[]
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={FRAME}>
        <div className="flex items-center gap-1 border-b border-worktree-sidebar-border p-1.5 text-[11px]">
          <span className="rounded-md px-2 py-0.5 text-muted-foreground">
            {props.terminalLabel}
          </span>
          <span className="rounded-md bg-accent px-2 py-0.5 font-medium text-accent-foreground">
            {props.chatLabel}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row">
          <div className="flex-1 border-b border-border p-2 sm:border-r sm:border-b-0">
            <div className="rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {props.terminalLines.map((line) => (
                <div key={line} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-2">
            {props.bubbles.map((bubble) => (
              <div
                key={bubble.text}
                className={bubble.own ? 'flex justify-end' : 'flex flex-col gap-0.5'}
              >
                {bubble.own ? null : (
                  <span className="text-[9px] text-muted-foreground">{bubble.author}</span>
                )}
                <span
                  className={
                    bubble.own
                      ? 'max-w-[85%] rounded-lg rounded-br-sm bg-primary/15 px-2 py-1 text-[10px] leading-snug'
                      : 'max-w-[85%] rounded-lg rounded-tl-sm border border-border bg-background/60 px-2 py-1 text-[10px] leading-snug'
                  }
                >
                  {bubble.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption>
        <Caption>{props.caption}</Caption>
      </figcaption>
    </figure>
  )
}

export type GroupRoomFigureRow = {
  /** '' for the reader's own row, which is tinted instead of avatared. */
  emoji: string
  name: string
  text: string
}

/** A room end to end: face stack, the thread, and the turn line that proves it is running. */
export function GroupRoomFigure(props: {
  caption: React.ReactNode
  roomName: string
  memberCountLabel: string
  faces: readonly string[]
  rows: readonly GroupRoomFigureRow[]
  turnLabel: string
  turnClock: string
  turnProgress: string
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={FRAME}>
        <div className="flex items-center gap-2 border-b border-worktree-sidebar-border px-2 py-1.5 text-[12px]">
          <span aria-hidden="true" className="text-muted-foreground">
            ‹
          </span>
          <span className="flex-1 truncate font-semibold">{props.roomName}</span>
          <span className="flex items-center -space-x-1.5" aria-hidden="true">
            {props.faces.map((face) => (
              <span
                key={face}
                className="flex size-4 items-center justify-center rounded-full bg-muted text-[9px] ring-2 ring-worktree-sidebar"
              >
                {face}
              </span>
            ))}
          </span>
          <span className="text-[10px] text-muted-foreground">{props.memberCountLabel}</span>
        </div>

        {/* The rail is what makes a thread read as one exchange rather than a flat log. */}
        <div className="ml-3 flex flex-col gap-1 border-l border-border/60 py-2 pr-2 pl-2">
          {props.rows.map((row) => (
            <div
              key={row.text}
              className={
                row.emoji === ''
                  ? 'flex items-start gap-2 rounded-md bg-muted px-2 py-1'
                  : 'flex items-start gap-2 px-2 py-0.5'
              }
            >
              {row.emoji === '' ? null : (
                <span className="text-[11px]" aria-hidden="true">
                  {row.emoji}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <span
                  className={
                    row.emoji === ''
                      ? 'text-[10px] font-semibold'
                      : 'text-[10px] font-semibold text-primary'
                  }
                >
                  {row.name}
                </span>
                <span className="text-[10px] text-muted-foreground">{row.text}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground">
          <span aria-hidden="true">◐</span>
          <span className="min-w-0 flex-1 truncate">{props.turnLabel}</span>
          <span className="font-mono tabular-nums">{props.turnClock}</span>
          <span className="text-muted-foreground/70">{props.turnProgress}</span>
        </div>
      </div>
      <figcaption>
        <Caption>{props.caption}</Caption>
      </figcaption>
    </figure>
  )
}
