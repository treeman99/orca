import { describe, expect, it, vi } from 'vitest'
import { resolveDaemonLaunchHosts } from './daemon-launch-hosts'

const INSTALL_DIR_ENTRY =
  '/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/main/daemon-entry.js'

describe('resolveDaemonLaunchHosts', () => {
  it('offers only the install-dir host when nothing is relocated (every non-win32 launch)', () => {
    const materialize = vi.fn(() => null)
    const hosts = resolveDaemonLaunchHosts(INSTALL_DIR_ENTRY, materialize)

    expect(hosts).toEqual({
      primary: { kind: 'install-dir', entryPath: INSTALL_DIR_ENTRY },
      fallback: null
    })
    // No execPath override: the daemon must keep forking the current binary off win32.
    expect(hosts.primary.execPath).toBeUndefined()
  })

  it('prefers the relocated host but keeps the install-dir host as a second attempt', () => {
    const hosts = resolveDaemonLaunchHosts(INSTALL_DIR_ENTRY, () => ({
      execPath: 'C:\\Users\\u\\AppData\\Local\\Orca\\daemon-host\\1.0.0\\orca-terminal-daemon.exe',
      entryPath:
        'C:\\Users\\u\\AppData\\Local\\Orca\\daemon-host\\1.0.0\\resources\\daemon-entry.js'
    }))

    expect(hosts.primary.kind).toBe('relocated')
    expect(hosts.primary.execPath).toBe(
      'C:\\Users\\u\\AppData\\Local\\Orca\\daemon-host\\1.0.0\\orca-terminal-daemon.exe'
    )
    expect(hosts.fallback).toEqual({ kind: 'install-dir', entryPath: INSTALL_DIR_ENTRY })
  })

  it('resolves the relocated host once per call, not once per attempt', () => {
    const materialize = vi.fn(() => null)
    resolveDaemonLaunchHosts(INSTALL_DIR_ENTRY, materialize)

    expect(materialize).toHaveBeenCalledTimes(1)
  })
})
