// The diagnostics/crash lane resolves consent independently of
// src/main/telemetry/consent.ts (the two lanes never share a code path), so the
// administrator policy has to be asserted separately here — a gate on only one
// resolver still leaves crash/feedback bundles uploading under lockdown.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/orca-observability-consent-test' } }))

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

import { getDiagnosticsStatus, resolveObservabilityConsent } from './index'

// Blanked rather than deleted: an empty value reads as "unset" to both `envOn`
// and the CI probe, and CI runners really do export CI/GITHUB_ACTIONS.
const ENV_KEYS_UNDER_TEST = [
  'DO_NOT_TRACK',
  'ORCA_TELEMETRY_DISABLED',
  'ORCA_DIAGNOSTICS_DISABLED',
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'JENKINS_URL',
  'TEAMCITY_VERSION'
]

beforeEach(() => {
  for (const key of ENV_KEYS_UNDER_TEST) {
    vi.stubEnv(key, '')
  }
  getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveObservabilityConsent — enterprise policy', () => {
  it('leaves both lanes on when no policy applies', () => {
    expect(resolveObservabilityConsent()).toEqual({
      localFileEnabled: true,
      bundleEnabled: true
    })
  })

  it('disables the diagnostic bundle lane under a locked-down policy', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(resolveObservabilityConsent()).toEqual({
      localFileEnabled: true,
      bundleEnabled: false,
      disabledReason: 'enterprise_policy'
    })
  })

  it('lets an explicit disableTelemetry=false keep bundles available', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ disableTelemetry: false }))
    expect(resolveObservabilityConsent()).toEqual({
      localFileEnabled: true,
      bundleEnabled: true
    })
  })

  it('keeps ORCA_DIAGNOSTICS_DISABLED ahead of the policy so local logs stop too', () => {
    vi.stubEnv('ORCA_DIAGNOSTICS_DISABLED', '1')
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(resolveObservabilityConsent()).toEqual({
      localFileEnabled: false,
      bundleEnabled: false,
      disabledReason: 'orca_diagnostics_disabled'
    })
  })

  it('reports do_not_track rather than the policy when both apply', () => {
    vi.stubEnv('DO_NOT_TRACK', '1')
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(resolveObservabilityConsent()).toMatchObject({
      bundleEnabled: false,
      disabledReason: 'do_not_track'
    })
  })
})

describe('getDiagnosticsStatus — enterprise policy', () => {
  it('surfaces the policy reason so the Privacy pane can explain the disabled button', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    expect(getDiagnosticsStatus()).toMatchObject({
      localFileEnabled: true,
      bundleEnabled: false,
      disabledReason: 'enterprise_policy'
    })
  })
})
