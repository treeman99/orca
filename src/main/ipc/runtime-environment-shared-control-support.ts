// Does this remote runtime speak the shared-control protocol?
//
// Split out of runtime-environment-transport-routing so the routing module stays about
// routing. The cache is keyed by pairing/runtime identity, not just environment id: the
// same saved host can be re-paired or point at a different runtime binary over time.

import type {
  getPreferredPairingOffer,
  KnownRuntimeEnvironment
} from '../../shared/runtime-environments'
import { markEnvironmentUsed } from '../../shared/runtime-environment-store'
import { REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY } from '../../shared/protocol-version'
import { sendRemoteRuntimeRequest } from '../../shared/remote-runtime-client'
import type { RuntimeStatus } from '../../shared/runtime-types'

type PairingOffer = ReturnType<typeof getPreferredPairingOffer>

const sharedControlSupport = new Map<string, { cacheKey: string; check: Promise<boolean> }>()

export const resetSharedControlSupport = (): void => sharedControlSupport.clear()

export const clearSharedControlSupport = (environmentId: string): void =>
  void sharedControlSupport.delete(environmentId)

function getSharedControlSupportCacheKey(
  environment: KnownRuntimeEnvironment,
  pairing: PairingOffer,
  runtimeId = environment.runtimeId
): string {
  return [
    runtimeId ?? 'unknown-runtime',
    pairing.endpoint,
    pairing.deviceToken,
    pairing.publicKeyB64
  ].join('\0')
}

export async function supportsSharedControl(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  pairing: PairingOffer,
  timeoutMs: number
): Promise<boolean> {
  const cacheKey = getSharedControlSupportCacheKey(environment, pairing)
  const cached = sharedControlSupport.get(environment.id)
  if (cached?.cacheKey === cacheKey) {
    return cached.check
  }
  let resolvedCacheKey = cacheKey
  const check = (async () => {
    const response = await sendRemoteRuntimeRequest<RuntimeStatus>(
      pairing,
      'status.get',
      undefined,
      timeoutMs
    )
    if (response.ok === true) {
      markEnvironmentUsed(userDataPath, environment.id, { runtimeId: response._meta.runtimeId })
      resolvedCacheKey = getSharedControlSupportCacheKey(
        environment,
        pairing,
        response._meta.runtimeId
      )
      return (
        response.result.capabilities?.includes(REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY) === true
      )
    }
    return false
  })()
  sharedControlSupport.set(environment.id, { cacheKey, check })
  try {
    const supported = await check
    const cachedAfterCheck = sharedControlSupport.get(environment.id)
    if (cachedAfterCheck?.check === check && cachedAfterCheck.cacheKey !== resolvedCacheKey) {
      sharedControlSupport.set(environment.id, { cacheKey: resolvedCacheKey, check })
    }
    return supported
  } catch (error) {
    if (sharedControlSupport.get(environment.id)?.check === check) {
      sharedControlSupport.delete(environment.id)
    }
    throw error
  }
}
