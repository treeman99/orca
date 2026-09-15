import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const gatewayClientConstructed = vi.hoisted(() => vi.fn())
vi.mock('./push-gateway-client', () => ({
  PushGatewayClient: class {
    constructor(options: unknown) {
      gatewayClientConstructed(options)
    }
  }
}))

import { DeviceRegistry } from '../device-registry'
import { RuntimeMobileNotificationController } from '../runtime-mobile-notification-controller'
import { DesktopPushService } from './desktop-push-service'
import { createPushHostKeypair } from './push-host-challenge-fixtures'
import { PushUnregisterOutbox } from './push-unregister-outbox'
import { resolvePushGatewayOrigin } from './push-gateway-origin'

function createFromResolvedOrigin(
  env: NodeJS.ProcessEnv,
  packaged: boolean,
  controller = new RuntimeMobileNotificationController()
) {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-push-removal-'))
  const registry = new DeviceRegistry(userDataPath)
  registry.addDevice('phone', 'mobile')
  return DesktopPushService.create({
    runtime: {
      setMobilePushRegistrar: (registrar: never) => controller.setPushRegistrar(registrar),
      onNotificationDispatched: vi.fn()
    } as never,
    runtimeRpc: {
      getE2EEKeypair: () => createPushHostKeypair(),
      getDeviceRegistry: () => registry,
      getPushUnregisterOutbox: () => new PushUnregisterOutbox(userDataPath),
      setOnPushUnregisterQueued: vi.fn()
    } as never,
    gatewayUrl: resolvePushGatewayOrigin(env, packaged)
  })
}

describe('removed vendor push gateway', () => {
  it.each([true, false])(
    'resolves no origin, even with an env override (packaged=%s)',
    (packaged) => {
      expect(resolvePushGatewayOrigin({}, packaged)).toBe('')
      expect(
        resolvePushGatewayOrigin({ ORCA_PUSH_GATEWAY_URL: 'https://push.gateway.test' }, packaged)
      ).toBe('')
    }
  )

  it('builds no push service and no gateway client for a paired phone', () => {
    const service = createFromResolvedOrigin(
      { ORCA_PUSH_GATEWAY_URL: 'https://push.gateway.test' },
      true
    )
    expect(service).toBeNull()
    expect(gatewayClientConstructed).not.toHaveBeenCalled()
  })

  // Why: v1.4.203 added notifications.testPush, a second phone-triggered door into the gateway.
  it('answers a paired phone test push as unavailable without building a gateway client', async () => {
    const controller = new RuntimeMobileNotificationController()
    // Same create → start sequence as startDesktopPushService.
    createFromResolvedOrigin(
      { ORCA_PUSH_GATEWAY_URL: 'https://push.gateway.test' },
      true,
      controller
    )?.start()
    await expect(controller.testPushDevice('phone')).resolves.toEqual({
      accepted: false,
      reason: 'unavailable'
    })
    expect(gatewayClientConstructed).not.toHaveBeenCalled()
  })
})
