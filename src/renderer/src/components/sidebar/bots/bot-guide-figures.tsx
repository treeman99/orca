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
