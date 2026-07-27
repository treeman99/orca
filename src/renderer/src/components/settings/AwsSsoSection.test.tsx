// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AwsSsoLoginProgress, AwsSsoStatus } from '../../../../shared/aws-sso-auth'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  setProfile: vi.fn(),
  login: vi.fn(),
  cancelLogin: vi.fn(),
  logout: vi.fn(),
  onLoginProgress: vi.fn(),
  openUrl: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) => {
    let result = fallback
    for (const [key, value] of Object.entries(values ?? {})) {
      result = result.replace(`{{${key}}}`, value)
    }
    return result
  }
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import { AwsSsoSection } from './AwsSsoSection'

const FUTURE = '2026-07-27T20:00:00Z'

function makeStatus(overrides: Partial<AwsSsoStatus> = {}): AwsSsoStatus {
  return {
    awsAvailable: true,
    configPath: '/home/dev/.aws/config',
    profiles: [
      {
        name: 'bedrock',
        startUrl: 'https://corp.awsapps.com/start',
        ssoRegion: 'us-east-1',
        accountId: '123456789012',
        roleName: 'BedrockUser',
        sessionName: 'corp',
        expiresAt: null,
        active: false
      }
    ],
    selectedProfile: 'bedrock',
    ...overrides
  }
}

describe('AwsSsoSection', () => {
  beforeEach(() => {
    mocks.getStatus.mockResolvedValue(makeStatus())
    mocks.login.mockResolvedValue({ ok: true, profile: 'bedrock' })
    mocks.onLoginProgress.mockReturnValue(() => {})
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        awsSso: {
          getStatus: mocks.getStatus,
          setProfile: mocks.setProfile,
          login: mocks.login,
          cancelLogin: mocks.cancelLogin,
          logout: mocks.logout,
          onLoginProgress: mocks.onLoginProgress
        },
        shell: { openUrl: mocks.openUrl }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('lists the profile with its portal details and a not-signed-in badge', async () => {
    render(<AwsSsoSection />)

    expect(await screen.findByRole('option', { name: 'bedrock' })).toBeInTheDocument()
    expect(screen.getByText('Not signed in')).toBeInTheDocument()
    expect(
      screen.getByText('https://corp.awsapps.com/start · 123456789012 · BedrockUser · us-east-1', {
        exact: false
      })
    ).toBeInTheDocument()
  })

  it('shows the expiry of a live session and offers to sign in again', async () => {
    mocks.getStatus.mockResolvedValue(
      makeStatus({
        profiles: [{ ...makeStatus().profiles[0], expiresAt: FUTURE, active: true }]
      })
    )
    render(<AwsSsoSection />)

    expect(await screen.findByText(/Signed in — valid until/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument()
  })

  it('runs the login for the selected profile', async () => {
    render(<AwsSsoSection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith({ profile: 'bedrock', useDeviceCode: false })
    )
  })

  it('passes the device-code choice through to the CLI run', async () => {
    render(<AwsSsoSection />)
    await userEvent.click(await screen.findByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with browser' }))

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith({ profile: 'bedrock', useDeviceCode: true })
    )
  })

  it('shows the device code and opens the authorization page on request', async () => {
    const live: {
      emit: ((progress: AwsSsoLoginProgress) => void) | null
      finish: (() => void) | null
    } = { emit: null, finish: null }
    mocks.onLoginProgress.mockImplementation(
      (callback: (progress: AwsSsoLoginProgress) => void) => {
        live.emit = callback
        return () => {}
      }
    )
    // Hold the login open so the progress card stays mounted.
    mocks.login.mockImplementation(
      () =>
        new Promise((resolve) => {
          live.finish = () => resolve({ ok: true, profile: 'bedrock' })
        })
    )

    render(<AwsSsoSection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))
    await waitFor(() => expect(live.emit).not.toBeNull())
    live.emit?.({
      userCode: 'WXYZ-1234',
      verificationUrl: 'https://device.sso.us-east-1.amazonaws.com/',
      usingDeviceCode: true
    })

    expect(await screen.findByText('WXYZ-1234')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Open authorization page/ }))
    expect(mocks.openUrl).toHaveBeenCalledWith('https://device.sso.us-east-1.amazonaws.com/')

    live.finish?.()
  })

  it('renders the CLI’s own reason when a sign-in fails', async () => {
    mocks.login.mockResolvedValue({
      ok: false,
      reason: 'failed',
      message: 'The config profile (bedrock) could not be found'
    })
    render(<AwsSsoSection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))

    expect(
      await screen.findByText('The config profile (bedrock) could not be found')
    ).toBeInTheDocument()
  })

  it('warns when the AWS CLI is missing', async () => {
    mocks.getStatus.mockResolvedValue(makeStatus({ awsAvailable: false }))
    render(<AwsSsoSection />)

    expect(await screen.findByText(/AWS CLI \(aws\) is not installed/)).toBeInTheDocument()
  })

  it('explains how to create a profile when the config has none', async () => {
    mocks.getStatus.mockResolvedValue(
      makeStatus({ profiles: [], selectedProfile: null, configPath: null })
    )
    render(<AwsSsoSection />)

    expect(await screen.findByText(/aws configure sso/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in with browser' })).not.toBeInTheDocument()
  })
})
