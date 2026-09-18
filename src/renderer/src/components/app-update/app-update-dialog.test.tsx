// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateCheckStatus } from '../../../../shared/app-update-check'
import AppUpdateAvailableDialog from '../AppUpdateAvailableDialog'
import { useAppStore } from '../../store'
import {
  resetAppUpdateCheckStoreForTests,
  runManualAppUpdateCheck,
  startAppUpdateCheckSync
} from './app-update-check-store'

const TARGET = { host: 'ghe.example.com', repository: 'tools/orca' }
const AVAILABLE: AppUpdateCheckStatus = {
  state: 'available',
  currentVersion: '1.4.200',
  latestVersion: '1.4.205',
  releaseTag: 'v1.4.205',
  releaseUrl: 'https://ghe.example.com/tools/orca/releases/tag/v1.4.205',
  dismissed: false,
  target: TARGET,
  checkedAt: 1_700_000_000_000
}

const dismissVersion = vi.fn()
const openReleasePage = vi.fn()
let statusListeners: ((status: AppUpdateCheckStatus) => void)[] = []
let checkResult: Promise<AppUpdateCheckStatus>

function installLane(options: { lane?: boolean } = {}): void {
  statusListeners = []
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      app: { getVersion: vi.fn().mockResolvedValue('1.4.200') },
      appUpdate:
        options.lane === false
          ? undefined
          : {
              getStatus: vi.fn().mockResolvedValue({ state: 'unknown' }),
              check: vi.fn(() => checkResult),
              dismissVersion,
              getLookupTarget: vi.fn().mockResolvedValue(TARGET),
              openReleasePage,
              onStatus: (callback: (status: AppUpdateCheckStatus) => void) => {
                statusListeners.push(callback)
                return () => undefined
              },
              onCheckRequested: () => () => undefined
            }
    }
  })
}

async function mountDialog(): Promise<void> {
  render(<AppUpdateAvailableDialog />)
  await act(async () => {
    startAppUpdateCheckSync()
  })
}

async function pushBackgroundStatus(status: AppUpdateCheckStatus): Promise<void> {
  await act(async () => {
    for (const listener of statusListeners) {
      listener(status)
    }
  })
}

async function runManualCheck(status: AppUpdateCheckStatus): Promise<void> {
  checkResult = Promise.resolve(status)
  await act(async () => {
    await runManualAppUpdateCheck()
  })
}

beforeEach(() => {
  resetAppUpdateCheckStoreForTests()
  dismissVersion.mockReset().mockResolvedValue({ ...AVAILABLE, dismissed: true })
  openReleasePage.mockReset().mockResolvedValue(undefined)
  checkResult = Promise.resolve({ state: 'unknown' })
  installLane()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  resetAppUpdateCheckStoreForTests()
})

describe('scheduled checks', () => {
  it('interrupts for an upgrade nobody skipped', async () => {
    await mountDialog()
    await pushBackgroundStatus(AVAILABLE)

    expect(screen.queryByText(/A newer version of Orca is available/)).not.toBeNull()
    expect(screen.queryByText(/v1\.4\.205/)).not.toBeNull()
  })

  it('stays silent when the build is current', async () => {
    await mountDialog()
    await pushBackgroundStatus({
      state: 'up-to-date',
      currentVersion: '1.4.205',
      latestVersion: '1.4.205',
      target: TARGET,
      checkedAt: 1
    })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays silent when the lookup fails', async () => {
    await mountDialog()
    await pushBackgroundStatus({
      state: 'unavailable',
      reason: 'lookup-failed',
      target: TARGET,
      checkedAt: 1
    })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays silent for a version the user skipped', async () => {
    await mountDialog()
    await pushBackgroundStatus({ ...AVAILABLE, dismissed: true })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('waits behind another modal', async () => {
    act(() => useAppStore.setState({ activeModal: 'quick-open' }))
    await mountDialog()
    await pushBackgroundStatus(AVAILABLE)

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('checks the user asked for', () => {
  it('shows the upgrade offer', async () => {
    await mountDialog()
    await runManualCheck(AVAILABLE)

    expect(screen.queryByText(/A newer version of Orca is available/)).not.toBeNull()
  })

  it('says so when the build is current', async () => {
    await mountDialog()
    await runManualCheck({
      state: 'up-to-date',
      currentVersion: '1.4.205',
      latestVersion: '1.4.205',
      target: TARGET,
      checkedAt: 1
    })

    expect(screen.queryByText('Orca is up to date')).not.toBeNull()
    expect(screen.queryByText(/1\.4\.205/)).not.toBeNull()
  })

  it('names a missing corporate host as configuration, not network', async () => {
    await mountDialog()
    await runManualCheck({
      state: 'unavailable',
      reason: 'no-enterprise-host',
      target: { host: null, repository: 'tools/orca' },
      checkedAt: 1
    })

    expect(screen.queryByText(/No corporate GitHub Enterprise host is configured/)).not.toBeNull()
    expect(screen.queryByText('Not configured')).not.toBeNull()
  })

  it('shows the coordinate it could not reach', async () => {
    await mountDialog()
    await runManualCheck({
      state: 'unavailable',
      reason: 'lookup-failed',
      target: TARGET,
      checkedAt: 1
    })

    expect(screen.queryByText(/did not answer/)).not.toBeNull()
    expect(screen.queryByText('ghe.example.com')).not.toBeNull()
    expect(screen.queryByText('tools/orca')).not.toBeNull()
  })

  it('separates an empty repository from an unreachable one', async () => {
    await mountDialog()
    await runManualCheck({
      state: 'unavailable',
      reason: 'no-release',
      target: TARGET,
      checkedAt: 1
    })

    expect(screen.queryByText(/publishes no release tag yet/)).not.toBeNull()
  })

  it('names the administrator when the policy turned checks off', async () => {
    await mountDialog()
    await runManualCheck({ state: 'disabled' })

    expect(screen.queryByText('Update checks are turned off')).not.toBeNull()
  })

  it('still answers when the lane does not respond', async () => {
    await mountDialog()
    checkResult = Promise.reject(new Error('no handler registered'))
    await act(async () => {
      await runManualAppUpdateCheck()
    })

    expect(screen.queryByText(/could not run the check/)).not.toBeNull()
  })

  it('answers over another modal, because the user asked for it', async () => {
    act(() => useAppStore.setState({ activeModal: 'quick-open' }))
    await mountDialog()
    await runManualCheck({
      state: 'up-to-date',
      currentVersion: '1.4.205',
      latestVersion: '1.4.205',
      target: TARGET,
      checkedAt: 1
    })

    expect(screen.queryByText('Orca is up to date')).not.toBeNull()
  })

  it('closes the result and leaves nothing behind', async () => {
    await mountDialog()
    await runManualCheck({ state: 'disabled' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('upgrade offer actions', () => {
  it('remembers a skipped version and closes', async () => {
    await mountDialog()
    await pushBackgroundStatus(AVAILABLE)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skip this version' }))
    })
    expect(dismissVersion).toHaveBeenCalledWith({ version: '1.4.205' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the release page main owns', async () => {
    await mountDialog()
    await pushBackgroundStatus(AVAILABLE)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open release page' }))
    })
    expect(openReleasePage).toHaveBeenCalledTimes(1)
  })

  it('steps aside on Later without forgetting the version', async () => {
    await mountDialog()
    await pushBackgroundStatus(AVAILABLE)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    })
    expect(dismissVersion).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('clients without an update lane', () => {
  it('renders nothing', async () => {
    installLane({ lane: false })
    await mountDialog()

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
