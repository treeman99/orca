// Pins the cursor half of a warm reattach: the daemon payload must place the
// cursor absolutely, or the live shell writes over the rows it just restored
// (the "restart puts the cursor at the top and output overlaps" report).
// A resolver test proves nothing here — this replays the composed payload the
// way pty-connection.ts does and compares the landing cell.
import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/headless'
import { HeadlessEmulator } from './headless-emulator'
import { POST_REPLAY_REATTACH_RESET } from '../../shared/terminal-mode-reset-profiles'
import type { TerminalSnapshot } from './types'

function writeTerminal(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve))
}

/** Composition of daemon-pty-adapter.ts's reattach PtySpawnResult.snapshot. */
function reattachPayload(snapshot: TerminalSnapshot): string {
  return snapshot.scrollbackAnsi + snapshot.rehydrateSequences + snapshot.snapshotAnsi
}

/** The daemon-snapshot branch of pty-connection.ts: clear, replay at the
 *  snapshot grid, then the reattach mode reset. */
async function replayReattachPayload(snapshot: TerminalSnapshot): Promise<Terminal> {
  const terminal = new Terminal({
    cols: snapshot.cols,
    rows: snapshot.rows,
    scrollback: 5000,
    allowProposedApi: true
  })
  await writeTerminal(terminal, '\x1b[2J\x1b[3J\x1b[H')
  await writeTerminal(terminal, reattachPayload(snapshot))
  await writeTerminal(terminal, POST_REPLAY_REATTACH_RESET)
  return terminal
}

function cursorRowText(terminal: Terminal): string {
  const buffer = terminal.buffer.active
  return buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? ''
}

function sourceTerminalOf(emulator: HeadlessEmulator): Terminal {
  return (emulator as unknown as { terminal: Terminal }).terminal
}

describe('warm reattach cursor parity', () => {
  it.each([
    {
      name: 'prompt on the last viewport row, with scrollback',
      rows: 10,
      write: (emulator: HeadlessEmulator) => {
        for (let line = 0; line < 40; line += 1) {
          emulator.write(`line ${line}\r\n`)
        }
        emulator.write('user@host:~$ ')
      }
    },
    {
      name: 'prompt above blank viewport rows, with scrollback',
      rows: 30,
      write: (emulator: HeadlessEmulator) => {
        for (let line = 0; line < 100; line += 1) {
          emulator.write(`line ${line}\r\n`)
        }
        // A TUI leaving the alternate screen lands the prompt mid-viewport.
        emulator.write('\x1b[10;1H\x1b[J user@host:~$ ')
      }
    },
    {
      name: 'short session with no scrollback',
      rows: 24,
      write: (emulator: HeadlessEmulator) => {
        emulator.write('hello\r\nworld\r\nuser@host:~$ ')
      }
    }
  ])('restores the cursor onto the same content row: $name', async ({ rows, write }) => {
    const emulator = new HeadlessEmulator({ cols: 80, rows, scrollback: 1000 })
    write(emulator)
    const snapshot = emulator.getSnapshot()
    const replayed = await replayReattachPayload(snapshot)
    try {
      const source = sourceTerminalOf(emulator)
      expect(cursorRowText(replayed)).toBe(cursorRowText(source))
      expect(replayed.buffer.active.cursorX).toBe(source.buffer.active.cursorX)
      // The payload must say so explicitly: a relative-only restore is what
      // strands the cursor when replay and source disagree on trailing rows.
      expect(reattachPayload(snapshot)).toMatch(/\[\d+;\d+H$/u)
    } finally {
      replayed.dispose()
      emulator.dispose()
    }
  })
})
