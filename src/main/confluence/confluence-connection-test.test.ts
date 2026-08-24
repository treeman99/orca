import { describe, expect, it, vi } from 'vitest'
import { testConfluenceConnection } from './confluence-connection-test'

const BASE = 'https://confluence.example.net'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function redirect(to: string, status = 301): Response {
  // `Response.redirect` forbids reading the body/headers the same way; build it directly.
  return new Response(null, { status, headers: { location: to } })
}

describe('testConfluenceConnection', () => {
  it('sends the bearer credential the server asks for', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [{ name: 'Engineering' }] }))
    const result = await testConfluenceConnection({
      baseUrl: BASE,
      token: ' tok ',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result).toEqual({ ok: true, displayName: 'Engineering' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/rest/api/space?limit=1`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  // The reason redirects are handled at all: per the fetch spec a redirect that changes ORIGIN
  // drops `Authorization`, so silently following one turns a good token into a mystery 401.
  it('refuses a cross-origin redirect and names the URL to use instead', async () => {
    const fetchImpl = vi.fn(async () => redirect('https://wiki.example.net/rest/api/space?limit=1'))
    const result = await testConfluenceConnection({
      baseUrl: 'http://confluence.example.net',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'redirected',
      suggestedBaseUrl: 'https://wiki.example.net'
    })
    // One request only: the second hop is what would have leaked the 401.
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('treats an http→https redirect of the SAME host as cross-origin', async () => {
    const fetchImpl = vi.fn(async () => redirect('https://confluence.example.net/rest/api/space'))
    const result = await testConfluenceConnection({
      baseUrl: 'http://confluence.example.net',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result).toMatchObject({ reason: 'redirected', suggestedBaseUrl: BASE })
  })

  it('follows a same-origin redirect with the credential intact', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirect(`${BASE}/confluence/rest/api/space?limit=1`))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
    const result = await testConfluenceConnection({
      baseUrl: BASE,
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    expect(result).toEqual({ ok: true, displayName: null })
    const [, second] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect((second.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('gives up on a same-origin redirect loop instead of hanging', async () => {
    const fetchImpl = vi.fn(async () => redirect(`${BASE}/rest/api/space?limit=1`))
    expect(
      await testConfluenceConnection({
        baseUrl: BASE,
        token: 'tok',
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).toMatchObject({ reason: 'redirected' })
  })

  it('reports a rejected token separately from a redirect', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    expect(
      await testConfluenceConnection({
        baseUrl: BASE,
        token: 'tok',
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).toMatchObject({ reason: 'unauthorized' })
  })

  // The three 401s that look identical from outside but need different fixes.
  it('names a CAPTCHA lockout rather than blaming the token', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 401,
          headers: {
            'x-authentication-denied-reason': 'CAPTCHA_CHALLENGE; login-url=/login.action'
          }
        })
    )
    const result = await testConfluenceConnection({
      baseUrl: BASE,
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result).toMatchObject({ reason: 'unauthorized' })
    expect((result as { message: string }).message).toMatch(/CAPTCHA/i)
  })

  it('points at a gateway when the challenge is not a bearer scheme', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 401,
          headers: { 'www-authenticate': 'Negotiate' }
        })
    )
    const result = await testConfluenceConnection({
      baseUrl: BASE,
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect((result as { message: string }).message).toMatch(/Negotiate/)
  })

  it('says a bare 401 was probably not answered by Confluence at all', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    const result = await testConfluenceConnection({
      baseUrl: BASE,
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect((result as { message: string }).message).toMatch(/gateway/i)
  })

  // A token copied across a line wrap fails as an ordinary 401, which sends people hunting the
  // wrong thing — catch it before the request.
  it('rejects a token with whitespace inside without calling out', async () => {
    const fetchImpl = vi.fn()
    const result = await testConfluenceConnection({
      baseUrl: BASE,
      token: 'abc def',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect((result as { message: string }).message).toMatch(/line wrap|unbroken/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses to call anything when half the credential is missing', async () => {
    const fetchImpl = vi.fn()
    expect(
      await testConfluenceConnection({
        baseUrl: BASE,
        token: '   ',
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).toMatchObject({ reason: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
