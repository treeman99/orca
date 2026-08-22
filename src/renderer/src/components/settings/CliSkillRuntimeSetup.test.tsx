import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  buildAgentFeatureSkillInstallCommand,
  buildAgentFeatureSkillUpdateCommand
} from '../../../../shared/agent-feature-install-commands'
import { buildWslLoginShellCommand } from '../../../../shared/wsl-login-shell-command'
import {
  buildSkillCommandForRuntime,
  buildSkillInstallCommandForRuntime,
  buildSkillSetupTerminalCommand,
  getAgentSkillTerminalShellOverride,
  getOrcaCliCommandNameForRuntime,
  getSelectedAgentRuntime,
  getSkillDiscoveryTargetForRuntime
} from './CliSkillRuntimeSetup'

function decodeWslLoginShellScript(command: string): string {
  const encoded =
    /(?:--|--exec) sh -c 'eval \\"`printf %s ([A-Za-z0-9+/=]+) \| base64 -d`\\"'/.exec(command)?.[1]
  expect(encoded).toBeDefined()
  return Buffer.from(encoded!, 'base64').toString('utf8')
}

function getWslOuterShellScript(command: string): string {
  const script = /(?:--|--exec) sh -c '([^']+)' \} # Runs:/.exec(command)?.[1]
  expect(script).toBeDefined()
  // Simulate PowerShell 5.1's native argv boundary consuming quote escapes.
  return script!.replaceAll('\\"', '"')
}

describe('CliSkillRuntimeSetup runtime helpers', () => {
  it('wraps WSL skill installs as a directly runnable selected-distro command', () => {
    const skillCommand = 'npx skills add orchestration --global'
    const command = buildSkillInstallCommandForRuntime(skillCommand, {
      runtime: 'wsl',
      wslDistro: 'Ubuntu',
      label: 'WSL Ubuntu'
    })
    const encoded = Buffer.from(buildWslLoginShellCommand(skillCommand), 'utf8').toString('base64')

    expect(command).toBe(
      `& { $PSNativeCommandArgumentPassing = 'Legacy'; wsl.exe -d 'Ubuntu' --exec sh -c 'eval \\"\`printf %s ${encoded} | base64 -d\`\\"' } # Runs: ${skillCommand}`
    )
    expect(decodeWslLoginShellScript(command)).toContain(
      'exec "$_orca_wsl_shell" -ilc \'npx skills add orchestration --global\''
    )
  })

  it('keeps a Windows-selected WSL install inside WSL without the host preflight', () => {
    const skillCommand = 'npx skills add orchestration --global'
    const command = buildSkillCommandForRuntime(
      skillCommand,
      {
        runtime: 'wsl',
        wslDistro: 'Ubuntu',
        label: 'WSL Ubuntu'
      },
      'win32'
    )

    expect(command).toContain("wsl.exe -d 'Ubuntu'")
    expect(command).not.toContain('where.exe npx')
    expect(decodeWslLoginShellScript(command)).toContain(
      'exec "$_orca_wsl_shell" -ilc \'npx skills add orchestration --global\''
    )
  })

  it('wraps WSL skill updates as a directly runnable selected-distro command', () => {
    const command = buildSkillCommandForRuntime('npx skills update orchestration --global', {
      runtime: 'wsl',
      wslDistro: 'Fedora Remix',
      label: 'WSL Fedora Remix'
    })

    expect(decodeWslLoginShellScript(command)).toContain(
      'exec "$_orca_wsl_shell" -ilc \'npx skills update orchestration --global\''
    )
  })

  it('scopes the PS5-compatible argv mode when pasted into PowerShell 7', () => {
    const command = buildSkillCommandForRuntime('npx skills update orchestration --global', {
      runtime: 'wsl',
      label: 'WSL'
    })

    expect(command).toMatch(
      /^& \{ \$PSNativeCommandArgumentPassing = 'Legacy'; wsl\.exe --exec sh -c 'eval \\"`printf/
    )
    expect(command).toContain('`\\"\' } # Runs: npx skills update orchestration --global')
  })

  it.skipIf(process.platform === 'win32')(
    'runs skill commands with npx from the configured WSL login-shell PATH',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'orca-wsl-skill-command-'))
      const tools = join(root, 'tools')
      const npxBin = join(root, 'npx-bin')
      const loginShell = join(root, 'zsh')
      mkdirSync(tools)
      mkdirSync(npxBin)
      writeFileSync(
        join(tools, 'getent'),
        '#!/bin/sh\nprintf \'%s\\n\' "user:x:1000:1000::/home/user:$ORCA_TEST_LOGIN_SHELL"\n'
      )
      writeFileSync(
        loginShell,
        '#!/bin/sh\nexport PATH="$ORCA_TEST_NPX_BIN:/usr/bin:/bin"\nexec /bin/sh -c "$2"\n'
      )
      writeFileSync(
        join(npxBin, 'npx'),
        '#!/bin/sh\nread -r input\nprintf \'%s:%s\' "$*" "$input"\n'
      )
      chmodSync(join(tools, 'getent'), 0o755)
      chmodSync(loginShell, 0o755)
      chmodSync(join(npxBin, 'npx'), 0o755)

      try {
        const wrapped = buildSkillCommandForRuntime('npx skills update orchestration --global', {
          runtime: 'wsl',
          label: 'WSL'
        })
        expect(
          execFileSync('/bin/sh', ['-c', getWslOuterShellScript(wrapped)], {
            encoding: 'utf8',
            input: 'terminal-input\n',
            env: {
              ...process.env,
              PATH: `${tools}:/usr/bin:/bin`,
              ORCA_TEST_LOGIN_SHELL: loginShell,
              ORCA_TEST_NPX_BIN: npxBin
            }
          })
        ).toBe('skills update orchestration --global:terminal-input')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  )

  // Why: the install runs Orca's own CLI against bundled bytes, so there is no npm
  // package to fetch and nothing for a shell preflight to check.
  it('hands Windows hosts the command exactly as built', () => {
    const installCommand = buildAgentFeatureSkillInstallCommand(['orca-cli', 'orchestration'])
    const windowsHost = { runtime: 'host', label: 'Windows' } as const

    expect(buildSkillCommandForRuntime(installCommand, windowsHost, 'win32')).toBe(installCommand)
    expect(buildSkillCommandForRuntime(installCommand, undefined, 'win32')).toBe(installCommand)
    expect(installCommand).not.toContain('npx')
  })

  it('keeps Windows-host skill updates on the update command', () => {
    const updateCommand = buildAgentFeatureSkillUpdateCommand('orchestration')

    expect(
      buildSkillCommandForRuntime(updateCommand, { runtime: 'host', label: 'Windows' }, 'win32')
    ).toBe(updateCommand)
  })

  // Why: `/usr/bin/orca` on Linux is GNOME's screen reader, so a pasted `orca ...`
  // there would run the wrong program. Linux and WSL register `orca-ide` instead.
  it('retargets the command name for Linux hosts and WSL', () => {
    const installCommand = buildAgentFeatureSkillInstallCommand(['orchestration'])
    const linuxHost = { runtime: 'host', label: 'This device' } as const

    expect(buildSkillCommandForRuntime(installCommand, linuxHost, 'linux')).toBe(
      installCommand.replace(/^orca /, 'orca-ide ')
    )
    expect(getOrcaCliCommandNameForRuntime(linuxHost, 'linux')).toBe('orca-ide')
    expect(getOrcaCliCommandNameForRuntime({ runtime: 'wsl', label: 'WSL' }, 'win32')).toBe(
      'orca-ide'
    )
    expect(getOrcaCliCommandNameForRuntime({ runtime: 'host', label: 'Mac' }, 'darwin')).toBe(
      'orca'
    )
  })

  it('keeps non-Windows host skill updates on the update path', () => {
    const updateCommand = buildAgentFeatureSkillUpdateCommand('orchestration')

    expect(
      buildSkillCommandForRuntime(updateCommand, { runtime: 'host', label: 'Mac' }, 'darwin')
    ).toBe(updateCommand)
  })

  it('runs the setup terminal command exactly as copied on Windows and macOS', () => {
    const installCommand = buildAgentFeatureSkillInstallCommand(['orchestration'])
    const copied = buildSkillCommandForRuntime(
      installCommand,
      { runtime: 'host', label: 'Windows' },
      'win32'
    )

    expect(buildSkillSetupTerminalCommand(copied)).toBe(copied)
  })

  // Why: Orca-managed PTYs prepend a shim dir that provides bare `orca` and only that
  // name, so a Linux setup terminal running `orca-ide` would fail unless the user had
  // already registered the CLI and had ~/.local/bin on PATH.
  it('uses the bare command inside the Linux setup terminal but not in the copied string', () => {
    const installCommand = buildAgentFeatureSkillInstallCommand(['orchestration'])
    const copied = buildSkillCommandForRuntime(
      installCommand,
      { runtime: 'host', label: 'This device' },
      'linux'
    )

    expect(copied).toBe('orca-ide skills install --skill orchestration')
    expect(buildSkillSetupTerminalCommand(copied)).toBe('orca skills install --skill orchestration')
  })

  it('leaves the WSL payload on the name registered inside WSL', () => {
    const wslCommand = buildSkillCommandForRuntime(
      buildAgentFeatureSkillInstallCommand(['orchestration']),
      { runtime: 'wsl', wslDistro: 'Ubuntu', label: 'WSL Ubuntu' },
      'win32'
    )

    expect(buildSkillSetupTerminalCommand(wslCommand)).toBe(wslCommand)
    expect(decodeWslLoginShellScript(wslCommand)).toContain('orca-ide skills install')
  })

  it('leaves the WSL setup terminal command untouched', () => {
    const wslCommand = buildSkillCommandForRuntime(
      buildAgentFeatureSkillInstallCommand(['orchestration']),
      { runtime: 'wsl', wslDistro: 'Ubuntu', label: 'WSL Ubuntu' },
      'win32'
    )

    expect(buildSkillSetupTerminalCommand(wslCommand)).toBe(wslCommand)
  })

  it('does not wrap unrelated Windows host commands', () => {
    expect(
      buildSkillCommandForRuntime(
        'orca skills list',
        {
          runtime: 'host',
          label: 'Windows'
        },
        'win32'
      )
    ).toBe('orca skills list')
  })

  it('forces PowerShell for the skill terminal when Windows runs a POSIX-family shell', () => {
    const hostRuntime = { runtime: 'host', label: 'Windows' } as const
    const overrideFor = (terminalWindowsShell: string): string | undefined =>
      getAgentSkillTerminalShellOverride(
        'win32',
        { ...getDefaultSettings('/tmp'), terminalWindowsShell },
        hostRuntime
      )

    // Git Bash rewrites the leading /d /s /c arguments as MSYS paths.
    expect(overrideFor('git-bash')).toBe('powershell.exe')
    expect(overrideFor('wsl.exe')).toBe('powershell.exe')
    expect(overrideFor('cmd.exe')).toBeUndefined()
    expect(overrideFor('powershell.exe')).toBeUndefined()
  })

  it('preserves the selected WSL distro for skill discovery', () => {
    expect(
      getSkillDiscoveryTargetForRuntime({
        runtime: 'wsl',
        wslDistro: 'Ubuntu',
        label: 'WSL Ubuntu'
      })
    ).toEqual({ runtime: 'wsl', wslDistro: 'Ubuntu' })
  })

  it('uses the global project runtime default instead of stale WSL agent location', () => {
    expect(
      getSelectedAgentRuntime(
        {
          ...getDefaultSettings('/tmp'),
          localAgentRuntime: 'wsl',
          localAgentWslDistro: 'Debian',
          terminalWindowsShell: 'wsl.exe',
          terminalWindowsWslDistro: 'Debian',
          localWindowsRuntimeDefault: { kind: 'windows-host' }
        },
        true,
        true,
        false
      )
    ).toMatchObject({ runtime: 'host' })
  })

  it('uses the WSL global project runtime default instead of stale host agent location', () => {
    expect(
      getSelectedAgentRuntime(
        {
          ...getDefaultSettings('/tmp'),
          localAgentRuntime: 'host',
          terminalWindowsShell: 'powershell.exe',
          localWindowsRuntimeDefault: { kind: 'wsl', distro: 'Ubuntu' }
        },
        true,
        true,
        false
      )
    ).toEqual({ runtime: 'wsl', wslDistro: 'Ubuntu', label: 'WSL Ubuntu' })
  })
})
