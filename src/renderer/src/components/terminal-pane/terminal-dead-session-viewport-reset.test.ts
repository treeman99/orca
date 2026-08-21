// Reproduces the "restart leaves the old conversation on screen and the new
// shell draws over it" report for the path the payload-less-reattach fix does
// NOT cover: the session DIED, so a fresh shell replaces it while the pane
// still carries the dead TUI's alternate screen.
import { Terminal } from '@xterm/headless'
import { describe, expect, it } from 'vitest'

import {
  buildFreshShellViewportBlankingSequence,
  buildRestoredViewportResetSequence
} from './terminal-restored-viewport'

function writeTerminal(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve))
}

function viewportLines(term: Terminal): string[] {
  const buffer = term.buffer.active
  const lines: string[] = []
  for (let row = 0; row < term.rows; row += 1) {
    lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? '')
  }
  return lines
}

function allLines(term: Terminal): string[] {
  const buffer = term.buffer.active
  const lines: string[] = []
  for (let row = 0; row < buffer.length; row += 1) {
    lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
  }
  return lines
}

const RESTORED = ['user@host:~$ claude', 'prev conversation A', 'prev conversation B']

/** A pane holding restored scrollback under a dead agent TUI's alt screen. */
async function createDeadTuiPane(): Promise<Terminal> {
  const term = new Terminal({ cols: 40, rows: 8, scrollback: 1000, allowProposedApi: true })
  await writeTerminal(term, `${RESTORED.join('\r\n')}\r\n`)
  // The dead TUI's residue: alt screen, mouse + paste reporting, scroll region,
  // saved cursor and a stale pen — none of it balanced by a `?1049l`.
  await writeTerminal(term, '\x1b[?1049h\x1b[H\x1b[?1002h\x1b[?2004h\x1b[?1004h\x1b[2;7r')
  await writeTerminal(term, '\x1b[1;31m\x1b[3;5H\x1b7dead TUI frame')
  return term
}

describe('fresh shell replacing a dead session on an alternate screen', () => {
  it('reproduces the overlap when only the viewport is blanked', async () => {
    const term = await createDeadTuiPane()
    try {
      await writeTerminal(term, buildFreshShellViewportBlankingSequence(term.rows))
      // Blanking scrolled the ALTERNATE buffer, which has no scrollback.
      expect(term.buffer.active.type).toBe('alternate')
      await writeTerminal(term, 'user@host:~$ ')
      // Anything that leaves the alt screen — ConPTY's startup sync, a resumed
      // agent, a pager — drops the live shell back onto the restored rows.
      await writeTerminal(term, '\x1b[?1049l')
      await writeTerminal(term, 'live output\r\n')
      expect(viewportLines(term).slice(0, 4)).toEqual([...RESTORED, 'live output'])
    } finally {
      term.dispose()
    }
  })

  it('parks the restored rows in scrollback and starts the shell on a clean line', async () => {
    const term = await createDeadTuiPane()
    try {
      await writeTerminal(
        term,
        buildRestoredViewportResetSequence({
          rows: term.rows,
          paneOnAlternateScreen: term.buffer.active.type === 'alternate',
          ownerProcessEnded: true
        })
      )
      expect(term.buffer.active.type).toBe('normal')
      expect(viewportLines(term)).toEqual(Array.from({ length: term.rows }, () => ''))

      await writeTerminal(term, 'user@host:~$ ')
      expect(viewportLines(term)[0]).toBe('user@host:~$ ')
      // Scrolling up still reaches the previous conversation.
      expect(allLines(term).slice(0, RESTORED.length)).toEqual(RESTORED)

      // A later alt-screen exit cannot resurrect the dead frame over the shell.
      await writeTerminal(term, '\x1b[?1049l\r\nlive output')
      expect(viewportLines(term).slice(0, 2)).toEqual(['user@host:~$ ', 'live output'])
    } finally {
      term.dispose()
    }
  })

  it('grounds the dead TUI modes, pen and saved cursor before the shell writes', async () => {
    const term = await createDeadTuiPane()
    try {
      await writeTerminal(
        term,
        buildRestoredViewportResetSequence({
          rows: term.rows,
          paneOnAlternateScreen: true,
          ownerProcessEnded: true
        })
      )
      expect(term.modes.mouseTrackingMode).toBe('none')
      expect(term.modes.bracketedPasteMode).toBe(false)
      expect(term.modes.sendFocusMode).toBe(false)
      expect(term.modes.originMode).toBe(false)

      // A stray DECRC must land on the grounded home register, not inside the
      // restored rows the dead TUI saved a cursor into.
      await writeTerminal(term, 'prompt\x1b8restored-cursor')
      const lines = viewportLines(term)
      expect(lines[0]).toBe('restored-cursor')
      // The dead TUI's red pen must not colour the shell's own output.
      const cell = term.buffer.active.getLine(term.buffer.active.viewportY)?.getCell(0)
      expect(cell?.isFgDefault()).toBe(true)
    } finally {
      term.dispose()
    }
  })

  it('leaves a live reattach on the normal buffer untouched by the mode reset', async () => {
    const term = new Terminal({ cols: 40, rows: 8, scrollback: 1000, allowProposedApi: true })
    try {
      await writeTerminal(term, `${RESTORED.join('\r\n')}\r\n`)
      // A live session owns these; the payload-less reattach path must not wipe them.
      await writeTerminal(term, '\x1b[?1002h\x1b[?2004h')
      const sequence = buildRestoredViewportResetSequence({
        rows: term.rows,
        paneOnAlternateScreen: false,
        ownerProcessEnded: false
      })
      expect(sequence).toBe(buildFreshShellViewportBlankingSequence(term.rows))
      await writeTerminal(term, sequence)
      expect(term.modes.mouseTrackingMode).toBe('drag')
      expect(term.modes.bracketedPasteMode).toBe(true)
      expect(viewportLines(term)).toEqual(Array.from({ length: term.rows }, () => ''))
      expect(allLines(term).slice(0, RESTORED.length)).toEqual(RESTORED)
    } finally {
      term.dispose()
    }
  })
})
