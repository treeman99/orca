import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { ORCA_CLOUD_REMOVED_MESSAGE } from '../../shared/orca-cloud-removal'
import {
  allowsPlaintextOrcaCloudSession,
  getOrcaCloudAuthConfig,
  isOrcaCloudDevAuthEnabled
} from './profile-cloud-auth-config'

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

beforeEach(() => {
  getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
})

describe('Orca cloud auth config', () => {
  // This build removes vendor cloud sign-in, which is also what keeps the desktop mobile relay
  // from starting — index.ts only constructs it when this call reports configured.
  const removed = {
    configured: false,
    setupMessage: ORCA_CLOUD_REMOVED_MESSAGE
  }

  it('reports the cloud removed for a packaged build with no environment', () => {
    expect(getOrcaCloudAuthConfig({}, true)).toEqual(removed)
    expect(getOrcaCloudAuthConfig({})).toEqual(removed)
  })

  it('cannot be restored by cloud or relay environment variables', () => {
    // The env vars are inherited by every process Orca spawns, so a build that honoured them
    // would be one `export` away from reaching the vendor again.
    expect(
      getOrcaCloudAuthConfig(
        {
          ORCA_CLOUD_API_URL: 'https://orca-cloud.example',
          ORCA_CLOUD_CLIENT_ID: 'desktop-client',
          ORCA_CLOUD_AUTH_URL: 'https://orca-cloud.example',
          ORCA_RELAY_URL: 'https://relay.example'
        },
        true
      )
    ).toEqual(removed)
  })

  it('stays removed however the enterprise policy is set', () => {
    // Notably including `disableCloudRelay: false`, the setting a fleet that wants mobile
    // pairing would choose — under the old gate that alone restored vendor sign-in.
    for (const policy of [
      makeEnterprisePolicy(),
      makeLockdownPolicy(),
      makeLockdownPolicy({ disableCloudRelay: false })
    ]) {
      getEnterprisePolicyMock.mockReturnValue(policy)
      expect(getOrcaCloudAuthConfig({}, true)).toEqual(removed)
    }
  })

  it('ships no vendor endpoint for a future rebase to fall back to', () => {
    // Behavioural coverage stops at the guard, so assert the deletion at the source: if an
    // upstream merge restores the packaged fallbacks, the guard is one edit from being the only
    // thing standing between this build and the vendor.
    const source = readFileSync(new URL('./profile-cloud-auth-config.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('onorca.dev')
  })

  it('allows dev plaintext sessions only outside production', () => {
    expect(
      allowsPlaintextOrcaCloudSession({
        ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      allowsPlaintextOrcaCloudSession({
        ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })

  it('ignores dev flags in packaged builds even without NODE_ENV', () => {
    // Why: packaged main bundles never define NODE_ENV, so packaged-ness must
    // gate the escape hatches on its own.
    expect(allowsPlaintextOrcaCloudSession({ ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1' }, true)).toBe(
      false
    )
    expect(isOrcaCloudDevAuthEnabled({ ORCA_CLOUD_DEV_AUTH: '1' }, true)).toBe(false)
  })

  it('allows local dev auth only outside production', () => {
    expect(
      isOrcaCloudDevAuthEnabled({
        ORCA_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      isOrcaCloudDevAuthEnabled({
        ORCA_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })
})
