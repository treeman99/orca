/**
 * Local `HH:MM:SS.mmm` for an event's wall-clock time.
 *
 * Why its own stamp and not the log line's prefix: the prefix is taken when main writes, and a
 * renderer line reaches main over IPC — late by exactly the stall being measured. Both processes
 * stamp the event itself with this, so a main stall and a renderer long frame line up.
 */
export function formatDiagnosticClockTime(epochMs: number): string {
  const at = new Date(epochMs)
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}.${pad(at.getMilliseconds(), 3)}`
}
