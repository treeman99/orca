import { describe, expect, it } from 'vitest'
import {
  buildConfiguredProxyEnv,
  getProxyBypassRulesFromEnvironment,
  getProxyUrlFromEnvironment,
  normalizeProxyBypassRules,
  normalizeProxyUrl,
  redactProxyUrl
} from './network-proxy'

describe('network proxy settings', () => {
  it('normalizes supported proxy URLs without path, query, or fragment', () => {
    expect(normalizeProxyUrl(' https://user:pass@proxy.example.com:8443/path?q=1#secret ')).toEqual(
      {
        ok: true,
        value: 'https://user:pass@proxy.example.com:8443'
      }
    )
  })

  it('rejects unsupported or malformed proxy URLs', () => {
    expect(normalizeProxyUrl('file:///tmp/proxy').ok).toBe(false)
    expect(normalizeProxyUrl('http://').ok).toBe(false)
    expect(normalizeProxyUrl('not-a-url').ok).toBe(false)
  })

  it('normalizes bypass rules from common separator styles', () => {
    expect(normalizeProxyBypassRules('localhost, 127.0.0.1; *.internal\n<local>')).toBe(
      'localhost;127.0.0.1;*.internal;<local>'
    )
  })

  it('uses standard proxy environment precedence', () => {
    expect(
      getProxyUrlFromEnvironment({
        HTTP_PROXY: 'http://plain.example:8080',
        HTTPS_PROXY: 'https://secure.example:8443'
      })
    ).toEqual({ ok: true, value: 'https://secure.example:8443' })
    expect(
      getProxyBypassRulesFromEnvironment({
        no_proxy: 'localhost,*.internal'
      })
    ).toBe('localhost;*.internal')
  })

  it('builds local PTY proxy env only from explicit settings', () => {
    expect(
      buildConfiguredProxyEnv({
        httpProxyUrl: 'http://proxy.example:8080',
        httpProxyBypassRules: 'localhost;*.internal'
      })
    ).toEqual({
      HTTP_PROXY: 'http://proxy.example:8080',
      HTTPS_PROXY: 'http://proxy.example:8080',
      ALL_PROXY: 'http://proxy.example:8080',
      http_proxy: 'http://proxy.example:8080',
      https_proxy: 'http://proxy.example:8080',
      all_proxy: 'http://proxy.example:8080',
      NO_PROXY: 'localhost,*.internal',
      no_proxy: 'localhost,*.internal'
    })
    expect(buildConfiguredProxyEnv({ httpProxyUrl: '' })).toEqual({})
  })

  it('merges the inherited NO_PROXY with the configured bypass rules', () => {
    const env = buildConfiguredProxyEnv(
      {
        httpProxyUrl: 'http://proxy.example:8080',
        httpProxyBypassRules: 'localhost;github.corp.test'
      },
      { NO_PROXY: 'github.corp.test,10.0.0.0/8' }
    )

    expect(env.NO_PROXY).toBe('localhost,github.corp.test,10.0.0.0/8')
    expect(env.no_proxy).toBe(env.NO_PROXY)
  })

  it('keeps an inherited NO_PROXY when no bypass rules are configured', () => {
    // Corporate internal hosts stay off the external proxy only because of this list.
    const env = buildConfiguredProxyEnv(
      { httpProxyUrl: 'http://proxy.example:8080' },
      { no_proxy: 'github.corp.test, *.corp.test' }
    )

    expect(env.NO_PROXY).toBe('github.corp.test,*.corp.test')
    expect(env.no_proxy).toBe('github.corp.test,*.corp.test')
  })

  it('leaves NO_PROXY unset instead of blanking it', () => {
    const env = buildConfiguredProxyEnv({ httpProxyUrl: 'http://proxy.example:8080' }, {})

    expect('NO_PROXY' in env).toBe(false)
    expect('no_proxy' in env).toBe(false)
  })

  it('redacts credentials for diagnostics', () => {
    expect(redactProxyUrl('http://user:pass@proxy.example:8080')).toBe(
      'http://***:***@proxy.example:8080'
    )
  })
})
