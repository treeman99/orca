// Main-side lifecycle lines for the daemon launch, appended to the same rotated NDJSON file the
// daemon itself writes. The daemon's own log starts at its first line of code, so a daemon that
// never starts leaves nothing behind — exactly the case worth diagnosing — and the launcher's
// console goes nowhere in a packaged GUI build. Same rules as daemon-file-log: fail-open, and
// never a path, a token, or terminal content (see classifyDaemonLaunchFailure).
import { createDaemonFileLog, createNoopDaemonFileLog, type DaemonFileLog } from './daemon-file-log'
import { getDaemonLogFilePath } from '../observability/logs-directory'

/** Terse, path-free classification of why a launch attempt did not reach readiness. */
export type DaemonLaunchFailureStage =
  | 'child-exited'
  | 'timeout'
  | 'ready-identity'
  | 'endpoint-occupied'
  | 'endpoint-ownership'
  | 'spawn'
  | 'unknown'

export type DaemonLaunchFailure = {
  stage: DaemonLaunchFailureStage
  /** Present only for 'child-exited'. */
  exitCode?: number
  /** Present only for 'spawn' — the errno name, which carries no path. */
  code?: string
}

const EXITED_PREFIX = 'Daemon exited during startup with code '

/**
 * Error messages here can embed the entry path or a stderr tail, so nothing from the message is
 * copied verbatim into the log — only a stage, and the exit code or errno that names it.
 * 'endpoint-ownership' is not derived here: only the call site holding the error class can prove it.
 */
export function classifyDaemonLaunchFailure(error: unknown): DaemonLaunchFailure {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (typeof code === 'string' && code.length > 0) {
    return { stage: 'spawn', code }
  }
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith(EXITED_PREFIX)) {
    const exitCode = Number.parseInt(message.slice(EXITED_PREFIX.length), 10)
    return Number.isInteger(exitCode)
      ? { stage: 'child-exited', exitCode }
      : { stage: 'child-exited' }
  }
  if (message.startsWith('Daemon startup timed out')) {
    return { stage: 'timeout' }
  }
  if (message.startsWith('Daemon readiness identity is incomplete')) {
    return { stage: 'ready-identity' }
  }
  if (message.startsWith('Daemon could not take the endpoint')) {
    return { stage: 'endpoint-occupied' }
  }
  return { stage: 'unknown' }
}

// Mirrors daemonLogArgs(): the switch that withholds --log-file from the daemon withholds this too.
function diagnosticsDisabled(): boolean {
  const disabled = (process.env.ORCA_DIAGNOSTICS_DISABLED ?? '').trim().toLowerCase()
  return disabled === '1' || disabled === 'true'
}

let sink: DaemonFileLog | null = null

/** Lazy so an app that never forks a daemon never touches the logs directory. */
export function logDaemonLaunch(event: string, details: Record<string, unknown> = {}): void {
  if (!sink) {
    sink = diagnosticsDisabled()
      ? createNoopDaemonFileLog()
      : createDaemonFileLog(getDaemonLogFilePath(), { src: 'main' })
  }
  sink.log(event, details)
}

/** Test seam: drops the cached sink so a later call re-reads the env switch and the log path. */
export function resetDaemonLaunchLog(): void {
  sink = null
}
