// Chromium resolves names over DNS-over-HTTPS whenever the machine's configured
// resolver is a known DoH provider: Electron's ConfigureHostResolverOptions
// documents `secureDnsMode` as defaulting to 'automatic', and warns that "for some
// DNS providers, the resolver will automatically upgrade to DoH unless DoH is
// explicitly disabled". On a locked-down fleet that upgrade sends resolution to a
// public resolver over 443 — past split-horizon DNS that is the only thing able to
// resolve internal hosts, and past DNS-based egress monitoring. Under lockdown,
// resolve exactly the way the OS is configured to.

import { app } from 'electron'

import { getEnterprisePolicy } from './enterprise-policy-file'

/**
 * Pin host resolution to the OS resolver when the policy file sets `lockdown`.
 * No-op otherwise, so a default build keeps Chromium's stock behavior.
 * Must be called after the `ready` event — Electron rejects it before that.
 */
export function applyEnterpriseSecureDnsPolicy(): void {
  if (!getEnterprisePolicy().lockdown) {
    return
  }
  try {
    app.configureHostResolver({ secureDnsMode: 'off' })
  } catch (error) {
    // A resolver we could not configure must be visible, but never fatal at startup.
    process.stderr.write(
      `[enterprise-network] could not disable DNS-over-HTTPS: ${String(error)}\n`
    )
  }
}
