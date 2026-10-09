// Fork-owned: the dismissal ledger reaches disk only while a phone push route exists (the fork's
// dismissal-write push gate, v1.4.201). Upstream's restart and relay tests read that disk ledger,
// so they declare the route their scenario already assumes.
import type { RuntimeMobileNotificationController } from './runtime-mobile-notification-controller'

export function withPhonePushRoute(
  controller: RuntimeMobileNotificationController
): RuntimeMobileNotificationController {
  controller.setPushRegistrar({
    test: async () => ({ accepted: true }),
    register: async () => ({ registered: true, registrationId: 'phone' }),
    unregister: async () => ({ unregistered: true })
  })
  return controller
}
