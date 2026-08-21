import { materializeRelocatedDaemonHost, type RelocatedDaemonHost } from './daemon-host-relocation'

/** One image to fork the daemon from. `execPath` unset means "the current binary". */
export type DaemonLaunchHost = {
  /** Log/telemetry label. Never a path — the launch log must stay free of user paths. */
  kind: 'relocated' | 'install-dir'
  entryPath: string
  execPath?: string
}

export type DaemonLaunchHosts = {
  primary: DaemonLaunchHost
  /** Non-null only when `primary` is the relocated copy, i.e. win32 packaged. */
  fallback: DaemonLaunchHost | null
}

/**
 * Which images to try, in order.
 *
 * Relocation fails open on the *copy* (a failed materialize returns null), but not on the *launch*:
 * a machine that refuses to execute the copy — AppLocker/WDAC/SRP over user-writable dirs, AV
 * quarantine, a truncated image — used to cost the whole daemon lane, and every terminal then ran
 * on the LocalPtyProvider, which `killAllPty()` kills on quit (#5232). Keeping the install-dir host
 * as a second attempt trades the update-survival property for a daemon that at least exists.
 * Off win32 `materializeRelocatedDaemonHost()` is always null, so there is exactly one host.
 */
export function resolveDaemonLaunchHosts(
  installDirEntryPath: string,
  materialize: () => RelocatedDaemonHost | null = materializeRelocatedDaemonHost
): DaemonLaunchHosts {
  const installDir: DaemonLaunchHost = { kind: 'install-dir', entryPath: installDirEntryPath }
  const relocated = materialize()
  if (!relocated) {
    return { primary: installDir, fallback: null }
  }
  return {
    primary: {
      kind: 'relocated',
      entryPath: relocated.entryPath,
      execPath: relocated.execPath
    },
    fallback: installDir
  }
}
