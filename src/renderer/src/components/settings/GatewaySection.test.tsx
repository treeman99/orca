// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GatewayLoginProgress, GatewayStatus } from '../../../../shared/gateway-auth'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  login: vi.fn(),
  cancelLogin: vi.fn(),
  onLoginProgress: vi.fn(),
  openUrl: vi.fn()
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

import { GatewaySection } from './GatewaySection'

const FUTURE = '2026-07-27T20:00:00Z'

function makeStatus(overrides: Partial<GatewayStatus> = {}): GatewayStatus {
  return {
    gatewayAvailable: true,
    version: null,
    signedIn: false,
    expiresAt: null,
    identity: null,
    detail: null,
    ...overrides
  }
}

describe('GatewaySection', () => {
  beforeEach(() => {
    mocks.getStatus.mockResolvedValue(makeStatus())
    mocks.login.mockResolvedValue({ ok: true })
    mocks.onLoginProgress.mockReturnValue(() => {})
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        gateway: {
          getStatus: mocks.getStatus,
          login: mocks.login,
          cancelLogin: mocks.cancelLogin,
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

  it('warns when the gateway CLI is missing', async () => {
    mocks.getStatus.mockResolvedValue(makeStatus({ gatewayAvailable: false }))
    render(<GatewaySection />)

    expect(await screen.findByText(/could not run `gateway-cli`/)).toBeInTheDocument()
  })

  it('shows the expiry, identity and version of a live session, and offers to sign in again', async () => {
    mocks.getStatus.mockResolvedValue(
      makeStatus({
        signedIn: true,
        expiresAt: FUTURE,
        identity: 'dev@corp.example',
        version: '1.4.0'
      })
    )
    render(<GatewaySection />)

    expect(await screen.findByText(/Signed in — valid until/)).toBeInTheDocument()
    expect(screen.getByText('dev@corp.example')).toBeInTheDocument()
    expect(screen.getByText('1.4.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
  })

  it('reports a session that expired without a live one', async () => {
    mocks.getStatus.mockResolvedValue(makeStatus({ expiresAt: FUTURE }))
    render(<GatewaySection />)

    expect(await screen.findByText('Session expired')).toBeInTheDocument()
  })

  it('runs the login with no arguments — there is no profile to pass', async () => {
    render(<GatewaySection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))

    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
    expect(mocks.login).toHaveBeenCalledWith()
  })

  it('shows the user code and opens the authorization page on request', async () => {
    const live: {
      emit: ((progress: GatewayLoginProgress) => void) | null
      finish: (() => void) | null
    } = { emit: null, finish: null }
    mocks.onLoginProgress.mockImplementation(
      (callback: (progress: GatewayLoginProgress) => void) => {
        live.emit = callback
        return () => {}
      }
    )
    // Hold the login open so the progress card stays mounted.
    mocks.login.mockImplementation(
      () =>
        new Promise((resolve) => {
          live.finish = () => resolve({ ok: true })
        })
    )

    render(<GatewaySection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))
    await waitFor(() => expect(live.emit).not.toBeNull())
    live.emit?.({
      userCode: 'WXYZ-1234',
      verificationUrl: 'https://gateway.corp.example/device'
    })

    expect(await screen.findByText('WXYZ-1234')).toBeInTheDocument()
    expect(screen.getByText(/Enter this code to authorize/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Open authorization page/ }))
    expect(mocks.openUrl).toHaveBeenCalledWith('https://gateway.corp.example/device')

    live.finish?.()
  })

  it('waits without a code when the flow prints none', async () => {
    const live: { finish: (() => void) | null } = { finish: null }
    mocks.login.mockImplementation(
      () =>
        new Promise((resolve) => {
          live.finish = () => resolve({ ok: true })
        })
    )

    render(<GatewaySection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))

    expect(await screen.findByText(/Finish the authorization there/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.cancelLogin).toHaveBeenCalledTimes(1)

    live.finish?.()
  })

  it('renders the CLI’s own reason when a sign-in fails', async () => {
    mocks.login.mockResolvedValue({
      ok: false,
      reason: 'failed',
      message: 'gateway rejected the OIDC assertion'
    })
    render(<GatewaySection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))

    expect(await screen.findByText('gateway rejected the OIDC assertion')).toBeInTheDocument()
  })

  it('explains each structured failure reason', async () => {
    const cases: [string, RegExp][] = [
      ['gateway-unavailable', /Confirm `gateway-cli --version` works in a terminal/],
      ['pty-unavailable', /could not start a terminal to run `gateway-cli`/],
      ['timeout', /timed out before it completed in the browser/],
      ['cancelled', /Sign-in was cancelled/]
    ]
    for (const [reason, expected] of cases) {
      mocks.login.mockResolvedValue({ ok: false, reason })
      render(<GatewaySection />)
      await userEvent.click(await screen.findByRole('button', { name: 'Sign in with browser' }))

      expect(await screen.findByText(expected)).toBeInTheDocument()
      cleanup()
    }
  })

  it('shows the verify detail line when nothing more specific parsed', async () => {
    mocks.getStatus.mockResolvedValue(makeStatus({ detail: 'no active session' }))
    render(<GatewaySection />)

    expect(await screen.findByText('no active session')).toBeInTheDocument()
  })
})
