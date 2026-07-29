// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GithubEnterpriseAuthStatus } from '../../../../shared/github-enterprise-auth'
import { i18n } from '../../i18n/i18n'
import { useAppStore } from '../../store'
import {
  EffectiveGitHubHostSetting,
  effectiveGitHubHostMatchesSearch
} from './EffectiveGitHubHostSetting'

const roots: Root[] = []

function makeStatus(
  overrides: Partial<GithubEnterpriseAuthStatus> = {}
): GithubEnterpriseAuthStatus {
  return {
    ghAvailable: true,
    host: 'github.example.com',
    authenticated: true,
    account: 'daegun',
    effectiveHost: 'github.example.com',
    effectiveHostSource: 'enterprise-policy',
    ...overrides
  }
}

async function renderSetting(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<EffectiveGitHubHostSetting />)
  })
  return container
}

describe('EffectiveGitHubHostSetting', () => {
  beforeEach(() => {
    useAppStore.setState({ settingsSearchQuery: '' })
    window.api = {
      githubEnterprise: {
        getStatus: vi.fn().mockResolvedValue(makeStatus())
      }
    } as never
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => {
      act(() => root.unmount())
    })
    document.body.replaceChildren()
  })

  it('shows the host requests actually go to, and where that value came from', async () => {
    const container = await renderSetting()

    await vi.waitFor(() => expect(container.textContent).toContain('github.example.com'))
    expect(container.textContent).toContain('from your organization’s Orca policy')
  })

  it('reports the vendor default rather than the saved corporate host', async () => {
    // The policy's host does not redirect gh; showing `host` here would claim a
    // corporate destination for requests that still leave for github.com.
    window.api.githubEnterprise.getStatus = vi.fn().mockResolvedValue(
      makeStatus({
        host: 'github.example.com',
        effectiveHost: 'github.com',
        effectiveHostSource: 'default'
      })
    )

    const container = await renderSetting()

    await vi.waitFor(() => expect(container.textContent).toContain('github.com'))
    expect(container.textContent).not.toContain('github.example.com')
  })

  it('keeps the pane usable when the host status cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.api.githubEnterprise.getStatus = vi.fn().mockRejectedValue(new Error('ipc down'))

    const container = await renderSetting()

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(container.textContent).toContain('Checking…')
    consoleError.mockRestore()
  })

  it('is findable by the words someone types looking for the git address', () => {
    expect(effectiveGitHubHostMatchesSearch('git address')).toBe(true)
    expect(effectiveGitHubHostMatchesSearch('ghes')).toBe(true)
    expect(effectiveGitHubHostMatchesSearch('host')).toBe(true)
    expect(effectiveGitHubHostMatchesSearch('branch prefix')).toBe(false)
  })

  it('is findable in the UI language, not just English', async () => {
    // Caught live: a hardcoded English keyword array hid the section for "git 주소".
    await i18n.changeLanguage('ko')
    try {
      expect(effectiveGitHubHostMatchesSearch('git 주소')).toBe(true)
      expect(effectiveGitHubHostMatchesSearch('리모트 호스트')).toBe(true)
      expect(effectiveGitHubHostMatchesSearch('git address')).toBe(true)
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
