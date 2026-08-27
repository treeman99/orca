// The failure this covers: on the target fleet (Windows GUI launched from the
// Start Menu) fd 2 is a contentless stub, so the stderr diagnostics in
// enterprise-policy-file.ts are unreadable and an admin cannot confirm that a
// locked machine is actually locked. These cases assert the durable NDJSON
// record carries the same information.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const readFileSyncMock = vi.fn<(target: string, encoding: string) => string>()

vi.mock('node:fs', () => ({
  readFileSync: (target: string, encoding: string) => readFileSyncMock(target, encoding)
}))

// The loader reads the host port, not electron's `app`, so the runtime stays
// bootable on plain Node. Installing a fake here is what mocking `electron` used to do.
const hostEnvironment = { getPath: () => '/home/dev/.config/Orca', isPackaged: false }

import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'
import {
  ENTERPRISE_POLICY_PATH_ENV,
  resetEnterprisePolicyCacheForTests
} from './enterprise-policy-file'

import { recordEnterprisePolicyTrace } from './enterprise-policy-trace'
import { _resetTracerForTests, setActiveSink } from '../observability/tracer'

type SpanRecord = {
  name: string
  attributes: Record<string, unknown>
}

const pushed: SpanRecord[] = []

function installRecordingSink(): void {
  setActiveSink({
    push: (record: unknown) => {
      pushed.push(record as SpanRecord)
    },
    flush: () => {},
    close: () => {}
  })
}

function enoent(): never {
  const error = new Error('ENOENT') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  throw error
}

function recordedPolicySpan(): SpanRecord {
  const span = pushed.find((entry) => entry.name === 'enterprise.policy')
  expect(span, 'no enterprise.policy span was recorded').toBeDefined()
  return span as SpanRecord
}

beforeEach(() => {
  // Must be inside beforeEach: config/scripts/vitest-host-ports-setup.ts installs a
  // default host environment in its own beforeEach, which runs first.
  installFakeAppEnvironment({
    getPath: () => hostEnvironment.getPath(),
    getAppPath: () => '',
    isPackaged: () => hostEnvironment.isPackaged
  })
  pushed.length = 0
  resetEnterprisePolicyCacheForTests()
  readFileSyncMock.mockReset()
  readFileSyncMock.mockImplementation(enoent)
  hostEnvironment.isPackaged = false
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  installRecordingSink()
})

afterEach(() => {
  _resetTracerForTests()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('recordEnterprisePolicyTrace', () => {
  it('records which file was applied and the switches it produced', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true, "disableSpellcheck": false }')

    recordEnterprisePolicyTrace()

    const span = recordedPolicySpan()
    expect(span.attributes['enterprise.policy.source_path']).toBe('/opt/policy.json')
    expect(span.attributes['enterprise.policy.lockdown']).toBe(true)
    expect(span.attributes['enterprise.policy.switches']).toMatchObject({
      disableTelemetry: true,
      disableManagedClaudeAccounts: true,
      // Explicit `false` opts one feature back in; the record must show that.
      disableSpellcheck: false
    })
  })

  it('records that no file was found, with the paths it searched', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')

    recordEnterprisePolicyTrace()

    const span = recordedPolicySpan()
    expect(span.attributes['enterprise.policy.source_path']).toBe('(none found)')
    expect(span.attributes['enterprise.policy.searched_paths']).toEqual(['/opt/policy.json'])
    expect(span.attributes['enterprise.policy.lockdown']).toBe(false)
  })

  it('carries the parse failure that stderr would have swallowed', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true ')

    recordEnterprisePolicyTrace()

    const warnings = recordedPolicySpan().attributes['enterprise.policy.warnings'] as string[]
    expect(warnings.join('\n')).toContain('not valid JSON')
  })

  it('carries an unreadable-file diagnostic', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockImplementation(() => {
      const error = new Error('EACCES') as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    })

    recordEnterprisePolicyTrace()

    const warnings = recordedPolicySpan().attributes['enterprise.policy.warnings'] as string[]
    expect(warnings.join('\n')).toContain('could not read')
  })

  it('carries the mistyped-key warning that silently leaves a machine unlocked', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true, "disableStarNagg": true }')

    recordEnterprisePolicyTrace()

    const warnings = recordedPolicySpan().attributes['enterprise.policy.warnings'] as string[]
    expect(warnings.join('\n')).toContain('disableStarNagg')
  })

  // The user-visible symptom this answers: "the agent picker still lists codex." Without
  // this attribute the record shows a fully locked machine either way, because
  // allowedAgents is the one restriction that does not inherit lockdown.
  it('records the agent allowlist that actually took effect', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue(
      '{ "lockdown": true, "allowedAgents": ["claude", "opencode"] }'
    )

    recordEnterprisePolicyTrace()

    expect(recordedPolicySpan().attributes['enterprise.policy.allowed_agents']).toEqual([
      'claude',
      'opencode'
    ])
  })

  it('records that a locked machine left every agent selectable', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    // A mistyped key is the realistic way this happens: it resolves to no restriction.
    readFileSyncMock.mockReturnValue('{ "lockdown": true, "allowedAgent": ["claude"] }')

    recordEnterprisePolicyTrace()

    expect(recordedPolicySpan().attributes['enterprise.policy.allowed_agents']).toBe(
      '(unrestricted)'
    )
  })

  it('does not throw when the observability lane is disabled', () => {
    _resetTracerForTests()
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true }')

    expect(() => recordEnterprisePolicyTrace()).not.toThrow()
    expect(pushed).toEqual([])
  })
})
