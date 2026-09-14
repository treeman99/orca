import { cleanCloudServiceOrigin } from '../../../shared/cloud-service-url'
import { ORCA_CLOUD_REMOVED } from '../../../shared/orca-cloud-removal'

export function resolvePushGatewayOrigin(env: NodeJS.ProcessEnv, packaged: boolean): string {
  // Fork: the vendor push gateway goes with the rest of Orca Cloud — no default host, and no env
  // override either, so DesktopPushService.create never builds a client. See orca-cloud-removal.
  if (ORCA_CLOUD_REMOVED) {
    return ''
  }
  return cleanCloudServiceOrigin(env.ORCA_PUSH_GATEWAY_URL, !packaged) ?? ''
}
