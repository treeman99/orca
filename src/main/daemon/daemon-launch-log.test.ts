import { describe, expect, it } from 'vitest'
import { classifyDaemonLaunchFailure } from './daemon-launch-log'

describe('classifyDaemonLaunchFailure', () => {
  it('names the exit code of a child that died during startup', () => {
    expect(
      classifyDaemonLaunchFailure(new Error('Daemon exited during startup with code 20'))
    ).toEqual({ stage: 'child-exited', exitCode: 20 })
  })

  it('reports a spawn errno without the path that produced it', () => {
    const error = Object.assign(new Error('spawn C:\\Local\\Orca\\host.exe EACCES'), {
      code: 'EACCES'
    })

    expect(classifyDaemonLaunchFailure(error)).toEqual({ stage: 'spawn', code: 'EACCES' })
  })

  it.each([
    ['Daemon startup timed out', 'timeout'],
    ['Daemon readiness identity is incomplete', 'ready-identity'],
    ['Daemon could not take the endpoint: occupied', 'endpoint-occupied'],
    ['something nobody classified', 'unknown']
  ])('maps %j to %j', (message, stage) => {
    expect(classifyDaemonLaunchFailure(new Error(message))).toEqual({ stage })
  })

  it('keeps the stderr tail out of the classification', () => {
    const error = new Error(
      'Daemon exited during startup with code 1\nDaemon stderr (tail):\nC:\\Users\\someone\\secret'
    )

    expect(classifyDaemonLaunchFailure(error)).toEqual({ stage: 'child-exited', exitCode: 1 })
    expect(JSON.stringify(classifyDaemonLaunchFailure(error))).not.toContain('someone')
  })

  it('does not throw on a non-Error rejection', () => {
    expect(classifyDaemonLaunchFailure('boom')).toEqual({ stage: 'unknown' })
    expect(classifyDaemonLaunchFailure(undefined)).toEqual({ stage: 'unknown' })
  })
})
