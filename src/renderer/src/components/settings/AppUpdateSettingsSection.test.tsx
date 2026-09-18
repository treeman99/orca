// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateCheckStatus } from '../../../../shared/app-update-check'
import { AppUpdateSettingsSection } from './AppUpdateSettingsSection'
import { getGeneralAppUpdateSearchEntries } from './general-app-update-search'
import { matchesSettingsSearch } from './settings-search'
import { useAppStore } from '../../store'
import {
  resetAppUpdateCheckStoreForTests,
  startAppUpdateCheckSync
} from '../app-update/app-update-check-store'

const TARGET = { host: 'ghe.example.com', repository: 'tools/orca' }
const check = vi.fn()
const openReleasePage = vi.fn()

// `status` is unknown, not AppUpdateCheckStatus: the point of several cases is the
// malformed payload the browser client's fallback proxy hands back.
function installLane(status: unknown, options: { lane?: boolean; target?: unknown } = {}): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      app: { getVersion: vi.fn().mockResolvedValue('1.4.200') },
      appUpdate:
        options.lane === false
          ? undefined
          : {
              getStatus: vi.fn().mockResolvedValue(status),
              check,
              dismissVersion: vi.fn(),
              getLookupTarget: vi.fn().mockResolvedValue(options.target ?? TARGET),
              openReleasePage,
              onStatus: () => () => undefined,
              onCheckRequested: () => () => undefined
            }
    }
  })
}

async function mountSection(): Promise<void> {
  render(<AppUpdateSettingsSection />)
  await act(async () => {
    startAppUpdateCheckSync()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  resetAppUpdateCheckStoreForTests()
  check.mockReset().mockResolvedValue({ state: 'unknown' })
  openReleasePage.mockReset().mockResolvedValue(undefined)
  useAppStore.setState(useAppStore.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  resetAppUpdateCheckStoreForTests()
})

describe('diagnostics readout', () => {
  it('shows the coordinate before any check has run', async () => {
    installLane({ state: 'unknown' })
    await mountSection()

    expect(screen.queryByText('ghe.example.com')).not.toBeNull()
    expect(screen.queryByText('tools/orca')).not.toBeNull()
    expect(screen.queryByText('1.4.200')).not.toBeNull()
  })

  it('says a host is unconfigured rather than showing a blank', async () => {
    installLane({ state: 'unknown' }, { target: { host: null, repository: 'tools/orca' } })
    await mountSection()

    expect(screen.queryByText('Not configured')).not.toBeNull()
  })

  it('shows the latest version and a release action when an upgrade exists', async () => {
    installLane({
      state: 'available',
      currentVersion: '1.4.200',
      latestVersion: '1.4.205',
      releaseTag: 'v1.4.205',
      releaseUrl: 'https://ghe.example.com/tools/orca/releases/tag/v1.4.205',
      dismissed: false,
      target: TARGET,
      checkedAt: 1_700_000_000_000
    })
    await mountSection()

    expect(screen.queryByText('1.4.205')).not.toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open release page' }))
    })
    expect(openReleasePage).toHaveBeenCalledTimes(1)
  })

  it('explains a failed lookup in place', async () => {
    installLane({
      state: 'unavailable',
      reason: 'lookup-failed',
      target: TARGET,
      checkedAt: 1_700_000_000_000
    })
    await mountSection()

    expect(screen.queryByText(/did not answer/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Open release page' })).toBeNull()
  })

  it('shows only the policy notice on a locked-down machine', async () => {
    installLane({ state: 'disabled' })
    await mountSection()

    expect(screen.queryByText(/administrator turned update checks off/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
  })
})

describe('the check button', () => {
  it('runs the lane check and blocks a second press while in flight', async () => {
    installLane({ state: 'unknown' })
    let release: (status: AppUpdateCheckStatus) => void = () => undefined
    check.mockReturnValue(
      new Promise<AppUpdateCheckStatus>((resolve) => {
        release = resolve
      })
    )
    await mountSection()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    })
    const progress = screen.getByRole('button', { name: 'Checking for updates…' })
    expect(progress.hasAttribute('disabled')).toBe(true)

    await act(async () => {
      fireEvent.click(progress)
    })
    expect(check).toHaveBeenCalledTimes(1)

    await act(async () => {
      release({
        state: 'up-to-date',
        currentVersion: '1.4.200',
        latestVersion: '1.4.200',
        target: TARGET,
        checkedAt: 1_700_000_000_000
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeNull()
  })
})

describe('clients without an update lane', () => {
  it('renders nothing at all, not an empty header', async () => {
    installLane({ state: 'unknown' }, { lane: false })
    const { container } = render(<AppUpdateSettingsSection />)
    await act(async () => {
      startAppUpdateCheckSync()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('Updates')).toBeNull()
  })

  it('renders nothing when the browser client fallback proxy answers', async () => {
    // `pnpm dev:web` resolves getStatus() to [] — truthy, and not a status.
    installLane([], { target: undefined })
    const { container } = render(<AppUpdateSettingsSection />)
    await act(async () => {
      startAppUpdateCheckSync()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.innerHTML).toBe('')
  })
})

describe('settings search', () => {
  it('finds the section by what a user would type', () => {
    const entries = getGeneralAppUpdateSearchEntries()

    expect(matchesSettingsSearch('update', entries)).toBe(true)
    expect(matchesSettingsSearch('check for updates', entries)).toBe(true)
    expect(matchesSettingsSearch('version', entries)).toBe(true)
    expect(matchesSettingsSearch('release', entries)).toBe(true)
    expect(matchesSettingsSearch('terminal font', entries)).toBe(false)
  })

  it('keeps the rendered row on the same words the pane gates on', async () => {
    installLane({ state: 'unknown' })
    act(() => useAppStore.setState({ settingsSearchQuery: 'update' }))
    await mountSection()

    expect(screen.queryByText('Updates')).not.toBeNull()
    expect(screen.queryByText('ghe.example.com')).not.toBeNull()
  })
})
