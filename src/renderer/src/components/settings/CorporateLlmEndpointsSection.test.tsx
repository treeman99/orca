// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CorporateLlmEndpointStatus } from '../../../../shared/corporate-llm-endpoint-status'

const mocks = vi.hoisted(() => ({
  listEndpoints: vi.fn(),
  saveToken: vi.fn(),
  clearToken: vi.fn(),
  addUserEndpoint: vi.fn(),
  removeUserEndpoint: vi.fn(),
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

import { CorporateLlmEndpointsSection } from './CorporateLlmEndpointsSection'

const ENDPOINT: CorporateLlmEndpointStatus = {
  id: 'inhouse',
  label: 'In-house Llama',
  baseUrl: 'https://llm.corp.example.com/v1',
  api: 'openai',
  model: 'llama-3.3-70b',
  hasToken: false,
  userManaged: false
}

describe('CorporateLlmEndpointsSection', () => {
  beforeEach(() => {
    mocks.listEndpoints.mockResolvedValue([ENDPOINT])
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        corporateLlm: {
          listEndpoints: mocks.listEndpoints,
          saveToken: mocks.saveToken,
          clearToken: mocks.clearToken,
          addUserEndpoint: mocks.addUserEndpoint,
          removeUserEndpoint: mocks.removeUserEndpoint
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the host a token would be trusted with, masked entry, and the not-saved state', async () => {
    render(<CorporateLlmEndpointsSection />)

    expect(await screen.findByText('https://llm.corp.example.com/v1')).toBeInTheDocument()
    expect(screen.getByText('No token')).toBeInTheDocument()
    expect(screen.getByLabelText('Token for In-house Llama')).toHaveAttribute('type', 'password')
    // Nothing to forget until a token exists.
    expect(screen.queryByRole('button', { name: 'Forget token' })).not.toBeInTheDocument()
  })

  it('explains that an encryption failure means the token was not written', async () => {
    mocks.saveToken.mockResolvedValue({ ok: false, reason: 'encryption-unavailable' })
    render(<CorporateLlmEndpointsSection />)

    await userEvent.type(await screen.findByLabelText('Token for In-house Llama'), 'sk-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(/will not write a token to disk in plain text/i)
    ).toBeInTheDocument()
    // The refusal must not be reported as a save.
    expect(screen.getByText('No token')).toBeInTheDocument()
  })

  it('flips to the saved state without ever reading the token back', async () => {
    mocks.saveToken.mockResolvedValue({ ok: true, hasToken: true })
    render(<CorporateLlmEndpointsSection />)

    const input = await screen.findByLabelText('Token for In-house Llama')
    await userEvent.type(input, 'sk-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Token saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Forget token' })).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(document.body.textContent).not.toContain('sk-secret')
  })

  it('offers an add form so a user can connect a self-hosted model by URL + token', async () => {
    mocks.listEndpoints.mockResolvedValue([])
    render(<CorporateLlmEndpointsSection />)

    expect(
      await screen.findByPlaceholderText('https://llm.your-company.com/v1')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    // No per-endpoint token row exists until an endpoint is added.
    expect(
      screen.queryByPlaceholderText('Paste your token for this endpoint')
    ).not.toBeInTheDocument()
  })

  it('adds a user endpoint from URL + token, then re-lists', async () => {
    mocks.listEndpoints.mockResolvedValue([])
    mocks.addUserEndpoint.mockResolvedValue({
      ok: true,
      endpoint: {
        id: 'user-1',
        label: 'Mine',
        baseUrl: 'https://llm.mine/v1',
        api: 'openai',
        model: null,
        hasToken: false,
        userManaged: true
      }
    })
    mocks.saveToken.mockResolvedValue({ ok: true, hasToken: true })
    render(<CorporateLlmEndpointsSection />)

    await userEvent.type(
      await screen.findByPlaceholderText('https://llm.your-company.com/v1'),
      'https://llm.mine/v1'
    )
    await userEvent.type(
      screen.getByPlaceholderText('Token (optional — you can add it later)'),
      'sk-mine'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(mocks.addUserEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://llm.mine/v1', api: 'openai' })
    )
    expect(mocks.saveToken).toHaveBeenCalledWith({ endpointId: 'user-1', token: 'sk-mine' })
    expect(document.body.textContent).not.toContain('sk-mine')
  })

  it('shows a remove control only for user-added endpoints', async () => {
    mocks.listEndpoints.mockResolvedValue([
      ENDPOINT,
      { ...ENDPOINT, id: 'user-1', label: 'Mine', userManaged: true }
    ])
    render(<CorporateLlmEndpointsSection />)

    const removeButtons = await screen.findAllByRole('button', { name: 'Remove endpoint' })
    // One remove control, for the single user-managed endpoint.
    expect(removeButtons).toHaveLength(1)
  })
})
