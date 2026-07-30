// Behavioural gate tests for `disablePlugins`.
//
// A resolver test would only prove the policy object is right. These assert what the
// switch is actually for: that no plugin code path reaches the vendor marketplace over
// `git` or the kill-list endpoint over `fetch` — the two lanes `enforceNetworkAllowlist`
// cannot see. Each one calls the real chokepoint, not a caller.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

const { getEnterprisePolicyMock, execFileMock } = vi.hoisted(() => ({
  getEnterprisePolicyMock: vi.fn(),
  execFileMock: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

vi.mock('node:child_process', () => ({
  execFile: (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
  ) => {
    execFileMock()
    callback(null, { stdout: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', stderr: '' })
  }
}))

import { checkoutPluginGitSource, runPluginGit } from './plugin-git-repository'
import { fetchPluginKillList } from './plugin-kill-list-service'
import { isPluginSystemAllowed } from './plugin-system-policy'

beforeEach(() => {
  getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  execFileMock.mockReset()
})

describe('disablePlugins', () => {
  it('overrides the user setting, unlike every other switch', () => {
    expect(isPluginSystemAllowed(true)).toBe(true)

    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    // The point of the switch: the person at the keyboard opted in and the policy still wins.
    expect(isPluginSystemAllowed(true)).toBe(false)
    expect(isPluginSystemAllowed(false)).toBe(false)
    expect(isPluginSystemAllowed(undefined)).toBe(false)
  })

  it('is inherited from lockdown', () => {
    expect(makeLockdownPolicy().disablePlugins).toBe(true)
    // ...and a fleet that wants plugins can opt this one back in.
    expect(makeLockdownPolicy({ disablePlugins: false }).disablePlugins).toBe(false)
  })

  it('refuses the marketplace Git subprocess', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    await expect(runPluginGit(['rev-parse', 'HEAD'], '/tmp')).rejects.toThrow(
      /disabled by an enterprise policy/
    )
    // Not "spawned and failed" — never spawned. This lane is invisible to the allowlist.
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('refuses a clone even for an otherwise valid HTTPS source', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    await expect(
      checkoutPluginGitSource({
        url: 'https://github.com/stablyai/orca-plugins.git',
        ref: 'main',
        destination: '/tmp/orca-plugin-test',
        workingDirectory: '/tmp'
      })
    ).rejects.toThrow(/disabled by an enterprise policy/)
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('refuses the vendor kill-list fetch without opening a socket', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const fetcher = vi.fn()
    await expect(fetchPluginKillList(fetcher as unknown as typeof fetch)).rejects.toThrow(
      /disabled by an enterprise policy/
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('leaves both lanes open when the policy permits plugins', async () => {
    await expect(runPluginGit(['rev-parse', 'HEAD'], '/tmp')).resolves.toContain('deadbeef')
    expect(execFileMock).toHaveBeenCalled()

    const fetcher = vi.fn().mockRejectedValue(new Error('network reached'))
    await expect(fetchPluginKillList(fetcher as unknown as typeof fetch)).rejects.toThrow(
      'network reached'
    )
    expect(fetcher).toHaveBeenCalledWith('https://onorca.dev/plugins/kill-list.json', {
      cache: 'no-store'
    })
  })
})
