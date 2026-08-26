// Figures for the usage guide.
//
// Drawn, not screenshotted. A raster capture of this app goes stale the next time a padding
// changes, ships bytes in the bundle, and cannot follow the viewer's theme — these use the
// same tokens the real UI does, so a figure and the panel beside it always agree.
//
// Every word comes in as a prop. The figure owns layout; the section owns copy, because that
// is where translate() lives — a literal in here would be a user-visible string outside the
// catalog.

import type React from 'react'

const FRAME =
  'overflow-hidden rounded-lg border border-border bg-worktree-sidebar text-worktree-sidebar-foreground'
const PANE = 'rounded-md border border-border bg-background/60'

export function FigureCaption({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="mt-1.5 text-[11px] text-muted-foreground">{children}</p>
}

/**
 * The sidebar's activity dot, drawn with the classes StatusIndicator itself uses so the guide
 * shows the reader the colour they will actually look for — not a stand-in glyph.
 */
export function FigureStatusDot({ tone }: { tone: 'live' | 'idle' }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-figure-status-dot={tone}
      className={`mt-1 block size-2 shrink-0 rounded-full ${
        tone === 'live' ? 'bg-emerald-500' : 'bg-neutral-500/40'
      }`}
    />
  )
}

function FigureFrameLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-1 text-[10px] tracking-[0.05em] text-muted-foreground uppercase">
      {children}
    </div>
  )
}

export type FigureRowProps = {
  /** Omitted when the row carries no glyph; a node so a row can show a real status dot. */
  glyph?: React.ReactNode
  label: string
  detail?: string
  trailing?: string
  /** Tree depth, for figures contrasting a flat listing with a nested one. */
  indent?: 0 | 1 | 2
  /** Renders the row as the selected one, matching the sidebar's active wash. */
  active?: boolean
}

const INDENT_CLASS: Record<0 | 1 | 2, string> = { 0: '', 1: 'ml-3', 2: 'ml-6' }

/** One list row, shaped like a sidebar/panel row in the real UI. */
export function FigureRow(props: FigureRowProps): React.JSX.Element {
  return (
    <div
      className={`${
        props.active
          ? 'flex items-start gap-2 rounded-md bg-worktree-sidebar-accent px-2 py-1 text-worktree-sidebar-accent-foreground'
          : 'flex items-start gap-2 rounded-md px-2 py-1'
      } ${INDENT_CLASS[props.indent ?? 0]}`}
    >
      {props.glyph ? (
        <span aria-hidden="true" className="text-[11px] leading-snug">
          {props.glyph}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate text-[11px] font-medium">{props.label}</span>
        {props.detail ? (
          <span className="truncate text-[10px] text-muted-foreground">{props.detail}</span>
        ) : null}
      </span>
      {props.trailing ? (
        <span aria-hidden="true" className="text-[10px] text-muted-foreground">
          {props.trailing}
        </span>
      ) : null}
    </div>
  )
}

/** A miniature Orca window: the sidebar rail on the left, the main area on the right. */
export function AppWindowFigure(props: {
  caption?: React.ReactNode
  sidebarTitle: string
  /** Glyph-only affordances drawn at the right of the sidebar's title row. */
  sidebarActions?: readonly string[]
  sidebar: React.ReactNode
  bodyTitle?: string
  body: React.ReactNode
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={`${FRAME} flex min-h-[7rem] flex-col sm:flex-row`}>
        <div className="flex flex-col border-b border-worktree-sidebar-border sm:w-2/5 sm:border-r sm:border-b-0">
          <div className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold">
            <span className="flex-1 truncate">{props.sidebarTitle}</span>
            {(props.sidebarActions ?? []).map((action) => (
              <span
                key={action}
                aria-hidden="true"
                className="rounded-sm px-1 text-[11px] text-muted-foreground"
              >
                {action}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-0.5 px-1.5 pb-2">{props.sidebar}</div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 bg-background/40 p-2">
          {props.bodyTitle ? <FigureFrameLabel>{props.bodyTitle}</FigureFrameLabel> : null}
          {props.body}
        </div>
      </div>
      {props.caption ? (
        <figcaption>
          <FigureCaption>{props.caption}</FigureCaption>
        </figcaption>
      ) : null}
    </figure>
  )
}

/** A single panel or card lifted out of the app, for one screen's worth of detail. */
export function PanelFigure(props: {
  caption?: React.ReactNode
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={`${FRAME} p-2`}>
        {props.title ? <FigureFrameLabel>{props.title}</FigureFrameLabel> : null}
        <div className={`${PANE} flex flex-col gap-1 p-2`}>{props.children}</div>
      </div>
      {props.caption ? (
        <figcaption>
          <FigureCaption>{props.caption}</FigureCaption>
        </figcaption>
      ) : null}
    </figure>
  )
}

/** Plain monospace output — a shell line, a command, anything the reader would see literally. */
export function FigureMonoLines({ lines }: { lines: readonly string[] }): React.JSX.Element {
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      {lines.map((line) => (
        <div key={line} className="truncate whitespace-pre">
          {line}
        </div>
      ))}
    </div>
  )
}

export type FigureDiffLine = {
  text: string
  tone: 'added' | 'removed' | 'context'
}

// The repo's own way of reaching a git decoration colour (see right-sidebar/status-display.ts):
// the variable, never the hex behind it, so light and dark stay correct.
const DIFF_TONE_STYLE: Record<FigureDiffLine['tone'], React.CSSProperties | undefined> = {
  added: { color: 'var(--git-decoration-added)' },
  removed: { color: 'var(--git-decoration-deleted)' },
  context: undefined
}

/**
 * Diff text as the app lays it out. One column reads as the inline view; two columns read as
 * the side-by-side view — which is exactly the setting this exists to illustrate.
 */
export function FigureDiffLines({
  columns
}: {
  columns: readonly (readonly FigureDiffLine[])[]
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 gap-1.5">
      {columns.map((column, columnIndex) => (
        <div
          // Columns have no id of their own; position is the identity here.
          key={columnIndex}
          className="min-w-0 flex-1 font-mono text-[10px] leading-relaxed"
        >
          {column.map((line) => (
            <div
              key={line.text}
              className={line.tone === 'context' ? 'truncate text-muted-foreground' : 'truncate'}
              style={DIFF_TONE_STYLE[line.tone]}
            >
              {line.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A tab strip over one or more side-by-side panes — the shape a terminal tab with a split
 * has. `panes` is a list because the split IS the point; one entry draws an unsplit tab.
 */
export function TabbedPanesFigure(props: {
  caption?: React.ReactNode
  tabs: readonly string[]
  /** Index of the tab drawn as active. */
  activeTab: number
  panes: readonly { label: string; lines: readonly string[]; active?: boolean }[]
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={`${FRAME} p-2`}>
        <div className="flex gap-1 overflow-x-auto text-[11px]">
          {props.tabs.map((tab, index) => (
            <span
              key={tab}
              className={
                index === props.activeTab
                  ? 'shrink-0 rounded-t-md border border-b-0 border-border bg-background px-2 py-1 font-medium'
                  : 'shrink-0 rounded-t-md px-2 py-1 text-muted-foreground'
              }
            >
              {tab}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row">
          {props.panes.map((pane) => (
            <div
              key={pane.label}
              data-figure-pane={pane.label}
              // The inactive pane is dimmed the way the real terminal dims an unfocused split.
              className={`${PANE} min-w-0 flex-1 rounded-tl-none p-2 font-mono text-[10px] leading-relaxed ${
                pane.active === false ? 'opacity-60' : ''
              }`}
            >
              {/* Not uppercased like the other frame labels: these are commands, and PNPM DEV
                  is not a command anyone can type. */}
              <div className="mb-1 truncate text-[9px] text-muted-foreground">{pane.label}</div>
              {pane.lines.map((line) => (
                <div key={line} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {props.caption ? (
        <figcaption>
          <FigureCaption>{props.caption}</FigureCaption>
        </figcaption>
      ) : null}
    </figure>
  )
}

function ComparisonPane(props: {
  side: 'left' | 'right'
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-1.5 p-2" data-comparison-pane={props.side}>
      <FigureFrameLabel>{props.label}</FigureFrameLabel>
      <div className={`${PANE} flex flex-1 flex-col gap-1 p-2`}>{props.children}</div>
    </div>
  )
}

/**
 * Two mockups side by side with a rule between them — the shape a settings before/after
 * needs. Labels and both bodies are the caller's; this owns only the split.
 */
export function ComparisonFigure(props: {
  caption?: React.ReactNode
  leftLabel: string
  rightLabel: string
  left: React.ReactNode
  right: React.ReactNode
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div className={`${FRAME} flex flex-col sm:flex-row`}>
        <ComparisonPane side="left" label={props.leftLabel}>
          {props.left}
        </ComparisonPane>
        {/* The rule is the whole point of the frame: it says these are alternatives, not steps. */}
        <div aria-hidden="true" className="border-t border-border sm:border-t-0 sm:border-l" />
        <ComparisonPane side="right" label={props.rightLabel}>
          {props.right}
        </ComparisonPane>
      </div>
      {props.caption ? (
        <figcaption>
          <FigureCaption>{props.caption}</FigureCaption>
        </figcaption>
      ) : null}
    </figure>
  )
}
