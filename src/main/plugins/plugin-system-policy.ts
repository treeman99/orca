// The one place that decides whether the plugin system may run.
//
// Every other switch in this fork gates a vendor call the app makes on its own. This one
// has to override a *user* setting, because `pluginSystemEnabled` is what upstream gates
// the whole feature on — and two of its lanes are ones `enforceNetworkAllowlist` cannot
// see: `plugin-git-repository.ts` clones the vendor marketplace through a `git` child
// process, and a plugin worker is an ordinary child process with unrestricted network.
//
// So the gate is applied twice on purpose:
//   - `isPluginSystemAllowed` replaces every read of the setting in main, so discovery,
//     panels, workers, marketplace seeding and the kill-list refresh all fail closed.
//   - `assertPluginSystemAllowed` sits at the two egress chokepoints themselves, because
//     `plugins:install` and `plugins:refreshMarketplaces` reach Git without consulting
//     the feature flag at all — the flag is not upstream's egress boundary.

import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

/** True only when the user opted in *and* the administrator's policy permits it. */
export function isPluginSystemAllowed(settingEnabled: boolean | undefined): boolean {
  return settingEnabled === true && !getEnterprisePolicy().disablePlugins
}

/** Hard refusal for the network chokepoints, which the feature flag does not cover. */
export function assertPluginSystemAllowed(): void {
  if (getEnterprisePolicy().disablePlugins) {
    throw new Error('The plugin system is disabled by an enterprise policy.')
  }
}
